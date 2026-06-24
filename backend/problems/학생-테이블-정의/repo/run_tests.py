import sqlite3, sys
from pathlib import Path

EXPECTED = [
    ('김철수', '20230001', '컴퓨터공학과'),
    ('이영희', '20230002', '전자공학과'),
    ('박지민', '20230003', '컴퓨터공학과')
]

def _norm(rows):
    return [tuple(round(v,4) if isinstance(v,float) else v for v in r) for r in rows]

def main():
    schema = Path('schema.sql').read_text()
    solution = Path('solution.sql').read_text().strip()
    if not solution or ('select' not in solution.lower()):
        print('예제: 실패 — solution.sql이 비어 있거나 SELECT 쿼리가 아닙니다.')
        return 1
    # Check for SELECT * which is disallowed by constraints
    if '*' in solution:
        print('예제: 실패 — SELECT * 사용은 허용되지 않습니다. 모든 컬럼을 명시적으로 선택하세요.')
        return 1

    con = sqlite3.connect(':memory:')
    con.executescript(schema)
    try:
        rows = con.execute(solution).fetchall()
    except sqlite3.Error as e:
        print(f'예제: 실패 — SQL 오류: {e}')
        return 1
    if _norm(rows) == _norm(EXPECTED):
        print(f'예제: 통과 (1/1) — {rows}')
        return 0
    print(f'예제: 실패 (0/1)\n  기대: {EXPECTED}\n  실제: {rows}')
    return 1

if __name__ == '__main__':
    sys.exit(main())
