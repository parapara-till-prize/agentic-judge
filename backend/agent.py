"""Agent loop (OpenAI-compatible tool-calling).

One user message = one call to run_agent = one "turn". Inside a turn the model may call
tools many times (read 3 files, write 1, run tests) before producing a final reply.

The model is a server-side constant for everyone (one hosted model, env-configured). The
client is OpenAI-compatible so a local Ollama and a hosted API are a one-line env swap.
"""
import json
import os
import uuid
from pathlib import Path

from openai import OpenAI

import sandbox

# --- prompts & tool schemas (data, not code; edit the files under prompts/) ------------
PROMPTS = Path(__file__).parent / "prompts"
SYSTEM_PROMPT = (PROMPTS / "system.md").read_text(encoding="utf-8").strip()
TEST_INSTRUCTIONS = (PROMPTS / "test_instructions.md").read_text(encoding="utf-8").strip()
TOOLS = json.loads((PROMPTS / "tools.json").read_text(encoding="utf-8"))
TOOL_NAMES = {t["function"]["name"] for t in TOOLS}

# --- model config (env; OpenAI-compatible so Ollama <-> hosted is a one-liner) ---------
BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")  # Ollama ignores the key
MODEL = os.environ.get("OPENAI_MODEL", "qwen2.5-coder:7b")

MAX_STEPS = 24  # hard cap on tool round-trips per turn, guards against loops


def get_client() -> OpenAI:
    return OpenAI(base_url=BASE_URL, api_key=API_KEY)


def _balanced_json_spans(text: str):
    """Yield (start, end) spans of top-level {...} blocks in text."""
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth > 0:
            depth -= 1
            if depth == 0 and start is not None:
                yield start, i + 1
                start = None


def extract_text_tool_calls(content: str):
    """Recover tool calls a weak model emitted as TEXT instead of structured tool_calls.

    Small models (esp. after a few tool round-trips) drift and print
    `{"name": "run_command", "arguments": {...}}` as plain content. We scan for those
    JSON blocks naming one of our tools and turn them into real calls, returning
    (calls, cleaned_text) where cleaned_text has those blocks (and code fences) removed.
    """
    if not content or "{" not in content:
        return [], content or ""

    calls = []
    spans = []
    for s, e in _balanced_json_spans(content):
        try:
            obj = json.loads(content[s:e])
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(obj, dict) and obj.get("name") in TOOL_NAMES:
            args = obj.get("arguments")
            calls.append((obj["name"], args if isinstance(args, dict) else {}))
            spans.append((s, e))

    if not calls:
        return [], content

    cleaned = []
    last = 0
    for s, e in spans:
        cleaned.append(content[last:s])
        last = e
    cleaned.append(content[last:])
    text = "".join(cleaned)
    # drop now-empty code fences left behind
    text = text.replace("```json", "").replace("```", "").strip()
    return calls, text


def _tool_label(name: str, args: dict) -> str:
    """Compact label the frontend renders on a tool-call chip."""
    if name == "read_file":
        return f"read_file · {args.get('path', '')}"
    if name == "write_file":
        return f"write_file · {args.get('path', '')}"
    if name == "run_command":
        return f"run_command · {args.get('command', '')[:40]}"
    return name


def _system_prompt(test_cmd: str = None) -> str:
    """Base prompt + the problem's visible-test command so the agent doesn't guess it."""
    if test_cmd:
        return SYSTEM_PROMPT + "\n\n" + TEST_INSTRUCTIONS.format(test_cmd=test_cmd)
    return SYSTEM_PROMPT


def stream_turn(
    attempt_id: str,
    history: list,
    user_text: str,
    client: OpenAI = None,
    image: str = sandbox.DEFAULT_IMAGE,
    test_cmd: str = None,
):
    """Run one full turn as a generator, yielding events as they happen.

    Event types (dicts):
      {"type":"agent","text":...}                          assistant message text
      {"type":"tool_call","name":...,"label":...}          a tool is about to run
      {"type":"tool_result","name":"run_command",
        "command":...,"output":...}                        run_command stdout/stderr
      {"type":"file_written","path":...}                   write_file landed on disk
      {"type":"done","tokens":N,"history":[...]}           terminal: turn finished

    `history` is the persisted OpenAI message list; a fresh local copy is built so the
    terminal event can hand the updated list back to the caller. `client` is injectable.
    """
    client = client or get_client()

    messages = (
        list(history) if history else [{"role": "system", "content": _system_prompt(test_cmd)}]
    )
    messages.append({"role": "user", "content": user_text})

    tokens = 0
    for _ in range(MAX_STEPS):
        resp = client.chat.completions.create(model=MODEL, messages=messages, tools=TOOLS)
        if getattr(resp, "usage", None):
            tokens += resp.usage.total_tokens or 0

        msg = resp.choices[0].message

        # Normalize calls to [(id, name, args_dict)] from native tool_calls, or — if the
        # model degraded to text — recover them from the content.
        calls = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                calls.append((tc.id, tc.function.name, args))
            display_text = msg.content or ""
        else:
            recovered, display_text = extract_text_tool_calls(msg.content or "")
            calls = [(f"call_{uuid.uuid4().hex[:8]}", name, args) for name, args in recovered]

        # Record the assistant message (clean content + structured tool_calls) so the
        # history stays well-formed and the model keeps seeing proper tool-calling shape.
        messages.append(
            {
                "role": "assistant",
                "content": display_text,
                "tool_calls": [
                    {
                        "id": cid,
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(args)},
                    }
                    for cid, name, args in calls
                ]
                or None,
            }
        )
        if display_text.strip():
            yield {"type": "agent", "text": display_text}

        if not calls:
            break  # no tools -> turn is done

        for cid, name, args in calls:
            yield {"type": "tool_call", "name": name, "label": _tool_label(name, args)}

            result = sandbox.run_tool(attempt_id, name, args, image)
            messages.append({"role": "tool", "tool_call_id": cid, "content": result})

            if name == "run_command":
                yield {
                    "type": "tool_result",
                    "name": name,
                    "command": args.get("command", ""),
                    "output": result,
                }
            elif name == "write_file" and args.get("path"):
                yield {"type": "file_written", "path": args["path"]}

    yield {"type": "done", "tokens": tokens, "history": messages}


def run_agent(
    attempt_id: str,
    history: list,
    user_text: str,
    client: OpenAI = None,
    image: str = sandbox.DEFAULT_IMAGE,
    test_cmd: str = None,
) -> dict:
    """Non-streaming wrapper: drains stream_turn into {events, history, tokens}.

    Kept for tests and any non-SSE caller. Folds the rich stream into the compact
    chip/text event list the older consumers expect.
    """
    events = []
    final = None
    for ev in stream_turn(attempt_id, history, user_text, client, image, test_cmd):
        if ev["type"] == "done":
            final = ev
        elif ev["type"] == "agent":
            events.append({"role": "agent", "text": ev["text"]})
        elif ev["type"] == "tool_call":
            events.append({"type": "tool", "name": ev["name"], "label": ev["label"]})
    return {"events": events, "history": final["history"], "tokens": final["tokens"]}
