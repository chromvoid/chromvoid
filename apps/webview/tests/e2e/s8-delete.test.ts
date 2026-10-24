import type {Page} from 'playwright'
import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {createUniqueName, openFilesRoot, waitForCatalogItem} from './utils'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S8: delete folder', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const folderName = createUniqueName('test-sync-folder')

  // Keep direct catalog API coverage; yield a frame after updates so Chromium cannot collect evaluate's result.
  const created = await page.evaluate(async (name) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ctx = getAppContext()
    if (!ctx?.catalog?.api?.createDir) {
      throw new Error('catalog.api.createDir is unavailable')
    }
    const created = await ctx.catalog.api.createDir(name)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return created
  }, folderName)
  expect(created.nodeId).toEqual(expect.any(Number))
  await waitForCatalogItem(page, folderName, {path: '/'})

  // Apply the same frame boundary after the direct delete API call.
  await page.evaluate(async (nodeId) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ctx = getAppContext()
    if (!ctx.catalog.api.delete) {
      throw new Error('catalog.api.delete is unavailable')
    }
    await ctx.catalog.api.delete(nodeId)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }, created.nodeId)
  await waitForCatalogItem(page, folderName, {exists: false, path: '/'})
})
