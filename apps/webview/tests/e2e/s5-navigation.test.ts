import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S5: навигация по папкам', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // открываем папку docs/ (ожидается по умолчанию в backend)
  await page.getByText('docs').click()

  // можно проверить, что в breadcrumbs появился сегмент docs
  // и вернуться назад (в корень)
  await page.getByText('docs').waitFor({timeout: 10_000})
  // вернуться в корень через первый сегмент " / " или специальную кнопку в breadcrumbs
  // для простоты — нажмём на сегмент корня
  const rootCrumb = await page.locator('breadcrumbs-nav').first()
  await rootCrumb.click()

  // ожидаем, что снова виден элемент docs в корне
  await page.getByText('docs').waitFor({timeout: 10_000})
  expect(await page.getByText('docs').isVisible()).toBe(true)
})
