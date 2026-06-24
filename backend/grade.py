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

# Injected into grade_dir for pytest-hidden problems that have no run_grade.py.
# Counts results via a pytest collector plugin (report.when == "call") rather than scraping
# stdout — string-matching pytest's output is fragile (e.g. `-v` appends `[ 16%]` so a line
# never ends in "PASSED"). Per-case weights come from meta.json hidden.cases (id == test
# function name) and are baked into the script, since the container can't read meta.json: a
# passing test contributes its declared weight, total is the sum of weights, and any test not
# declared as a case contributes 0 so `passed` can't exceed `total`. Prints GRADE: JSON.
def _pytest_grade_script(cases: list) -> str:
    weights = {c["id"]: c.get("weight", 1) for c in cases}
    return f"""\
import json
import pytest

_WEIGHTS = {weights!r}


class _Collector:
    def __init__(self):
        self.passed = 0

    def pytest_runtest_logreport(self, report):
        if report.when == "call" and report.passed:
            name = report.nodeid.split("::")[-1]
            self.passed += _WEIGHTS.get(name, 0)


_c = _Collector()
pytest.main(["test_hidden.py", "-q", "--tb=no", "-p", "no:cacheprovider"], plugins=[_c])
print("GRADE:" + json.dumps({{"passed": _c.passed, "total": sum(_WEIGHTS.values())}}))
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
    """Grade one attempt against its hidden suite. Returns {passed, total}."""
    hit = _resolve(problem_id)
    if not hit:
        return {"passed": 0, "total": 0}
    slug, meta = hit
    image = (meta.get("submission") or {}).get("runtime") or "judge-py:base"
    hidden = meta.get("hidden") or {}
    kind = hidden.get("kind", "pytest-hidden")
    if kind == "pytest-hidden":
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
        return {"passed": 0, "total": 0}

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
        # 3) inject run_grade.py for pytest-hidden if hidden/ didn't supply one
        if kind == "pytest-hidden" and not (grade_dir / "run_grade.py").exists():
            (grade_dir / "run_grade.py").write_text(
                _pytest_grade_script(hidden.get("cases", []))
            )
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

    # 권위있는 분모는 meta.json에서 — 하네스가 오집계해도 올바른 total 유지.
    # pytest-hidden은 case weight 합, 그 외(sql/browser)는 case당 1점.
    cases = hidden.get("cases", [])
    if kind == "pytest-hidden":
        defined_total = sum(c.get("weight", 1) for c in cases)
    else:
        defined_total = len(cases)

    m = re.search(r"GRADE:(\{.*\})", out)
    if not m:
        return {"passed": 0, "total": defined_total}
    try:
        data = json.loads(m.group(1))
        passed = int(data.get("passed", 0))
        total = int(data.get("total", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"passed": 0, "total": defined_total}

    authoritative_total = defined_total or total
    return {"passed": min(passed, authoritative_total), "total": authoritative_total}
