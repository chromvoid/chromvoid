import {expect, test} from 'vitest'

import {createUniqueName, openFilesRoot} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S7: Rename the folder', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const initialName = createUniqueName('e2e-rs')
  const renamedName = createUniqueName('e2e-rt')

  await page.evaluate(() => {
    document.querySelector('chromvoid-file-manager')?.remove()
  })

  const result = await page.evaluate(
    async ({sourceName, targetName}) => {
      const ctx = (window as any).getAppContext?.()
      if (!ctx?.catalog?.api?.createDir || !ctx?.catalog?.api?.rename) {
        throw new Error('catalog CRUD API is unavailable')
      }

      await ctx.catalog.api.createDir(sourceName)

      const childrenAfterCreate = ctx.catalog.catalog.getChildren('/')
      const source = Array.isArray(childrenAfterCreate)
        ? childrenAfterCreate.find((node: {name?: string; nodeId?: number}) => node?.name === sourceName)
        : null

      if (!source?.nodeId) {
        throw new Error(`created folder "${sourceName}" is unavailable`)
      }

      await ctx.catalog.api.rename(source.nodeId, targetName)

      const childrenAfterRename = ctx.catalog.catalog.getChildren('/')
      const hasSource = Array.isArray(childrenAfterRename)
        ? childrenAfterRename.some((node: {name?: string}) => node?.name === sourceName)
        : false
      const hasTarget = Array.isArray(childrenAfterRename)
        ? childrenAfterRename.some((node: {name?: string}) => node?.name === targetName)
        : false

      return {hasSource, hasTarget}
    },
    {sourceName: initialName, targetName: renamedName},
  )

  expect(result).toEqual({hasSource: false, hasTarget: true})
})
