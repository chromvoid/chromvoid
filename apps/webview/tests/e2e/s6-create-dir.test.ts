import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S6: создание папки', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // нажать кнопку "Новая папка" (внутри dashboard-header)
  await page.getByText('Новая папка').click()

  // диалог prompt будет перехвачен в setup и вернёт e2e-folder
  // проверяем появление элемента в списке (по тексту имени)
  await page.getByText('e2e-folder').waitFor({timeout: 10_000})
  expect(await page.getByText('e2e-folder').isVisible()).toBe(true)
})
