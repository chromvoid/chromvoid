import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S1: Start → file-manager', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')

  // waiting for a basic render
  await page.getByTestId('app-root').waitFor()
  await waitForAuthenticated(page)

  // Check the main elements
  expect(await page.$('[data-testid="shell-status"]')).toBeNull()
  expect(await page.$('chromvoid-file-manager')).toBeTruthy()
})
