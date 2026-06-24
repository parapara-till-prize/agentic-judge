# 부서별 평균 급여

`employees` 테이블이 주어진다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | INTEGER | 사번 (PK) |
| name | TEXT | 이름 |
| dept | TEXT | 부서명 |
| salary | INTEGER | 급여 |
| active | INTEGER | 재직 여부 (1=재직, 0=퇴사) |

`solution.sql`에 **단일 SELECT 문**을 작성하라. 조건:

1. **재직 중인 직원(`active = 1`)만** 집계 대상이다.
2. 부서별 평균 급여를 구한다. 결과 컬럼은 `dept`, `avg_salary` 두 개.
3. 평균 급여 **내림차순**으로 정렬한다. 평균이 같으면 **부서명 오름차순**으로 정렬한다.

> 재직자가 한 명도 없는 부서는 결과에 나오면 안 된다.

## 예시

```
dept   | avg_salary
-------+-----------
Sales  | 300.0
Eng    | 150.0
HR     | 60.0
```

`python3 run_tests.py`로 예제 데이터에 대해 직접 확인할 수 있다.
