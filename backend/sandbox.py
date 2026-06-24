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
DEFAULT_IMAGE = "judge-py:base"  # per-problem image overrides this (meta.runtime.image)

# Per-image resource + timeout envelope. The browser runtime needs a far larger profile
# than the lightweight python/sql ones: chromium wants ~1g RAM, more pids, a writable HOME,
# and several seconds just to launch + render before any assertion runs. `inner` is the
# in-container `timeout` (kills runaway code); `outer` is the subprocess backstop if docker
# itself hangs. Unknown images fall back to DEFAULT_PROFILE.
DEFAULT_PROFILE = {"memory": "512m", "pids": 128, "inner": 5, "outer": 15, "env": {}}
PROFILES = {
    "judge-browser:base": {
        "memory": "1g", "pids": 512, "inner": 25, "outer": 40,
        "env": {"HOME": "/tmp"},  # chromium needs a writable home/cache as `nobody`
    },
}


def run_in_container(workdir: Path, command: str, image: str = DEFAULT_IMAGE) -> str:
    """Run `command` inside a disposable, locked-down container over the workdir.

    `image` is the problem's runtime (judge-py / judge-browser / judge-sql / …). Security
    flags are mandatory: no network, capped memory/pids, unprivileged user. The resource
    + timeout envelope is per-image (see PROFILES) because the browser runtime needs a much
    bigger one. Two timeouts: inner `timeout` kills runaway code; the outer subprocess
    timeout is the backstop if docker itself hangs.
    """
    image = image or DEFAULT_IMAGE
    p = PROFILES.get(image, DEFAULT_PROFILE)
    env_args = []
    for k, v in p.get("env", {}).items():
        env_args += ["-e", f"{k}={v}"]
    try:
        r = subprocess.run(
            [
                "docker", "run", "--rm",
                "--network", "none",
                "--memory", p["memory"],
                "--pids-limit", str(p["pids"]),
                "--user", "nobody",
                *env_args,
                "-v", f"{workdir}:/work",
                "-w", "/work",
                image,
                "timeout", str(p["inner"]), "bash", "-c", command,
            ],
            capture_output=True, text=True, timeout=p["outer"],
        )
        out = r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        out = f"[error] container timed out ({p['outer']}s wall limit)"
    return out[:MAX_OUTPUT]


def run_tool(attempt_id: str, name: str, args: dict, image: str = DEFAULT_IMAGE) -> str:
    """Dispatch one agent tool call. File ops on host, run_command in container."""
    workdir = ATTEMPTS / attempt_id

    if name == "list_files":
        _hidden = {"__pycache__", ".pytest_cache", "harness"}
        return "\n".join(
            str(p.relative_to(workdir))
            for p in sorted(workdir.rglob("*"))
            if p.is_file() and not (_hidden & set(p.relative_to(workdir).parts))
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
        return run_in_container(workdir, args["command"], image)

    return f"[error] unknown tool: {name}"
