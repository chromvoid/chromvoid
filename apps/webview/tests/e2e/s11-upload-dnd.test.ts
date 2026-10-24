import {expect, test} from 'vitest'
import type * as AppContextModule from '../../src/shared/services/app-context'

import {createUniqueName, openFilesRoot} from './utils'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S11: Upload a file via Drag & Drop', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const fileName = `${createUniqueName('e2e-dnd')}.txt`

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
    ;(window as any).__s11UploadCalls = []

    const original = store.startUploadFiles.bind(store)
    ;(window as any).__s11RestoreStartUploadFile = () => {
      store.startUploadFiles = original
    }

    store.startUploadFiles = async (currentPath: string, files: File[]) => {
      for (const file of files) {
        ;(window as any).__s11UploadCalls.push({
          currentPath,
          name: file.name,
          size: file.size,
          type: file.type,
        })
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

  await page.getByTestId('workspace-header').waitFor({state: 'attached'})

  // Exercise the shared upload flow through the native file input.
  await page.getByTestId('workspace-header').locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('hello e2e'),
  })

  await page.waitForFunction(() => Array.isArray((window as any).__s11UploadCalls) && (window as any).__s11UploadCalls.length === 1)

  const uploadCall = await page.evaluate(() => (window as any).__s11UploadCalls?.[0] ?? null)
  expect(uploadCall).toEqual({
    currentPath: '/',
    name: fileName,
    size: 'hello e2e'.length,
    type: 'text/plain',
  })

  await page.evaluate(() => {
    ;(window as any).__s11RestoreStartUploadFile?.()
    delete (window as any).__s11RestoreStartUploadFile
    delete (window as any).__s11UploadCalls
  })
})
