const {
  db,
  setCORS,
  sendJson,
  parseJsonBody,
  generateSentenceWithOpenAI,
  getFallbackData,
  LLM_PROVIDER,
  OPENAI_API_KEY
} = require('./_shared');

module.exports = async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: '허용되지 않는 메소드입니다.' });
  }

  try {
    const body = await parseJsonBody(req);
    console.log(`[Generate] 요청 수신 - Method: ${req.method}, Body:`, body);

    const { keyword } = body;

    if (!keyword || keyword.trim() === '') {
      console.log('[Generate] 키워드 누락');
      return sendJson(res, 400, { error: '키워드를 입력해주세요.' });
    }

    const cleanKeyword = keyword.trim();
    console.log(`[Generate] 키워드: ${cleanKeyword}, Provider: ${LLM_PROVIDER}`);

    const sentences = [];

    // Generate sentences for all 3 levels
    const levels = ['초급', '중급', '고급'];

    for (const level of levels) {
      console.log(`[Generate] ${level} 문장 생성 시작`);
      let sentenceData;

      // Generate sentence based on provider
      if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
        console.log(`[Generate] OpenAI API 사용 - ${level}`);
        sentenceData = await generateSentenceWithOpenAI(cleanKeyword, level);
      } else {
        console.log(`[Generate] Fallback 데이터 사용 - ${level}`);
        sentenceData = getFallbackData(cleanKeyword, level);
      }

      console.log(`[Generate] ${level} 문장 생성 완료:`, sentenceData.japanese);

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

      // Add sentence with ID to response
      sentences.push({
        id: result.lastInsertRowid,
        level,
        ...sentenceData
      });
    }

    // Update user progress
    const progressStmt = db.prepare(`
      INSERT OR REPLACE INTO user_progress (keyword, times_studied, last_studied)
      VALUES (?, COALESCE((SELECT times_studied FROM user_progress WHERE keyword = ?) + 1, 1), CURRENT_TIMESTAMP)
    `);
    progressStmt.run(cleanKeyword, cleanKeyword);

    console.log(`[Generate] 응답 전송 - ${sentences.length}개 문장`);
    // Return response in the same format as server.js
    sendJson(res, 200, { sentences });
  } catch (error) {
    if (error?.statusCode === 400) {
      console.error('[Generate] 본문 파싱 오류:', error.message);
      return sendJson(res, 400, { error: error.message });
    }

    console.error('[Generate] 오류:', error);
    sendJson(res, 500, { error: '문장을 생성하는 동안 문제가 발생했습니다. 다시 시도해 주세요.' });
  }
}
