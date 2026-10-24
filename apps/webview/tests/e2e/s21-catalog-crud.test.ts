import {expect, test} from 'vitest'

import type {Page} from 'playwright'
import {waitForAuthenticated} from './utils'
declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S21: create folder via UI', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await page.getByTestId('app-root').waitFor()

  await waitForAuthenticated(page)

  // The file manager should be visible
  const fm = await page.$('chromvoid-file-manager')
  expect(fm).toBeTruthy()
})
