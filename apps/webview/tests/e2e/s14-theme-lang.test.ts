import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S14: переключение темы и языка', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')

  // переключить тему через кнопку в статус-баре
  const before = await page.evaluate(() => document.documentElement.getAttribute('theme'))
  const themeBtn = await page.locator('status-bar sl-button.theme').first()
  await themeBtn.click()
  const after = await page.evaluate(() => document.documentElement.getAttribute('theme'))
  expect(before).not.toBe(after)

  // сменить язык (если селект доступен)
  const selectLocator = page.locator('status-bar sl-select.lang-select').first()
  const selectCount = await selectLocator.count()
  const select = selectCount > 0 ? selectLocator : null
  if (select) {
    await select.click()
    // выбираем первый доступный вариант
    const option = await page.locator('sl-option').first()
    await option.click()
  }
})
