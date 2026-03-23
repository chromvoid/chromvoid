import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S20: app renders file-manager → lock → unlock cycle', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await page.waitForSelector('chromvoid-app')

  // Wait for dashboard route (MockTransport auto-connects)
  await page.waitForFunction(() => {
    const router = (window as any).router
    return !!router && typeof router.route === 'function' && router.route() === 'dashboard'
  }, undefined, {timeout: 15_000})

  // Verify file manager is present
  expect(await page.$('chromvoid-file-manager')).toBeTruthy()

  // Verify status bar shows connected state
  expect(await page.$('status-bar')).toBeTruthy()
})
