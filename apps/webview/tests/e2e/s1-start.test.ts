import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S1: старт → file-manager', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')

  // ждём базовый рендер
  await page.waitForSelector('chromvoid-app')

  // при активном backend сразу уходим в dashboard
  await page.waitForFunction(() => {
    const router = (window as any).router
    return !!router && typeof router.route === 'function' && router.route() === 'dashboard'
  })

  // проверяем основные элементы
  expect(await page.$('status-bar')).toBeTruthy()
  expect(await page.$('chromvoid-file-manager')).toBeTruthy()
})
