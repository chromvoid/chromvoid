import {type Browser, type Page, chromium} from 'playwright'
import {afterAll, beforeAll} from 'vitest'

let browser: Browser
let page: Page

declare global {
  var __TAURI_PAGE__: Page | undefined
}

export async function setup() {
  // Connect Playwright to the Tauri devUrl.
  // Assumes `npm run tauri:dev` (or the webview dev server) is already running.
  browser = await chromium.launch({headless: false})
  page = await browser.newPage()

  await page.goto('http://localhost:4400/index.html')

  globalThis.__TAURI_PAGE__ = page
}

export async function teardown() {
  await page?.close()
  await browser?.close()
}

beforeAll(async () => {
  await setup()
})

afterAll(async () => {
  await teardown()
})
