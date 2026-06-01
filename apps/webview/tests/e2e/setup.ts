import {type Browser, type BrowserContext, type Page, chromium} from 'playwright'
import {afterAll, afterEach, beforeAll, beforeEach} from 'vitest'

import {ensureViteStarted, stopVite} from './server'

console.log('E2E setup.ts loaded!')

let browser: Browser
let context: BrowserContext | undefined
let page: Page | undefined
let baselineMockStateText: string | undefined

declare global {
  var __E2E_BASELINE_MOCK_STATE__: string | undefined

  var __E2E_BROWSER__: Browser | undefined

  var __E2E_PAGE__: Page | undefined
}

export async function setup() {
  // Make sure the Vite dev server is lifted (unless manually run)
  await ensureViteStarted()
  if (globalThis.__E2E_BASELINE_MOCK_STATE__ === undefined) {
    try {
      const res = await fetch('http://localhost:4400/api/mock-state')
      globalThis.__E2E_BASELINE_MOCK_STATE__ = res.ok ? await res.text() : undefined
    } catch {
      globalThis.__E2E_BASELINE_MOCK_STATE__ = undefined
    }
  }
  baselineMockStateText = globalThis.__E2E_BASELINE_MOCK_STATE__
}

async function resetMockState() {
  if (baselineMockStateText) {
    await fetch('http://localhost:4400/api/mock-state', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: baselineMockStateText,
    })
    return
  }

  await fetch('http://localhost:4400/api/mock-state', {method: 'DELETE'})
}

async function resetMockTransportLog() {
  await fetch('http://localhost:4400/api/mock-transport-log', {method: 'DELETE'})
}

async function createPage() {
  await resetMockState()
  await resetMockTransportLog()
  const isHeaded = process.env['HEADED'] === '1'
  browser = await chromium.launch({headless: !isHeaded})
  context = await browser.newContext()
  page = await context.newPage()

  // Global Interception of Dialogues: prompt/confirm
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

  // Export to the global for testing
  globalThis.__E2E_BROWSER__ = browser
  globalThis.__E2E_PAGE__ = page
}

async function destroyPage() {
  await page?.close()
  await context?.close()
  await browser?.close()
  browser = undefined as unknown as Browser
  context = undefined
  page = undefined
  globalThis.__E2E_PAGE__ = undefined
}

export async function teardown() {
  // Close down the local dev server if you have raised
  await stopVite()
}

// Vitest 3: Registration of global setup/teardown
beforeAll(async () => {
  await setup()
})

beforeEach(async () => {
  await createPage()
})

afterEach(async () => {
  await destroyPage()
})

afterAll(async () => {
  await teardown()
})
