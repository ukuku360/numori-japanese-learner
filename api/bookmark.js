const { db, setCORS, sendJson } = require('./_shared');

export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: '허용되지 않는 메소드입니다.' });
  }

  try {
    const { id, bookmarked } = req.body;

    if (!id) {
      return sendJson(res, 400, { error: 'ID가 필요합니다.' });
    }

    const stmt = db.prepare('UPDATE sentences SET bookmarked = ? WHERE id = ?');
    const result = stmt.run(bookmarked ? 1 : 0, id);

    if (result.changes === 0) {
      return sendJson(res, 404, { error: '문장을 찾을 수 없습니다.' });
    }

    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error('북마크 오류:', error);
    sendJson(res, 500, { error: '북마크 처리 중 오류가 발생했습니다.' });
  }
}