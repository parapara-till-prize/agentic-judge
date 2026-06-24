"""Tool dispatch + disposable container execution.

File ops (list/read/write) run on the HOST against the attempt workdir — no container.
Only run_command spins up a one-shot `docker run --rm` container that bind-mounts the
workdir, so file changes land directly on the host (no docker cp needed) and the container
self-destructs when the command finishes.

The workdir is the source of truth; the container is a throwaway executor.
"""
import subprocess
from pathlib import Path

BASE = Path(__file__).parent
ATTEMPTS = BASE / "attempts"

MAX_OUTPUT = 8000  # truncate tool output so giant logs can't blow up the LLM context
IMAGE = "judge-py:base"


def run_in_container(workdir: Path, command: str) -> str:
    """Run `command` inside a disposable, locked-down container over the workdir.

    Security flags are mandatory: no network, capped memory/pids, unprivileged user.
    Two timeouts: inner `timeout 5` kills runaway code; outer subprocess timeout=15 is the
    backstop if docker itself hangs.
    """
    try:
        r = subprocess.run(
            [
                "docker", "run", "--rm",
                "--network", "none",
                "--memory", "512m",
                "--pids-limit", "128",
                "--user", "nobody",
                "-v", f"{workdir}:/work",
                "-w", "/work",
                IMAGE,
                "timeout", "5", "bash", "-c", command,
            ],
            capture_output=True, text=True, timeout=15,
        )
        out = r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        out = "[error] container timed out (15s wall limit)"
    return out[:MAX_OUTPUT]


def run_tool(attempt_id: str, name: str, args: dict) -> str:
    """Dispatch one agent tool call. File ops on host, run_command in container."""
    workdir = ATTEMPTS / attempt_id

    if name == "list_files":
        return "\n".join(
            str(p.relative_to(workdir))
            for p in sorted(workdir.rglob("*"))
            if p.is_file()
        )

    if name == "read_file":
        p = workdir / args["path"]
        return p.read_text()[:MAX_OUTPUT]

    if name == "write_file":
        p = workdir / args["path"]
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(args["content"])
        return f"wrote {args['path']}"

    if name == "run_command":
        return run_in_container(workdir, args["command"])

    return f"[error] unknown tool: {name}"
