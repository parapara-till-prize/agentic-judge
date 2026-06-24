// Visible example test for the sticky-navbar problem. Launches headless chromium,
// loads the page, and checks only the basic DOM contract (nav exists, at least 3 links,
// hamburger button exists). Structure only — no layout/responsive/a11y assertions; 
// those are in the hidden grader. Exit 0 iff all checks pass.
const { chromium } = require('playwright-core')

const NAV = 'nav'
const LINKS = 'nav a'
const HAMBURGER = 'button[data-testid="hamburger"]'

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('file:///work/index.html', { waitUntil: 'load' })

  const navs = await page.$$(NAV)
  const links = await page.$$(LINKS)
  const hamburger = await page.$(HAMBURGER)
  
  await browser.close()

  const checks = [
    ['<nav> 엘리먼트 존재', navs.length >= 1],
    ['네비게이션 링크 3개 이상 존재', links.length >= 3],
    ['햄버거 버튼 존재 (data-testid="hamburger")', !!hamburger],
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
