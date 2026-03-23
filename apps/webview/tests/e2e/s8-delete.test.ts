import type {Page} from 'playwright'
import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S8: удаление папки', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // создать папку (prompt перехвачен)
  await page.getByText('Новая папка').click()
  await page.getByText('e2e-folder').waitFor({timeout: 10_000})

  // контекст-меню → удалить → confirm перехвачен
  await page.getByText('e2e-folder').click({button: 'right'})
  await page.getByText('Удалить').click()

  // ожидать, что элемент исчезнет
  await page.waitForTimeout(300)
  const isVisible = await page
    .getByText('e2e-folder')
    .isVisible()
    .catch(() => false)
  expect(isVisible).toBe(false)
})
