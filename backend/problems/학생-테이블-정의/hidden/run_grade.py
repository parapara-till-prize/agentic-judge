import json, sqlite3
from pathlib import Path

DDL = """
CREATE TABLE 학생 (
    이름 TEXT,
    학번 TEXT PRIMARY KEY,
    학과 TEXT
);

CREATE TABLE 강의 (
    강의명 TEXT,
    학과 TEXT,
    학수번호 TEXT PRIMARY KEY
);
"""

SCENARIOS = [
    (   # Scenario 1: Basic data
        [
            ('김철수', '20230001', '컴퓨터공학과'),
            ('이영희', '20230002', '전자공학과')
        ],
        [
            ('데이터베이스 개론', '컴퓨터공학과', 'CS101'),
            ('회로이론', '전자공학과', 'EE201')
        ],
        [
            ('김철수', '20230001', '컴퓨터공학과'),
            ('이영희', '20230002', '전자공학과')
        ]
    ),
    (   # Scenario 2: More students, including one with a unique department
        [
            ('홍길동', '20220001', '국어국문학과'),
            ('이순신', '20220002', '역사학과'),
            ('강감찬', '20220003', '국어국문학과'),
            ('유관순', '20220004', '역사학과')
        ],
        [
            ('고전문학', '국어국문학과', 'KR101'),
            ('한국사개론', '역사학과', 'HI101')
        ],
        [
            ('홍길동', '20220001', '국어국문학과'),
            ('이순신', '20220002', '역사학과'),
            ('강감찬', '20220003', '국어국문학과'),
            ('유관순', '20220004', '역사학과')
        ]
    ),
    (   # Scenario 3: Empty student table
        [], # No student data
        [
            ('데이터베이스 개론', '컴퓨터공학과', 'CS101')
        ],
        []  # Expected empty result
    ),
    (   # Scenario 4: Students with departments not in 강의 table (but valid for 학생 table)
        [
            ('최영', '20210001', '경영학과'),
            ('장보고', '20210002', '해양학과')
        ],
        [
            ('마케팅원론', '경영학과', 'BU101')
        ],
        [
            ('최영', '20210001', '경영학과'),
            ('장보고', '20210002', '해양학과')
        ]
    )
]

def _norm(rows):
    return [tuple(round(v,4) if isinstance(v,float) else v for v in r) for r in rows]

def main():
    solution = Path('solution.sql').read_text().strip()
    # Also check for SELECT * in the grader
    if '*' in solution:
        print('GRADE:' + json.dumps({'passed': 0, 'total': len(SCENARIOS)}))
        return

    passed = 0
    for student_seed_rows, course_seed_rows, expected in SCENARIOS:
        con = sqlite3.connect(':memory:')
        con.executescript(DDL)
        con.executemany("INSERT INTO 학생 (이름, 학번, 학과) VALUES (?, ?, ?)", student_seed_rows)
        con.executemany("INSERT INTO 강의 (강의명, 학과, 학수번호) VALUES (?, ?, ?)", course_seed_rows)
        try:
            rows = con.execute(solution).fetchall()
            if _norm(rows) == _norm(expected):
                passed += 1
        except sqlite3.Error:
            pass # Fail silently for SQL errors
        finally:
            con.close()
    print('GRADE:' + json.dumps({'passed': passed, 'total': len(SCENARIOS)}))

if __name__ == '__main__':
    main()
