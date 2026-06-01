import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S1: Start → file-manager', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')

  // waiting for a basic render
  await page.waitForSelector('chromvoid-app')

  // With an active backend, we immediately go to dashboard.
  await page.waitForFunction(() => {
    const router = (window as any).router
    return !!router && typeof router.route === 'function' && router.route() === 'dashboard'
  })

  // Check the main elements
  expect(await page.$('status-bar')).toBeTruthy()
  expect(await page.$('chromvoid-file-manager')).toBeTruthy()
})
