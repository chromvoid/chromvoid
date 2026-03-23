import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('S11: загрузка файла через Drag&Drop', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // эмулируем DnD одного файла
  await page.evaluate(async () => {
    const file = new File([new Blob(['hello e2e'])], 'e2e-dnd.txt', {type: 'text/plain'})
    const dt = new DataTransfer()
    dt.items.add(file)
    const zone = document.querySelector('chromvoid-file-manager')?.shadowRoot?.querySelector('.drop-zone')
    const target: Element = zone || document.body
    const enter = new DragEvent('dragenter', {bubbles: true, cancelable: true})
    Object.defineProperty(enter, 'dataTransfer', {value: dt})
    target.dispatchEvent(enter)
    const drop = new DragEvent('drop', {bubbles: true, cancelable: true})
    Object.defineProperty(drop, 'dataTransfer', {value: dt})
    target.dispatchEvent(drop)
  })

  // проверяем появление загруженного файла
  await page.getByText('e2e-dnd.txt').waitFor({timeout: 15_000})
  expect(await page.getByText('e2e-dnd.txt').isVisible()).toBe(true)
})
