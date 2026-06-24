// Hidden grader for the sticky-navbar problem. Overlaid into the grading copy at
// /work/hidden/, run as `node hidden/run_grade.js` against the agent's /work/index.html.
const { chromium } = require('playwright-core')
const axe = require('axe-core')

const NAV = 'nav'
const LINKS = 'nav a'
const HAMBURGER = 'button[data-testid="hamburger"]'
const TOTAL = 4
const URL = 'file:///work/index.html'

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

  // 1) desktop layout: links are visible and arranged horizontally, hamburger is hidden
  await check('desktop_layout', async () => {
    const hamburgerVisible = await page.isVisible(HAMBURGER)
    if (hamburgerVisible) return false

    const links = await page.$$(LINKS)
    if (links.length < 3) return false

    const boxes = []
    for (const link of links) {
      const isVisible = await link.isVisible()
      if (!isVisible) return false
      const box = await link.boundingBox()
      if (box) boxes.push(box)
    }

    if (boxes.length < 3) return false
    
    // Check horizontal arrangement: tops are roughly the same, lefts strictly increasing
    const tops = boxes.map(b => b.y)
    const sameTop = Math.max(...tops) - Math.min(...tops) <= 10 // allow some minor vertical misalignment
    const sorted = [...boxes].sort((a, b) => a.x - b.x)
    const isHorizontal = sorted[0].x < sorted[1].x && sorted[1].x < sorted[2].x
    
    return sameTop && isHorizontal
  })

  // 2) sticky header: nav stays at top when scrolled
  await check('sticky_header', async () => {
    const navBoxBefore = await page.evaluate(() => {
      const el = document.querySelector('nav')
      return el ? el.getBoundingClientRect() : null
    })
    
    if (!navBoxBefore) return false

    await page.evaluate(() => window.scrollBy(0, 1000))
    await page.waitForTimeout(100) // wait for potential scroll effects
    
    const navBoxAfter = await page.evaluate(() => {
      const el = document.querySelector('nav')
      return el ? el.getBoundingClientRect() : null
    })

    // If position is sticky/fixed, getBoundingClientRect().top should remain close to 0 relative to viewport
    return navBoxAfter && navBoxAfter.top <= 5 && navBoxBefore.top <= 5
  })

  // --- mobile (375px) ---
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto(URL, { waitUntil: 'load' })

  // 3) hamburger toggle: mobile view hides links by default, shows them on click
  await check('hamburger_toggle', async () => {
    const hamburgerVisible = await page.isVisible(HAMBURGER)
    if (!hamburgerVisible) return false

    const areLinksHidden = await page.evaluate(() => {
      const links = document.querySelectorAll('nav a')
      if (links.length === 0) return true
      return Array.from(links).every(link => {
        const style = window.getComputedStyle(link)
        // Hidden usually means display: none, opacity: 0, visibility: hidden, or zero height
        return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || link.offsetHeight === 0
      })
    })

    if (!areLinksHidden) return false

    // Click hamburger
    await page.click(HAMBURGER)
    await page.waitForTimeout(300) // Wait for transition/animation

    const areLinksVisible = await page.evaluate(() => {
      const links = document.querySelectorAll('nav a')
      if (links.length === 0) return false
      return Array.from(links).some(link => {
        const style = window.getComputedStyle(link)
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && link.offsetHeight > 0
      })
    })

    return areLinksVisible
  })

  // 4) accessibility: axe core, nav landmark, aria-expanded
  await check('accessibility', async () => {
    // Inject and run axe
    await page.evaluate(axe.source)
    const bad = await page.evaluate(async () => {
      const r = await axe.run(document, { resultTypes: ['violations'] })
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').length
    })

    // Check aria-expanded attribute presence and valid value
    const hasAriaExpanded = await page.evaluate(() => {
      const btn = document.querySelector('button[data-testid="hamburger"]')
      if (!btn) return false
      const val = btn.getAttribute('aria-expanded')
      return val === 'true' || val === 'false'
    })

    return bad === 0 && hasAriaExpanded
  })

  await browser.close()
  const passed = results.filter(([, ok]) => ok).length
  console.log('GRADE:' + JSON.stringify({ passed, total: TOTAL }))
}

main().catch((e) => {
  console.error(e)
  console.log('GRADE:' + JSON.stringify({ passed: 0, total: TOTAL }))
})
