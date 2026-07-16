import {expect, test} from 'vitest'

import type {Page} from 'playwright'
declare global {
  var __TAURI_PAGE__: Page | undefined
}

test('Browser-hosted app smoke: app launches and reaches initialization', async () => {
  const page = globalThis.__TAURI_PAGE__!
  await page.waitForSelector('chromvoid-app', {timeout: 30_000})

  // This validates the browser-hosted shell target, not native Tauri IPC/custom protocols.
  const app = await page.$('chromvoid-app')
  expect(app).toBeTruthy()
})

test('Browser-hosted app smoke: master setup flow placeholder', async () => {
  const page = globalThis.__TAURI_PAGE__!

  // Wait for the app to be ready
  await page.waitForSelector('chromvoid-app', {timeout: 30_000})

  // Specific flows depend on component selectors in welcome.ts / master-setup.
  // Native Tauri IPC/custom protocol coverage requires a real WebView runner.
})
