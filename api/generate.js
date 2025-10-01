const { db, setCORS, sendJson, generateSentenceWithOpenAI, getFallbackData, LLM_PROVIDER, OPENAI_API_KEY } = require('./_shared');

export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: '허용되지 않는 메소드입니다.' });
  }

  try {
    const { keyword, level = '3' } = req.body;

    if (!keyword || keyword.trim() === '') {
      return sendJson(res, 400, { error: '키워드를 입력해주세요.' });
    }

    const cleanKeyword = keyword.trim();
    let sentenceData;

    // Generate sentence based on provider
    if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
      sentenceData = await generateSentenceWithOpenAI(cleanKeyword, level);
    } else {
      sentenceData = getFallbackData(cleanKeyword, level);
    }

    // Save to database
    const insertStmt = db.prepare(`
      INSERT INTO sentences (keyword, level, japanese, pronunciation, translation, breakdown)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      cleanKeyword,
      level,
      sentenceData.japanese,
      sentenceData.pronunciation,
      sentenceData.translation,
      JSON.stringify(sentenceData.breakdown)
    );

    // Update user progress
    const progressStmt = db.prepare(`
      INSERT OR REPLACE INTO user_progress (keyword, times_studied, last_studied)
      VALUES (?, COALESCE((SELECT times_studied FROM user_progress WHERE keyword = ?) + 1, 1), CURRENT_TIMESTAMP)
    `);
    progressStmt.run(cleanKeyword, cleanKeyword);

    // Return response
    const response = {
      id: result.lastInsertRowid,
      keyword: cleanKeyword,
      level,
      ...sentenceData
    };

    sendJson(res, 200, response);
  } catch (error) {
    console.error('문장 생성 오류:', error);
    sendJson(res, 500, { error: '문장을 생성하는 동안 문제가 발생했습니다. 다시 시도해 주세요.' });
  }
}