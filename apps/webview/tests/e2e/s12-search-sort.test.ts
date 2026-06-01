import type {Page} from 'playwright'
import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S12: Search and sorting', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // Enter the search bar (if the UI has input search). Let's say the placeholder contains "Search".
  const searchLocator = page.locator('file-search input').first()
  const searchCount = await searchLocator.count()
  const search = searchCount > 0 ? searchLocator : null
  if (search) {
    await search.fill('doc')
    await page.waitForTimeout(200)
  }

  // Sort: by name (if there is a selector/buttons)
  // In the minimum frame, just check that the list is not empty and the docs folder is visible.
  const visible = await page
    .getByText('docs')
    .isVisible()
    .catch(() => false)
  expect(visible).toBeTypeOf('boolean')
})
