"""Problem generation via Gemini API.

Flow:
  POST /problems/generate  → call_gemini() → validate_generated() → issue_token()
  POST /problems/publish   → consume_token() → save_problem()

Supports: algorithm (Python pytest) | sql (sqlite3) | frontend (Playwright)
"""
import json
import os
import re
import secrets
import shutil
import time
import uuid
from pathlib import Path

import sandbox

BASE = Path(__file__).parent
PROBLEMS = BASE / "problems"
ATTEMPTS = BASE / "attempts"

_tokens: dict[str, dict] = {}
TOKEN_TTL = 600  # 10 minutes


# ---------------------------------------------------------------------------
# Gemini client
# ---------------------------------------------------------------------------

def _gemini_model():
    try:
        import google.generativeai as genai
    except ImportError:
        raise RuntimeError("google-generativeai 패키지 필요: pip install google-generativeai")
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다")
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        model_name,
        generation_config={"response_mime_type": "application/json"},
    )


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_ALGO_PROMPT = """\
당신은 코딩 교육 플랫폼의 문제 출제자입니다.
다음 정보를 바탕으로 Python 알고리즘 코딩 문제를 생성해주세요.

## 입력 정보
- 제목: {title}
- 난이도: {difficulty}
- 스킬 태그: {skills}
- 문제 스토리: {story}
- 출제 의도 (비공개, 채점 트랩 설계용): {intent}

## 파일 구조
```
repo/
  solution.py           ← 빈 스텁 (AI 에이전트가 채움)
  tests/
    test_visible.py     ← happy path (에이전트에게 공개)
hidden/
  test_hidden.py        ← 트랩·엣지케이스 (채점 전용, 비공개)
```

## 생성 규칙

### statement_md
- 한국어, 배경·함수 시그니처·입출력 예시·제약 조건 포함
- **출제 의도가 절대 드러나지 않게** 작성

### starter_solution_py
- 함수 시그니처 + 한 줄 docstring + `raise NotImplementedError`

### test_visible_py
- 첫 두 줄:
  `import sys, os`
  `sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))`
- `from solution import <함수>` 로 import
- happy path 2~3개, 트랩 없음

### test_hidden_py
- 첫 두 줄:
  `import sys, os`
  `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`
- `from solution import <함수>` 로 import
- 출제 의도 반영한 트랩·엣지케이스 5~8개
- 함수명 반드시 `test_` 로 시작

### model_answer_py
- test_visible_py 와 test_hidden_py 를 **모두 통과**하는 정답
- 검증 후 즉시 폐기

### hidden_cases
- test_hidden_py 각 함수의 메타: weight 핵심=3, 중요=2, 단순=1

## 응답 형식 (순수 JSON)
{{
  "statement_md": "...",
  "starter_solution_py": "...",
  "test_visible_py": "...",
  "test_hidden_py": "...",
  "model_answer_py": "...",
  "hidden_cases": [{{"id": "test_함수명", "weight": 2}}]
}}
"""

_SQL_PROMPT = """\
당신은 코딩 교육 플랫폼의 문제 출제자입니다.
다음 정보를 바탕으로 SQL SELECT 쿼리 문제를 생성해주세요.

## 입력 정보
- 제목: {title}
- 난이도: {difficulty}
- 스킬 태그: {skills}
- 문제 스토리: {story}
- 출제 의도 (비공개, 채점 트랩 설계용): {intent}

## 파일 구조
```
repo/
  schema.sql     ← CREATE TABLE + 예제 시드 데이터 (에이전트에게 공개)
  solution.sql   ← 빈 스타터 (에이전트가 채움)
  run_tests.py   ← 예제 테스트 실행기 (에이전트가 실행 가능)
hidden/
  run_grade.py   ← 채점 전용 (비공개)
```

## 생성 규칙

### statement_md
- 한국어, 테이블 구조·작성할 쿼리·예상 결과·제약 조건 포함
- **출제 의도가 절대 드러나지 않게** 작성

### schema_sql
- CREATE TABLE DDL + 예제 INSERT 데이터
- 에이전트가 쿼리를 개발할 때 사용하는 단순한 시드

### starter_solution_sql
- `-- 여기에 SQL을 작성하세요` 한 줄

### run_tests_py
- schema.sql 과 solution.sql 을 읽어 sqlite3 로 실행
- 결과를 EXPECTED 와 비교하여 "통과" / "실패" 출력
- 성공 시 exit code 0, 실패 시 1

```python
import sqlite3, sys
from pathlib import Path

EXPECTED = [...]   # schema.sql 시드 기준 기대 결과 (행 튜플 목록)

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
        print(f'예제: 실패 — SQL 오류: {{e}}')
        return 1
    if _norm(rows) == _norm(EXPECTED):
        print(f'예제: 통과 (1/1) — {{rows}}')
        return 0
    print(f'예제: 실패 (0/1)\\n  기대: {{EXPECTED}}\\n  실제: {{rows}}')
    return 1

if __name__ == '__main__':
    sys.exit(main())
```

### run_grade_py
- DDL 을 직접 임베드 (schema.sql 참조 안 함)
- solution.sql 은 `Path('solution.sql').read_text()` 로 읽음
- SCENARIOS 에 출제 의도 반영: naive 쿼리를 통과시키는 시나리오 + 트랩 시나리오
- GRADE:{{"passed": N, "total": T}} 형식으로 출력

```python
import json, sqlite3
from pathlib import Path

DDL = "CREATE TABLE ..."

SCENARIOS = [
    # (삽입행목록, 기대결과목록)
    ([...], [...]),
]

def _norm(rows):
    return [tuple(round(v,4) if isinstance(v,float) else v for v in r) for r in rows]

def main():
    solution = Path('solution.sql').read_text().strip()
    passed = 0
    for seed_rows, expected in SCENARIOS:
        con = sqlite3.connect(':memory:')
        con.executescript(DDL)
        con.executemany("INSERT INTO ... VALUES (...)", seed_rows)
        try:
            rows = con.execute(solution).fetchall()
            if _norm(rows) == _norm(expected):
                passed += 1
        except sqlite3.Error:
            pass
        finally:
            con.close()
    print('GRADE:' + json.dumps({{'passed': passed, 'total': len(SCENARIOS)}}))

if __name__ == '__main__':
    main()
```

### model_answer_sql
- run_grade_py 의 모든 SCENARIOS 를 통과하는 정확한 SQL SELECT 문

### hidden_cases
- SCENARIOS 에 대응하는 id/weight 목록

## 응답 형식 (순수 JSON)
{{
  "statement_md": "...",
  "schema_sql": "...",
  "starter_solution_sql": "-- 여기에 SQL을 작성하세요",
  "run_tests_py": "...",
  "run_grade_py": "...",
  "model_answer_sql": "...",
  "hidden_cases": [{{"id": "basic_scenario", "weight": 1}}]
}}
"""

_FE_PROMPT = """\
당신은 코딩 교육 플랫폼의 문제 출제자입니다.
다음 정보를 바탕으로 HTML/CSS/JS 프론트엔드 문제를 생성해주세요.

## 입력 정보
- 제목: {title}
- 난이도: {difficulty}
- 스킬 태그: {skills}
- 문제 스토리: {story}
- 출제 의도 (비공개, 채점 트랩 설계용): {intent}

## 파일 구조
```
repo/
  index.html          ← 구조만 있는 스타터 HTML (에이전트가 스타일링)
  style.css           ← 빈 스타터 CSS
  tests/
    run_visible.js    ← 기본 DOM 확인 (에이전트에게 공개)
hidden/
  run_grade.js        ← 상세 채점 (비공개)
```

## 생성 규칙

### statement_md
- 한국어, 구현할 UI 명세·요구사항·제약 조건 포함
- **출제 의도가 절대 드러나지 않게** 작성

### starter_html
- 완전한 HTML 구조 (<!DOCTYPE html>, <head>, <body>)
- <link rel="stylesheet" href="style.css"> 포함
- 시맨틱 마크업만, 스타일 없음
- data-testid 등 Playwright 테스트에 필요한 속성 포함

### starter_css
- `/* 여기에 CSS를 작성하세요 */` 한 줄

### run_visible_js
- Playwright로 file:///work/index.html 로드
- 기본 DOM 구조 확인 2~3개 (요소 존재 여부 등)
- PASS/FAIL 출력, 전부 통과 시 exit 0

```javascript
const {{ chromium }} = require('playwright-core')
const URL = 'file:///work/index.html'
async function main() {{
  const browser = await chromium.launch({{args:['--no-sandbox','--disable-dev-shm-usage']}})
  const page = await browser.newPage()
  await page.setViewportSize({{width:1280,height:900}})
  await page.goto(URL, {{waitUntil:'load'}})
  const checks = []
  // checks.push(['설명', condition])
  await browser.close()
  checks.forEach(([n,ok])=>console.log((ok?'PASS':'FAIL')+': '+n))
  process.exit(checks.every(([,ok])=>ok)?0:1)
}}
main().catch(e=>{{console.error(e);process.exit(1)}})
```

### run_grade_js
- 출제 의도를 반영한 3~5개 상세 체크
- 각 check 이름이 hidden_cases 의 id 와 일치해야 함
- GRADE:{{"passed":N,"total":T}} 출력

```javascript
const {{ chromium }} = require('playwright-core')
const TOTAL = N
const URL = 'file:///work/index.html'
async function main() {{
  const results = []
  const check = async (name, fn) => {{
    try {{ results.push([name, !!(await fn())]) }}
    catch {{ results.push([name, false]) }}
  }}
  const browser = await chromium.launch({{args:['--no-sandbox','--disable-dev-shm-usage']}})
  const page = await browser.newPage()
  await page.setViewportSize({{width:1280,height:900}})
  await page.goto(URL, {{waitUntil:'load'}})
  await check('check_id', async () => {{ /* ... */ return true }})
  await browser.close()
  const passed = results.filter(([,ok])=>ok).length
  console.log('GRADE:'+JSON.stringify({{passed,total:TOTAL}}))
}}
main().catch(e=>{{console.error(e);console.log('GRADE:'+JSON.stringify({{passed:0,total:TOTAL}}))}})
```

### model_answer_html
- run_grade_js 의 모든 체크를 통과하는 완성된 HTML

### model_answer_css
- model_answer_html 과 함께 동작하는 CSS

### hidden_cases
- run_grade_js 의 check 함수명/id 와 weight

## 응답 형식 (순수 JSON)
{{
  "statement_md": "...",
  "starter_html": "...",
  "starter_css": "/* 여기에 CSS를 작성하세요 */",
  "run_visible_js": "...",
  "run_grade_js": "...",
  "model_answer_html": "...",
  "model_answer_css": "...",
  "hidden_cases": [{{"id": "check_id", "weight": 2}}]
}}
"""

_REQUIRED_FIELDS = {
    "algorithm": {"statement_md", "starter_solution_py", "test_visible_py",
                  "test_hidden_py", "model_answer_py", "hidden_cases"},
    "sql":       {"statement_md", "schema_sql", "starter_solution_sql",
                  "run_tests_py", "run_grade_py", "model_answer_sql", "hidden_cases"},
    "frontend":  {"statement_md", "starter_html", "starter_css",
                  "run_visible_js", "run_grade_js", "model_answer_html",
                  "model_answer_css", "hidden_cases"},
}

# 프론트엔드 명령 규칙(한 곳): 비짓블은 attempt 루트(repo/ 내용물)에서, 히든은 grade.py가
# hidden/ 트리를 채점폴더 루트에 펼친 뒤 실행한다 → 둘 다 루트 기준 경로.
_FE_VISIBLE_CMD = "node tests/run_visible.js"
_FE_GRADE_CMD = "node run_grade.js"


# ---------------------------------------------------------------------------
# Core generation
# ---------------------------------------------------------------------------

def call_gemini(title: str, problem_type: str, difficulty: str, skills: list,
                story: str, intent: str) -> dict:
    difficulty_label = {"basic": "초급", "mid": "중급", "hard": "고급"}.get(difficulty, difficulty)
    skills_str = ", ".join(skills) if skills else "없음"

    prompts = {"algorithm": _ALGO_PROMPT, "sql": _SQL_PROMPT, "frontend": _FE_PROMPT}
    if problem_type not in prompts:
        raise ValueError(f"지원하지 않는 유형: {problem_type}")

    prompt = prompts[problem_type].format(
        title=title, difficulty=difficulty_label,
        skills=skills_str, story=story, intent=intent,
    )

    model = _gemini_model()
    resp = model.generate_content(prompt)

    try:
        data = json.loads(resp.text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini 응답 파싱 실패: {e}\n응답: {resp.text[:400]}")

    missing = _REQUIRED_FIELDS[problem_type] - data.keys()
    if missing:
        raise RuntimeError(f"Gemini 응답에 필드 누락: {missing}")

    return data


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_generated(generated: dict, problem_type: str = "algorithm") -> dict:
    if problem_type == "algorithm":
        return _validate_algo(generated)
    if problem_type == "sql":
        return _validate_sql(generated)
    if problem_type == "frontend":
        return _validate_frontend(generated)
    raise ValueError(f"알 수 없는 유형: {problem_type}")


def _validate_algo(generated: dict) -> dict:
    work_dir = ATTEMPTS / f"__gen_val_{uuid.uuid4().hex[:8]}"
    work_dir.mkdir(parents=True)
    try:
        (work_dir / "solution.py").write_text(generated["model_answer_py"], encoding="utf-8")
        tests = work_dir / "tests"
        tests.mkdir()
        (tests / "test_visible.py").write_text(generated["test_visible_py"], encoding="utf-8")
        (work_dir / "test_hidden.py").write_text(generated["test_hidden_py"], encoding="utf-8")
        _chmod_r(work_dir)

        visible_out = sandbox.run_in_container(
            work_dir, "python3 -m pytest tests/test_visible.py -v --tb=short 2>&1", "judge-py:base")
        hidden_out = sandbox.run_in_container(
            work_dir, "python3 -m pytest test_hidden.py -v --tb=short 2>&1", "judge-py:base")

        visible_ok = _pytest_ok(visible_out)
        hidden_ok = _pytest_ok(hidden_out)
        return {"ok": visible_ok and hidden_ok,
                "visible_ok": visible_ok, "visible_output": visible_out,
                "hidden_ok": hidden_ok, "hidden_output": hidden_out}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _validate_sql(generated: dict) -> dict:
    work_dir = ATTEMPTS / f"__gen_val_{uuid.uuid4().hex[:8]}"
    work_dir.mkdir(parents=True)
    try:
        (work_dir / "schema.sql").write_text(generated["schema_sql"], encoding="utf-8")
        (work_dir / "solution.sql").write_text(generated["model_answer_sql"], encoding="utf-8")
        (work_dir / "run_tests.py").write_text(generated["run_tests_py"], encoding="utf-8")
        (work_dir / "run_grade.py").write_text(generated["run_grade_py"], encoding="utf-8")
        _chmod_r(work_dir)

        visible_out = sandbox.run_in_container(
            work_dir, "python3 run_tests.py 2>&1", "judge-sql:base")
        hidden_out = sandbox.run_in_container(
            work_dir, "python3 run_grade.py 2>&1", "judge-sql:base")

        visible_ok = "통과" in visible_out and "실패" not in visible_out
        hidden_ok = _grade_all_passed(hidden_out)
        return {"ok": visible_ok and hidden_ok,
                "visible_ok": visible_ok, "visible_output": visible_out,
                "hidden_ok": hidden_ok, "hidden_output": hidden_out}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _validate_frontend(generated: dict) -> dict:
    work_dir = ATTEMPTS / f"__gen_val_{uuid.uuid4().hex[:8]}"
    work_dir.mkdir(parents=True)
    try:
        (work_dir / "index.html").write_text(generated["model_answer_html"], encoding="utf-8")
        (work_dir / "style.css").write_text(generated["model_answer_css"], encoding="utf-8")
        tests = work_dir / "tests"
        tests.mkdir()
        (tests / "run_visible.js").write_text(generated["run_visible_js"], encoding="utf-8")
        # grade.py는 hidden/ 트리를 채점폴더 루트에 펼친다 — 검증도 동일 레이아웃으로 맞춰
        # 검증 통과 = 실제 채점 통과를 보장한다.
        (work_dir / "run_grade.js").write_text(generated["run_grade_js"], encoding="utf-8")
        _chmod_r(work_dir)

        visible_out = sandbox.run_in_container(
            work_dir, f"{_FE_VISIBLE_CMD} 2>&1", "judge-browser:base")
        hidden_out = sandbox.run_in_container(
            work_dir, f"{_FE_GRADE_CMD} 2>&1", "judge-browser:base")

        visible_ok = "FAIL" not in visible_out and "PASS" in visible_out
        hidden_ok = _grade_all_passed(hidden_out)
        return {"ok": visible_ok and hidden_ok,
                "visible_ok": visible_ok, "visible_output": visible_out,
                "hidden_ok": hidden_ok, "hidden_output": hidden_out}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _pytest_ok(output: str) -> bool:
    low = output.lower()
    return "passed" in low and " failed" not in low and "collected 0 items" not in low


def _grade_all_passed(output: str) -> bool:
    m = re.search(r"GRADE:(\{.*\})", output)
    if not m:
        return False
    try:
        d = json.loads(m.group(1))
        t = int(d.get("total", 0))
        return t > 0 and int(d.get("passed", 0)) == t
    except (json.JSONDecodeError, TypeError, ValueError):
        return False


def _chmod_r(path: Path) -> None:
    os.chmod(path, 0o755)
    for root, dirs, files in os.walk(path):
        for d in dirs:
            os.chmod(os.path.join(root, d), 0o755)
        for f in files:
            os.chmod(os.path.join(root, f), 0o644)


# ---------------------------------------------------------------------------
# Token store
# ---------------------------------------------------------------------------

def issue_token(payload: dict) -> str:
    token = secrets.token_urlsafe(32)
    _tokens[token] = {"expires_at": time.time() + TOKEN_TTL, "data": payload}
    return token


def consume_token(token: str) -> dict | None:
    entry = _tokens.pop(token, None)
    if not entry or time.time() > entry["expires_at"]:
        return None
    return entry["data"]


# ---------------------------------------------------------------------------
# Save to disk
# ---------------------------------------------------------------------------

def _slug(title: str) -> str:
    base = re.sub(r"[^a-z0-9가-힣]+", "-", title.lower()).strip("-") or "problem"
    slug, i = base, 2
    while (PROBLEMS / slug).exists():
        slug, i = f"{base}-{i}", i + 1
    return slug


def save_problem(slug: str, meta: dict, files: dict) -> None:
    prob = PROBLEMS / slug
    prob.mkdir(parents=True, exist_ok=True)
    (prob / "statement.md").write_text(files["statement_md"], encoding="utf-8")
    (prob / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    problem_type = meta.get("type", "algorithm")
    if problem_type == "algorithm":
        _save_algo(prob, files)
    elif problem_type == "sql":
        _save_sql(prob, files)
    elif problem_type == "frontend":
        _save_frontend(prob, files)


def _save_algo(prob: Path, files: dict) -> None:
    repo = prob / "repo"
    repo.mkdir(exist_ok=True)
    (repo / "solution.py").write_text(files["starter_solution_py"], encoding="utf-8")
    tests = repo / "tests"
    tests.mkdir(exist_ok=True)
    (tests / "test_visible.py").write_text(files["test_visible_py"], encoding="utf-8")
    hidden = prob / "hidden"
    hidden.mkdir(exist_ok=True)
    (hidden / "test_hidden.py").write_text(files["test_hidden_py"], encoding="utf-8")


def _save_sql(prob: Path, files: dict) -> None:
    repo = prob / "repo"
    repo.mkdir(exist_ok=True)
    (repo / "schema.sql").write_text(files["schema_sql"], encoding="utf-8")
    (repo / "solution.sql").write_text(files["starter_solution_sql"], encoding="utf-8")
    (repo / "run_tests.py").write_text(files["run_tests_py"], encoding="utf-8")
    hidden = prob / "hidden"
    hidden.mkdir(exist_ok=True)
    (hidden / "run_grade.py").write_text(files["run_grade_py"], encoding="utf-8")


def _save_frontend(prob: Path, files: dict) -> None:
    repo = prob / "repo"
    repo.mkdir(exist_ok=True)
    (repo / "index.html").write_text(files["starter_html"], encoding="utf-8")
    (repo / "style.css").write_text(files["starter_css"], encoding="utf-8")
    tests = repo / "tests"
    tests.mkdir(exist_ok=True)
    (tests / "run_visible.js").write_text(files["run_visible_js"], encoding="utf-8")
    hidden = prob / "hidden"
    hidden.mkdir(exist_ok=True)
    (hidden / "run_grade.js").write_text(files["run_grade_js"], encoding="utf-8")


# ---------------------------------------------------------------------------
# Meta builder
# ---------------------------------------------------------------------------

def build_meta(slug: str, title: str, problem_type: str, difficulty: str,
               skills: list, hidden_cases: list) -> dict:
    base = {
        "schema_version": 2,
        "id": slug,
        "title": title,
        "type": problem_type,
        "difficulty": difficulty,
        "skills": skills,
        "hidden": {"cases": hidden_cases},
        "scoring": {
            "axes": [
                {"key": "accuracy",         "weight": 0.65},
                {"key": "turn_efficiency",  "weight": 0.20},
                {"key": "token_efficiency", "weight": 0.15},
            ]
        },
    }

    if problem_type == "algorithm":
        base["category"] = "알고리즘"
        base["submission"] = {"entry": "repo/solution.py", "runtime": "judge-py:base"}
        base["open"] = {"kind": "pytest-visible",
                        "cmd": "python3 -m pytest tests/test_visible.py -q --tb=short"}
        base["hidden"].update({"kind": "pytest-hidden"})

    elif problem_type == "sql":
        base["category"] = "SQL 쿼리"
        base["submission"] = {"entry": "solution.sql", "runtime": "judge-sql:base"}
        base["open"] = {"kind": "sql-visible", "cmd": "python3 run_tests.py"}
        base["hidden"].update({"kind": "sql-scenarios", "cmd": "python3 run_grade.py"})

    elif problem_type == "frontend":
        base["category"] = "프론트엔드"
        base["submission"] = {"entry": "index.html", "runtime": "judge-browser:base"}
        base["open"] = {"kind": "browser-visible", "cmd": _FE_VISIBLE_CMD}
        base["hidden"].update({"kind": "browser-scenarios", "cmd": _FE_GRADE_CMD})

    return base
