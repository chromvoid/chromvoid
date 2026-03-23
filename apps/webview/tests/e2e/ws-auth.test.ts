import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('ws становится authenticated в течение 5 секунд', async () => {
  const page = globalThis.__E2E_PAGE__!

  await page.goto('http://localhost:4400/index.html')

  // Ждём инициализации AppContext (getAppContext экспортируется в window)
  await page.waitForFunction(
    () => {
      const getAppContext = (window as any).getAppContext
      if (typeof getAppContext !== 'function') return false
      try {
        const ctx = getAppContext()
        return ctx && ctx.ws !== undefined
      } catch {
        return false
      }
    },
    undefined,
    {timeout: 5_000},
  )

  // Опционально ждём установления соединения
  await page.waitForFunction(
    () => {
      try {
        const {ws} = (window as any).getAppContext()
        return !!ws && typeof ws.connected === 'function' && ws.connected()
      } catch {
        return false
      }
    },
    undefined,
    {timeout: 5_000},
  )

  // Проверяем, что authenticated станет true в пределах 5 секунд
  const authed = await page.waitForFunction(
    () => {
      try {
        const {ws} = (window as any).getAppContext()
        return !!ws && typeof ws.authenticated === 'function' && ws.authenticated()
      } catch {
        return false
      }
    },
    undefined,
    {timeout: 5_000},
  )

  expect(await authed.jsonValue()).toBe(true)
})
