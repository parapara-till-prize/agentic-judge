"""Problem generation via Gemini API.

Flow:
  POST /problems/generate  → call_gemini() → validate_generated() → issue_token()
  POST /problems/publish   → consume_token() → save_problem()

Gemini generates statement.md, test_visible.py, test_hidden.py, model answer (validation only).
The model answer is discarded after validation — never written to disk.
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
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        "gemini-2.0-flash",
        generation_config={"response_mime_type": "application/json"},
    )


# ---------------------------------------------------------------------------
# Prompt
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

## 생성 파일 구조
```
repo/
  solution.py           ← 빈 스텁 (AI 에이전트가 채움)
  tests/
    test_visible.py     ← happy path (에이전트에게 공개)
hidden/
  test_hidden.py        ← 트랩·엣지케이스 (채점 전용, 비공개)
```

## 각 필드 작성 규칙

### statement_md
- 한국어
- 배경 설명, 구현할 함수 시그니처, 입출력 예시, 제약 조건
- **출제 의도가 절대 드러나지 않게** 작성
- AI 에이전트가 읽고 작업할 문서

### starter_solution_py
- `solution.py`에 들어갈 스텁
- 함수 시그니처 + 한 줄 docstring + `raise NotImplementedError`

### test_visible_py
- `tests/test_visible.py`에 들어갈 pytest 파일
- **첫 두 줄 반드시 포함:**
  ```
  import sys, os
  sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
  ```
- `from solution import <함수명>` 으로 임포트
- happy path 2~3개 (정상 입력만)
- 출제 의도 관련 트랩 절대 없음

### test_hidden_py
- `hidden/test_hidden.py`에 들어갈 pytest 파일
- **첫 두 줄 반드시 포함:**
  ```
  import sys, os
  sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
  ```
- `from solution import <함수명>` 으로 임포트
- 출제 의도({intent})를 반영한 트랩·엣지케이스 5~8개
- 테스트 함수명은 반드시 `test_` 로 시작

### model_answer_py
- `test_visible_py`와 `test_hidden_py`를 **모두 통과**하는 정답 코드
- `solution.py` 형식과 동일
- 검증 후 즉시 폐기, 절대 저장 안 됨

### hidden_cases
- `test_hidden_py`에 정의한 각 테스트 함수의 메타
- weight: 핵심 트랩이면 3, 중요 엣지케이스면 2, 단순 검증이면 1

## 응답 형식 (순수 JSON, 마크다운 코드블록 없음)
{{
  "statement_md": "...",
  "starter_solution_py": "...",
  "test_visible_py": "...",
  "test_hidden_py": "...",
  "model_answer_py": "...",
  "hidden_cases": [
    {{"id": "test_함수명", "weight": 2}}
  ]
}}
"""


# ---------------------------------------------------------------------------
# Core generation
# ---------------------------------------------------------------------------

def call_gemini(title: str, problem_type: str, difficulty: str, skills: list,
                story: str, intent: str) -> dict:
    """Call Gemini and return parsed JSON dict with generated files."""
    if problem_type != "algorithm":
        raise ValueError(f"현재 algorithm 유형만 지원됩니다 (요청: {problem_type})")

    difficulty_label = {"basic": "초급", "mid": "중급", "hard": "고급"}.get(difficulty, difficulty)
    prompt = _ALGO_PROMPT.format(
        title=title,
        difficulty=difficulty_label,
        skills=", ".join(skills) if skills else "없음",
        story=story,
        intent=intent,
    )

    model = _gemini_model()
    resp = model.generate_content(prompt)

    try:
        data = json.loads(resp.text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Gemini 응답 파싱 실패: {e}\n응답 앞부분: {resp.text[:400]}")

    required = {"statement_md", "starter_solution_py", "test_visible_py",
                "test_hidden_py", "model_answer_py", "hidden_cases"}
    missing = required - data.keys()
    if missing:
        raise RuntimeError(f"Gemini 응답에 필드 누락: {missing}")

    return data


# ---------------------------------------------------------------------------
# Validation — run model answer against both test files in a container
# ---------------------------------------------------------------------------

def validate_generated(generated: dict) -> dict:
    """Spin up a temp workdir, run model answer against both test files.

    Returns {ok, visible_ok, visible_output, hidden_ok, hidden_output}.
    """
    work_dir = ATTEMPTS / f"__gen_val_{uuid.uuid4().hex[:8]}"
    work_dir.mkdir(parents=True)

    try:
        (work_dir / "solution.py").write_text(generated["model_answer_py"], encoding="utf-8")

        tests_dir = work_dir / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_visible.py").write_text(generated["test_visible_py"], encoding="utf-8")

        (work_dir / "test_hidden.py").write_text(generated["test_hidden_py"], encoding="utf-8")

        _chmod_r(work_dir)

        image = "judge-py:base"

        visible_out = sandbox.run_in_container(
            work_dir,
            "python3 -m pytest tests/test_visible.py -v --tb=short 2>&1",
            image,
        )
        visible_ok = _pytest_ok(visible_out)

        hidden_out = sandbox.run_in_container(
            work_dir,
            "python3 -m pytest test_hidden.py -v --tb=short 2>&1",
            image,
        )
        hidden_ok = _pytest_ok(hidden_out)

        return {
            "ok": visible_ok and hidden_ok,
            "visible_ok": visible_ok,
            "visible_output": visible_out,
            "hidden_ok": hidden_ok,
            "hidden_output": hidden_out,
        }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _pytest_ok(output: str) -> bool:
    """True if pytest ran and produced at least one passing test with no failures."""
    low = output.lower()
    has_passed = "passed" in low
    has_failed = " failed" in low or "error" in low
    no_tests = "no tests ran" in low or "collected 0 items" in low
    return has_passed and not has_failed and not no_tests


def _chmod_r(path: Path) -> None:
    """Make all files world-readable so the unprivileged container user can access them."""
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
    """Unique filesystem-safe slug derived from title."""
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

    repo = prob / "repo"
    repo.mkdir(exist_ok=True)
    (repo / "solution.py").write_text(files["starter_solution_py"], encoding="utf-8")

    tests = repo / "tests"
    tests.mkdir(exist_ok=True)
    (tests / "test_visible.py").write_text(files["test_visible_py"], encoding="utf-8")

    hidden = prob / "hidden"
    hidden.mkdir(exist_ok=True)
    (hidden / "test_hidden.py").write_text(files["test_hidden_py"], encoding="utf-8")


def build_meta(slug: str, title: str, problem_type: str, difficulty: str,
               skills: list, hidden_cases: list) -> dict:
    return {
        "schema_version": 2,
        "id": slug,
        "title": title,
        "type": problem_type,
        "category": "알고리즘",
        "difficulty": difficulty,
        "skills": skills,
        "submission": {"entry": "repo/solution.py", "runtime": "judge-py:base"},
        "open": {
            "kind": "pytest-visible",
            "cmd": "python3 -m pytest tests/test_visible.py -q --tb=short",
        },
        "hidden": {
            "kind": "pytest-hidden",
            "cases": hidden_cases,
        },
        "scoring": {
            "axes": [
                {"key": "accuracy", "weight": 0.65},
                {"key": "turn_efficiency", "weight": 0.20},
                {"key": "token_efficiency", "weight": 0.15},
            ]
        },
    }
