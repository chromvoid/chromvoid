import {afterEach, describe, expect, it} from 'vitest'

import {DesktopShellToolbar} from '../../src/features/shell/components/desktop-shell-toolbar'

let toolbarDefined = false

function ensureToolbarDefined() {
  if (toolbarDefined) return
  DesktopShellToolbar.define()
  toolbarDefined = true
}

async function flushToolbar(toolbar: DesktopShellToolbar) {
  await Promise.resolve()
  await toolbar.updateComplete
  await Promise.resolve()
  await toolbar.updateComplete
}

async function renderToolbar(slots: Partial<Record<string, string>>) {
  ensureToolbarDefined()

  const toolbar = document.createElement(DesktopShellToolbar.elementName) as DesktopShellToolbar
  for (const [slot, text] of Object.entries(slots)) {
    const element = document.createElement('span')
    element.slot = slot
    element.textContent = text
    toolbar.appendChild(element)
  }

  document.body.appendChild(toolbar)
  await flushToolbar(toolbar)
  return toolbar
}

function shadowPart(toolbar: DesktopShellToolbar, selector: string) {
  const part = toolbar.shadowRoot?.querySelector<HTMLElement>(selector)
  expect(part).toBeInstanceOf(HTMLElement)
  return part as HTMLElement
}

describe('DesktopShellToolbar', () => {
  afterEach(() => {
    document.querySelectorAll(DesktopShellToolbar.elementName).forEach((toolbar) => toolbar.remove())
  })

  it('hides empty slot groups so they do not participate in toolbar layout', async () => {
    const toolbar = await renderToolbar({
      leading: 'Files',
      actions: 'Create',
    })

    expect(shadowPart(toolbar, '.toolbar-primary').hidden).toBe(false)
    expect(shadowPart(toolbar, '.leading').hidden).toBe(false)
    expect(shadowPart(toolbar, '.toolbar-secondary').hidden).toBe(false)
    expect(shadowPart(toolbar, '.actions').hidden).toBe(false)
    expect(shadowPart(toolbar, '.heading').hidden).toBe(true)
    expect(shadowPart(toolbar, '.title').hidden).toBe(true)
    expect(shadowPart(toolbar, '.subtitle').hidden).toBe(true)
    expect(shadowPart(toolbar, '.start').hidden).toBe(true)
    expect(shadowPart(toolbar, '.center').hidden).toBe(true)
    expect(shadowPart(toolbar, '.end').hidden).toBe(true)
  })

  it('updates empty slot groups when slotted content changes', async () => {
    const toolbar = await renderToolbar({
      title: 'Notes',
      subtitle: 'Quick view',
      center: 'Controls',
    })

    const title = toolbar.querySelector('[slot="title"]')
    const subtitle = toolbar.querySelector('[slot="subtitle"]')
    title?.remove()
    await flushToolbar(toolbar)

    expect(shadowPart(toolbar, '.title').hidden).toBe(true)
    expect(shadowPart(toolbar, '.heading').hidden).toBe(false)

    subtitle?.remove()
    await flushToolbar(toolbar)

    expect(shadowPart(toolbar, '.subtitle').hidden).toBe(true)
    expect(shadowPart(toolbar, '.heading').hidden).toBe(true)
    expect(shadowPart(toolbar, '.center').hidden).toBe(false)
  })
})
