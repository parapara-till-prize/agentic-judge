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
from fastapi.responses import StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

import agent  # noqa: E402
import auth  # noqa: E402
import grade  # noqa: E402
import scoring  # noqa: E402
from db import Attempt, Submission, engine, init_db  # noqa: E402
import sandbox  # noqa: E402
from sandbox import MAX_OUTPUT  # noqa: E402

PROBLEMS = BASE / "problems"
ATTEMPTS = BASE / "attempts"
ATTEMPTS.mkdir(exist_ok=True)

app = FastAPI(title="Agentic Judge")
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


class FileSave(BaseModel):
    path: str
    content: str


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
def _workspace_files(attempt_id: str) -> list:
    """Return [{path, content}] for text files in the workdir (for the read-only viewer)."""
    wd = ATTEMPTS / attempt_id
    out = []
    _skip = {"__pycache__", ".pytest_cache", "harness"}
    for p in sorted(wd.rglob("*")):
        if not p.is_file() or _skip & set(p.parts):
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
# Public problem IDs are numbers (meta.json "id"); the slug stays the on-disk folder name.
# `problem_id` stored on attempts/submissions is the numeric id (as a string).
def _index() -> dict:
    """Map public numeric id (as str) -> (slug, meta). Scans the problems dir."""
    idx = {}
    for d in sorted(PROBLEMS.iterdir()):
        mf = d / "meta.json"
        if not mf.exists():
            continue
        m = json.loads(mf.read_text())
        if "id" in m:
            idx[str(m["id"])] = (d.name, m)
    return idx


def _resolve(problem_id: str) -> tuple:
    """(slug, meta) for a public numeric id, or 404."""
    hit = _index().get(str(problem_id))
    if not hit:
        raise HTTPException(404, f"unknown problem: {problem_id}")
    return hit


def _problem_card(pid: str, slug: str, m: dict, session: Session) -> dict:
    stats = _problem_stats(pid, session)  # submissions are keyed by the public id
    return {
        "id": m["id"],
        "slug": slug,
        "title": m.get("title", slug),
        "difficulty": m.get("difficulty", "basic"),
        "category": m.get("category", ""),
        "domain": m.get("type", "algorithm"),
        "skills": m.get("skills", []),
        **stats,
    }


@app.get("/problems")
def list_problems():
    out = []
    with Session(engine) as session:
        for pid, (slug, m) in sorted(_index().items(), key=lambda kv: kv[0]):
            out.append(_problem_card(pid, slug, m, session))
    return out


@app.get("/problems/{problem_id}")
def get_problem(problem_id: str):
    slug, m = _resolve(problem_id)
    with Session(engine) as session:
        card = _problem_card(str(m["id"]), slug, m, session)
    statement_file = PROBLEMS / slug / "statement.md"
    card["statement"] = statement_file.read_text() if statement_file.exists() else ""
    return card


@app.post("/attempts")
def start_attempt(body: StartAttempt, user: str = Depends(auth.get_current_user)):
    slug, m = _resolve(body.problem_id)
    src = PROBLEMS / slug / "repo"
    if not src.exists():
        raise HTTPException(404, f"unknown problem: {body.problem_id}")

    attempt_id = uuid.uuid4().hex
    shutil.copytree(src, ATTEMPTS / attempt_id)
    harness_src = BASE / "harness"
    if harness_src.exists():
        shutil.copytree(harness_src, ATTEMPTS / attempt_id / "harness")
    statement = (PROBLEMS / slug / "statement.md").read_text()

    with Session(engine) as session:
        session.add(Attempt(id=attempt_id, problem_id=str(m["id"]), user=user))
        session.commit()

    return {
        "attempt_id": attempt_id,
        "statement": statement,
        "files": _workspace_files(attempt_id),
    }


@app.put("/attempts/{attempt_id}/files")
def save_file(attempt_id: str, body: FileSave, user: str = Depends(auth.get_current_user)):
    """Overwrite one existing workspace file with user-edited content.

    The attempt workdir is the source of truth (it's what run_command mounts and what submit
    grades), so a direct edit here is picked up by both local tests and submission — no agent
    round-trip needed. Restricted to the owner, to paths that stay inside the workdir, and to
    files that already exist (no creating arbitrary paths).
    """
    with Session(engine) as session:
        attempt = session.get(Attempt, attempt_id)
        if not attempt:
            raise HTTPException(404, "unknown attempt")
        if attempt.user != user:
            raise HTTPException(403, "not your attempt")

    wd = (ATTEMPTS / attempt_id).resolve()
    target = (wd / body.path).resolve()
    if wd != target and wd not in target.parents:
        raise HTTPException(400, "invalid path")  # path escapes the workdir
    if not target.is_file():
        raise HTTPException(404, f"no such file: {body.path}")

    target.write_text(body.content)
    return {"files": _workspace_files(attempt_id)}


@app.post("/attempts/{attempt_id}/run-tests")
def run_tests(attempt_id: str, user: str = Depends(auth.get_current_user)):
    """Run the problem's visible test command in a disposable container, on demand.

    Same command + image the agent uses (meta.runtime), so a user who edited files directly
    can verify them without waiting for the agent to decide to run tests. Read-only w.r.t. the
    workdir — it only executes the visible suite. Returns {command, output}; the client parses
    it into the same pass/fail panel a run_command result would produce.
    """
    with Session(engine) as session:
        attempt = session.get(Attempt, attempt_id)
        if not attempt:
            raise HTTPException(404, "unknown attempt")
        if attempt.user != user:
            raise HTTPException(403, "not your attempt")

    _slug, meta = _resolve(attempt.problem_id)
    test_cmd = (meta.get("open") or {}).get("cmd")
    if not test_cmd:
        raise HTTPException(400, "this problem has no visible test command")
    image = (meta.get("submission") or {}).get("runtime") or "judge-py:base"

    output = sandbox.run_in_container(ATTEMPTS / attempt_id, test_cmd, image)
    return {"command": test_cmd, "output": output}


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


@app.post("/attempts/{attempt_id}/messages")
def post_message(attempt_id: str, body: Message):
    """Run one agent turn, streaming events as Server-Sent Events.

    The whole loop still runs server-side, but the client sees each tool call, file
    change and test run as it happens. History/turns/tokens are persisted once the turn
    finishes, then a final `done` event carries the authoritative counters + file snapshot.
    """
    with Session(engine) as session:
        attempt = session.get(Attempt, attempt_id)
        if not attempt:
            raise HTTPException(404, "unknown attempt")
        history = list(attempt.history)

    # per-problem runtime: which image to run in + how the agent should run visible tests
    _slug, meta = _resolve(attempt.problem_id)
    image = (meta.get("submission") or {}).get("runtime") or "judge-py:base"
    test_cmd = (meta.get("open") or {}).get("cmd")

    def gen():
        final = None
        for ev in agent.stream_turn(attempt_id, history, body.text, image=image, test_cmd=test_cmd):
            if ev["type"] == "done":
                final = ev
                break
            yield _sse(ev)
            # after a file write, push the fresh snapshot so the viewer updates live
            if ev["type"] == "file_written":
                yield _sse({"type": "files", "files": _workspace_files(attempt_id)})

        with Session(engine) as session:
            attempt = session.get(Attempt, attempt_id)
            attempt.history = final["history"]  # reassign so SQLAlchemy flags JSON dirty
            attempt.turns += 1
            attempt.tokens += final["tokens"]
            session.add(attempt)
            session.commit()
            turns, tokens = attempt.turns, attempt.tokens

        yield _sse(
            {
                "type": "done",
                "turns": turns,
                "tokens": tokens,
                "files": _workspace_files(attempt_id),
            }
        )

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: str):
    with Session(engine) as session:
        attempt = session.get(Attempt, attempt_id)
        if not attempt:
            raise HTTPException(404, "unknown attempt")

        slug, meta = _resolve(attempt.problem_id)
        result = grade.run_hidden_tests(attempt_id, slug)
        passed, total = result["passed"], result["total"]
        scored = scoring.evaluate(
            meta, passed, total, attempt.turns, attempt.tokens
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
