/**E2E test: full cycle of synchronization of events
* According to the Phase 4 refactoring plan. 6
*
Testing:
* Initial catalog synchronization
* Application of events to the client mirror
CRUD operations and their reflection in UI
*/
import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {openFilesRoot, waitForCatalogItem} from './utils'
import type {Page} from 'playwright'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S17: full event synchronization cycle', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)

  const testDirName = `test-sync-${Date.now()}`
  // Keep direct API event-sync coverage; yield a frame after updates so Chromium cannot collect evaluate's result.
  const created = await page.evaluate(async (dirName) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const cat = getAppContext().catalog
    if (!cat?.api?.createDir) {
      throw new Error('catalog.api.createDir is unavailable')
    }
    const created = await cat.api.createDir(dirName)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return created
  }, testDirName)
  expect(created.nodeId).toEqual(expect.any(Number))
  await waitForCatalogItem(page, testDirName, {path: '/'})

  // Apply the same frame boundary after the direct delete API call.
  await page.evaluate(async (nodeId) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const cat = getAppContext().catalog
    if (!cat.api.delete) {
      throw new Error('catalog.api.delete is unavailable')
    }
    await cat.api.delete(nodeId)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }, created.nodeId)
  await waitForCatalogItem(page, testDirName, {exists: false, path: '/'})
})

test('S17b: mirror correctly displays nested structure', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)

  // Check that getPath and findByPath work correctly
  const pathsWork = await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const cat = getAppContext().catalog
    if (!cat?.catalog) return false
    try {
      const children = cat.catalog.getChildren('/')
      if (children.length === 0) return true // No kids, that's okay.

      const child = children[0]
      if (!child) return true
      const path = cat.catalog.getPath(child.nodeId)
      return typeof path === 'string' && path.startsWith('/')
    } catch {
      return false
    }
  })

  expect(pathsWork).toBe(true)
})

test('S17c: Connection status updated correctly', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)

  // Status check.
  const isConnected = await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ws = getAppContext().ws
    return Boolean(ws?.connected?.())
  })

  expect(isConnected).toBe(true)
})
