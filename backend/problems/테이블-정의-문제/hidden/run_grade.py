import json, sqlite3
from pathlib import Path

DDL = """
CREATE TABLE Departments (
    department_code VARCHAR(10) PRIMARY KEY,
    department_name VARCHAR(50) NOT NULL
);

CREATE TABLE Students (
    student_id VARCHAR(10) PRIMARY KEY,
    student_name VARCHAR(50) NOT NULL,
    department_code VARCHAR(10),
    FOREIGN KEY (department_code) REFERENCES Departments(department_code)
);

CREATE TABLE Professors (
    professor_id VARCHAR(10) PRIMARY KEY,
    professor_name VARCHAR(50) NOT NULL,
    department_code VARCHAR(10),
    FOREIGN KEY (department_code) REFERENCES Departments(department_code)
);
"""

SCENARIOS = [
    ( # Scenario 1: Basic - all students have valid departments
        [
            ("INSERT INTO Departments VALUES (?, ?)", [('COMPSCI', '컴퓨터공학과'), ('ELECENG', '전자공학과')]),
            ("INSERT INTO Students VALUES (?, ?, ?)", [('S001', '김철수', 'COMPSCI'), ('S002', '이영희', 'ELECENG'), ('S003', '박민준', 'COMPSCI')])
        ],
        [
            ('김철수', 'S001', '컴퓨터공학과', 'COMPSCI'),
            ('이영희', 'S002', '전자공학과', 'ELECENG'),
            ('박민준', 'S003', '컴퓨터공학과', 'COMPSCI')
        ]
    ),
    ( # Scenario 2: Student with non-existent department_code (should be filtered by INNER JOIN)
        [
            ("INSERT INTO Departments VALUES (?, ?)", [('COMPSCI', '컴퓨터공학과')]),
            ("INSERT INTO Students VALUES (?, ?, ?)", [('S001', '김철수', 'COMPSCI'), ('S002', '이영희', 'NONEXIST')])
        ],
        [
            ('김철수', 'S001', '컴퓨터공학과', 'COMPSCI')
        ]
    ),
    ( # Scenario 3: Student with NULL department_code (should be filtered by INNER JOIN)
        [
            ("INSERT INTO Departments VALUES (?, ?)", [('ELECENG', '전자공학과')]),
            ("INSERT INTO Students VALUES (?, ?, ?)", [('S001', '최지우', 'ELECENG'), ('S002', '정대현', None)])
        ],
        [
            ('최지우', 'S001', '전자공학과', 'ELECENG')
        ]
    )
]

def _norm(rows):
    return [tuple(round(v,4) if isinstance(v,float) else v for v in r) for r in rows]

def main():
    solution = Path('solution.sql').read_text().strip()
    passed = 0
    for seed_data_list, expected in SCENARIOS:
        con = sqlite3.connect(':memory:')
        con.executescript(DDL)
        
        for insert_stmt, data_rows in seed_data_list:
            con.executemany(insert_stmt, data_rows)

        try:
            rows = con.execute(solution).fetchall()
            if _norm(rows) == _norm(expected):
                passed += 1
        except sqlite3.Error:
            pass
        finally:
            con.close()
    print('GRADE:' + json.dumps({'passed': passed, 'total': len(SCENARIOS)}))

if __name__ == '__main__':
    main()