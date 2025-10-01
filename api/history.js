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
    const stmt = db.prepare(`
      SELECT
        id, keyword, level, japanese, pronunciation, translation,
        breakdown, created_at, bookmarked
      FROM sentences
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const sentences = stmt.all().map(row => ({
      ...row,
      breakdown: JSON.parse(row.breakdown)
    }));

    sendJson(res, 200, { sentences });
  } catch (error) {
    console.error('기록 조회 오류:', error);
    sendJson(res, 500, { error: '기록을 불러오는 중 오류가 발생했습니다.' });
  }
}