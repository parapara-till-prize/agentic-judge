#!/usr/bin/env python3
"""SQL runner — baked into judge-sql:base at /runners/run_sql.py.

Usage (CWD = attempt folder with meta.json):
    python3 /runners/run_sql.py --mode open
    python3 /runners/run_sql.py --mode hidden

Output:
    open   → OPEN:{"ok": true/false, "output": "..."}
    hidden → GRADE:{"passed": W, "total": T}

Hidden grading delegates to hidden/run_grade.py which outputs GRADE: itself.
Open grading delegates to repo/run_tests.py (visible scenarios).
Both scripts are problem-specific; the runner just invokes them and standardises output.
"""
import argparse
import json
import subprocess
import sys
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
    cmd = hidden["cmd"]

    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    # hidden/run_grade.py already prints GRADE:{"passed":N,"total":M}
    for line in r.stdout.splitlines():
        if line.startswith("GRADE:"):
            print(line)
            return

    # Fallback: if run_grade.py crashed or didn't output GRADE:
    err = (r.stdout + r.stderr).strip()
    print("GRADE:" + json.dumps({"passed": 0, "total": 1, "error": err}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["open", "hidden"], required=True)
    args = parser.parse_args()

    meta = load_meta()
    if args.mode == "open":
        run_open(meta)
    else:
        run_hidden(meta)
