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
    const { sentenceId, correct } = req.body;

    if (!sentenceId || typeof correct !== 'boolean') {
      return sendJson(res, 400, { error: '문장 ID와 정답 여부가 필요합니다.' });
    }

    // Record quiz answer
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
      try {
        nextQuestion.breakdown = JSON.parse(nextQuestion.breakdown);
      } catch (e) {
        nextQuestion.breakdown = [];
      }
    }

    return sendJson(res, 200, {
      success: true,
      nextQuestion: nextQuestion || null
    });
  } catch (error) {
    console.error('퀴즈 처리 오류:', error);
    return sendJson(res, 500, { error: '퀴즈를 처리할 수 없습니다.' });
  }
}