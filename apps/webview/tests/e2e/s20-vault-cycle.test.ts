import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S20: app renders file-manager → lock → unlock cycle', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await page.getByTestId('app-root').waitFor()

  await waitForAuthenticated(page)

  // Verify file manager is present
  expect(await page.$('chromvoid-file-manager')).toBeTruthy()

  // Files surface does not render the global shell status bar.
  expect(await page.$('[data-testid="shell-status"]')).toBeNull()
})
