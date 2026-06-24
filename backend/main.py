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

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import agent  # noqa: E402
from db import Attempt, Submission, engine, init_db  # noqa: E402
from sandbox import MAX_OUTPUT  # noqa: E402

PROBLEMS = BASE / "problems"
ATTEMPTS = BASE / "attempts"
ATTEMPTS.mkdir(exist_ok=True)

app = FastAPI(title="Agentic Coding Arena")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


# --- request bodies ---------------------------------------------------------
class StartAttempt(BaseModel):
    problem_id: str
    user: str


class Message(BaseModel):
    text: str


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


def _solved_rate(problem_id: str, session: Session) -> float:
    subs = session.exec(
        select(Submission).where(Submission.problem_id == problem_id)
    ).all()
    if not subs:
        return 0.0
    full = sum(1 for s in subs if s.total > 0 and s.passed == s.total)
    return round(full / len(subs), 3)


# --- routes -----------------------------------------------------------------
@app.get("/problems")
def list_problems():
    out = []
    with Session(engine) as session:
        for d in sorted(PROBLEMS.iterdir()):
            if not (d / "meta.json").exists():
                continue
            m = _meta(d.name)
            out.append(
                {
                    "id": d.name,
                    "title": m.get("title", d.name),
                    "difficulty": m.get("difficulty", "basic"),
                    "category": m.get("category", ""),
                    "solved_rate": _solved_rate(d.name, session),
                }
            )
    return out


@app.post("/attempts")
def start_attempt(body: StartAttempt):
    src = PROBLEMS / body.problem_id / "repo"
    if not src.exists():
        raise HTTPException(404, f"unknown problem: {body.problem_id}")

    attempt_id = uuid.uuid4().hex
    shutil.copytree(src, ATTEMPTS / attempt_id)
    statement = (PROBLEMS / body.problem_id / "statement.md").read_text()

    with Session(engine) as session:
        session.add(Attempt(id=attempt_id, problem_id=body.problem_id, user=body.user))
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
    # Wired in step 6 (grader). Stubbed for now.
    return {
        "passed": 0,
        "total": 0,
        "score": 0,
        "turns": 0,
        "tokens": 0,
        "feedback": "(stub) submit not implemented yet",
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
