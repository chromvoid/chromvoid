import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {createUniqueName, openFilesRoot, waitForCatalogItem} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S7: Rename the folder', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const initialName = createUniqueName('e2e-rs')
  const renamedName = createUniqueName('e2e-rt')

  const created = await page.evaluate(
    async (sourceName) => {
      const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
      const {getAppContext} = (await dynamicImport(
        '/shared/services/app-context.ts',
      )) as typeof AppContextModule
      const ctx = getAppContext()
      if (!ctx.catalog.api.createDir) {
        throw new Error('catalog create API is unavailable')
      }
      return ctx.catalog.api.createDir(sourceName)
    },
    initialName,
  )
  expect(created.nodeId).toEqual(expect.any(Number))
  await waitForCatalogItem(page, initialName, {path: '/'})

  await page.evaluate(
    async ({nodeId, targetName}) => {
      const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
      const {getAppContext} = (await dynamicImport(
        '/shared/services/app-context.ts',
      )) as typeof AppContextModule
      const ctx = getAppContext()
      if (!ctx.catalog.api.rename) {
        throw new Error('catalog rename API is unavailable')
      }
      await ctx.catalog.api.rename(nodeId, targetName)
    },
    {nodeId: created.nodeId, targetName: renamedName},
  )

  await waitForCatalogItem(page, initialName, {exists: false, path: '/'})
  await waitForCatalogItem(page, renamedName, {path: '/'})
})
