#!/usr/bin/env python3
"""Algorithm runner — baked into judge-py:base at /runners/run_algo.py.

Usage (CWD = attempt folder with meta.json):
    python3 /runners/run_algo.py --mode open
    python3 /runners/run_algo.py --mode hidden

Output:
    open   → OPEN:{"ok": true/false, "output": "..."}
    hidden → GRADE:{"passed": W, "total": T}
"""
import argparse
import json
import re
import subprocess
import sys
import time
import tracemalloc
from pathlib import Path


def load_meta():
    return json.loads(Path("meta.json").read_text())


def run_open(meta):
    cmd = meta["open"]["cmd"]
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    ok = r.returncode == 0
    output = (r.stdout + r.stderr).strip()
    print("OPEN:" + json.dumps({"ok": ok, "output": output}))
    sys.exit(0 if ok else 1)


def run_hidden(meta):
    hidden = meta["hidden"]
    kind = hidden["kind"]

    if kind == "pytest-hidden":
        _run_pytest_hidden(hidden)
    elif kind == "pytest-perf":
        _run_pytest_perf(hidden)
    elif kind == "concurrency":
        _run_pytest_hidden(hidden)  # concurrency tests are also pytest; they manage threads internally
    else:
        print(f"GRADE:" + json.dumps({"passed": 0, "total": 1, "error": f"unknown kind: {kind}"}))
        sys.exit(1)


def _parse_pytest_results(stdout):
    """Return set of test ids that PASSED from pytest -v output."""
    passed = set()
    for line in stdout.splitlines():
        if " PASSED" in line:
            m = re.search(r"::(test_\w+)", line)
            if m:
                passed.add(m.group(1))
    return passed


def _run_pytest_hidden(hidden):
    cases = hidden["cases"]
    r = subprocess.run(
        ["python3", "-m", "pytest", "hidden/test_hidden.py",
         "--tb=no", "-v", "--no-header"],
        capture_output=True, text=True,
    )
    passed_ids = _parse_pytest_results(r.stdout)
    total = sum(c["weight"] for c in cases)
    passed = sum(c["weight"] for c in cases if c["id"] in passed_ids)
    print("GRADE:" + json.dumps({"passed": passed, "total": total}))


def _run_pytest_perf(hidden):
    """Run pytest-perf cases: each case is run individually with time+memory limits."""
    cases = hidden["cases"]
    limits = hidden.get("limits", {})
    time_limit_ms = limits.get("time_ms", 5000)
    mem_limit_mb = limits.get("mem_mb", 512)

    total = sum(c["weight"] for c in cases)
    passed_weight = 0

    for case in cases:
        # Run each case as a separate pytest invocation to isolate timing
        tracemalloc.start()
        t0 = time.perf_counter()
        r = subprocess.run(
            ["python3", "-m", "pytest", "hidden/test_hidden.py",
             f"-k={case['id']}", "--tb=no", "-q"],
            capture_output=True, text=True,
            timeout=time_limit_ms / 1000 * 3,  # generous outer timeout
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000
        _, peak_bytes = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        correctness_ok = r.returncode == 0
        time_ok = elapsed_ms <= time_limit_ms
        mem_ok = peak_bytes <= mem_limit_mb * 1024 * 1024

        if correctness_ok and time_ok and mem_ok:
            passed_weight += case["weight"]

    print("GRADE:" + json.dumps({"passed": passed_weight, "total": total}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["open", "hidden"], required=True)
    args = parser.parse_args()

    meta = load_meta()
    if args.mode == "open":
        run_open(meta)
    else:
        run_hidden(meta)
