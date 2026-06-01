import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S4: catalog synchronization', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // Give background catalog synchronization a short moment to settle.
  await page.waitForTimeout(300)

  // Check the presence of children at the root
  const hasChildren = await page.evaluate(() => {
    const cat = (window as any).catalog
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
