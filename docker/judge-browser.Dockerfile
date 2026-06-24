# Base image for frontend problems (HTML/CSS/JS). Built once as `judge-browser:base`.
# Grades with a REAL headless browser (assertions on rendered layout/computed-style/
# interaction/a11y), not jsdom (no layout engine) and not pixel-diff (flaky).
# Hidden grading runs `node hidden/run_grade.js` which prints GRADE:{"passed":N,"total":M}.
# See docs/multi-domain.md.
#
# The official Playwright image bundles node + chromium + deps. At run time the container
# is --network none and --user nobody, so launch chromium with --no-sandbox and expect a
# relaxed resource profile (≈1g memory) — run_in_container limits should be per-image.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# axe-core available for accessibility assertions (installed offline-usable, global).
RUN npm install -g axe-core@4.10
ENV NODE_PATH=/usr/lib/node_modules

WORKDIR /work
CMD ["node"]
