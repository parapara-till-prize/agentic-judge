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

INSERT INTO 학생 (이름, 학번, 학과) VALUES
('김철수', '20230001', '컴퓨터공학과'),
('이영희', '20230002', '전자공학과'),
('박지민', '20230003', '컴퓨터공학과');

INSERT INTO 강의 (강의명, 학과, 학수번호) VALUES
('데이터베이스 개론', '컴퓨터공학과', 'CS101'),
('회로이론', '전자공학과', 'EE201'),
('알고리즘', '컴퓨터공학과', 'CS202');
