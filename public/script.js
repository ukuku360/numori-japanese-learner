// DOM Elements
const form = document.getElementById('keywordForm');
const keywordInput = document.getElementById('keyword');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const detailPanel = document.getElementById('detailPanel');
const detailHeading = document.getElementById('detailHeading');
const detailContent = document.getElementById('detailContent');
const template = document.getElementById('sentenceTemplate');
const quizTemplate = document.getElementById('quizQuestionTemplate');

// Tab Elements
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanels = document.querySelectorAll('.tab-panel');
const historyList = document.getElementById('historyList');
const bookmarksList = document.getElementById('bookmarksList');
const quizContent = document.getElementById('quizContent');
const progressStats = document.getElementById('progressStats');
const progressDetails = document.getElementById('progressDetails');
const startQuizBtn = document.getElementById('startQuizBtn');

// State
let activeButton = null;
let currentQuizQuestion = null;
let speechSynthesis = window.speechSynthesis;

const levelLabelMap = {
  basic: '초급',
  beginner: '초급',
  elementary: '초급',
  intermediate: '중급',
  advanced: '고급',
  'upper-intermediate': '고급'
};

function localizeLevel(level) {
  const normalized = (level || '').toString().trim();
  if (!normalized) return '';
  return levelLabelMap[normalized.toLowerCase()] || normalized;
}

// Tab Navigation
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;
    switchTab(targetTab);
  });
});

function switchTab(targetTab) {
  // Update active tab
  navTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === targetTab);
  });

  // Update active panel
  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === targetTab + 'Tab');
  });

  // Load content for specific tabs
  switch (targetTab) {
    case 'history':
      loadHistory();
      break;
    case 'bookmarks':
      loadBookmarks();
      break;
    case 'progress':
      loadProgress();
      break;
    case 'quiz':
      initializeQuiz();
      break;
  }
}

// Text-to-Speech for Japanese
function speakJapanese(text) {
  if (!speechSynthesis) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.8;
  utterance.pitch = 1;

  speechSynthesis.speak(utterance);
}

// Bookmark functionality
async function toggleBookmark(sentenceId, isBookmarked) {
  try {
    const response = await fetch('/api/bookmark', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sentenceId: sentenceId,
        bookmarked: !isBookmarked
      })
    });

    if (response.ok) {
      return !isBookmarked;
    }
  } catch (error) {
    console.error('북마크 저장 오류:', error);
  }
  return isBookmarked;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const keyword = keywordInput.value.trim();

  if (!keyword) {
    setStatus('시작하려면 키워드를 입력해주세요.');
    return;
  }

  setStatus('문장을 생성하는 중입니다…');
  toggleLoading(true);
  resetDetailPanel();

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ keyword })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || '콘텐츠 생성에 실패했습니다.');
    }

    const payload = await response.json();
    renderSentences(payload?.sentences || []);

    if (payload?.sentences?.length) {
      setStatus('어떤 구절이든 눌러 구성 방식을 확인하세요.');
    } else {
      setStatus('예시가 없습니다. 다른 키워드를 입력해 보세요.');
    }
  } catch (error) {
    console.error(error);
    setStatus('문장을 생성하는 동안 문제가 발생했습니다. 다시 시도해 주세요.');
  } finally {
    toggleLoading(false);
  }
});

function toggleLoading(isLoading) {
  generateBtn.disabled = isLoading;
  generateBtn.classList.toggle('is-pressed', isLoading);
  generateBtn.textContent = isLoading ? '생성 중…' : '문장 생성';
}

function setStatus(message) {
  statusEl.textContent = message;
}

function renderSentences(sentences) {
  resultsEl.innerHTML = '';

  if (!sentences.length) {
    return;
  }

  sentences.forEach((sentence, index) => {
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.sentence-card');
    const levelEl = clone.querySelector('.level');
    const sentenceTextEl = clone.querySelector('.sentence-text');
    const pronunciationEl = clone.querySelector('.pronunciation');
    const translationEl = clone.querySelector('.translation');
    const breakdownEl = clone.querySelector('.breakdown');
    const bookmarkBtn = clone.querySelector('.bookmark-btn');
    const audioBtn = clone.querySelector('.audio-btn');

    const displayLevel = localizeLevel(sentence.level);
    levelEl.textContent = displayLevel;
    sentenceTextEl.textContent = sentence.japanese || '';
    pronunciationEl.textContent = sentence.pronunciation || '';
    translationEl.textContent = sentence.translation || '';

    // Add sentence ID for database operations
    const sentenceId = sentence.id || Date.now() + index;
    card.dataset.sentenceId = sentenceId;

    // Audio button functionality
    audioBtn.addEventListener('click', () => {
      speakJapanese(sentence.japanese);
    });

    // Bookmark button functionality
    let isBookmarked = sentence.bookmarked || false;
    updateBookmarkButton(bookmarkBtn, isBookmarked);

    bookmarkBtn.addEventListener('click', async () => {
      const newBookmarkState = await toggleBookmark(sentenceId, isBookmarked);
      isBookmarked = newBookmarkState;
      updateBookmarkButton(bookmarkBtn, isBookmarked);
    });

    if (Array.isArray(sentence.breakdown)) {
      sentence.breakdown.forEach((piece, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = piece.fragment || piece.literal || piece.surface || `부분 ${index + 1}`;
        button.addEventListener('click', () => handlePieceClick(button, { ...sentence, level: displayLevel }, piece));
        breakdownEl.appendChild(button);
      });
    }

    resultsEl.appendChild(clone);
  });
}

function updateBookmarkButton(button, isBookmarked) {
  button.textContent = isBookmarked ? '★' : '☆';
  button.classList.toggle('bookmarked', isBookmarked);
  button.title = isBookmarked ? '즐겨찾기 해제' : '즐겨찾기 추가';
}

function handlePieceClick(button, sentence, piece) {
  if (activeButton) {
    activeButton.classList.remove('active');
  }
  button.classList.add('active');
  activeButton = button;

  if (detailPanel.classList.contains('hidden')) {
    detailPanel.classList.remove('hidden');
  }

  detailHeading.textContent = `${localizeLevel(sentence.level) || '문장'} • ${piece.fragment || piece.surface || piece.literal || ''}`.trim();

  const scripts = [
    piece.kanji ? { label: '한자', value: piece.kanji } : null,
    piece.hiragana ? { label: '히라가나', value: piece.hiragana } : null,
    piece.katakana ? { label: '가타카나', value: piece.katakana } : null,
    piece.romaji ? { label: '로마자', value: piece.romaji } : null
  ].filter(Boolean);

  const metaRows = [
    piece.partOfSpeech ? { label: '역할', value: piece.partOfSpeech } : null,
    sentence.translation ? { label: '문장 의미', value: sentence.translation } : null
  ].filter(Boolean);

  detailContent.innerHTML = '';

  if (scripts.length) {
    scripts.forEach((script) => {
      const row = document.createElement('div');
      row.className = 'row';

      const label = document.createElement('span');
      label.textContent = script.label;

      const value = document.createElement('small');
      value.textContent = script.value;

      row.append(label, value);
      detailContent.appendChild(row);
    });
  }

  if (piece.meaning) {
    const meaningRow = document.createElement('div');
    meaningRow.className = 'row';

    const label = document.createElement('span');
    label.textContent = '의미';

    const value = document.createElement('small');
    value.textContent = piece.meaning;

    meaningRow.append(label, value);
    detailContent.appendChild(meaningRow);
  }

  metaRows.forEach((meta) => {
    const row = document.createElement('div');
    row.className = 'row';

    const label = document.createElement('span');
    label.textContent = meta.label;

    const value = document.createElement('small');
    value.textContent = meta.value;

    row.append(label, value);
    detailContent.appendChild(row);
  });

  if (piece.usageNote || piece.grammarNote) {
    const notes = document.createElement('p');
    notes.className = 'notes';
    notes.textContent = piece.usageNote || piece.grammarNote;
    detailContent.appendChild(notes);
  }
}

function resetDetailPanel() {
  detailHeading.textContent = '구절을 눌러 형태를 살펴보세요';
  detailContent.innerHTML = '';
  detailPanel.classList.add('hidden');
  if (activeButton) {
    activeButton.classList.remove('active');
    activeButton = null;
  }
}

// History Tab Functions
async function loadHistory() {
  try {
    const response = await fetch('/api/history?limit=20');
    const data = await response.json();

    if (data.sentences) {
      renderHistoryList(data.sentences);
    }
  } catch (error) {
    console.error('기록 로딩 오류:', error);
  }
}

function renderHistoryList(sentences) {
  historyList.innerHTML = '';

  if (!sentences.length) {
    historyList.innerHTML = '<p>아직 학습 기록이 없습니다.</p>';
    return;
  }

  sentences.forEach(sentence => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="item-header">
        <span class="item-keyword">${sentence.keyword}</span>
        <span class="item-level">${sentence.level}</span>
      </div>
      <div class="item-japanese">${sentence.japanese}</div>
      <div class="item-translation">${sentence.translation}</div>
    `;
    historyList.appendChild(item);
  });
}

// Bookmarks Tab Functions
async function loadBookmarks() {
  try {
    const response = await fetch('/api/bookmarks');
    const data = await response.json();

    if (data.bookmarks) {
      renderBookmarksList(data.bookmarks);
    }
  } catch (error) {
    console.error('북마크 로딩 오류:', error);
  }
}

function renderBookmarksList(bookmarks) {
  bookmarksList.innerHTML = '';

  if (!bookmarks.length) {
    bookmarksList.innerHTML = '<p>아직 즐겨찾기한 문장이 없습니다.</p>';
    return;
  }

  bookmarks.forEach(bookmark => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.innerHTML = `
      <div class="item-header">
        <span class="item-keyword">${bookmark.keyword}</span>
        <span class="item-level">${bookmark.level}</span>
        <button class="audio-btn" onclick="speakJapanese('${bookmark.japanese}')">🔊</button>
      </div>
      <div class="item-japanese">${bookmark.japanese}</div>
      <div class="item-translation">${bookmark.translation}</div>
    `;
    bookmarksList.appendChild(item);
  });
}

// Progress Tab Functions
async function loadProgress() {
  try {
    const response = await fetch('/api/progress');
    const data = await response.json();

    if (data.stats) {
      renderProgressStats(data.stats);
    }
    if (data.progress) {
      renderProgressDetails(data.progress);
    }
  } catch (error) {
    console.error('진도 로딩 오류:', error);
  }
}

function renderProgressStats(stats) {
  progressStats.innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${stats.total_sentences || 0}</div>
      <div class="stat-label">생성한 문장</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.unique_keywords || 0}</div>
      <div class="stat-label">학습한 키워드</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.bookmarked_count || 0}</div>
      <div class="stat-label">즐겨찾기</div>
    </div>
  `;
}

function renderProgressDetails(progress) {
  progressDetails.innerHTML = '';

  if (!progress.length) {
    progressDetails.innerHTML = '<p>아직 학습 진도가 없습니다.</p>';
    return;
  }

  progress.slice(0, 10).forEach(item => {
    const detail = document.createElement('div');
    detail.className = 'progress-item';
    detail.innerHTML = `
      <div class="item-header">
        <span class="item-keyword">${item.keyword}</span>
        <span class="item-level">${item.times_studied}회 학습</span>
      </div>
      <div class="item-translation">마지막 학습: ${new Date(item.last_studied).toLocaleDateString('ko-KR')}</div>
    `;
    progressDetails.appendChild(detail);
  });
}

// Quiz Functions
function initializeQuiz() {
  if (startQuizBtn) {
    startQuizBtn.addEventListener('click', startQuiz);
  }
}

async function startQuiz() {
  try {
    const response = await fetch('/api/quiz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sentenceId: 1, correct: true }) // Dummy to get first question
    });

    const data = await response.json();

    if (data.nextQuestion) {
      currentQuizQuestion = data.nextQuestion;
      renderQuizQuestion(data.nextQuestion);
    } else {
      quizContent.innerHTML = '<p>퀴즈할 문장이 없습니다. 먼저 문장을 즐겨찾기에 추가해주세요!</p>';
    }
  } catch (error) {
    console.error('퀴즈 시작 오류:', error);
  }
}

function renderQuizQuestion(question) {
  const clone = quizTemplate.content.cloneNode(true);
  const questionText = clone.querySelector('.question-text');
  const quizOptions = clone.querySelectorAll('.quiz-option');
  const answerContent = clone.querySelector('.answer-content');
  const feedbackBtns = clone.querySelectorAll('.feedback-btn');

  questionText.textContent = question.japanese;

  // Quiz option event listeners
  quizOptions.forEach(option => {
    option.addEventListener('click', () => {
      const type = option.dataset.type;
      const answerEl = clone.querySelector('.quiz-answer');

      switch (type) {
        case 'show-translation':
          answerContent.innerHTML = `<p><strong>번역:</strong> ${question.translation}</p>`;
          break;
        case 'show-breakdown':
          const breakdown = question.breakdown.map(piece =>
            `<span>${piece.fragment}: ${piece.meaning}</span>`
          ).join(', ');
          answerContent.innerHTML = `<p><strong>문법 분석:</strong> ${breakdown}</p>`;
          break;
        case 'play-audio':
          speakJapanese(question.japanese);
          return;
      }

      answerEl.classList.remove('hidden');
    });
  });

  // Feedback button listeners
  feedbackBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const correct = btn.classList.contains('correct');
      await submitQuizAnswer(question.id, correct);
    });
  });

  quizContent.innerHTML = '';
  quizContent.appendChild(clone);
}

async function submitQuizAnswer(questionId, correct) {
  try {
    const response = await fetch('/api/quiz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sentenceId: questionId,
        correct: correct
      })
    });

    const data = await response.json();

    if (data.nextQuestion) {
      currentQuizQuestion = data.nextQuestion;
      renderQuizQuestion(data.nextQuestion);
    } else {
      quizContent.innerHTML = `
        <div class="quiz-complete">
          <h3>퀴즈 완료!</h3>
          <p>더 많은 퀴즈를 원하시면 새로운 문장을 즐겨찾기에 추가해주세요.</p>
          <button onclick="initializeQuiz()" class="start-quiz-btn">다시 시작</button>
        </div>
      `;
    }
  } catch (error) {
    console.error('퀴즈 답변 제출 오류:', error);
  }
}

// Initialize app
window.addEventListener('DOMContentLoaded', () => {
  keywordInput.value = '감사';
  initializeQuiz();
});
