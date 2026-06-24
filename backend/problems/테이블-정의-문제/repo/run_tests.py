import sqlite3, sys
from pathlib import Path

EXPECTED = [
    ('김철수', 'S001', '컴퓨터공학과', 'COMPSCI'),
    ('이영희', 'S002', '전자공학과', 'ELECENG'),
    ('박민준', 'S003', '컴퓨터공학과', 'COMPSCI'),
    ('최지우', 'S004', '기계공학과', 'MECHENG')
]

def _norm(rows):
    return [tuple(round(v,4) if isinstance(v,float) else v for v in r) for r in rows]

def main():
    schema = Path('schema.sql').read_text()
    solution = Path('solution.sql').read_text().strip()
    if not solution or ('select' not in solution.lower()):
        print('예제: 실패 — solution.sql이 비어 있습니다.')
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