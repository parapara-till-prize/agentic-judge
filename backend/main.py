"""FastAPI app + routes (thin).

File ops + agent loop live in sandbox.py / agent.py; this file is just routing + DB glue.
The submit route stays stubbed until step 6 (grader).
"""
import json
import os
import shutil
import uuid
from pathlib import Path

BASE = Path(__file__).parent

# Load .env into the environment BEFORE importing agent (which reads the endpoint config
# at import time). No external dotenv dependency — tiny KEY=VALUE parser.
_envf = BASE / ".env"
if _envf.exists():
    for _line in _envf.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

from fastapi import Depends, FastAPI, HTTPException, Response  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import agent  # noqa: E402
import auth  # noqa: E402
import grade  # noqa: E402
import scoring  # noqa: E402
from db import Attempt, Submission, engine, init_db  # noqa: E402
from sandbox import MAX_OUTPUT  # noqa: E402

PROBLEMS = BASE / "problems"
ATTEMPTS = BASE / "attempts"
ATTEMPTS.mkdir(exist_ok=True)

app = FastAPI(title="Agentic Coding Arena")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,  # required so the session cookie is sent cross-origin
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


# --- request bodies ---------------------------------------------------------
class StartAttempt(BaseModel):
    problem_id: str


class Message(BaseModel):
    text: str


class Credentials(BaseModel):
    username: str
    password: str


# --- auth (session cookie) --------------------------------------------------
def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        auth.SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=auth.COOKIE_MAX_AGE,
        path="/",
    )


@app.post("/auth/register")
def register(body: Credentials, response: Response):
    auth.register_user(body.username, body.password)
    _set_session_cookie(response, auth.create_session(body.username))
    return {"username": body.username}


@app.post("/auth/login")
def login(body: Credentials, response: Response):
    if not auth.authenticate(body.username, body.password):
        raise HTTPException(401, "invalid username or password")
    _set_session_cookie(response, auth.create_session(body.username))
    return {"username": body.username}


@app.post("/auth/logout")
def logout(response: Response, session: str = auth.Cookie(default=None, alias=auth.SESSION_COOKIE)):
    auth.delete_session(session)
    response.delete_cookie(auth.SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/auth/me")
def me(user: str = Depends(auth.get_current_user)):
    return {"username": user}


# --- helpers ----------------------------------------------------------------
def _meta(slug: str) -> dict:
    return json.loads((PROBLEMS / slug / "meta.json").read_text())


def _workspace_files(attempt_id: str) -> list:
    """Return [{path, content}] for text files in the workdir (for the read-only viewer)."""
    wd = ATTEMPTS / attempt_id
    out = []
    for p in sorted(wd.rglob("*")):
        if not p.is_file() or "__pycache__" in p.parts:
            continue
        try:
            content = p.read_text()[:MAX_OUTPUT]
        except UnicodeDecodeError:
            content = "<binary>"
        out.append({"path": str(p.relative_to(wd)), "content": content})
    return out


def _problem_stats(problem_id: str, session: Session) -> dict:
    """Aggregate submission stats for one problem (solved_rate, counts, turn records)."""
    subs = session.exec(
        select(Submission).where(Submission.problem_id == problem_id)
    ).all()
    if not subs:
        return {"solved_rate": 0.0, "submitters": 0, "avg_turns": None, "best_turns": None}
    full = [s for s in subs if s.total > 0 and s.passed == s.total]
    return {
        "solved_rate": round(len(full) / len(subs), 3),
        "submitters": len({s.user for s in subs}),
        "avg_turns": round(sum(s.turns for s in subs) / len(subs), 1),
        "best_turns": min((s.turns for s in full), default=None),
    }


# --- routes -----------------------------------------------------------------
def _problem_card(slug: str, m: dict, session: Session) -> dict:
    stats = _problem_stats(slug, session)
    return {
        "id": slug,
        "title": m.get("title", slug),
        "difficulty": m.get("difficulty", "basic"),
        "category": m.get("category", ""),
        "domain": m.get("domain", "algorithm"),
        "skills": m.get("skills", []),
        **stats,
    }


@app.get("/problems")
def list_problems():
    out = []
    with Session(engine) as session:
        for d in sorted(PROBLEMS.iterdir()):
            if not (d / "meta.json").exists():
                continue
            out.append(_problem_card(d.name, _meta(d.name), session))
    return out


@app.get("/problems/{problem_id}")
def get_problem(problem_id: str):
    d = PROBLEMS / problem_id
    if not (d / "meta.json").exists():
        raise HTTPException(404, f"unknown problem: {problem_id}")
    with Session(engine) as session:
        card = _problem_card(problem_id, _meta(problem_id), session)
    statement_file = d / "statement.md"
    card["statement"] = statement_file.read_text() if statement_file.exists() else ""
    return card


@app.post("/attempts")
def start_attempt(body: StartAttempt, user: str = Depends(auth.get_current_user)):
    src = PROBLEMS / body.problem_id / "repo"
    if not src.exists():
        raise HTTPException(404, f"unknown problem: {body.problem_id}")

    attempt_id = uuid.uuid4().hex
    shutil.copytree(src, ATTEMPTS / attempt_id)
    statement = (PROBLEMS / body.problem_id / "statement.md").read_text()

    with Session(engine) as session:
        session.add(Attempt(id=attempt_id, problem_id=body.problem_id, user=user))
        session.commit()

    return {
        "attempt_id": attempt_id,
        "statement": statement,
        "files": _workspace_files(attempt_id),
    }


@app.post("/attempts/{attempt_id}/messages")
def post_message(attempt_id: str, body: Message):
    with Session(engine) as session:
        attempt = session.get(Attempt, attempt_id)
        if not attempt:
            raise HTTPException(404, "unknown attempt")

        result = agent.run_agent(attempt_id, list(attempt.history), body.text)

        attempt.history = result["history"]  # reassign so SQLAlchemy flags the JSON dirty
        attempt.turns += 1
        attempt.tokens += result["tokens"]
        session.add(attempt)
        session.commit()
        turns, tokens = attempt.turns, attempt.tokens

    return {
        "events": result["events"],
        "turns": turns,
        "tokens": tokens,
        "files": _workspace_files(attempt_id),
    }


@app.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: str):
    with Session(engine) as session:
        attempt = session.get(Attempt, attempt_id)
        if not attempt:
            raise HTTPException(404, "unknown attempt")

        result = grade.run_hidden_tests(attempt_id, attempt.problem_id)
        passed, total = result["passed"], result["total"]
        scored = scoring.evaluate(
            _meta(attempt.problem_id), passed, total, attempt.turns, attempt.tokens
        )
        points = scored["score"]

        sub = Submission(
            attempt_id=attempt_id,
            problem_id=attempt.problem_id,
            user=attempt.user,
            passed=passed,
            total=total,
            score=points,
            turns=attempt.turns,
            tokens=attempt.tokens,
        )
        session.add(sub)
        session.commit()
        turns, tokens = attempt.turns, attempt.tokens

    if total and passed == total:
        feedback = f"전체 통과 — 히든 {passed}/{total}. 효율 점수 반영됨."
    elif total:
        feedback = f"히든 {passed}/{total} 통과. 실패 케이스의 경계 조건을 점검하세요."
    else:
        feedback = "이 문제에는 히든 테스트가 없습니다."

    return {
        "passed": passed,
        "total": total,
        "score": points,
        "turns": turns,
        "tokens": tokens,
        "axes": scored["axes"],
        "feedback": feedback,
    }


@app.get("/leaderboard")
def leaderboard(problem_id: str = None):
    with Session(engine) as session:
        q = select(Submission)
        if problem_id:
            q = q.where(Submission.problem_id == problem_id)
        subs = session.exec(q).all()

    # best submission per user: most passed, then fewest turns
    best = {}
    for s in subs:
        cur = best.get(s.user)
        if cur is None or (s.passed, -s.turns) > (cur.passed, -cur.turns):
            best[s.user] = s

    ranked = sorted(best.values(), key=lambda s: (-s.passed, s.turns))
    return [
        {"rank": i + 1, "user": s.user, "turns": s.turns, "passed": s.passed}
        for i, s in enumerate(ranked)
    ]
