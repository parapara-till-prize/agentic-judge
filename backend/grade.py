"""Grader: run a problem's HIDDEN tests against an attempt's solution and score it.

Hidden tests live in problems/{slug}/hidden/ and are never copied into the attempt
workdir, so the agent can't see or game them. At submit time we build a throwaway
grading dir (attempt files + the hidden test + a tiny pytest runner), run it in the same
locked-down container the agent uses, and read a `GRADE:{...}` marker off stdout.

`total` is counted on the host (AST of the hidden file) so it's stable even when the
solution fails to import; `passed` comes from the sandbox run.
"""
import ast
import json
import os
import re
import shutil
import uuid
from pathlib import Path

import sandbox

BASE = Path(__file__).parent
PROBLEMS = BASE / "problems"
ATTEMPTS = BASE / "attempts"

# Runs only the hidden file, no cache/traceback noise, prints one parseable line.
_RUNNER = '''import json, pytest


class _G:
    def __init__(self):
        self.passed = 0

    def pytest_runtest_logreport(self, report):
        if report.when == "call" and report.passed:
            self.passed += 1


_g = _G()
_code = pytest.main(["test_hidden.py", "-q", "--tb=no", "-p", "no:cacheprovider"], plugins=[_g])
print("GRADE:" + json.dumps({"passed": _g.passed, "code": int(_code)}))
'''


def _count_hidden_tests(hidden_file: Path) -> int:
    tree = ast.parse(hidden_file.read_text())
    return sum(
        1
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name.startswith("test_")
    )


def _run_passed(grade_dir: Path) -> int:
    out = sandbox.run_in_container(grade_dir, "python _runner.py")
    m = re.search(r"GRADE:(\{.*\})", out)
    if not m:
        return 0
    try:
        return int(json.loads(m.group(1)).get("passed", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return 0


def run_hidden_tests(attempt_id: str, problem_id: str) -> dict:
    """Grade one attempt against the hidden suite. Returns {passed, total}."""
    workdir = ATTEMPTS / attempt_id
    hidden_file = PROBLEMS / problem_id / "hidden" / "test_hidden.py"
    if not hidden_file.exists():
        return {"passed": 0, "total": 0}

    total = _count_hidden_tests(hidden_file)

    # isolated dir: attempt's source files + hidden test + runner. World-readable so the
    # unprivileged container user (nobody) can read the bind-mounted files.
    grade_dir = ATTEMPTS / f"{attempt_id}__grade_{uuid.uuid4().hex[:8]}"
    grade_dir.mkdir(parents=True)
    os.chmod(grade_dir, 0o755)
    try:
        for p in workdir.rglob("*"):
            if not p.is_file() or "__pycache__" in p.parts:
                continue
            # skip the visible test dir; we only grade against hidden tests
            if "tests" in p.relative_to(workdir).parts:
                continue
            dest = grade_dir / p.relative_to(workdir)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
        shutil.copy2(hidden_file, grade_dir / "test_hidden.py")
        (grade_dir / "_runner.py").write_text(_RUNNER)

        passed = _run_passed(grade_dir)
    finally:
        shutil.rmtree(grade_dir, ignore_errors=True)

    return {"passed": min(passed, total), "total": total}
