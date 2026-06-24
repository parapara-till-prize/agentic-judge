# Base image for frontend problems (HTML/CSS/JS). Built once as `judge-browser:base`.
# Grades with a REAL headless browser (assertions on rendered layout/computed-style/
# interaction/a11y), not jsdom (no layout engine) and not pixel-diff (flaky).
# Hidden grading runs `node hidden/run_grade.js` which prints GRADE:{"passed":N,"total":M}.
# See docs/multi-domain.md.
#
# The official Playwright image bundles node + chromium binaries + OS deps, but NOT the
# playwright npm API — graders `require('playwright-core')`, so we install it globally
# (browsers are already at /ms-playwright; PLAYWRIGHT_BROWSERS_PATH is set in the image).
# axe-core is installed too for accessibility assertions. At run time the container is
# --network none and --user nobody, so launch chromium with --no-sandbox + a /tmp HOME and
# expect a relaxed resource profile (≈1g memory) — run_in_container limits are per-image.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

RUN npm install -g playwright-core@1.49.0 axe-core@4.10
ENV NODE_PATH=/usr/lib/node_modules

WORKDIR /work
CMD ["node"]
