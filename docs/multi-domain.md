# Multi-domain architecture (Python · Frontend · SQL · …)

The platform is not Python-only. Problems span domains — algorithm/backend (Python),
frontend (HTML/CSS/JS), SQL (queries / ERD design) — and each needs a different runtime
and a different way to run + grade tests. The core engine must stay **domain-agnostic**;
all domain specifics live **per-problem**.

## Principle

> The engine knows how to: copy a repo, let the agent read/write files, run a command in a
> container, and inject hidden artifacts into a throwaway grading copy.
> It does **not** know what "a test" is. Each problem declares its runtime + commands.

`sandbox.py` (run_command) and `agent.py` (the tool loop) are already language-agnostic —
they just run whatever command the agent issues, in some container image. The only
Python/pytest coupling to remove is: (1) a fixed base image, (2) the grader assuming
pytest, (3) the agent guessing the test command (the `conftest.py` hack patched this for
pytest only).

## Per-problem contract — `meta.json` `runtime` block

```jsonc
{
  "id": 1024, "title": "...", "domain": "algorithm",
  "runtime": {
    "image": "judge-py:base",                       // container image for run_command + grading
    "test_cmd": "python3 -m pytest tests -q",        // VISIBLE tests; told to the agent
    "grade_cmd": "python3 hidden/run_grade.py"        // HIDDEN grading; prints the GRADE marker
  }
}
```

- **image** — which prebuilt base the disposable container uses. Default `judge-py:base`.
- **test_cmd** — surfaced to the agent (system prompt) so it runs visible tests the right
  way instead of guessing (this replaces the `conftest.py` workaround).
- **grade_cmd** — run inside the grading copy; must print the result marker (below).

## Grade result protocol (domain-agnostic)

Every domain's `grade_cmd` prints exactly one line:

```
GRADE:{"passed": <int>, "total": <int>}
```

The host (`grade.py`) only: builds the grading copy → overlays `hidden/` → runs
`grade_cmd` in `runtime.image` → parses the `GRADE:` marker. It never parses pytest text
or counts tests itself. Each domain owns how passed/total are computed.

## Grading copy assembly

```
grade_dir = copy(attempt workdir, excluding visible tests)   # source of truth, minus visible tests
overlay(grade_dir, problems/<slug>/hidden/**)                # hidden artifacts land at their paths
run grade_cmd in runtime.image  ->  GRADE:{passed,total}
rm -rf grade_dir
```

`hidden/` mirrors the layout it should occupy in the grading copy and contains **whatever
that domain needs**: the hidden tests AND the runner/checker that prints the marker.
Hidden artifacts are never in the attempt workdir → the agent can't see or game them.

## Base images (prebuilt, one per runtime)

| image | for | contains |
|---|---|---|
| `judge-py:base`      | algorithm/backend | python3 + pytest |
| `judge-browser:base` | frontend          | node + Playwright + chromium (real layout/render) |
| `judge-sql:base`     | SQL               | python3 + sqlite3 (resultset / schema diff) |

> Note: the browser image needs a relaxed resource profile (chromium wants ~1g memory,
> more pids, and `--no-sandbox`) — `run_in_container`'s fixed `--memory 512m`/`--pids-limit`
> should become **per-image** when the browser runtime lands.

Built once (`docker build -t <name> -f docker/<name>.Dockerfile docker/`). `run_command`
and grading both use the problem's `runtime.image`.

## How each domain maps onto the contract

**Python (algorithm/backend)** — `image: judge-py:base`.
`test_cmd: python3 -m pytest tests -q`. `hidden/` holds `test_hidden.py` + a tiny
`run_grade.py` that runs pytest and prints `GRADE:{passed,total}` (total = collected).

**SQL (queries / ERD)** — `image: judge-sql:base`.
Repo starter has `solution.sql` + a `schema.sql`/seed and visible expected output. Agent
writes SQL; `test_cmd` runs it against sqlite and diffs the visible expected resultset.
`hidden/run_grade.py` loads the schema, runs `solution.sql`, compares against hidden
expected resultsets (query problems) or asserts schema shape — tables/columns/keys/types —
for ERD-design problems, then prints the marker.

**Frontend (HTML/CSS/JS)** — `image: judge-browser:base` (Playwright + chromium).
Repo starter has `index.html` + `styles.css` (+ maybe `app.js`). Decision: grade with a
**real headless browser via assertions on rendered properties** — not pixel-diff (flaky).
jsdom is rejected for frontend because it has no layout/render engine (`getComputedStyle`
layout + `getBoundingClientRect` are meaningless), so it can't tell a good solution from a
lazy one — no measurable gap.

`hidden/run_grade.js` launches chromium (`--no-sandbox`), loads the page from the workdir
(`file://`), and runs checks across axes, printing `GRADE:{passed,total}`:
- **layout/responsive** — set viewport (1280 vs 375), assert bounding boxes (cards in a
  row on desktop, stacked on mobile), grid/flex via `getComputedStyle`
- **computed style** — colors, spacing, font-size, etc.
- **interaction** — click/keyboard → DOM state, focus trap, Esc-to-close
- **accessibility** — inject axe-core, assert no violations; roles/labels/contrast
Pixel screenshot diff is optional, secondary only. Scoring axes: 레이아웃/시각 · 반응형 ·
접근성 · 상호작용 · 효율.

## Scoring stays as-is

`scoring.py` is already config-driven (per-problem axes + weights). Domain-specific axes
(visual match, a11y, query-plan efficiency) plug in by adding a branch to `_axis_pct` once
the measuring tool exists — the config format and the frontend breakdown don't change.

## Implementation order

1. **Foundation (this pass):** `runtime` block in meta.json; `image` threaded through
   sandbox → agent → main; `test_cmd` injected into the agent prompt; drop `conftest.py`;
   `judge-node`/`judge-sql` Dockerfile scaffolds; grading runs in the problem's image.
2. **Grader protocol:** move to the `GRADE:{passed,total}` marker emitted by a per-problem
   `hidden/run_grade.py` (Python first), so `grade.py` is fully domain-agnostic.
3. **SQL domain:** `judge-sql:base` + one worked SQL problem end-to-end.
4. **Frontend domain:** build `judge-browser:base` (Playwright+chromium, per-image resource
   profile) + one worked problem with a `hidden/run_grade.js` assertion suite.
