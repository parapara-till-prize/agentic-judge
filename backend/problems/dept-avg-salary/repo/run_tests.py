"""예제 테스트: schema.sql로 DB를 만들고 solution.sql을 실행해 기대 결과와 비교한다."""
import sqlite3
import sys
from pathlib import Path

EXPECTED = [("Sales", 300.0), ("Eng", 150.0), ("HR", 60.0)]


def _norm(rows):
    return [
        tuple(round(v, 4) if isinstance(v, float) else v for v in row) for row in rows
    ]


def main():
    schema = Path("schema.sql").read_text()
    solution = Path("solution.sql").read_text().strip()
    if not solution or solution.lstrip().startswith("--") and "select" not in solution.lower():
        print("예제: 실패 — solution.sql이 비어 있습니다.")
        return 1

    con = sqlite3.connect(":memory:")
    con.executescript(schema)
    try:
        rows = con.execute(solution).fetchall()
    except sqlite3.Error as e:
        print(f"예제: 실패 — SQL 오류: {e}")
        return 1

    if _norm(rows) == _norm(EXPECTED):
        print(f"예제: 통과 (1/1) — {rows}")
        return 0
    print(f"예제: 실패 (0/1)\n  기대: {EXPECTED}\n  실제: {rows}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
