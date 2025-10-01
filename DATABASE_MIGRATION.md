# Vercel 데이터베이스 문제 및 해결 방안

## 현재 문제점

### 1. `/tmp` 디렉토리 사용의 문제
현재 `api/_shared.js:6`에서 `/tmp/numori.db`를 사용하고 있습니다:
```javascript
const db = new Database('/tmp/numori.db');
```

**문제:**
- Vercel 서버리스 함수의 `/tmp` 디렉토리는 **임시 저장소**입니다
- 함수 실행이 끝나면 데이터가 손실될 수 있습니다
- 각 서버리스 함수 인스턴스가 별도의 파일 시스템을 가질 수 있어 데이터 일관성 문제 발생
- Cold start 시 데이터베이스가 초기화되어 모든 데이터 손실

### 2. 데이터 영구성 부재
- 사용자가 생성한 문장, 북마크, 퀴즈 기록이 유지되지 않음
- 프로덕션 환경에서 사용 불가능

## 해결 방안

### 옵션 1: Vercel Postgres (추천) ⭐
**장점:**
- Vercel과 완벽한 통합
- 자동 확장 및 백업
- 무료 티어 제공
- SQL 기반이므로 기존 쿼리 유지 가능

**구현 단계:**
1. Vercel 대시보드에서 Postgres 데이터베이스 생성
2. `@vercel/postgres` 패키지 설치
3. 환경변수 자동 설정됨
4. SQLite 쿼리를 PostgreSQL 문법으로 변경

**예제 코드:**
```javascript
const { sql } = require('@vercel/postgres');

// 문장 조회
const result = await sql`
  SELECT * FROM sentences
  WHERE bookmarked = 1
  ORDER BY created_at DESC
`;
```

### 옵션 2: Turso (Libsql - SQLite 호환)
**장점:**
- SQLite 문법 그대로 사용 가능
- 엣지 데이터베이스로 빠른 응답
- 무료 티어 제공 (500 databases, 9GB 저장소)

**구현 단계:**
1. Turso 계정 생성 및 데이터베이스 생성
2. `@libsql/client` 설치
3. 연결 URL 및 토큰을 Vercel 환경변수에 추가

**예제 코드:**
```javascript
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const result = await db.execute('SELECT * FROM sentences WHERE bookmarked = 1');
```

### 옵션 3: Supabase
**장점:**
- PostgreSQL 기반
- 실시간 기능 제공
- 인증 시스템 내장
- 무료 티어 제공

**구현 단계:**
1. Supabase 프로젝트 생성
2. `@supabase/supabase-js` 설치
3. API 키를 환경변수에 추가

### 옵션 4: PlanetScale
**장점:**
- MySQL 호환
- Serverless 친화적
- 브랜치 기반 개발 가능

**구현 단계:**
1. PlanetScale 데이터베이스 생성
2. 연결 문자열을 환경변수에 추가

## 권장 마이그레이션 순서

1. **Turso 사용 (최소 변경)**
   - SQLite 문법 그대로 사용 가능
   - 가장 빠른 마이그레이션 경로
   - `better-sqlite3` → `@libsql/client` 변경만 필요

2. **Vercel Postgres (장기 확장성)**
   - 쿼리 문법 변경 필요
   - Vercel 생태계와 완벽 통합
   - 더 강력한 기능

## 임시 해결책 (개발 환경)
개발/테스트 중이라면 현재 구조 유지 가능하나, **프로덕션 배포 전 반드시 영구 DB로 마이그레이션 필요**

## 다음 단계
1. 원하는 데이터베이스 선택
2. 환경 설정 및 계정 생성
3. 코드 마이그레이션
4. 스키마 생성 및 테스트
5. Vercel 환경변수 설정
6. 배포 및 검증
