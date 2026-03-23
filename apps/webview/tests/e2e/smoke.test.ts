import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('главная страница рендерится и содержит chromvoid-app', async () => {
  const page = globalThis.__E2E_PAGE__!
  // Vite dev server по адресу http://localhost:4400 (root=src)
  await page.goto('http://localhost:4400/index.html')

  const app = await page.$('chromvoid-app')
  expect(app).toBeTruthy()

  const loading = await page.$('#loading-native')
  expect(loading).toBeTruthy()
})
