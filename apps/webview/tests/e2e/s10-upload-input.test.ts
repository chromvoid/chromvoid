import path from 'node:path'
import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S10: загрузка файла через input', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // открыть диалог выбора файла
  await page.getByText('Загрузить файлы').click()

  // выбрать фикстуру (создайте файл в указанном пути)
  const filePath = path.resolve(__dirname, '../fixtures/sample.txt')
  const handle = await page.$('#file-input')
  await handle!.setInputFiles(filePath)

  // ожидаем успешное завершение загрузки (уведомление или наличие файла в списке)
  // упрощённо проверим появление имени файла
  const baseName = 'sample.txt'
  await page.getByText(baseName).waitFor({timeout: 15_000})
  expect(await page.getByText(baseName).isVisible()).toBe(true)
})
