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

  const created = await page.evaluate(async (name) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ctx = getAppContext()
    if (!ctx?.catalog?.api?.createDir) {
      throw new Error('catalog.api.createDir is unavailable')
    }
    return ctx.catalog.api.createDir(name)
  }, folderName)
  expect(created.nodeId).toEqual(expect.any(Number))
  await waitForCatalogItem(page, folderName, {path: '/'})

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
  }, created.nodeId)
  await waitForCatalogItem(page, folderName, {exists: false, path: '/'})
})
