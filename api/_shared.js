// Shared utilities and database setup for API routes
require('dotenv').config();
const Database = require('better-sqlite3');

// Initialize database (use a persistent temp database for Vercel)
const db = new Database('/tmp/numori.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    level TEXT NOT NULL,
    japanese TEXT NOT NULL,
    pronunciation TEXT NOT NULL,
    translation TEXT NOT NULL,
    breakdown TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    bookmarked BOOLEAN DEFAULT FALSE
  );

  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT UNIQUE NOT NULL,
    times_studied INTEGER DEFAULT 1,
    last_studied DATETIME DEFAULT CURRENT_TIMESTAMP,
    difficulty_preference TEXT DEFAULT 'mixed'
  );

  CREATE TABLE IF NOT EXISTS quiz_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sentence_id INTEGER NOT NULL,
    correct BOOLEAN NOT NULL,
    answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sentence_id) REFERENCES sentences(id)
  );
`);

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LLM_PROVIDER = OPENAI_API_KEY ? 'openai' : 'fallback';

console.log(`[API] LLM Provider: ${LLM_PROVIDER}, API Key present: ${!!OPENAI_API_KEY}`);

// Fetch function
const fetch = typeof global.fetch === 'function'
  ? global.fetch.bind(global)
  : async () => {
      throw new Error('Fetch API를 찾을 수 없습니다.');
    };

// CORS headers
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// JSON response helper
function sendJson(res, statusCode, body) {
  res.status(statusCode).json(body);
}

// Body parser for JSON POST requests (Vercel's Node runtime doesn't parse automatically)
async function parseJsonBody(req) {
  if (req.body && Buffer.isBuffer(req.body)) {
    try {
      const parsed = JSON.parse(req.body.toString('utf8'));
      req.body = parsed;
      return parsed;
    } catch (error) {
      const parseError = new Error('요청 본문을 JSON으로 파싱할 수 없습니다.');
      parseError.statusCode = 400;
      throw parseError;
    }
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }

  if (req.body && typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
      return req.body;
    } catch (error) {
      const parseError = new Error('요청 본문을 JSON으로 파싱할 수 없습니다.');
      parseError.statusCode = 400;
      throw parseError;
    }
  }

  const rawBody = await new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy(new Error('요청 본문이 너무 큽니다.'));
      }
    });

    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

  if (!rawBody) {
    req.body = {};
    return req.body;
  }

  try {
    req.body = JSON.parse(rawBody);
    return req.body;
  } catch (error) {
    const parseError = new Error('요청 본문을 JSON으로 파싱할 수 없습니다.');
    parseError.statusCode = 400;
    throw parseError;
  }
}

// Generate sentence using OpenAI
async function generateSentenceWithOpenAI(keyword, level) {
  const prompt = `일본어 학습을 위한 문장을 생성해주세요. 키워드: "${keyword}", 난이도: ${level}

요구사항:
- 키워드가 자연스럽게 포함된 일본어 문장 1개
- ${level} 수준에 맞는 어휘와 문법 사용
- 일상생활에서 실제로 사용할 수 있는 문장

다음 JSON 형식으로 응답해주세요:
{
  "japanese": "일본어 문장",
  "pronunciation": "발음 (히라가나)",
  "translation": "한국어 번역",
  "breakdown": [
    {
      "fragment": "문장 조각",
      "kanji": "한자",
      "hiragana": "히라가나",
      "katakana": "가타카나",
      "romaji": "로마자",
      "meaning": "의미",
      "partOfSpeech": "품사",
      "usageNote": "문법 설명"
    }
  ]
}`;

  try {
    console.log(`[OpenAI] Calling API for keyword: ${keyword}, level: ${level}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '당신은 일본어 교육 전문가입니다. 학습자의 수준에 맞는 실용적인 일본어 문장을 생성하고, 문법적 분석을 제공합니다. 반드시 유효한 JSON으로만 응답하세요.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenAI] API 오류 ${response.status}: ${errorText}`);
      throw new Error(`OpenAI API 오류: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      const parsed = JSON.parse(content);
      console.log(`[OpenAI] 성공적으로 생성됨: ${keyword} (${level})`);
      return parsed;
    } catch (parseError) {
      console.error('[OpenAI] JSON 파싱 오류:', parseError, 'Content:', content);
      return getFallbackData(keyword, level);
    }
  } catch (error) {
    console.error('[OpenAI] API 호출 실패:', error.message);
    return getFallbackData(keyword, level);
  }
}

// Fallback data
function getFallbackData(keyword, level) {
  const fallbackSentences = {
    '초급': {
      japanese: `今日、${keyword}について話しました。`,
      pronunciation: `きょう、${keyword}についてはなしました。`,
      translation: `오늘 ${keyword}에 대해 이야기했습니다.`,
      breakdown: [
        {
          fragment: '今日',
          kanji: '今日',
          hiragana: 'きょう',
          katakana: 'キョウ',
          romaji: 'kyou',
          meaning: '오늘',
          partOfSpeech: '명사',
          usageNote: '시간을 나타내는 기본 어휘입니다.'
        },
        {
          fragment: keyword,
          kanji: keyword,
          hiragana: keyword,
          katakana: keyword,
          romaji: keyword,
          meaning: keyword,
          partOfSpeech: '명사',
          usageNote: '입력한 키워드입니다.'
        },
        {
          fragment: 'について',
          kanji: 'について',
          hiragana: 'について',
          katakana: 'ニツイテ',
          romaji: 'ni tsuite',
          meaning: '~에 대해',
          partOfSpeech: '조사구',
          usageNote: '주제나 관련성을 나타내는 표현입니다.'
        },
        {
          fragment: '話しました',
          kanji: '話しました',
          hiragana: 'はなしました',
          katakana: 'ハナシマシタ',
          romaji: 'hanashimashita',
          meaning: '이야기했습니다',
          partOfSpeech: '동사 과거형',
          usageNote: '정중한 과거 표현입니다.'
        }
      ]
    },
    '중급': {
      japanese: `${keyword}に関する経験を共有していただけませんか。`,
      pronunciation: `${keyword}にかんするけいけんをきょうゆうしていただけませんか。`,
      translation: `${keyword}에 관한 경험을 공유해 주시겠습니까?`,
      breakdown: [
        {
          fragment: keyword,
          kanji: keyword,
          hiragana: keyword,
          katakana: keyword,
          romaji: keyword,
          meaning: keyword,
          partOfSpeech: '명사',
          usageNote: '입력한 키워드입니다.'
        },
        {
          fragment: 'に関する',
          kanji: 'に関する',
          hiragana: 'にかんする',
          katakana: 'ニカンスル',
          romaji: 'ni kan suru',
          meaning: '~에 관한',
          partOfSpeech: '관형어구',
          usageNote: '명사를 수식하여 관련성을 나타냅니다.'
        },
        {
          fragment: '経験を',
          kanji: '経験を',
          hiragana: 'けいけんを',
          katakana: 'ケイケンヲ',
          romaji: 'keiken wo',
          meaning: '경험을',
          partOfSpeech: '명사 + 목적격조사',
          usageNote: '동작의 대상을 나타냅니다.'
        },
        {
          fragment: '共有していただけませんか',
          kanji: '共有していただけませんか',
          hiragana: 'きょうゆうしていただけませんか',
          katakana: 'キョウユウシテイタダケマセンカ',
          romaji: 'kyouyuu shite itadakemasen ka',
          meaning: '공유해 주시겠습니까',
          partOfSpeech: '존경어 + 의문형',
          usageNote: '정중한 부탁의 표현입니다.'
        }
      ]
    },
    '고급': {
      japanese: `${keyword}に対する見解が多様化している現状を踏まえ、更なる検討が必要だと考えられます。`,
      pronunciation: `${keyword}にたいするけんかいがたようかしているげんじょうをふまえ、さらなるけんとうがひつようだとかんがえられます。`,
      translation: `${keyword}에 대한 견해가 다양화되고 있는 현상을 고려하여, 더욱 깊은 검토가 필요하다고 생각됩니다.`,
      breakdown: [
        {
          fragment: keyword,
          kanji: keyword,
          hiragana: keyword,
          katakana: keyword,
          romaji: keyword,
          meaning: keyword,
          partOfSpeech: '명사',
          usageNote: '입력한 키워드입니다.'
        },
        {
          fragment: 'に対する',
          kanji: 'に対する',
          hiragana: 'にたいする',
          katakana: 'ニタイスル',
          romaji: 'ni tai suru',
          meaning: '~에 대한',
          partOfSpeech: '관형어구',
          usageNote: '대상이나 상대를 나타내는 고급 표현입니다.'
        },
        {
          fragment: '見解が多様化している',
          kanji: '見解が多様化している',
          hiragana: 'けんかいがたようかしている',
          katakana: 'ケンカイガタヨウカシテイル',
          romaji: 'kenkai ga tayouka shite iru',
          meaning: '견해가 다양화되고 있는',
          partOfSpeech: '관형절',
          usageNote: '현재 진행중인 상태를 나타내는 표현입니다.'
        },
        {
          fragment: '現状を踏まえ',
          kanji: '現状を踏まえ',
          hiragana: 'げんじょうをふまえ',
          katakana: 'ゲンジョウヲフマエ',
          romaji: 'genjou wo fumae',
          meaning: '현상을 고려하여',
          partOfSpeech: '부사구',
          usageNote: '상황을 고려한다는 의미의 공식적 표현입니다.'
        },
        {
          fragment: '更なる検討が必要だと考えられます',
          kanji: '更なる検討が必要だと考えられます',
          hiragana: 'さらなるけんとうがひつようだとかんがえられます',
          katakana: 'サラナルケントウガヒツヨウダトカンガエラレマス',
          romaji: 'sara naru kentou ga hitsuyou da to kangaeraremasu',
          meaning: '더욱 깊은 검토가 필요하다고 생각됩니다',
          partOfSpeech: '수동형 + 추측표현',
          usageNote: '객관적이고 공식적인 의견 표현입니다.'
        }
      ]
    }
  };

  return fallbackSentences[level] || fallbackSentences['초급'];
}

module.exports = {
  db,
  setCORS,
  sendJson,
  parseJsonBody,
  generateSentenceWithOpenAI,
  getFallbackData,
  LLM_PROVIDER,
  OPENAI_API_KEY
};
