import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {waitForAuthenticated} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S16: break and reconnect WS', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html?surface=files', {waitUntil: 'domcontentloaded'})
  await waitForAuthenticated(page)

  // Disconnect is a programmatic fault injection; a frame keeps its updates clear of Chromium's weak result promise.
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ws = getAppContext().ws
    if (!ws?.disconnect) {
      throw new Error('ws.disconnect is unavailable')
    }
    ws.disconnect()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await page.waitForFunction(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ws = getAppContext().ws
    return !!ws && typeof ws.connected === 'function' && ws.connected() === false
  })

  await page.waitForSelector('no-connection')

  await page.reload()
  await waitForAuthenticated(page)

  const connected = await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    return getAppContext().ws.connected()
  })
  expect(connected).toBe(true)
})
