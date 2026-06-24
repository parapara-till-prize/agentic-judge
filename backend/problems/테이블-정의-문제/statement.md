## 테이블 정의 문제

### 문제 설명
코딩 교육 플랫폼에서 학생과 교수에 대한 정보를 관리하려고 합니다. 다음은 시스템에 이미 정의된 테이블 구조입니다.

### 테이블 구조

1.  **`Departments` 테이블**
    *   `department_code` (VARCHAR(10), 기본 키): 학과 코드 (예: COMPSCI, ELECENG)
    *   `department_name` (VARCHAR(50), NOT NULL): 학과 이름 (예: 컴퓨터공학과, 전자공학과)

2.  **`Students` 테이블**
    *   `student_id` (VARCHAR(10), 기본 키): 학번 (예: S001)
    *   `student_name` (VARCHAR(50), NOT NULL): 학생 이름 (예: 김철수)
    *   `department_code` (VARCHAR(10), 외래 키): 소속 학과 코드 (Departments 테이블의 `department_code` 참조)

3.  **`Professors` 테이블**
    *   `professor_id` (VARCHAR(10), 기본 키): 교수 번호 (예: P001)
    *   `professor_name` (VARCHAR(50), NOT NULL): 교수명 (예: 김교수)
    *   `department_code` (VARCHAR(10), 외래 키): 소속 학과 코드 (Departments 테이블의 `department_code` 참조)

### 작성할 쿼리
`Students` 테이블에서 모든 학생의 `학생 이름`, `학번`, `학과 이름`, `학과 코드`를 조회하세요. 이때, `학과 이름`은 `Departments` 테이블에서 가져와야 합니다. 결과는 `학번`을 기준으로 오름차순 정렬해야 합니다.

### 예상 결과 (샘플 데이터 기준)

| student_name | student_id | department_name | department_code |
| :----------- | :--------- | :---------------- | :-------------- |
| 김철수       | S001       | 컴퓨터공학과      | COMPSCI         |
| 이영희       | S002       | 전자공학과        | ELECENG         |
| 박민준       | S003       | 컴퓨터공학과      | COMPSCI         |
| 최지우       | S004       | 기계공학과        | MECHENG         |

### 제약 조건
*   `Students` 테이블과 `Departments` 테이블을 `department_code` 컬럼으로 조인해야 합니다.
*   조회하는 컬럼의 순서와 이름은 위 '예상 결과'와 일치해야 합니다. (alias 사용 권장)
*   `학번` (student_id)을 기준으로 오름차순 정렬해야 합니다.