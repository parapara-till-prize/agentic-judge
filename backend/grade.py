"""Grader: run a problem's HIDDEN grading harness against an attempt and read a score.

Domain-agnostic. At submit time we build a throwaway grading copy = the attempt's solution
files (minus visible tests) + the problem's `hidden/` tree overlaid at the root, then run
the problem's `runtime.grade_cmd` inside its `runtime.image` (the same locked-down
container the agent uses). The harness prints one line:

    GRADE:{"passed": <int>, "total": <int>}

The host only parses that marker — it never knows whether grading was pytest, a SQL diff,
or a headless-browser assertion suite. Hidden files never touch the attempt workdir, so the
agent can't see or game them. See docs/multi-domain.md.
"""
import json
import os
import re
import shutil
import uuid
from pathlib import Path

import sandbox

BASE = Path(__file__).parent

# Injected into grade_dir for pytest-hidden/concurrency problems that have no run_grade.py.
# Runs test_hidden.py via a pytest plugin (TTY-independent, unlike scraping -v output) that
# records the pass count, total, and the node id of every failed case, then prints GRADE: JSON.
# Same collector shape the custom hidden/run_grade.py files use, so `failed` is uniform.
_PYTEST_GRADE_SCRIPT = """\
import json
import pytest


class _Collector:
    def __init__(self):
        self.passed = 0
        self.total = 0
        self.failed = []

    def pytest_runtest_logreport(self, report):
        if report.when == "call":
            self.total += 1
            if report.passed:
                self.passed += 1
            else:
                self.failed.append(report.nodeid.split("::")[-1])


_c = _Collector()
pytest.main(["test_hidden.py", "-q", "--tb=no", "-p", "no:cacheprovider"], plugins=[_c])
print("GRADE:" + json.dumps({"passed": _c.passed, "total": _c.total, "failed": _c.failed}))
"""

PROBLEMS = BASE / "problems"
ATTEMPTS = BASE / "attempts"

VISIBLE_TEST_DIRS = {"tests"}  # excluded from the grading copy (hidden suite only)
_SKIP_PARTS = {"__pycache__", ".pytest_cache"}


def _resolve(problem_id: str):
    """(slug, meta) for a public numeric id OR a slug folder name; None if unknown."""
    pid = str(problem_id)
    if (PROBLEMS / pid / "meta.json").exists():
        slug = pid
    else:
        slug = None
        for d in PROBLEMS.iterdir():
            mf = d / "meta.json"
            if not mf.exists():
                continue
            try:
                if str(json.loads(mf.read_text()).get("id")) == pid:
                    slug = d.name
                    break
            except (json.JSONDecodeError, ValueError):
                continue
        if slug is None:
            return None
    return slug, json.loads((PROBLEMS / slug / "meta.json").read_text())


def run_hidden_tests(attempt_id: str, problem_id: str) -> dict:
    """Grade one attempt against its hidden suite. Returns {passed, total, failed}.

    `failed` is the list of failed case ids (node names) — pytest-based graders report them;
    other kinds (sql/browser) may omit them, in which case it's []. It feeds the AI feedback
    route (one no-spoiler hint per failed case); scoring only uses passed/total.
    """
    hit = _resolve(problem_id)
    if not hit:
        return {"passed": 0, "total": 0, "failed": []}
    slug, meta = hit
    image = (meta.get("submission") or {}).get("runtime") or "judge-py:base"
    hidden = meta.get("hidden") or {}
    kind = hidden.get("kind", "pytest-hidden")
    if kind in ("pytest-hidden", "concurrency"):
        grade_cmd = "python3 run_grade.py"
    else:
        grade_cmd = (
            hidden.get("cmd")
            or (meta.get("runtime") or {}).get("grade_cmd")
            or "python3 run_grade.py"
        )

    workdir = ATTEMPTS / attempt_id
    hidden_dir = PROBLEMS / slug / "hidden"
    if not workdir.exists() or not hidden_dir.exists():
        return {"passed": 0, "total": 0, "failed": []}

    # throwaway grading dir; world-readable so the unprivileged container user can read it
    grade_dir = ATTEMPTS / f"{attempt_id}__grade_{uuid.uuid4().hex[:8]}"
    grade_dir.mkdir(parents=True)
    try:
        # 1) attempt's solution files (skip visible tests + caches)
        for p in workdir.rglob("*"):
            if not p.is_file():
                continue
            parts = p.relative_to(workdir).parts
            if _SKIP_PARTS & set(parts) or (parts and parts[0] in VISIBLE_TEST_DIRS):
                continue
            dest = grade_dir / p.relative_to(workdir)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
        # 2) overlay the hidden tree at the root (grading harness + hidden fixtures)
        for p in hidden_dir.rglob("*"):
            if not p.is_file():
                continue
            dest = grade_dir / p.relative_to(hidden_dir)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
        # 3) inject run_grade.py for pytest-hidden/concurrency if hidden/ didn't supply one
        if kind in ("pytest-hidden", "concurrency") and not (grade_dir / "run_grade.py").exists():
            (grade_dir / "run_grade.py").write_text(_PYTEST_GRADE_SCRIPT)
        # 4) supply harness/ so concurrency tests can import HookableStore, run_concurrent
        harness_src = BASE / "harness"
        if harness_src.exists() and not (grade_dir / "harness").exists():
            shutil.copytree(harness_src, grade_dir / "harness")
        # make everything readable by `nobody` in the bind mount
        for root, dirs, files in os.walk(grade_dir):
            for d in dirs:
                os.chmod(os.path.join(root, d), 0o755)
            for f in files:
                os.chmod(os.path.join(root, f), 0o644)
        os.chmod(grade_dir, 0o755)

        out = sandbox.run_in_container(grade_dir, grade_cmd, image)
    finally:
        shutil.rmtree(grade_dir, ignore_errors=True)

    defined_total = len(hidden.get("cases", []))

    m = re.search(r"GRADE:(\{.*\})", out)
    if not m:
        return {"passed": 0, "total": defined_total, "failed": []}
    try:
        data = json.loads(m.group(1))
        passed = int(data.get("passed", 0))
        total = int(data.get("total", 0))
        failed = [str(x) for x in (data.get("failed") or [])]
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"passed": 0, "total": defined_total, "failed": []}

    # meta.json hidden.cases 개수가 권위있는 total — pytest 수집 실패 시에도 올바른 분모 유지
    authoritative_total = defined_total or total
    return {
        "passed": min(passed, authoritative_total),
        "total": authoritative_total,
        "failed": failed,
    }
