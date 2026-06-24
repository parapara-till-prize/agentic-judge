-- 예제 데이터 (run_tests.py가 이 스키마로 solution.sql을 검증한다).
CREATE TABLE employees (
    id     INTEGER PRIMARY KEY,
    name   TEXT,
    dept   TEXT,
    salary INTEGER,
    active INTEGER
);

INSERT INTO employees (id, name, dept, salary, active) VALUES
    (1, 'Ann',  'Eng',   100, 1),
    (2, 'Bob',  'Eng',   200, 1),
    (3, 'Cara', 'Sales', 300, 1),
    (4, 'Dan',  'HR',     50, 1),
    (5, 'Eve',  'HR',     70, 1);
