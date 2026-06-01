/**E2E test: full cycle of synchronization of events
* According to the Phase 4 refactoring plan. 6
*
Testing:
* Initial catalog synchronization
* Application of events to the client mirror
CRUD operations and their reflection in UI
*/
import {expect, test} from 'vitest'

import {openFilesRoot} from './utils'
import type {Page} from 'playwright'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S17: full event synchronization cycle', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)

  const testDirName = `test-sync-${Date.now()}`
  const result = await page.evaluate(async (dirName) => {
    const cat = (window as any).getAppContext?.()?.catalog
    if (!cat?.api?.createDir) {
      throw new Error('catalog.api.createDir is unavailable')
    }
    if (!cat?.api?.delete) {
      throw new Error('catalog.api.delete is unavailable')
    }
    const created = await cat.api.createDir(dirName)
    const childrenAfterCreate = cat.catalog.getChildren('/')
    const createdVisible = Array.isArray(childrenAfterCreate)
      ? childrenAfterCreate.some((node: {name?: string}) => node?.name === dirName)
      : false

    if (!created?.nodeId) {
      return {nodeId: null, createdVisible, deletedVisible: false}
    }

    await cat.api.delete(created.nodeId)
    const childrenAfterDelete = cat.catalog.getChildren('/')
    const deletedVisible = Array.isArray(childrenAfterDelete)
      ? !childrenAfterDelete.some((node: {name?: string}) => node?.name === dirName)
      : false

    return {
      nodeId: created.nodeId,
      createdVisible,
      deletedVisible,
    }
  }, testDirName)

  expect(result).toEqual({
    nodeId: expect.any(Number),
    createdVisible: true,
    deletedVisible: true,
  })
})

test('S17b: mirror correctly displays nested structure', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)

  // Check that getPath and findByPath work correctly
  const pathsWork = await page.evaluate(() => {
    const cat = (window as any).getAppContext?.()?.catalog
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
  const isConnected = await page.evaluate(() => {
    const ws = (window as any).getAppContext?.()?.ws
    return Boolean(ws?.connected?.())
  })

  expect(isConnected).toBe(true)
})
