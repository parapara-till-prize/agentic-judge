# Agentic Judge

AI 코딩 에이전트를 **자연어로 지시·검증**해서 문제를 푸는 능력을 평가하는 코딩 문제은행.
사용자는 코드를 직접 못 친다 — 에이전트(주니어)에게 지시·리뷰만 한다.

## 백엔드 실행 흐름

큰 그림: **파일의 주인은 서버, 컨테이너는 일회용 실행기.**

```
[브라우저] ──HTTP──> [FastAPI main.py] ──> [agent.py 루프] ──> [sandbox.py]
                           │                                       │
                           ▼                                 파일IO: 호스트
                     [SQLite db.py]                    run_command: docker --rm
                                                               │
                        attempts/{id}/ ◀── source of truth ────┘
```

- **`GET /problems`** — `problems/` 폴더 스캔 + `meta.json` 읽고 `solved_rate` 계산.
  카테고리는 중립("API 구현"/"알고리즘")만, 함정은 숨김.
- **`POST /attempts {problem_id,user}`** — `problems/{slug}/repo/`를 `attempts/{id}/`로
  copytree(이 폴더가 진실) → statement + 파일목록 반환, DB에 Attempt 행 생성.
- **`POST /attempts/{id}/messages {text}`** ← 핵심 루프
  1. DB에서 `history`(OpenAI 메시지 배열) 복원 + 사용자 텍스트 추가
  2. LLM 호출 → `tool_calls` 있으면:
     - `read_file`/`write_file`/`list_files` → **호스트에서** `attempts/{id}/` 직접 조작
     - `run_command` → **`docker run --rm`** 일회용 컨테이너(network none·mem/pid 제한·nobody·
       내부 `timeout 5`+외부 15s)에서 실행, 볼륨 마운트라 결과가 호스트에 남음
     - 결과를 `{"role":"tool",...}`로 history에 추가 → 툴 없을 때까지 LLM 재호출
  3. 턴 끝: `history`·`turns(+1)`·`tokens` DB 저장. 컨테이너는 자동 삭제(좀비 없음)
  4. 반환: `events`(칩+에이전트텍스트) + `turns` + `tokens` + `files`
  → **사용자 1번 개입 = 1턴.** 그 안에서 에이전트는 파일 여러 개 읽고/쓰고/테스트를 자율 실행.
- **`POST /attempts/{id}/submit`** — (아직 stub) 나중에 `attempts/{id}/`를 별도 채점 폴더로 복사
  → **거기에만** 히든 테스트 주입 → 실행 → 점수만 받고 폐기. 원본·작업컨테이너엔 히든 안 들어감.
- **`GET /leaderboard?problem_id=`** — Submission에서 유저별 최고기록(통과수↑·턴수↓) 랭킹.

## 디렉토리 구조

```
backend/
  main.py        # FastAPI 앱 + 라우트(얇게) + .env 로더
  agent.py       # 에이전트 루프(OpenAI 호환 tool-calling), TOOLS 4종
  sandbox.py     # run_tool(호스트 파일IO) + run_in_container(일회용 컨테이너)
  db.py          # SQLModel: Attempt(JSON history) + Submission + SQLite 엔진
  grader.py      # grade()  ← 아직 없음(6단계)
  problems/<slug>/
    statement.md            # 문제 설명
    meta.json               # {title,difficulty,category,ideal_turns,trap_note}
    repo/                   # attempts로 복사되는 작업 시작점
      solution.py           #   스타터 코드
      tests/test_visible.py #   예제 테스트(에이전트가 돌려봄)
    hidden/test_hidden.py   # 채점기 전용. repo에 절대 넣지 말 것.
  attempts/      # 런타임 작업폴더(gitignore, 시작 시 자동 mkdir)
  requirements.txt / .env.example / .gitignore / .venv(py3.12)
docker/judge-py.Dockerfile   # judge-py:base = python:3.12-slim + pytest
frontend/        # Vite+React, 사용자가 동시 작업 중 → 건드리지 말 것
```

## 메모
- LLM: OpenAI 호환, `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL` 환경변수. Ollama 기반 예정
  (ngrok 연결). `.env` 채우면 동작. 현재 실제 LLM 호출은 mock 클라이언트로만 검증됨.
- 라이브러리는 `fastapi` `uvicorn` `sqlmodel` `openai`만. 서비스 계층 만들지 말 것.
- 진행: 1~4단계(샌드박스·에이전트·라우트·데모문제3개) 완료·커밋됨. 다음은 프론트 연결(5단계~).
```bash
docker build -t judge-py:base -f docker/judge-py.Dockerfile docker/
cd backend && .venv/bin/uvicorn main:app --port 8000
```
```

