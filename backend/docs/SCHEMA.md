# 문제 스키마 v2 정의

문제 하나는 폴더 하나이며, 폴더 안에 반드시 `meta.json`이 있어야 한다.

```
problems/<slug>/
  meta.json              ← 이 문서에서 정의하는 스키마
  statement.md           ← 문제 설명 (에이전트에게 공개)
  repo/                  ← 에이전트가 작업하는 폴더 (attempts/로 복사됨)
    solution.py (or .sql / .css)
    tests/test_visible.py  (algorithm)
    run_tests.py           (sql)
    index.html             (frontend)
  hidden/                ← 채점 전용, 에이전트에게 절대 노출 금지
    test_hidden.py         (algorithm)
    run_grade.py           (sql)
    run_grade.js           (frontend)
    ref/                   (frontend: 레퍼런스 이미지)
```

> **런타임 레이아웃 (중요).** `meta.json`의 모든 `cmd`·`entry` 경로는 **컨테이너 작업폴더
> 루트(`/work`) 기준**이다 — `repo/`·`hidden/` 접두사를 붙이지 않는다.
> - `start_attempt`는 `repo/`의 **내용물**을 attempt 루트로 복사한다 → 에이전트는 `/work/solution.py`,
>   `/work/index.html`을 본다 (`repo/solution.py`가 아님).
> - 채점 시 grade.py는 attempt 파일(visible 테스트 제외) + `hidden/`의 **내용물**을 grade 루트에
>   겹쳐 깐다 → 그레이더는 `/work/solution.py`와 `/work/run_grade.py`를 같은 루트에서 본다.
> - 따라서 `open.cmd`는 `python3 -m pytest tests/test_visible.py`, `hidden.cmd`는
>   `python3 run_grade.py`처럼 **루트 상대 경로**로 쓴다.

---

## 1. 공통 코어 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `schema_version` | `2` | 항상 숫자 2 (고정) |
| `id` | number | **공개용 숫자 id** — 사용자/프론트에 노출 (예: `1024`). 도메인별 대역(알고리즘 `1xxx`, sql `2xxx`, frontend `3xxx`). 폴더명 슬러그(내부 식별자)와 별개 |
| `title` | string | 사용자에게 표시되는 문제 제목 |
| `type` | `"algorithm"` \| `"sql"` \| `"frontend"` | **채점 엔진 선택자** (내부용) |
| `category` | string | **사용자 표시용** 중립 라벨 — 함정 내용 포함 금지 |
| `difficulty` | `"basic"` \| `"mid"` \| `"hard"` | 난이도 |
| `skills` | string[] | 핵심 기술 태그 |
| `submission` | object | 제출물 위치 및 실행 환경 |
| `open` | object | **Open-test 설정** (카테고리 내 통일) |
| `hidden` | object | **Hidden-test 설정** (문제별) |
| `scoring` | object | 점수 축과 가중치 |
| `par` | object | 기준 효율 (turns / tokens / time_sec) |
| `trap_note` | string | 내부 메모 — naive 풀이가 어디서 떨어지는지 |

### `submission`

```json
{
  "entry": "solution.py",   // 에이전트가 작성하는 파일
  "runtime": "judge-py:base"     // 도커 이미지 (아래 표 참조)
}
```

| `type` | `runtime` |
|---|---|
| `algorithm` | `judge-py:base` |
| `sql` | `judge-sql:base` |
| `frontend` | `judge-browser:base` |

### `scoring`

```json
{
  "axes": [
    { "key": "accuracy",         "weight": 0.65 },
    { "key": "turn_efficiency",  "weight": 0.20 },
    { "key": "token_efficiency", "weight": 0.15 }
  ]
}
```

가중치 합은 반드시 1.0. 어려운 성능 문제라면 `accuracy` 비중을 낮추고 `turn_efficiency`를 높일 수 있다.

### `par`

```json
{ "turns": 3, "tokens": 6000, "time_sec": 540 }
```

효율 점수 계산 기준값. `turn_efficiency = clamp(par.turns / actual_turns, 0, 1)`.

---

## 2. `open` 블록 — 카테고리별 통일

> **역할**: "구현 자체가 됐는가?" 를 검사하는 **게이트**. 실패 시 `accuracy = 0`.

### algorithm

```json
"open": {
  "kind": "pytest-visible",
  "cmd": "python3 -m pytest tests/test_visible.py -q --tb=short"
}
```

- 컴파일(import) 에러 없음 + 작은 예제 정답 확인
- 시간/공간 제한 **없음** — 구현 여부만 판단

### sql

```json
"open": {
  "kind": "sql-visible",
  "cmd": "python3 run_tests.py"
}
```

- DDL이 에러 없이 실행되는지 확인
- 정상 INSERT/SELECT가 기대 결과를 반환하는지 확인
- `run_tests.py`는 `schema.sql` + `solution.sql`을 순서대로 실행

### frontend — `browser-visible`

```json
"open": {
  "kind": "browser-visible",
  "cmd": "node tests/run_visible.js"
}
```

- SQL의 `sql-visible`과 동형 — 문제별 visible 스크립트(`tests/run_visible.js`)에 위임
- 헤드리스 브라우저로 렌더링 성공 + 문제별 기본 단언(요소 존재·스타일 적용 등) 통과

---

## 3. `hidden` 블록 — 문제별

> **역할**: naive 풀이가 통과 못 하는 **핵심 테스트**. weighted 점수로 `accuracy`를 구성.

### algorithm — `pytest-hidden`

```json
"hidden": {
  "kind": "pytest-hidden",
  "cases": [
    { "id": "test_reversed_bounds", "weight": 2 },
    { "id": "test_negatives",       "weight": 1 }
  ]
}
```

- `id` = `hidden/test_hidden.py` 안의 함수명과 **정확히 일치**해야 함
- `weight` = 해당 케이스가 accuracy에 기여하는 상대적 비중
- `run_grade.py` 없이도 grade.py가 grader를 주입한다. grader는 통과한 case id 목록만
  보고하고(`GRADE:{"passed_ids":[...]}`), 호스트가 `weight`로 배점을 매긴다 — accuracy는
  통과 weight 합 / 전체 weight 합. `cases`에 없는 id는 무시되어 `passed ≤ total` 보장

### sql — `sql-scenarios`

```json
"hidden": {
  "kind": "sql-scenarios",
  "cmd": "python3 run_grade.py",
  "cases": [
    { "id": "basic_all_active",          "weight": 1 },
    { "id": "active_filter_changes_avg", "weight": 2 },
    { "id": "inactive_dept_excluded",    "weight": 2 },
    { "id": "all_inactive_empty",        "weight": 1 }
  ]
}
```

- `run_grade.py`가 여러 데이터 시나리오에 `solution.sql`을 실행하고 결과셋 비교
- `run_grade.py` 출력: `GRADE:{"passed_ids":[...]}` (통과한 case id 목록)
- `cases[].id`는 grader의 시나리오 id와 일치해야 함 — 호스트가 `weight`로 배점·케이스수 집계

### frontend — `browser-scenarios` (문제별 그레이더, sql-scenarios와 동형)

선언형 computed-style 단언으로 표현 못 하는 검사(뷰포트 전환, 박스 기하, axe-core 등)는
SQL의 `sql-scenarios`와 같은 방식 — 문제별 `cmd` 그레이더에 위임한다. `open`도 동일하게
문제별 visible 스크립트를 가리킨다(`sql-visible`이 `run_tests.py`를 가리키는 것과 동형).

```json
"open": {
  "kind": "browser-visible",
  "cmd": "node tests/run_visible.js"
},
"hidden": {
  "kind": "browser-scenarios",
  "cmd": "node run_grade.js",
  "cases": [
    { "id": "layout_row",        "weight": 1 },
    { "id": "responsive_stack",  "weight": 2 },
    { "id": "accessibility",     "weight": 2 }
  ]
}
```

- `run_grade.js`는 헤드리스 브라우저를 직접 띄워 데스크톱/모바일 레이아웃·추천 카드 구분·
  axe-core 접근성을 검증하고 `GRADE:{"passed_ids":[...]}` 출력 (sql-scenarios와 동일 계약)
- `cases[].id`는 grader의 단언 id와 일치 — 호스트가 `weight`로 배점·케이스수 집계
- 현재 유일한 frontend 문제 `responsive-pricing`이 이 형식을 쓴다

---

## 4. 전체 예시

### Algorithm (`range-sum`)

```json
{
  "schema_version": 2,
  "id": 1024,
  "title": "구간 합 구하기",
  "type": "algorithm",
  "category": "알고리즘",
  "difficulty": "mid",
  "skills": ["누적합", "자료구조"],
  "submission": { "entry": "solution.py", "runtime": "judge-py:base" },
  "open": {
    "kind": "pytest-visible",
    "cmd": "python3 -m pytest tests/test_visible.py -q --tb=short"
  },
  "hidden": {
    "kind": "pytest-hidden",
    "cases": [
      { "id": "test_basic",                    "weight": 1 },
      { "id": "test_single_element_interval",  "weight": 1 },
      { "id": "test_full_range",               "weight": 1 },
      { "id": "test_reversed_bounds",          "weight": 2 },
      { "id": "test_negatives",                "weight": 1 }
    ]
  },
  "scoring": {
    "axes": [
      { "key": "accuracy",         "weight": 0.60 },
      { "key": "turn_efficiency",  "weight": 0.25 },
      { "key": "token_efficiency", "weight": 0.15 }
    ]
  },
  "par": { "turns": 3, "tokens": 6000, "time_sec": 540 },
  "trap_note": "naive sum(arr[i-1:j]) passes visible but fails hidden: reversed bounds, 1-indexed off-by-one, negatives."
}
```

### SQL (`dept-avg-salary`)

```json
{
  "schema_version": 2,
  "id": 2207,
  "title": "부서별 평균 급여",
  "type": "sql",
  "category": "집계 쿼리",
  "difficulty": "basic",
  "skills": ["GROUP BY", "필터링"],
  "submission": { "entry": "solution.sql", "runtime": "judge-sql:base" },
  "open": {
    "kind": "sql-visible",
    "cmd": "python3 run_tests.py"
  },
  "hidden": {
    "kind": "sql-scenarios",
    "cmd": "python3 run_grade.py",
    "cases": [
      { "id": "basic_all_active",          "weight": 1 },
      { "id": "active_filter_changes_avg", "weight": 2 },
      { "id": "inactive_dept_excluded",    "weight": 2 },
      { "id": "all_inactive_empty",        "weight": 1 }
    ]
  },
  "scoring": {
    "axes": [
      { "key": "accuracy",         "weight": 0.65 },
      { "key": "turn_efficiency",  "weight": 0.20 },
      { "key": "token_efficiency", "weight": 0.15 }
    ]
  },
  "par": { "turns": 3, "tokens": 5000, "time_sec": 540 },
  "trap_note": "lazy GROUP BY without WHERE active=1 passes visible but fails hidden: inactive rows skew avg, all-inactive dept must be absent."
}
```

### Frontend (`responsive-pricing`)

```json
{
  "schema_version": 2,
  "id": 3001,
  "title": "반응형 요금제 카드",
  "type": "frontend",
  "category": "반응형 레이아웃",
  "difficulty": "mid",
  "skills": ["반응형", "Flexbox/Grid", "접근성"],
  "submission": { "entry": "index.html", "runtime": "judge-browser:base" },
  "open": {
    "kind": "browser-visible",
    "cmd": "node tests/run_visible.js"
  },
  "hidden": {
    "kind": "browser-scenarios",
    "cmd": "node run_grade.js",
    "cases": [
      { "id": "layout_row",        "weight": 1 },
      { "id": "equal_width",       "weight": 1 },
      { "id": "featured_distinct", "weight": 1 },
      { "id": "responsive_stack",  "weight": 2 },
      { "id": "accessibility",     "weight": 2 }
    ]
  },
  "scoring": {
    "axes": [
      { "key": "accuracy",         "weight": 0.70 },
      { "key": "turn_efficiency",  "weight": 0.18 },
      { "key": "token_efficiency", "weight": 0.12 }
    ]
  },
  "trap_note": "naive fixed-px inline-block row with no media query passes the visible 'three cards render' check but fails hidden: no <768px stacking, unequal widths, featured card not distinguished, and missing button text / heading semantics trip axe-core."
}
```

---

## 5. 채점 파이프라인 요약

```
[에이전트 작업 중]
  → POST /attempts/{id}/messages
  → 에이전트: solution 작성 → open 실행 → 실패 시 수정 반복
  → open 통과 후 사용자가 제출 결정

[제출]
  → POST /attempts/{id}/submit
  → attempts/{id}/ 를 채점 폴더로 복사
  → hidden/ 아티팩트 주입 (에이전트 작업폴더엔 절대 들어가지 않음)
  → docker run --rm (network none, mem/pid 제한):
      ① open 재실행 → 실패 시 accuracy = 0 (단락)
      ② hidden 실행 → GRADE:{"passed_ids":[...]} → 호스트가 weight로 배점/케이스수 집계
  → accuracy = W / T
  → turn_efficiency  = clamp(par.turns  / actual_turns,  0, 1)
  → token_efficiency = clamp(par.tokens / actual_tokens, 0, 1)
  → final_score = 0.65·acc + 0.20·turn_eff + 0.15·tok_eff
  → Submission 저장 → 리더보드 반영
  → 채점 폴더 폐기
```
