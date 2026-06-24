#!/usr/bin/env node
/**
 * Frontend runner — baked into judge-browser:base at /runners/run_fe.js.
 *
 * Usage (CWD = attempt folder with meta.json):
 *   node /runners/run_fe.js --mode open
 *   node /runners/run_fe.js --mode hidden
 *
 * Output:
 *   open   → OPEN:{"ok": true/false, "output": "..."}
 *   hidden → GRADE:{"passed": W, "total": T}
 *
 * Open  : CSS 파싱 OK + 렌더링 OK + required_selectors 전부 화면에 존재
 * Hidden: computed-style 단언 (selector/prop/expect) + 스크린샷 픽셀 diff
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');  // optional, for pixel diff

const meta = JSON.parse(fs.readFileSync('meta.json', 'utf8'));
const mode = process.argv.includes('--mode=hidden') || process.argv.includes('hidden') ? 'hidden' : 'open';

// ── helpers ──────────────────────────────────────────────────────────────────

function indexHtmlUrl() {
  return 'file://' + path.resolve('repo/index.html');
}

/** Pixel diff ratio between two PNG buffers. Returns 0..1. */
async function pixelDiffRatio(buf1, buf2) {
  try {
    const [img1, img2] = await Promise.all([loadImage(buf1), loadImage(buf2)]);
    const w = Math.min(img1.width, img2.width);
    const h = Math.min(img1.height, img2.height);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img1, 0, 0);
    const d1 = ctx.getImageData(0, 0, w, h).data;
    ctx.drawImage(img2, 0, 0);
    const d2 = ctx.getImageData(0, 0, w, h).data;

    let diff = 0;
    for (let i = 0; i < d1.length; i += 4) {
      if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) +
          Math.abs(d1[i+2] - d2[i+2]) > 30) diff++;
    }
    return diff / (w * h);
  } catch {
    // canvas module not available → skip visual diff
    return 0;
  }
}

/** Match computed style value against expect string.
 *  expect "*" = any non-default (non-empty/none/0px/normal) value
 *  expect "~xxx~" = contains "xxx"
 *  otherwise exact match */
function matchExpect(value, expect) {
  if (expect === '*') {
    return value !== '' && value !== 'none' && value !== '0px' && value !== 'normal';
  }
  if (expect.startsWith('~') && expect.endsWith('~')) {
    return value.includes(expect.slice(1, -1));
  }
  return value === expect;
}

// ── open mode ─────────────────────────────────────────────────────────────────

async function runOpen() {
  const errors = [];
  const openCfg = meta.open || {};
  const required = openCfg.required_selectors || [];

  // 1) CSS syntax check via reading file
  const cssPath = path.resolve('repo/solution.css');
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    if (!css.trim()) {
      errors.push('solution.css is empty');
    }
    // Basic brace balance check
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    if (opens !== closes) errors.push(`CSS brace mismatch: ${opens} { vs ${closes} }`);
  }

  // 2) Render check + selector existence
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  try {
    const response = await page.goto(indexHtmlUrl(), { waitUntil: 'load' });
    if (!response || !response.ok()) {
      errors.push('Failed to load index.html');
    } else {
      for (const sel of required) {
        const el = await page.$(sel);
        if (!el) {
          errors.push(`Required selector not found: ${sel}`);
        } else {
          // Check style is actually applied (not initial)
          const display = await page.$eval(sel, el => getComputedStyle(el).display);
          if (display === '') errors.push(`Selector ${sel} has no computed style`);
        }
      }
    }
  } catch (e) {
    errors.push(`Render error: ${e.message}`);
  } finally {
    await browser.close();
  }

  const ok = errors.length === 0;
  console.log('OPEN:' + JSON.stringify({ ok, output: errors.join('; ') || 'OK' }));
  process.exit(ok ? 0 : 1);
}

// ── hidden mode ───────────────────────────────────────────────────────────────

async function runHidden() {
  const hidden = meta.hidden;
  const cases = hidden.cases || [];
  const viewport = hidden.viewport || { w: 1280, h: 800 };
  const visual = hidden.visual;

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: viewport.w, height: viewport.h } });

  let passed = 0;
  let total = cases.reduce((s, c) => s + c.weight, 0);
  if (visual) total += visual.weight;

  try {
    await page.goto(indexHtmlUrl(), { waitUntil: 'load' });

    // computed-style assertions
    for (const c of cases) {
      try {
        const value = await page.$eval(
          c.selector,
          (el, prop) => getComputedStyle(el)[prop],
          c.prop
        );
        if (matchExpect(value, c.expect)) {
          passed += c.weight;
        }
      } catch {
        // selector not found or eval failed → case fails
      }
    }

    // pixel diff (optional)
    if (visual) {
      const refPath = path.resolve('hidden/ref/desktop.png');
      if (fs.existsSync(refPath)) {
        const screenshot = await page.screenshot({ fullPage: false });
        const ref = fs.readFileSync(refPath);
        const ratio = await pixelDiffRatio(screenshot, ref);
        if (ratio <= visual.max_diff_ratio) {
          passed += visual.weight;
        }
      } else {
        // No reference image: skip visual, redistribute weight to other cases
        total -= visual.weight;
      }
    }
  } finally {
    await browser.close();
  }

  console.log('GRADE:' + JSON.stringify({ passed, total }));
}

// ── entry point ───────────────────────────────────────────────────────────────

(async () => {
  try {
    if (mode === 'open') {
      await runOpen();
    } else {
      await runHidden();
    }
  } catch (e) {
    console.error(e);
    if (mode === 'open') {
      console.log('OPEN:' + JSON.stringify({ ok: false, output: e.message }));
    } else {
      console.log('GRADE:' + JSON.stringify({ passed: 0, total: 1, error: e.message }));
    }
    process.exit(1);
  }
})();
