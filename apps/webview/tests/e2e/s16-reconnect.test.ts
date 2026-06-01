import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S16: break and reconnect WS', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html?surface=files', {waitUntil: 'domcontentloaded'})
  await waitForAuthenticated(page)

  // break off
  await page.evaluate(() => {
    const ws = (window as any).getAppContext?.()?.ws
    if (!ws?.disconnect) {
      throw new Error('ws.disconnect is unavailable')
    }
    ws.disconnect()
  })
  await page.waitForFunction(() => {
    const ws = (window as any).getAppContext?.()?.ws
    return !!ws && typeof ws.connected === 'function' && ws.connected() === false
  })

  await page.waitForFunction(() => (window as any).router?.route?.() === 'no-connection')

  await page.reload()
  await waitForAuthenticated(page)

  // Make sure the router is back on dashboard
  const route = await page.evaluate(() => (window as any).router?.route?.())
  expect(route).toBe('dashboard')
})
