# Frontend — Agentic Coding Arena

Vite + React 19 + react-router. 4개 화면: ProblemList(홈) · Workspace · Result · Leaderboard.

## 사전 준비

- Node.js 18+ (Vite 8)

```bash
npm install
```

## 실행

```bash
npm run dev       # http://localhost:5173
```

기타 스크립트:

```bash
npm run build     # 프로덕션 빌드
npm run preview   # 빌드 결과 미리보기
npm run lint      # oxlint
```

## 백엔드 연동

- 백엔드를 `http://localhost:8000`에서 띄워야 한다 (`../backend/README.md` 참고).
- 백엔드 CORS가 `http://localhost:5173`을 허용한다.
- 현재 화면 데이터는 `src/data/mock.js` 기반이며, 실 API(`api.js`) 연결은 진행 중.

## 구조

```
src/
  pages/        Home · ProblemDetail · Workspace · Result · Leaderboard
  components/   Navbar · ui · Select · Toggle · SkillFilter 등
  data/mock.js  목업 데이터
  App.jsx       라우트 정의
  main.jsx      엔트리(BrowserRouter + ThemeProvider)
```
