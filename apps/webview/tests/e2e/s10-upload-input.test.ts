import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S10: Uploading a file via input', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html?layout=desktop')
  await waitForAuthenticated(page)

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

  const fileName = `sample-${Date.now()}.txt`

  await page.evaluate(() => {
    const ctx = (window as any).getAppContext?.()
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
  })

  await page.evaluate((name) => {
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

    const header = queryDeep('dashboard-header')
    if (!header) {
      throw new Error('dashboard-header is unavailable')
    }

    const transfer = new DataTransfer()
    transfer.items.add(new File(['hello from s10 upload input'], name, {type: 'text/plain'}))

    header.dispatchEvent(
      new CustomEvent('upload-requested', {
        detail: {files: transfer.files},
        bubbles: true,
        composed: true,
      }),
    )
  }, fileName)

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
