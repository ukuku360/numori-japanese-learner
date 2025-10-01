// Load environment variables
require('dotenv').config();

const http = require('http');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const fetch = typeof global.fetch === 'function'
  ? global.fetch.bind(global)
  : async () => {
      throw new Error('Fetch API를 찾을 수 없습니다. Node.js 18+을 사용하거나 fetch 폴리필을 추가해주세요.');
    };

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gpt-oss';
const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const rawProvider = (process.env.LLM_PROVIDER || '').toLowerCase();

const LLM_PROVIDER = (() => {
  if (rawProvider === 'ollama') return 'ollama';
  if (rawProvider === 'openai') return OPENAI_API_KEY ? 'openai' : 'fallback';
  if (rawProvider === 'fallback') return 'fallback';

  if (process.env.OLLAMA_MODEL) return 'ollama';
  if (OPENAI_API_KEY) return 'openai';
  return 'fallback';
})();

const publicDir = path.join(__dirname, 'public');

// Initialize database (in-memory for Vercel compatibility)
const db = new Database(':memory:');

// Create tables if they don't exist
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API routes
  if (req.method === 'POST' && url.pathname === '/api/generate') {
    return handleGenerate(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    return handleGetHistory(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/bookmark') {
    return handleBookmark(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/bookmarks') {
    return handleGetBookmarks(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/progress') {
    return handleGetProgress(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/quiz') {
    return handleQuiz(req, res);
  }

  return serveStatic(url, res);
});

// For Vercel deployment
if (process.env.VERCEL) {
  module.exports = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // API routes
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      return handleGenerate(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/history') {
      return handleGetHistory(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/bookmark') {
      return handleBookmark(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/bookmarks') {
      return handleGetBookmarks(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/progress') {
      return handleGetProgress(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/quiz') {
      return handleQuiz(req, res);
    }

    // Serve static files
    return serveStatic(url, res);
  };
} else {
  // Local development
  server.listen(PORT, HOST, () => {
    console.log(`NuMori 서버가 http://${HOST}:${PORT} 에서 대기 중입니다.`);
    console.log(`LLM 공급자: ${LLM_PROVIDER}`);
    if (LLM_PROVIDER === 'openai' && !OPENAI_API_KEY) {
      console.log('경고: OPENAI_API_KEY가 감지되지 않았습니다. 샘플 데이터로 전환합니다.');
    }
    if (LLM_PROVIDER === 'ollama') {
      console.log(`"${OLLAMA_MODEL}" Ollama 모델을 ${OLLAMA_HOST}에서 사용할 예정입니다.`);
    }
  });
}

async function handleGenerate(req, res) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || '{}');
    const keyword = (payload.keyword || '').trim();

    if (!keyword) {
      return sendJson(res, 400, { error: '키워드를 입력해야 합니다.' });
    }

    const data = await generateContent(keyword);

    // Save sentences to database and get IDs
    const insertSentence = db.prepare(`
      INSERT INTO sentences (keyword, level, japanese, pronunciation, translation, breakdown)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    data.sentences.forEach(sentence => {
      const result = insertSentence.run(
        keyword,
        sentence.level,
        sentence.japanese,
        sentence.pronunciation,
        sentence.translation,
        JSON.stringify(sentence.breakdown)
      );
      sentence.id = result.lastInsertRowid;
    });

    // Update user progress
    const updateProgress = db.prepare(`
      INSERT OR REPLACE INTO user_progress (keyword, times_studied, last_studied)
      VALUES (?, COALESCE((SELECT times_studied FROM user_progress WHERE keyword = ?) + 1, 1), CURRENT_TIMESTAMP)
    `);
    updateProgress.run(keyword, keyword);

    return sendJson(res, 200, data);
  } catch (error) {
    console.error('[generate] 오류', error);
    return sendJson(res, 500, { error: '지금은 콘텐츠를 생성할 수 없습니다.' });
  }
}

async function handleGetHistory(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    const sentences = db.prepare(`
      SELECT id, keyword, level, japanese, pronunciation, translation,
             created_at, bookmarked
      FROM sentences
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    return sendJson(res, 200, { sentences });
  } catch (error) {
    console.error('[history] 오류', error);
    return sendJson(res, 500, { error: '기록을 불러올 수 없습니다.' });
  }
}

async function handleBookmark(req, res) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || '{}');
    const { sentenceId, bookmarked } = payload;

    if (!sentenceId) {
      return sendJson(res, 400, { error: '문장 ID가 필요합니다.' });
    }

    const updateBookmark = db.prepare(`
      UPDATE sentences SET bookmarked = ? WHERE id = ?
    `);
    updateBookmark.run(bookmarked ? 1 : 0, sentenceId);

    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error('[bookmark] 오류', error);
    return sendJson(res, 500, { error: '북마크를 저장할 수 없습니다.' });
  }
}

async function handleGetBookmarks(req, res) {
  try {
    const sentences = db.prepare(`
      SELECT id, keyword, level, japanese, pronunciation, translation,
             breakdown, created_at
      FROM sentences
      WHERE bookmarked = 1
      ORDER BY created_at DESC
    `).all();

    const bookmarks = sentences.map(sentence => ({
      ...sentence,
      breakdown: JSON.parse(sentence.breakdown)
    }));

    return sendJson(res, 200, { bookmarks });
  } catch (error) {
    console.error('[bookmarks] 오류', error);
    return sendJson(res, 500, { error: '북마크를 불러올 수 없습니다.' });
  }
}

async function handleGetProgress(req, res) {
  try {
    const progress = db.prepare(`
      SELECT keyword, times_studied, last_studied, difficulty_preference
      FROM user_progress
      ORDER BY last_studied DESC
    `).all();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_sentences,
        COUNT(DISTINCT keyword) as unique_keywords,
        COUNT(CASE WHEN bookmarked = 1 THEN 1 END) as bookmarked_count
      FROM sentences
    `).get();

    return sendJson(res, 200, { progress, stats });
  } catch (error) {
    console.error('[progress] 오류', error);
    return sendJson(res, 500, { error: '진도를 불러올 수 없습니다.' });
  }
}

async function handleQuiz(req, res) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || '{}');
    const { sentenceId, correct } = payload;

    if (!sentenceId || typeof correct !== 'boolean') {
      return sendJson(res, 400, { error: '문장 ID와 정답 여부가 필요합니다.' });
    }

    const insertQuiz = db.prepare(`
      INSERT INTO quiz_history (sentence_id, correct)
      VALUES (?, ?)
    `);
    insertQuiz.run(sentenceId, correct ? 1 : 0);

    // Get next quiz question (simple spaced repetition)
    const nextQuestion = db.prepare(`
      SELECT s.id, s.japanese, s.pronunciation, s.translation, s.breakdown
      FROM sentences s
      LEFT JOIN quiz_history qh ON s.id = qh.sentence_id
      WHERE s.bookmarked = 1
      GROUP BY s.id
      HAVING COUNT(qh.id) = 0 OR
             (COUNT(CASE WHEN qh.correct = 1 THEN 1 END) < 3 AND
              MAX(qh.answered_at) < datetime('now', '-1 day'))
      ORDER BY RANDOM()
      LIMIT 1
    `).get();

    if (nextQuestion) {
      nextQuestion.breakdown = JSON.parse(nextQuestion.breakdown);
    }

    return sendJson(res, 200, {
      success: true,
      nextQuestion: nextQuestion || null
    });
  } catch (error) {
    console.error('[quiz] 오류', error);
    return sendJson(res, 500, { error: '퀴즈를 처리할 수 없습니다.' });
  }
}

async function generateContent(keyword) {
  const promptParts = buildPromptParts(keyword);

  let data;

  if (LLM_PROVIDER === 'ollama') {
    data = await generateWithOllama(keyword, promptParts);
  } else if (LLM_PROVIDER === 'openai') {
    data = await generateWithOpenAI(keyword, promptParts);
  } else {
    data = buildFallbackResponse(keyword);
  }

  return normalizeResponse(data);
}

function buildPromptParts(keyword) {
  const systemMessage = '당신은 일본어 학습자가 문법을 이해하도록 돕는 코치입니다. 제공된 스키마와 일치하는 JSON으로만 응답하고, 모든 설명과 해석은 자연스러운 한국어로 작성하세요.';
  const userMessage = `키워드 "${keyword}"와 관련된 일본어 문장을 초급, 중급, 고급으로 각각 하나씩 만들어 주세요.
다음 구조의 JSON 객체를 반환해야 합니다:
{
  "sentences": [
    {
      "level": "초급|중급|고급", // 반드시 이 세 가지 중 하나만 사용하세요.
      "japanese": "...",
      "pronunciation": "로마자 발음",
      "translation": "한국어 해석", // 영어를 섞지 말고 자연스러운 한국어만 작성하세요.
      "breakdown": [
        {
          "fragment": "한자 또는 가나 단위",
          "kanji": "필요 시 한자 표기",
          "hiragana": "히라가나 표기",
          "katakana": "관련 있다면 가타카나 표기",
          "romaji": "로마자 표기",
          "meaning": "직역 또는 역할", // 한국어로만 작성하세요.
          "partOfSpeech": "품사 / 문법 역할", // 품사 이름도 한국어 표현을 사용하세요.
          "usageNote": "짧은 참고 메모" // 문법 메모 역시 한국어로 작성하세요.
        }
      ]
    }
  ]
}
모든 문자열은 한국어(또는 일본어 원문)만 포함해야 하며 영어는 사용하지 마세요.
각 fragment 객체에는 fragment, hiragana, romaji, meaning이 반드시 포함되어야 합니다.`;

  const combinedPrompt = `${systemMessage}\n\n${userMessage}\n\n반드시 유효한 JSON 문자열로만 응답하세요.`;

  return { systemMessage, userMessage, combinedPrompt };
}

async function generateWithOpenAI(keyword, promptParts) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: promptParts.systemMessage },
          { role: 'user', content: promptParts.userMessage }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[openai] 비정상 응답', errorText);
      throw new Error('OpenAI API 오류');
    }

    const json = await response.json();
    const messageContent = json?.choices?.[0]?.message?.content;

    if (!messageContent) {
      throw new Error('OpenAI에서 반환된 내용이 없습니다.');
    }

    return JSON.parse(messageContent);
  } catch (error) {
    console.error('[openai] 요청 실패, 샘플 데이터를 사용합니다.', error);
    return buildFallbackResponse(keyword);
  }
}

async function generateWithOllama(keyword, promptParts) {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: promptParts.combinedPrompt,
        stream: false,
        options: {
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ollama] 비정상 응답', errorText);
      throw new Error('Ollama API 오류');
    }

    const payload = await response.json();
    const content = payload?.response;

    if (!content) {
      throw new Error('Ollama에서 반환된 내용이 없습니다.');
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('[ollama] 요청 실패, 샘플 데이터를 사용합니다.', error);
    return buildFallbackResponse(keyword);
  }
}

function normalizeResponse(data) {
  if (!data || !Array.isArray(data.sentences)) {
    return { source: '오류', sentences: [] };
  }

  const levelMap = new Map([
    ['basic', '초급'],
    ['beginner', '초급'],
    ['elementary', '초급'],
    ['intermediate', '중급'],
    ['advanced', '고급'],
    ['upper-intermediate', '고급']
  ]);

  const sentences = data.sentences.map((sentence) => {
    const rawLevel = `${sentence.level || ''}`;
    const normalizedLevel = levelMap.get(rawLevel.trim().toLowerCase()) || rawLevel;

    const breakdown = Array.isArray(sentence.breakdown)
      ? sentence.breakdown.map((piece, index) => ({
          ...piece,
          fragment: ensureText(piece.fragment, `부분 ${index + 1}`)
        }))
      : [];

    return {
      ...sentence,
      level: normalizedLevel,
      breakdown
    };
  });

  return {
    ...data,
    sentences
  };
}

function ensureText(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return fallback;
}

function buildFallbackResponse(keyword) {
  const theme = keyword || '감사';

  return {
    source: '샘플',
    sentences: [
      {
        level: '초급',
        japanese: 'ありがとう、今日は手伝ってくれて嬉しいです。',
        pronunciation: 'Arigatō, kyō wa tetsudatte kurete ureshii desu.',
        translation: `${theme}와 관련해서 오늘 도와줘서 고마워요.`,
        breakdown: [
          {
            fragment: 'ありがとう',
            kanji: '有り難う',
            hiragana: 'ありがとう',
            katakana: 'アリガトウ',
            romaji: 'arigatō',
            meaning: '고맙다는 말',
            partOfSpeech: '표현',
            usageNote: '일상적인 감사 표현으로 정중한 상황에서도 자연스럽습니다.'
          },
          {
            fragment: '今日は',
            kanji: '今日は',
            hiragana: 'きょうは',
            katakana: 'キョウハ',
            romaji: 'kyō wa',
            meaning: '오늘은/오늘에 관해',
            partOfSpeech: '주제 표시 조사',
            usageNote: '오늘(今日)에 주제 조사 は가 붙어 화제를 제시합니다.'
          },
          {
            fragment: '手伝ってくれて',
            kanji: '手伝ってくれて',
            hiragana: 'てつだってくれて',
            katakana: 'テツダッテクレテ',
            romaji: 'tetsudatte kurete',
            meaning: '도와줘서',
            partOfSpeech: 'て형 + くれる',
            usageNote: '동사 手伝う의 て형 뒤에 くれる가 붙어 화자가 도움을 받았음을 나타냅니다.'
          },
          {
            fragment: '嬉しいです',
            kanji: '嬉しいです',
            hiragana: 'うれしいです',
            katakana: 'ウレシイデス',
            romaji: 'ureshii desu',
            meaning: '기쁩니다',
            partOfSpeech: '형용사 + です',
            usageNote: 'です로 마무리하여 공손하고 부드러운 어조를 만듭니다.'
          }
        ]
      },
      {
        level: '중급',
        japanese: 'いつも支えてくれる仲間に感謝の気持ちを伝えたい。',
        pronunciation: 'Itsumo sasaete kureru nakama ni kansha no kimochi o tsutaetai.',
        translation: `${theme}에 대해 늘 곁에서 지지해 주는 동료들에게 감사의 마음을 전하고 싶어요.`,
        breakdown: [
          {
            fragment: 'いつも',
            kanji: '何時も',
            hiragana: 'いつも',
            katakana: 'イツモ',
            romaji: 'itsumo',
            meaning: '항상',
            partOfSpeech: '부사',
            usageNote: '습관적이거나 반복되는 상황을 나타냅니다.'
          },
          {
            fragment: '支えてくれる',
            kanji: '支えてくれる',
            hiragana: 'ささえてくれる',
            katakana: 'ササエテクレル',
            romaji: 'sasaete kureru',
            meaning: '지지해 주는',
            partOfSpeech: '관계절',
            usageNote: '동사 支える의 て형에 くれる가 이어져 화자를 도와주는 의미가 됩니다.'
          },
          {
            fragment: '仲間に',
            kanji: '仲間に',
            hiragana: 'なかまに',
            katakana: 'ナカマニ',
            romaji: 'nakama ni',
            meaning: '동료들에게',
            partOfSpeech: '명사 + 조사 に',
            usageNote: '間接목적어, 감사의 마음이 향하는 대상을 표시합니다.'
          },
          {
            fragment: '感謝の気持ちを',
            kanji: '感謝の気持ちを',
            hiragana: 'かんしゃのきもちを',
            katakana: 'カンシャノキモチヲ',
            romaji: 'kansha no kimochi o',
            meaning: '감사의 마음을',
            partOfSpeech: '명사구 + を',
            usageNote: 'の가 感謝와 気持ち를 연결하여 수식 구조를 만듭니다.'
          },
          {
            fragment: '伝えたい',
            kanji: '伝えたい',
            hiragana: 'つたえたい',
            katakana: 'ツタエタイ',
            romaji: 'tsutaetai',
            meaning: '전하고 싶다',
            partOfSpeech: '동사 어간 + たい형',
            usageNote: 'たい형은 화자의 희망이나 욕구를 나타냅니다.'
          }
        ]
      },
      {
        level: '고급',
        japanese: '困難な状況でも支援してくれた皆さんへ、心からの謝意を改めて表明したいと思います。',
        pronunciation: 'Konʼnan na jōkyō demo shien shite kureta minasan e, kokoro kara no shai o aratamete hyōmei shitai to omoimasu.',
        translation: `어려운 상황 속에서도 ${theme}을(를) 위해 힘이 되어준 여러분께 진심 어린 감사 인사를 다시 전하고 싶습니다.`,
        breakdown: [
          {
            fragment: '困難な状況でも',
            kanji: '困難な状況でも',
            hiragana: 'こんなんなじょうきょうでも',
            katakana: 'コンナンナジョウキョウデモ',
            romaji: 'konnan na jōkyō demo',
            meaning: '어려운 상황에서도',
            partOfSpeech: '명사구 + でも',
            usageNote: 'でも가 양보를 나타내며 "~에도 불구하고"의 뉘앙스를 줍니다.'
          },
          {
            fragment: '支援してくれた',
            kanji: '支援してくれた',
            hiragana: 'しえんしてくれた',
            katakana: 'シエンシテクレタ',
            romaji: 'shien shite kureta',
            meaning: '지원해 준',
            partOfSpeech: '관계절',
            usageNote: '支援する의 て형에 くれる가 붙어 "나를 도와준"이라는 의미가 됩니다.'
          },
          {
            fragment: '皆さんへ',
            kanji: '皆さんへ',
            hiragana: 'みなさんへ',
            katakana: 'ミナサンヘ',
            romaji: 'minasan e',
            meaning: '여러분께',
            partOfSpeech: '명사 + 조사 へ',
            usageNote: 'へ가 감사의 표현이 향하는 대상을 나타냅니다.'
          },
          {
            fragment: '心からの謝意を',
            kanji: '心からの謝意を',
            hiragana: 'こころからのしゃいを',
            katakana: 'ココロカラノシャイヲ',
            romaji: 'kokoro kara no shai o',
            meaning: '진심 어린 감사의 뜻을',
            partOfSpeech: '명사구 + を',
            usageNote: 'から가 마음(心)에서 비롯된 감정을 강조합니다.'
          },
          {
            fragment: '改めて表明したいと思います',
            kanji: '改めて表明したいと思います',
            hiragana: 'あらためてひょうめいしたいとおもいます',
            katakana: 'アラタメテヒョウメイシタイトオモイマス',
            romaji: 'aratamete hyōmei shitai to omoimasu',
            meaning: '다시 한번 표하고 싶습니다',
            partOfSpeech: '동사 + たい형 + と + 思います',
            usageNote: 'たい형이 희망을, 思います가 정중한 의지를 나타내며 진지한 어조를 만듭니다.'
          }
        ]
      }
    ]
  };
}

async function serveStatic(url, res) {
  let filePath = url.pathname;

  if (filePath === '/') {
    filePath = '/index.html';
  }

  const cleanPath = path.normalize(filePath).replace(/^\/+/, '');
  const resolvedPath = path.join(publicDir, cleanPath);

  if (!resolvedPath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('접근이 금지되었습니다.');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('찾을 수 없습니다.');
      return;
    }

    if (stats.isDirectory()) {
      serveFile(path.join(resolvedPath, 'index.html'), res);
    } else {
      serveFile(resolvedPath, res);
    }
  });
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = getContentType(ext);

  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, { 'Content-Type': contentType });
    stream.pipe(res);
  });
  stream.on('error', () => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('찾을 수 없습니다.');
  });
}

function getContentType(ext) {
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.connection.destroy();
        reject(new Error('요청 본문이 너무 큽니다.'));
      }
    });

    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
