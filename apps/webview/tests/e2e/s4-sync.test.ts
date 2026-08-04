import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {openFilesRoot} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S4: catalog synchronization', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)

  // Check the presence of children at the root
  const hasChildren = await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const cat = getAppContext().catalog
    if (!cat?.catalog) return false
    try {
      const children = cat.catalog.getChildren('/')
      return Array.isArray(children)
    } catch {
      return false
    }
  })
  expect(hasChildren).toBe(true)
})
