# NuMori 2.0 – AI 기반 일본어 학습 플랫폼

차세대 뉴모피즘 디자인의 종합 일본어 학습 앱입니다. AI를 활용해 키워드 기반으로 초급·중급·고급 일본어 문장을 생성하고, 상세한 문법 분석, 진도 추적, 간격 반복 퀴즈, 발음 지원 등 완전한 학습 경험을 제공합니다.

## ✨ 주요 기능

### 🧠 AI 문장 생성
- OpenAI GPT-4o-mini 또는 로컬 Ollama 지원
- 키워드 기반 맞춤형 문장 생성
- 초급/중급/고급 난이도별 학습
- 상세한 문법 분석 (한자, 히라가나, 로마자, 용법)

### 📊 학습 진도 관리
- 개인 학습 기록 자동 저장
- 키워드별 학습 횟수 추적
- 북마크 시스템으로 중요 문장 관리
- 학습 통계 및 진도 시각화

### 🎯 간격 반복 퀴즈
- 과학적 기반 간격 반복 알고리즘
- 북마크된 문장 기반 개인화 퀴즈
- 정답률에 따른 지능형 문제 선별
- 장기 기억 강화를 위한 최적화된 복습

### 🔊 발음 지원
- 내장 TTS를 통한 정확한 일본어 발음
- 모든 문장에서 원클릭 음성 재생
- 퀴즈 모드에서 청취 연습

### 🎨 현대적 UI/UX
- 부드러운 뉴모피즘 디자인
- 반응형 디자인으로 모든 기기 지원
- 직관적인 탭 네비게이션
- 매끄러운 애니메이션과 전환 효과

## 🚀 빠른 시작

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 설정
```bash
# .env 파일 생성 (예시 파일 복사)
cp .env.example .env

# OpenAI API 키 설정 (선택사항)
# .env 파일을 열어 OPENAI_API_KEY를 입력하세요
```

### 3. 서버 시작
```bash
# 개발 모드
npm run dev

# 또는 일반 시작
npm start
```

이후 브라우저에서 <http://localhost:3000> 에 접속하세요.

## ⚙️ 환경 설정

### OpenAI 사용 (권장)
```bash
# .env 파일에 설정
OPENAI_API_KEY=your_api_key_here
LLM_PROVIDER=openai
```

### Ollama 사용 (로컬 AI)
```bash
# Ollama 설치 후 gpt-oss 모델 다운로드
ollama run gpt-oss

# .env 파일 설정
LLM_PROVIDER=ollama
OLLAMA_MODEL=gpt-oss
OLLAMA_HOST=http://127.0.0.1:11434
```

### 샘플 모드 (API 키 없이 체험)
API 키 없이도 미리 준비된 고품질 샘플 데이터로 앱을 체험할 수 있습니다.

## 📱 앱 사용법

### 문장 생성
1. **문장 생성** 탭에서 관심 있는 키워드 입력
2. AI가 초급/중급/고급 문장을 생성
3. 문법 구성 요소를 클릭하여 상세 분석 확인
4. 🔊 버튼으로 발음 듣기, ☆ 버튼으로 즐겨찾기 추가

### 학습 기록 확인
- **학습 기록** 탭에서 생성한 모든 문장 확인
- **즐겨찾기** 탭에서 중요한 문장들 모아보기
- **진도 현황** 탭에서 학습 통계 및 진도 확인

### 퀴즈 학습
1. **퀴즈** 탭에서 간격 반복 퀴즈 시작
2. 즐겨찾기한 문장들이 과학적 알고리즘으로 출제
3. 번역 보기, 문법 분석, 발음 듣기 옵션 활용
4. 정답/오답 피드백으로 학습 효과 극대화

## 🛠️ 개발 및 배포

### 개발 환경 설정
```bash
# 개발 도구 설치
npm install

# 린트 검사
npm run lint

# 코드 포맷팅
npm run format

# 테스트 실행
npm test
```

### 기술 스택
- **Backend**: Node.js, SQLite3, dotenv
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **AI**: OpenAI GPT-4o-mini, Ollama
- **Design**: Neumorphism UI
- **Testing**: Jest
- **Code Quality**: ESLint, Prettier

### 아키텍처
- 제로 프레임워크 접근법으로 가벼운 성능
- SQLite 기반 로컬 데이터 저장
- RESTful API 설계
- 반응형 SPA 구조

## 📂 프로젝트 구조

```
numori/
├── public/           # 프론트엔드 자산
│   ├── index.html   # 메인 HTML
│   ├── styles.css   # 뉴모피즘 스타일
│   └── script.js    # 클라이언트 로직
├── tests/           # 테스트 파일
├── server.js        # Node.js 서버
├── package.json     # 의존성 및 스크립트
├── .env.example     # 환경 변수 예시
└── numori.sqlite    # SQLite 데이터베이스 (자동 생성)
```

## 🔗 API 엔드포인트

- `POST /api/generate` - 키워드 기반 문장 생성
- `GET /api/history` - 학습 기록 조회
- `GET /api/bookmarks` - 즐겨찾기 조회
- `POST /api/bookmark` - 즐겨찾기 토글
- `GET /api/progress` - 학습 진도 조회
- `POST /api/quiz` - 퀴즈 답안 제출 및 다음 문제 요청

## 🎯 학습 알고리즘

NuMori는 **간격 반복 학습법(Spaced Repetition)**을 기반으로 한 지능형 퀴즈 시스템을 제공합니다:

1. **초기 학습**: 새로 즐겨찾기한 문장은 우선적으로 출제
2. **정답률 추적**: 각 문장별 정답률과 학습 빈도 기록
3. **지능형 스케줄링**: 틀린 문장은 더 자주, 맞춘 문장은 점진적으로 간격 확대
4. **장기 기억 강화**: 과학적으로 검증된 복습 주기로 최적화

## 📈 향후 로드맵

- [ ] 사용자 계정 시스템
- [ ] 모바일 앱 버전
- [ ] 다국어 지원 (영어, 중국어 등)
- [ ] 고급 문법 분석 AI
- [ ] 소셜 학습 기능
- [ ] 오프라인 모드
- [ ] 발음 평가 시스템

---

**NuMori 2.0**으로 더 스마트하고 효과적인 일본어 학습을 경험해보세요! 🌸
