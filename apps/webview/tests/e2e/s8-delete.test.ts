import type {Page} from 'playwright'
import {expect, test} from 'vitest'

import {createUniqueName, openFilesRoot} from './utils'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S8: delete folder', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const folderName = createUniqueName('test-sync-folder')

  const result = await page.evaluate(async (name) => {
    const ctx = (window as any).getAppContext?.()
    if (!ctx?.catalog?.api?.createDir) {
      throw new Error('catalog.api.createDir is unavailable')
    }
    if (!ctx?.catalog?.api?.delete) {
      throw new Error('catalog.api.delete is unavailable')
    }

    const created = await ctx.catalog.api.createDir(name)
    const childrenAfterCreate = ctx.catalog.catalog.getChildren('/')
    const createdVisible = Array.isArray(childrenAfterCreate)
      ? childrenAfterCreate.some((node: {name?: string}) => node?.name === name)
      : false

    if (!created?.nodeId) {
      return {nodeId: null, createdVisible, deletedVisible: false}
    }

    await ctx.catalog.api.delete(created.nodeId)
    const childrenAfterDelete = ctx.catalog.catalog.getChildren('/')
    const deletedVisible = Array.isArray(childrenAfterDelete)
      ? !childrenAfterDelete.some((node: {name?: string}) => node?.name === name)
      : false

    return {
      nodeId: created.nodeId,
      createdVisible,
      deletedVisible,
    }
  }, folderName)

  expect(result).toEqual({
    nodeId: expect.any(Number),
    createdVisible: true,
    deletedVisible: true,
  })
})
