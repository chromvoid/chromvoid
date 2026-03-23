import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S16: обрыв и переподключение WS', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // разорвать соединение
  await page.evaluate(() => (window as any).ws.disconnect())

  // подождать немного и снова соединиться
  await page.waitForTimeout(500)
  await page.evaluate(() => (window as any).ws.connect())

  // дождаться повторной аутентификации
  await waitForAuthenticated(page)

  // убедиться, что роутер снова на dashboard
  const route = await page.evaluate(() => (window as any).router.route())
  expect(route).toBe('dashboard')
})
