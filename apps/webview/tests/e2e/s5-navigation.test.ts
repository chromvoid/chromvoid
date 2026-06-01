import {expect, test} from 'vitest'

import {createFolder, createUniqueName, openFilesRoot, waitForCatalogItem, waitForCurrentPath} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S5: Navigating folders', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)

  const folderName = createUniqueName('e2e-nav-folder')
  await createFolder(page, folderName)
  await waitForCatalogItem(page, folderName, {path: '/'})

  await page.goto(`http://localhost:4400/index.html?surface=files&path=%2F${encodeURIComponent(folderName)}`)
  await waitForCurrentPath(page, `/${folderName}`)

  await page.goto('http://localhost:4400/index.html?surface=files&path=%2F')
  await waitForCurrentPath(page, '/')

  const result = await page.evaluate(() => ({rootPath: new URL(window.location.href).searchParams.get('path')}))
  expect(result).toEqual({rootPath: '/'})
})
