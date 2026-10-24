import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {waitForAuthenticated} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S10: Uploading a file via input', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html?layout=desktop')
  await waitForAuthenticated(page)

  await page.getByTestId('workspace-header').waitFor({state: 'attached'})

  const fileName = `sample-${Date.now()}.txt`

  // Root-path fixture setup changes reactive state; yield a frame before returning
  // so its updates cannot race Chromium's evaluate result under GC.
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {getAppContext} = (await dynamicImport(
      '/shared/services/app-context.ts',
    )) as typeof AppContextModule
    const ctx = getAppContext()
    const store = ctx?.store
    if (!store?.startUploadFiles || !store?.setCurrentPath) {
      throw new Error('upload store contract is unavailable')
    }

    store.setCurrentPath('/')
    ;(window as any).__s10UploadCalls = []

    const original = store.startUploadFiles.bind(store)
    ;(window as any).__s10RestoreStartUploadFile = () => {
      store.startUploadFiles = original
    }

    store.startUploadFiles = async (currentPath: string, files: File[]) => {
      for (const file of files) {
        ;(window as any).__s10UploadCalls.push({
          currentPath,
          name: file.name,
          size: file.size,
          type: file.type,
        })
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

  // Exercise the shared upload flow through the native file input.
  await page.getByTestId('workspace-header').locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('hello from s10 upload input'),
  })

  await page.waitForFunction(() => Array.isArray((window as any).__s10UploadCalls) && (window as any).__s10UploadCalls.length === 1)

  const uploadCall = await page.evaluate(() => (window as any).__s10UploadCalls?.[0] ?? null)
  expect(uploadCall).toEqual({
    currentPath: '/',
    name: fileName,
    size: 'hello from s10 upload input'.length,
    type: 'text/plain',
  })

  await page.evaluate(() => {
    ;(window as any).__s10RestoreStartUploadFile?.()
    delete (window as any).__s10RestoreStartUploadFile
    delete (window as any).__s10UploadCalls
  })
})
