"""Hidden grader for the SQL problem. Self-contained: defines its own datasets so the
agent never sees them. Runs /work/solution.sql against each scenario, compares the
resultset, and prints GRADE:{"passed_ids":[...]} — the host maps ids to meta.json weights."""
import json
import sqlite3
from pathlib import Path

DDL = """
CREATE TABLE employees (
    id INTEGER PRIMARY KEY, name TEXT, dept TEXT, salary INTEGER, active INTEGER
);
"""

# (case id, seed rows, expected resultset). `id` matches meta.json hidden.cases. Lazy
# `AVG ... GROUP BY ... ORDER BY AVG DESC` (no active filter) passes only the basic scenario;
# the rest require WHERE active = 1.
SCENARIOS = [
    # basic — all active, distinct averages (lazy == correct)
    (
        "basic_all_active",
        [(1, "Ann", "Eng", 100, 1), (2, "Bob", "Eng", 200, 1),
         (3, "Cara", "Sales", 300, 1), (4, "Dan", "HR", 50, 1), (5, "Eve", "HR", 70, 1)],
        [("Sales", 300.0), ("Eng", 150.0), ("HR", 60.0)],
    ),
    # active filter changes an average (inactive high earner must be excluded)
    (
        "active_filter_changes_avg",
        [(1, "Ann", "Eng", 100, 1), (2, "Bob", "Eng", 200, 1),
         (3, "Zed", "Eng", 1000, 0), (4, "Cara", "Sales", 300, 1)],
        [("Sales", 300.0), ("Eng", 150.0)],
    ),
    # a dept whose only members are inactive must not appear at all
    (
        "inactive_dept_excluded",
        [(1, "Ann", "Eng", 100, 1), (2, "Ghost", "Ops", 500, 0)],
        [("Eng", 100.0)],
    ),
    # everyone inactive -> empty result
    (
        "all_inactive_empty",
        [(1, "Ann", "Eng", 100, 0), (2, "Bob", "Sales", 300, 0)],
        [],
    ),
]


def _norm(rows):
    return [tuple(round(v, 4) if isinstance(v, float) else v for v in r) for r in rows]


def main():
    solution = Path("solution.sql").read_text().strip()
    passed_ids = []
    for case_id, seed, expected in SCENARIOS:
        con = sqlite3.connect(":memory:")
        con.executescript(DDL)
        con.executemany(
            "INSERT INTO employees (id, name, dept, salary, active) VALUES (?,?,?,?,?)", seed
        )
        try:
            rows = con.execute(solution).fetchall()
            if _norm(rows) == _norm(expected):
                passed_ids.append(case_id)
        except sqlite3.Error:
            pass
        finally:
            con.close()
    print("GRADE:" + json.dumps({"passed_ids": passed_ids}))


if __name__ == "__main__":
    main()
