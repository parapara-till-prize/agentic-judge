# Backend — Agentic Judge

FastAPI + SQLModel + SQLite. 에이전트 루프 + 샌드박스 채점.

## 사전 준비

- Docker (실행 중)
- Python 3.12

```bash
# 1) 채점/실행용 베이스 이미지 빌드 (1회)
docker build -t judge-py:base -f ../docker/judge-py.Dockerfile ../docker

# 2) 가상환경 + 의존성
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 3) LLM 엔드포인트 설정
cp .env.example .env
# .env 에서 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL 수정
# (Ollama 예: OPENAI_BASE_URL=http://localhost:11434/v1, 원격은 ngrok URL + /v1)
```

## 실행

```bash
.venv/bin/uvicorn main:app --port 8000 --reload
```

- 서버: http://localhost:8000 · API 문서: http://localhost:8000/docs
- CORS는 Vite dev(`http://localhost:5173`) 허용됨.
- SQLite `arena.db`, 작업폴더 `attempts/`는 자동 생성(gitignore).

## 빠른 확인

```bash
curl http://localhost:8000/problems
curl -X POST http://localhost:8000/attempts \
  -H 'Content-Type: application/json' \
  -d '{"problem_id":"range-sum","user":"me"}'
```

> `/messages`는 실제 LLM 호출이 필요하다(.env 설정 후 동작). 미설정 시 라우트는 뜨지만
> 에이전트 호출에서 연결 에러가 난다.

## 구조

```
main.py     라우트(얇게) + .env 로더
agent.py    OpenAI 호환 tool-calling 루프 (TOOLS 4종)
sandbox.py  run_tool(호스트 파일IO) + run_in_container(docker --rm 일회용)
db.py       Attempt(JSON history) + Submission + SQLite
problems/   문제 폴더 (statement.md / meta.json / repo / hidden)
```

자세한 실행 흐름은 루트 [CLAUDE.md](../CLAUDE.md) 참고.
