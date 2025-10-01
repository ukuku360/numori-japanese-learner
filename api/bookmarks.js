const { db, setCORS, sendJson } = require('./_shared');

export default async function handler(req, res) {
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
      WHERE bookmarked = 1
      ORDER BY created_at DESC
    `);

    const bookmarks = stmt.all().map(row => ({
      ...row,
      breakdown: JSON.parse(row.breakdown)
    }));

    sendJson(res, 200, bookmarks);
  } catch (error) {
    console.error('북마크 조회 오류:', error);
    sendJson(res, 500, { error: '북마크를 불러오는 중 오류가 발생했습니다.' });
  }
}