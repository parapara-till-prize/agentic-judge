// Visible example test for the responsive-pricing problem. Launches headless chromium,
// loads the page, and checks only the basic DOM contract (3 cards, each with a heading and
// a non-empty button). Structure only — no layout/responsive/a11y assertions; those are in
// the hidden grader. Exit 0 iff all checks pass. (network none + nobody -> --no-sandbox.)
const { chromium } = require('playwright-core')

const CARD = '[data-testid="plan-card"]'

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('file:///work/index.html', { waitUntil: 'load' })

  const cards = await page.$$(CARD)
  const headings = await page.$$eval(CARD, (els) => els.map((e) => !!e.querySelector('h1,h2,h3')))
  const buttons = await page.$$eval(CARD, (els) =>
    els.map((e) => {
      const b = e.querySelector('button')
      return !!b && (b.textContent || '').trim().length > 0
    }),
  )
  await browser.close()

  const checks = [
    ['카드 3개 존재', cards.length === 3],
    ['각 카드에 제목(h1~h3)', headings.length === 3 && headings.every(Boolean)],
    ['각 카드에 텍스트 버튼', buttons.length === 3 && buttons.every(Boolean)],
  ]
  let ok = 0
  for (const [name, pass] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`)
    if (pass) ok++
  }
  console.log(`\n${ok}/${checks.length} passed`)
  process.exit(ok === checks.length ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
