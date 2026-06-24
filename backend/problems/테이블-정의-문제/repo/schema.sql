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

INSERT INTO Departments (department_code, department_name) VALUES
('COMPSCI', '컴퓨터공학과'),
('ELECENG', '전자공학과'),
('MECHENG', '기계공학과'),
('ARCH', '건축학과');

INSERT INTO Students (student_id, student_name, department_code) VALUES
('S001', '김철수', 'COMPSCI'),
('S002', '이영희', 'ELECENG'),
('S003', '박민준', 'COMPSCI'),
('S004', '최지우', 'MECHENG'),
('S005', '정대현', NULL);

INSERT INTO Professors (professor_id, professor_name, department_code) VALUES
('P001', '김교수', 'COMPSCI'),
('P002', '이교수', 'ELECENG'),
('P003', '박교수', 'MECHENG');