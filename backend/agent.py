"""Agent loop (OpenAI-compatible tool-calling).

One user message = one call to run_agent = one "turn". Inside a turn the model may call
tools many times (read 3 files, write 1, run tests) before producing a final reply.

The model is a server-side constant for everyone (one hosted model, env-configured). The
client is OpenAI-compatible so a local Ollama and a hosted API are a one-line env swap.
"""
import json
import os

from openai import OpenAI

import sandbox

# --- model config (env; OpenAI-compatible so Ollama <-> hosted is a one-liner) ---------
BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")  # Ollama ignores the key
MODEL = os.environ.get("OPENAI_MODEL", "qwen2.5-coder:7b")

SYSTEM_PROMPT = (
    "You are a junior software developer. The user is your tech lead and cannot write "
    "code directly — they only instruct, review and correct you in natural language. "
    "Use the tools to inspect and edit files in the workspace and to run commands/tests. "
    "Always write code via the write_file tool; never just paste code in chat. Verify your "
    "work by running the visible tests before reporting back. Keep replies short."
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List all files in the workspace.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file's contents.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a file with the given content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a shell command in the sandboxed container (e.g. pytest).",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
        },
    },
]

MAX_STEPS = 24  # hard cap on tool round-trips per turn, guards against loops


def get_client() -> OpenAI:
    return OpenAI(base_url=BASE_URL, api_key=API_KEY)


def _tool_chip(name: str, args: dict) -> dict:
    """Compact event the frontend renders as a tool-call chip."""
    if name == "read_file":
        label = f"read_file · {args.get('path', '')}"
    elif name == "write_file":
        label = f"write_file · {args.get('path', '')}"
    elif name == "run_command":
        label = f"run_command · {args.get('command', '')[:40]}"
    else:
        label = name
    return {"type": "tool", "name": name, "label": label}


def run_agent(attempt_id: str, history: list, user_text: str, client: OpenAI = None) -> dict:
    """Run one full turn. Returns {events, history, tokens}.

    `history` is the OpenAI message list (persisted in the attempt row between turns).
    On first call, prepend the system prompt. `client` is injectable for testing.
    """
    client = client or get_client()

    if not history:
        history = [{"role": "system", "content": SYSTEM_PROMPT}]
    history.append({"role": "user", "content": user_text})

    events = []
    tokens = 0

    for _ in range(MAX_STEPS):
        resp = client.chat.completions.create(
            model=MODEL, messages=history, tools=TOOLS,
        )
        if getattr(resp, "usage", None):
            tokens += resp.usage.total_tokens or 0

        msg = resp.choices[0].message
        tool_calls = msg.tool_calls or []

        # Record the assistant message exactly as returned (so tool_calls round-trip).
        history.append(
            {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ]
                or None,
            }
        )
        if msg.content:
            events.append({"role": "agent", "text": msg.content})

        if not tool_calls:
            break  # no tools -> turn is done, return to user

        for tc in tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            events.append(_tool_chip(tc.function.name, args))
            result = sandbox.run_tool(attempt_id, tc.function.name, args)
            history.append(
                {"role": "tool", "tool_call_id": tc.id, "content": result}
            )

    return {"events": events, "history": history, "tokens": tokens}
