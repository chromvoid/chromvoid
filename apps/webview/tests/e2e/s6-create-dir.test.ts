import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {createUniqueName, openFilesRoot} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S6: folder creation', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const folderName = createUniqueName('e2e-create-folder')

  const hasFolder = await page.evaluate(async (name) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ctx = getAppContext()
    if (!ctx?.catalog?.api?.createDir) {
      throw new Error('catalog.api.createDir is unavailable')
    }

    await ctx.catalog.api.createDir(name)
    const children = ctx.catalog.catalog.getChildren('/')
    return Array.isArray(children) && children.some((node: {name?: string}) => node?.name === name)
  }, folderName)

  expect(hasFolder).toBe(true)
})
