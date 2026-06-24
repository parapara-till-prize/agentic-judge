"""Grader: run a problem's HIDDEN grading harness against an attempt and read a score.

Domain-agnostic. At submit time we build a throwaway grading copy = the attempt's solution
files (minus visible tests) + the problem's `hidden/` tree overlaid at the root, then run
the problem's `runtime.grade_cmd` inside its `runtime.image` (the same locked-down
container the agent uses). The harness prints one line naming which CASE IDS passed:

    GRADE:{"passed_ids": ["case_a", "case_b", ...]}

The host maps those ids to meta.json hidden.cases weights, so weighting lives in one place
and is identical across pytest / SQL / browser graders. It never knows which engine ran. A
legacy aggregate GRADE:{"passed": <int>, "total": <int>} is still accepted (count-based, no
weighting). Hidden files never touch the attempt workdir, so the agent can't see or game
them. See docs/multi-domain.md.
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
# Reports the set of PASSED test ids via a pytest collector plugin (report.when == "call")
# rather than scraping stdout — string-matching pytest's output is fragile (e.g. `-v` appends
# `[ 16%]` so a line never ends in "PASSED"). The host (run_hidden_tests) maps those ids to
# meta.json weights, so weighting lives in one place and works for every domain. Prints
# GRADE:{"passed_ids": [...]}.
_PYTEST_GRADE_SCRIPT = """\
import json
import pytest


class _Collector:
    def __init__(self):
        self.passed_ids = []

    def pytest_runtest_logreport(self, report):
        if report.when == "call" and report.passed:
            self.passed_ids.append(report.nodeid.split("::")[-1].split("[")[0])


_c = _Collector()
pytest.main(["test_hidden.py", "-q", "--tb=no", "-p", "no:cacheprovider"], plugins=[_c])
print("GRADE:" + json.dumps({"passed_ids": _c.passed_ids}))
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


def _zero() -> dict:
    return {"passed": 0, "total": 0, "passed_cases": 0, "total_cases": 0, "failed": []}


def run_hidden_tests(attempt_id: str, problem_id: str) -> dict:
    """Grade one attempt against its hidden suite.

    Returns {passed, total, passed_cases, total_cases}: passed/total are the weighted
    score (sum of meta.json hidden.cases weights) that drives accuracy; passed_cases/
    total_cases are the raw test counts for display ("3 / 5 케이스"). Both come from the
    grader reporting which case ids passed; the host owns the weight mapping.
    """
    hit = _resolve(problem_id)
    if not hit:
        return _zero()
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
        return _zero()

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
            (grade_dir / "run_grade.py").write_text(_PYTEST_GRADE_SCRIPT)
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

    # The grader reports which case ids passed; the host maps them to meta.json weights so
    # weighting is consistent across domains and both numbers (weighted score + raw case
    # count) fall out here. A legacy aggregate GRADE:{"passed":N,"total":M} is still accepted
    # (count-based, no per-case weighting) for any grader that hasn't migrated. total_cases /
    # the weighted total come from meta, so a miscount can't change the denominator.
    cases = hidden.get("cases", [])
    weights = {c["id"]: c.get("weight", 1) for c in cases}
    total_cases = len(cases)
    weighted_total = sum(weights.values()) or total_cases

    data = {}
    m = re.search(r"GRADE:(\{.*\})", out)
    if m:
        try:
            data = json.loads(m.group(1))
        except (json.JSONDecodeError, ValueError):
            data = {}

    if "passed_ids" in data:
        passed_ids = set(data["passed_ids"]) & set(weights)  # only declared cases count
        passed_cases = len(passed_ids)
        passed = sum(weights[i] for i in passed_ids)
        # failed case ids (declared cases that didn't pass) feed the AI feedback route —
        # one no-spoiler hint per failure; scoring itself only uses passed/total.
        failed = [c["id"] for c in cases if c["id"] not in passed_ids]
        return {"passed": passed, "total": weighted_total,
                "passed_cases": passed_cases, "total_cases": total_cases,
                "failed": failed}

    # legacy aggregate: count-based, since there are no per-case ids to weight by
    try:
        p = int(data.get("passed", 0))
    except (TypeError, ValueError):
        p = 0
    passed_cases = min(p, total_cases) if total_cases else p
    total = total_cases or int(data.get("total", 0) or 0)
    # legacy aggregate has no per-case ids, so we can't say which cases failed.
    return {"passed": passed_cases, "total": total,
            "passed_cases": passed_cases, "total_cases": total or passed_cases,
            "failed": []}
