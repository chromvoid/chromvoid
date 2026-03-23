import {type Browser, type Page, chromium} from 'playwright'
import {afterAll, beforeAll} from 'vitest'

import {ensureViteStarted, stopVite} from './server'

console.log('E2E setup.ts loaded!')

let browser: Browser
let page: Page

declare global {
  var __E2E_BROWSER__: Browser | undefined

  var __E2E_PAGE__: Page | undefined
}

export async function setup() {
  // Убедимся, что dev-сервер Vite поднят (если не запущен вручную)
  await ensureViteStarted()
  // Запускаем браузер один раз на раннер
  const isHeaded = process.env['HEADED'] === '1'
  browser = await chromium.launch({headless: !isHeaded})
  page = await browser.newPage()

  // Глобальный перехват диалогов: prompt/confirm
  page.on('dialog', async (dialog) => {
    try {
      if (dialog.type() === 'prompt') {
        await dialog.accept('e2e-folder')
      } else if (dialog.type() === 'confirm') {
        await dialog.accept()
      } else {
        await dialog.dismiss()
      }
    } catch {}
  })

  // Экспортируем в глобал для тестов
  globalThis.__E2E_BROWSER__ = browser
  globalThis.__E2E_PAGE__ = page
}

export async function teardown() {
  await page?.close()
  await browser?.close()
  // Завершаем локальный dev-сервер, если поднимали
  await stopVite()
}

// Vitest 3: регистрация хуков глобального setup/teardown
beforeAll(async () => {
  await setup()
})

afterAll(async () => {
  await teardown()
})
