import {expect, test} from 'vitest'

import {createUniqueName, openFilesRoot} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S6: folder creation', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const folderName = createUniqueName('e2e-create-folder')

  const hasFolder = await page.evaluate(async (name) => {
    const ctx = (window as any).getAppContext?.()
    if (!ctx?.catalog?.api?.createDir) {
      throw new Error('catalog.api.createDir is unavailable')
    }

    await ctx.catalog.api.createDir(name)
    const children = ctx.catalog.catalog.getChildren('/')
    return Array.isArray(children) && children.some((node: {name?: string}) => node?.name === name)
  }, folderName)

  expect(hasFolder).toBe(true)
})
