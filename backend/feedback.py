"""AI code feedback: fill the feedback prompt and call the SAME hosted model the agent uses.

Submit grades the attempt against its hidden suite; this turns "which hidden cases failed" +
the problem + the user's code into a holistic evaluation plus one no-spoiler hint per failed
case. It reuses agent.get_client()/agent.MODEL (one env-configured OpenAI-compatible endpoint)
— only the prompt differs from the agent loop, and no tools are offered. Returns
{"overall": str, "feedbacks": [{"test": str, "hint": str}, ...]}.
"""
import json
from pathlib import Path

import agent

PROMPT = (Path(__file__).parent / "prompts" / "feedback.md").read_text()


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


def _parse(content: str) -> dict:
    """Pull the {overall, feedbacks} object out of the reply, tolerating fences / stray prose.

    Small models often wrap JSON in ``` fences or add a preamble; we scan for the first
    balanced {...} that parses and carries an "overall" key. On total failure we surface the
    raw text as `overall` so the user still sees something instead of a blank panel.
    """
    content = content or ""
    for start, end in agent._balanced_json_spans(content):
        try:
            obj = json.loads(content[start:end])
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(obj, dict) and "overall" in obj:
            feedbacks = []
            for f in obj.get("feedbacks") or []:
                if isinstance(f, dict):
                    feedbacks.append(
                        {"test": str(f.get("test", "")), "hint": str(f.get("hint", ""))}
                    )
            return {"overall": str(obj.get("overall", "")).strip(), "feedbacks": feedbacks}

    fallback = " ".join(content.split())[:300]
    return {"overall": fallback or "피드백을 생성하지 못했어요.", "feedbacks": []}


def generate_feedback(problem: str, code: str, failed_tests: list, client=None) -> dict:
    """One synchronous LLM call -> {overall, feedbacks}. `client` is injectable for tests."""
    client = client or agent.get_client()
    prompt = _build_prompt(problem, code, failed_tests)
    resp = client.chat.completions.create(
        model=agent.MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse(resp.choices[0].message.content)
