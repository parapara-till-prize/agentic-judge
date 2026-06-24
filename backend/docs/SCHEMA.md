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

---

## 1. 공통 코어 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `schema_version` | `2` | 항상 숫자 2 (고정) |
| `id` | string | 폴더명과 동일한 슬러그 (예: `"range-sum"`) |
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
  "entry": "repo/solution.py",   // 에이전트가 작성하는 파일
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
  "cmd": "python3 -m pytest repo/tests/test_visible.py -q --tb=short"
}
```

- 컴파일(import) 에러 없음 + 작은 예제 정답 확인
- 시간/공간 제한 **없음** — 구현 여부만 판단

### sql

```json
"open": {
  "kind": "sql-visible",
  "cmd": "python3 repo/run_tests.py"
}
```

- DDL이 에러 없이 실행되는지 확인
- 정상 INSERT/SELECT가 기대 결과를 반환하는지 확인
- `run_tests.py`는 `schema.sql` + `solution.sql`을 순서대로 실행

### frontend

```json
"open": {
  "kind": "css-visible",
  "cmd": "node /runners/run_fe.js --mode=open",
  "required_selectors": [".sidebar", ".grid", ".card"]
}
```

- CSS 파싱 에러 없음
- 헤드리스 브라우저로 렌더링 성공
- `required_selectors` 의 모든 요소가 화면에 존재하고 스타일이 적용됨

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
- 성능 제한이 필요한 경우 `limits` 추가:

```json
"hidden": {
  "kind": "pytest-perf",
  "limits": { "time_ms": 2000, "mem_mb": 256 },
  "cases": [
    { "id": "test_perf_large", "weight": 3 }
  ]
}
```

### algorithm — `concurrency` (동시성 문제)

```json
"hidden": {
  "kind": "concurrency",
  "cases": [
    { "id": "test_concurrent_no_lost_update", "weight": 3 },
    { "id": "test_idempotent_init",           "weight": 1 }
  ]
}
```

- `hidden/test_hidden.py`가 스레드를 직접 생성해 동시 실행을 검증함
- 러너는 pytest로 실행하되 단일 프로세스 내 스레드 레벨에서 경합 발생

### sql — `sql-scenarios`

```json
"hidden": {
  "kind": "sql-scenarios",
  "cmd": "python3 hidden/run_grade.py",
  "cases": [
    { "id": "basic_all_active",          "weight": 1 },
    { "id": "active_filter_changes_avg", "weight": 2 },
    { "id": "inactive_dept_excluded",    "weight": 2 },
    { "id": "all_inactive_empty",        "weight": 1 }
  ]
}
```

- `run_grade.py`가 여러 데이터 시나리오에 `solution.sql`을 실행하고 결과셋 비교
- `run_grade.py` 출력: `GRADE:{"passed": N, "total": M}`
- `cases`는 **문서화 목적** — 러너는 `cmd`에 위임, weight는 grader에서 직접 집계

### frontend — `dom-style-assert`

```json
"hidden": {
  "kind": "dom-style-assert",
  "viewport": { "w": 1280, "h": 800 },
  "cases": [
    { "id": "sidebar_width",  "selector": ".sidebar", "prop": "width",   "expect": "240px", "weight": 2 },
    { "id": "grid_display",   "selector": ".grid",    "prop": "display", "expect": "grid",  "weight": 2 },
    { "id": "card_shadow",    "selector": ".card",    "prop": "boxShadow","expect": "*",    "weight": 1 }
  ],
  "visual": { "max_diff_ratio": 0.03, "weight": 3 }
}
```

- `selector` + `prop` + `expect`: Playwright `getComputedStyle` 단언
- `expect: "*"` = 값이 default(`none`/`0px`/`normal`)가 아니면 통과
- `visual`: 레퍼런스 스크린샷(`hidden/ref/desktop.png`)과 픽셀 diff 비율
- ⚠️ 단일 뷰포트 computed-style 단언만 가능 — **반응형(뷰포트 전환)·axe a11y 같은
  검사는 표현 불가**. 그런 문제는 아래 `browser-scenarios`(문제별 그레이더)를 쓴다.
- 실행 경로(`/runners/run_fe.js` 마운트 + grade.py 라우팅)는 **아직 미배선**.

### frontend — `browser-scenarios` (문제별 그레이더, sql-scenarios와 동형)

`dom-style-assert`로 표현 못 하는 검사(뷰포트 전환, 박스 기하, axe-core 등)는 SQL의
`sql-scenarios`와 같은 방식 — 문제별 `cmd` 그레이더에 위임한다. `open`도 동일하게
문제별 visible 스크립트를 가리킨다(`sql-visible`이 `repo/run_tests.py`를 가리키는 것과 동형).

```json
"open": {
  "kind": "browser-visible",
  "cmd": "node repo/tests/run_visible.js"
},
"hidden": {
  "kind": "browser-scenarios",
  "cmd": "node hidden/run_grade.js",
  "cases": [
    { "id": "layout_row",        "weight": 1 },
    { "id": "responsive_stack",  "weight": 2 },
    { "id": "accessibility",     "weight": 2 }
  ]
}
```

- `run_grade.js`는 헤드리스 브라우저를 직접 띄워 데스크톱/모바일 레이아웃·추천 카드 구분·
  axe-core 접근성을 검증하고 `GRADE:{"passed":N,"total":M}` 출력 (sql-scenarios와 동일 계약)
- `cases`는 **문서화·분모 용도** — grade.py가 `hidden.cases` 개수를 authoritative total로 사용
- 현재 유일한 frontend 문제 `responsive-pricing`이 이 형식을 쓴다 (`dom-style-assert`는 향후
  `run_fe.js` 배선 후 선언형 옵션)

---

## 4. 전체 예시

### Algorithm (`range-sum`)

```json
{
  "schema_version": 2,
  "id": "range-sum",
  "title": "구간 합 구하기",
  "type": "algorithm",
  "category": "알고리즘",
  "difficulty": "mid",
  "skills": ["누적합", "자료구조"],
  "submission": { "entry": "repo/solution.py", "runtime": "judge-py:base" },
  "open": {
    "kind": "pytest-visible",
    "cmd": "python3 -m pytest repo/tests/test_visible.py -q --tb=short"
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
  "id": "dept-avg-salary",
  "title": "부서별 평균 급여",
  "type": "sql",
  "category": "집계 쿼리",
  "difficulty": "basic",
  "skills": ["GROUP BY", "필터링"],
  "submission": { "entry": "repo/solution.sql", "runtime": "judge-sql:base" },
  "open": {
    "kind": "sql-visible",
    "cmd": "python3 repo/run_tests.py"
  },
  "hidden": {
    "kind": "sql-scenarios",
    "cmd": "python3 hidden/run_grade.py",
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

### Frontend (`flex-card-layout` — 예시)

```json
{
  "schema_version": 2,
  "id": "flex-card-layout",
  "title": "카드 리스트 레이아웃",
  "type": "frontend",
  "category": "CSS 레이아웃",
  "difficulty": "basic",
  "skills": ["Flexbox", "반응형"],
  "submission": { "entry": "repo/solution.css", "runtime": "judge-browser:base" },
  "open": {
    "kind": "css-visible",
    "cmd": "node /runners/run_fe.js --mode=open",
    "required_selectors": [".container", ".card", ".card-title"]
  },
  "hidden": {
    "kind": "dom-style-assert",
    "viewport": { "w": 1280, "h": 800 },
    "cases": [
      { "id": "container_flex",   "selector": ".container", "prop": "display",      "expect": "flex",     "weight": 2 },
      { "id": "container_wrap",   "selector": ".container", "prop": "flexWrap",     "expect": "wrap",     "weight": 1 },
      { "id": "card_width",       "selector": ".card",      "prop": "width",        "expect": "300px",    "weight": 2 },
      { "id": "card_shadow",      "selector": ".card",      "prop": "boxShadow",    "expect": "*",        "weight": 1 },
      { "id": "title_bold",       "selector": ".card-title","prop": "fontWeight",   "expect": "700",      "weight": 1 }
    ],
    "visual": { "max_diff_ratio": 0.03, "weight": 3 }
  },
  "scoring": {
    "axes": [
      { "key": "accuracy",         "weight": 0.65 },
      { "key": "turn_efficiency",  "weight": 0.20 },
      { "key": "token_efficiency", "weight": 0.15 }
    ]
  },
  "par": { "turns": 3, "tokens": 6000, "time_sec": 540 },
  "trap_note": "naive display:block으로 세로 나열은 open 통과하지만 flex+wrap+고정너비 없어서 hidden 실패."
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
      ② hidden 실행 → GRADE:{"passed": W, "total": T}
  → accuracy = W / T
  → turn_efficiency  = clamp(par.turns  / actual_turns,  0, 1)
  → token_efficiency = clamp(par.tokens / actual_tokens, 0, 1)
  → final_score = 0.65·acc + 0.20·turn_eff + 0.15·tok_eff
  → Submission 저장 → 리더보드 반영
  → 채점 폴더 폐기
```
