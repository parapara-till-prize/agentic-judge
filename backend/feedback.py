"""AI code feedback: fill the feedback prompt and call the SAME hosted model the agent uses.

Submit grades the attempt against its hidden suite; this turns "which hidden cases failed" +
the problem + the user's code into a holistic evaluation plus one no-spoiler hint per failed
case. It reuses agent.get_client()/agent.MODEL (one env-configured OpenAI-compatible endpoint)
— only the prompt differs from the agent loop, and no tools are offered. Returns
{"overall": str, "feedbacks": [{"test": str, "hint": str}, ...]}.
"""
import json
import re
from pathlib import Path

import agent

PROMPT = (Path(__file__).parent / "prompts" / "feedback.md").read_text()

# Tolerant field extractors for when the model's JSON is *almost* valid (a stray unescaped
# quote, a trailing comma, extra prose) and json.loads rejects the whole blob. Each captures
# a JSON string body: any escaped char (\\.) or any char that isn't a quote/backslash.
_STR = r'"((?:\\.|[^"\\])*)"'
_OVERALL_RE = re.compile(r'"overall"\s*:\s*' + _STR)
_PAIR_RE = re.compile(r'"test"\s*:\s*' + _STR + r'\s*,\s*"hint"\s*:\s*' + _STR)


def _build_prompt(problem: str, code: str, failed_tests: list) -> str:
    """Fill the template's four placeholders.

    The template escapes its JSON example braces as `{{`/`}}` for readability; we normalize
    those to single braces FIRST, then substitute via plain str.replace (NOT str.format) so
    user code containing `{` / `}` can never be mistaken for a format field.
    """
    failed = [str(t) for t in (failed_tests or [])]
    listing = "\n".join(f"- {t}" for t in failed) if failed else "(없음)"
    prompt = PROMPT.replace("{{", "{").replace("}}", "}")
    prompt = prompt.replace("{problem}", problem or "(문제 설명 없음)")
    prompt = prompt.replace("{code}", code or "(코드 없음)")
    prompt = prompt.replace("{failed_count}", str(len(failed)))
    prompt = prompt.replace("{failed_tests_list}", listing)
    return prompt


def _unescape(s: str) -> str:
    """Turn a captured JSON string body back into text (\\n, \\", \\uXXXX). Falls back to the
    raw capture if it isn't cleanly decodable."""
    try:
        return json.loads(f'"{s}"')
    except (json.JSONDecodeError, ValueError):
        return s


def _parse(content: str) -> dict:
    """Pull {overall, feedbacks:[{test,hint}]} out of the reply, three escalating ways.

    1. Clean: the first balanced {...} that json.loads-es and carries "overall" — handles
       fenced or preamble-wrapped JSON (the balanced scan skips ``` and stray prose).
    2. Tolerant: if no blob parses (a stray unescaped quote / trailing comma breaks
       json.loads), regex the `overall` line and every `test`/`hint` pair straight out of the
       text, so we STILL render a one-liner + per-test hints instead of dumping raw JSON.
    3. Last resort: surface the raw text as `overall` so the panel is never blank.
    """
    content = (content or "").strip()

    # 1) clean parse
    for start, end in agent._balanced_json_spans(content):
        try:
            obj = json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(obj, dict) and "overall" in obj:
            feedbacks = [
                {"test": str(f.get("test", "")), "hint": str(f.get("hint", ""))}
                for f in (obj.get("feedbacks") or [])
                if isinstance(f, dict)
            ]
            return {"overall": str(obj.get("overall", "")).strip(), "feedbacks": feedbacks}

    # 2) tolerant field extraction from near-JSON
    om = _OVERALL_RE.search(content)
    pairs = _PAIR_RE.findall(content)
    if om or pairs:
        overall = _unescape(om.group(1)).strip() if om else ""
        feedbacks = [{"test": _unescape(t), "hint": _unescape(h)} for t, h in pairs]
        return {"overall": overall, "feedbacks": feedbacks}

    # 3) nothing structured recoverable
    fallback = " ".join(content.split())[:300]
    return {"overall": fallback or "피드백을 생성하지 못했어요.", "feedbacks": []}


def generate_feedback(problem: str, code: str, failed_tests: list, client=None) -> dict:
    """One synchronous LLM call -> {overall, feedbacks}. `client` is injectable for tests.

    LLM/transport errors are turned into a friendly {overall, feedbacks: []} (still HTTP 200)
    rather than bubbling up to a 500: an unhandled 500 reaches the browser as an opaque
    "Failed to fetch" (Starlette drops CORS headers on exception responses), so the panel
    could never explain what went wrong. Returning the reason lets the UI show + offer retry.
    """
    client = client or agent.get_client()
    prompt = _build_prompt(problem, code, failed_tests)
    try:
        resp = client.chat.completions.create(
            model=agent.MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:  # noqa: BLE001 — any LLM/transport failure -> readable message
        return {"overall": f"AI 피드백 생성에 실패했어요. (모델 호출 오류: {str(e)[:160]})", "feedbacks": []}
    return _parse(resp.choices[0].message.content)
