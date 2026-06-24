# Base image for the disposable judge/exec containers.
# Built once as `judge-py:base`; every run_command spins up `docker run --rm` on top of it.
FROM python:3.12-slim

# Test runner the agent uses for visible tests and the grader uses for hidden tests.
RUN pip install --no-cache-dir pytest==8.3.4

# Work dir is bind-mounted at runtime (-v {workdir}:/work). Nothing is baked in here.
WORKDIR /work

# Containers run as --user nobody at runtime; no entrypoint, command is passed per run.
CMD ["python3"]
