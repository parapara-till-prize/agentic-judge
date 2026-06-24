# Base image for SQL problems (queries / ERD design). Built once as `judge-sql:base`.
# Hidden grading runs a python checker (sqlite3 is in the stdlib) that loads the schema,
# executes the agent's solution.sql, and diffs resultsets / asserts schema shape, then
# prints GRADE:{"passed":N,"total":M}. See docs/multi-domain.md.
FROM python:3.12-slim

# sqlite3 CLI for convenience; the python sqlite3 module is already built in.
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
CMD ["python3"]
