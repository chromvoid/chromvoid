import {expect, test} from 'vitest'

import {createUniqueName, openFilesRoot} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S11: Upload a file via Drag & Drop', async () => {
  const page = globalThis.__E2E_PAGE__!
  await openFilesRoot(page)
  const fileName = `${createUniqueName('e2e-dnd')}.txt`

  await page.evaluate(() => {
    const ctx = (window as any).getAppContext?.()
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
  })

  await page.waitForFunction(() => {
    const queryDeep = (selector: string, root: ParentNode = document): Element | null => {
      const direct = root.querySelector(selector)
      if (direct) return direct

      const elements = root.querySelectorAll('*')
      for (const element of elements) {
        const shadowRoot = (element as HTMLElement).shadowRoot
        if (!shadowRoot) continue
        const nested = queryDeep(selector, shadowRoot)
        if (nested) return nested
      }

      return null
    }

    return Boolean(queryDeep('dashboard-header'))
  })

  // Browser-level synthetic external DnD is unreliable in Playwright, so this
  // test validates the public upload-requested event path used by the drop flow.
  await page.evaluate(async (name) => {
    const queryDeep = (selector: string, root: ParentNode = document): Element | null => {
      const direct = root.querySelector(selector)
      if (direct) return direct

      const elements = root.querySelectorAll('*')
      for (const element of elements) {
        const shadowRoot = (element as HTMLElement).shadowRoot
        if (!shadowRoot) continue
        const nested = queryDeep(selector, shadowRoot)
        if (nested) return nested
      }

      return null
    }

    const file = new File([new Blob(['hello e2e'])], name, {type: 'text/plain'})
    const dt = new DataTransfer()
    dt.items.add(file)
    const target = queryDeep('dashboard-header')
    if (!target) {
      throw new Error('dashboard-header is unavailable')
    }
    target.dispatchEvent(
      new CustomEvent('upload-requested', {
        detail: {files: dt.files},
        bubbles: true,
        composed: true,
      }),
    )
  }, fileName)

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
