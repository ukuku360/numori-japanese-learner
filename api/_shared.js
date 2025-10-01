// Shared utilities and database setup for API routes
require('dotenv').config();
const Database = require('better-sqlite3');

// Initialize database (in-memory for Vercel)
const db = new Database(':memory:');

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
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';

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
  setCORS(res);
  res.status(statusCode).json(body);
}

// Generate sentence using OpenAI
async function generateSentenceWithOpenAI(keyword, level) {
  const prompt = `일본어 학습을 위한 문장을 생성해주세요. 키워드: "${keyword}", 난이도: ${level}급

요구사항:
- 키워드가 자연스럽게 포함된 일본어 문장 1개
- ${level}급 수준에 맞는 어휘와 문법 사용
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
            content: '당신은 일본어 교육 전문가입니다. 학습자의 수준에 맞는 실용적인 일본어 문장을 생성하고, 문법적 분석을 제공합니다.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API 오류: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
      return getFallbackData(keyword, level);
    }
  } catch (error) {
    console.error('OpenAI API 호출 실패:', error);
    return getFallbackData(keyword, level);
  }
}

// Fallback data
function getFallbackData(keyword, level) {
  return {
    japanese: `${keyword}は大切です。`,
    pronunciation: `${keyword}はたいせつです。`,
    translation: `${keyword}는 중요합니다.`,
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
        fragment: 'は',
        kanji: 'は',
        hiragana: 'は',
        katakana: 'ハ',
        romaji: 'wa',
        meaning: '는/은',
        partOfSpeech: '조사',
        usageNote: '주제를 나타내는 조사입니다.'
      },
      {
        fragment: '大切です',
        kanji: '大切です',
        hiragana: 'たいせつです',
        katakana: 'タイセツデス',
        romaji: 'taisetsu desu',
        meaning: '중요합니다',
        partOfSpeech: '형용동사 + です',
        usageNote: '정중한 표현입니다.'
      }
    ]
  };
}

module.exports = {
  db,
  setCORS,
  sendJson,
  generateSentenceWithOpenAI,
  getFallbackData,
  LLM_PROVIDER,
  OPENAI_API_KEY
};