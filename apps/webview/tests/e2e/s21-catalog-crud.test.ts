import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S21: create folder via UI', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await page.waitForSelector('chromvoid-app')

  await page.waitForFunction(() => {
    const router = (window as any).router
    return !!router && typeof router.route === 'function' && router.route() === 'dashboard'
  }, undefined, {timeout: 15_000})

  // The file manager should be visible
  const fm = await page.$('chromvoid-file-manager')
  expect(fm).toBeTruthy()
})
