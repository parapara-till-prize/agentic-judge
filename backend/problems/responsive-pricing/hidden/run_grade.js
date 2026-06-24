// Hidden grader for the responsive-pricing problem. Overlaid into the grading copy at
// /work/hidden/, run as `node hidden/run_grade.js` against the agent's /work/index.html.
// Launches headless chromium, loads the page at desktop + mobile viewports, and runs 5
// assertions across layout / responsiveness / visual distinction / accessibility, then
// prints GRADE:{"passed_ids":[...]} — the host maps ids to meta.json weights. Case names
// (layout_row, equal_width, ...) must match meta.json hidden.cases ids.
const { chromium } = require('playwright-core')
const axe = require('axe-core')

const CARD = '[data-testid="plan-card"]'
const URL = 'file:///work/index.html'

const boxes = (page) =>
  page.$$eval(CARD, (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, left: r.left, width: r.width }
    }),
  )

async function main() {
  const results = []
  const check = async (name, fn) => {
    try {
      results.push([name, !!(await fn())])
    } catch {
      results.push([name, false])
    }
  }

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()

  // --- desktop (1280px) ---
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(URL, { waitUntil: 'load' })
  const desk = await boxes(page)

  // 1) three cards in a single row: tops aligned, lefts strictly increasing
  await check('layout_row', () => {
    if (desk.length !== 3) return false
    const tops = desk.map((c) => c.top)
    const sameTop = Math.max(...tops) - Math.min(...tops) <= 2
    const s = [...desk].sort((a, b) => a.left - b.left)
    return sameTop && s[0].left < s[1].left && s[1].left < s[2].left
  })

  // 2) cards share approximately equal widths
  await check('equal_width', () => {
    if (desk.length !== 3) return false
    const w = desk.map((c) => c.width)
    return Math.max(...w) - Math.min(...w) <= 4
  })

  // 3) featured card visually distinguished from a non-featured sibling
  await check('featured_distinct', () =>
    page.$$eval(CARD, (els) => {
      const cs = (el) => getComputedStyle(el)
      const feat = els.find((e) => e.hasAttribute('data-featured'))
      const other = els.find((e) => !e.hasAttribute('data-featured'))
      if (!feat || !other) return false
      const f = cs(feat)
      const o = cs(other)
      return (
        f.backgroundColor !== o.backgroundColor ||
        f.borderTopWidth !== o.borderTopWidth ||
        f.borderTopColor !== o.borderTopColor ||
        f.boxShadow !== o.boxShadow ||
        f.transform !== o.transform
      )
    }),
  )

  // --- mobile (375px) ---
  await page.setViewportSize({ width: 375, height: 900 })
  const mob = await boxes(page)

  // 4) cards stack vertically: tops strictly increase
  await check('responsive_stack', () => {
    if (mob.length !== 3) return false
    const s = [...mob].sort((a, b) => a.top - b.top)
    return s[0].top < s[1].top && s[1].top < s[2].top
  })

  // 5) accessibility: no serious/critical axe violations AND every button has a name
  await check('accessibility', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.evaluate(axe.source)
    const bad = await page.evaluate(async () => {
      const r = await axe.run(document, { resultTypes: ['violations'] })
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').length
    })
    const namedButtons = await page.$$eval(
      'button',
      (btns) =>
        btns.length > 0 &&
        btns.every((b) => (b.textContent || '').trim().length > 0 || !!b.getAttribute('aria-label')),
    )
    return bad === 0 && namedButtons
  })

  await browser.close()
  const passedIds = results.filter(([, ok]) => ok).map(([name]) => name)
  console.log('GRADE:' + JSON.stringify({ passed_ids: passedIds }))
}

main().catch((e) => {
  console.error(e)
  console.log('GRADE:' + JSON.stringify({ passed_ids: [] }))
})
