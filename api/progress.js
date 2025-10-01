const { db, setCORS, sendJson } = require('./_shared');

module.exports = async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: '허용되지 않는 메소드입니다.' });
  }

  try {
    const progressStmt = db.prepare(`
      SELECT keyword, times_studied, last_studied, difficulty_preference
      FROM user_progress
      ORDER BY last_studied DESC
      LIMIT 20
    `);

    const progress = progressStmt.all();

    const statsStmt = db.prepare(`
      SELECT
        COUNT(*) as total_sentences,
        COUNT(CASE WHEN bookmarked = 1 THEN 1 END) as bookmarked_count,
        COUNT(DISTINCT keyword) as unique_keywords
      FROM sentences
    `);

    const stats = statsStmt.get();

    sendJson(res, 200, {
      progress,
      stats
    });
  } catch (error) {
    console.error('진도 조회 오류:', error);
    sendJson(res, 500, { error: '진도를 불러오는 중 오류가 발생했습니다.' });
  }
}