import {afterEach, describe, expect, it, vi} from 'vitest'

import type {CVContextMenu} from '@chromvoid/uikit'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {ContextMenu, type ContextMenuItem} from '../../src/features/file-manager/components/context-menu'

function ensureDefined() {
  ContextMenu.define()
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

async function settleContextMenu(menu: ContextMenu) {
  await settle(menu)
  const inner = menu.shadowRoot?.querySelector('cv-context-menu') as CVContextMenu | null
  await inner?.updateComplete
  await Promise.resolve()
  return inner
}

const items = (actions: Partial<Record<string, () => void>> = {}): ContextMenuItem[] => [
  {
    id: 'open-external',
    label: 'Open in system',
    icon: 'box-arrow-up-right',
    action: actions['open-external'] ?? vi.fn(),
    shortcutId: 'files.openExternal',
  },
  {
    id: 'rename',
    label: 'Rename',
    icon: 'pencil',
    action: actions.rename ?? vi.fn(),
    shortcutId: 'files.rename',
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: 'trash',
    action: actions.delete ?? vi.fn(),
    shortcutId: 'files.delete',
  },
]

afterEach(() => {
  document.body.innerHTML = ''
  resetRuntimeCapabilities()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('file-manager shortcut surfaces', () => {
  it('renders context-menu shortcut labels through the shortcut model', async () => {
    ensureDefined()
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    const menu = document.createElement('context-menu') as ContextMenu
    document.body.appendChild(menu)

    menu.show(20, 20, items())
    await settleContextMenu(menu)
    let shortcuts = Array.from(menu.shadowRoot?.querySelectorAll('cv-menu-item [slot="suffix"]') ?? []).map(
      (node) => node.textContent ?? '',
    )
    expect(shortcuts).toEqual(['⌘O', 'F2', 'Del'])

    setRuntimeCapabilities({platform: 'android', mobile: true})
    menu.requestUpdate()
    await settleContextMenu(menu)
    shortcuts = Array.from(menu.shadowRoot?.querySelectorAll('cv-menu-item [slot="suffix"]') ?? []).map(
      (node) => node.textContent ?? '',
    )
    expect(shortcuts).toEqual([])
  })

  it('activates context-menu shortcuts only when the current platform has bindings', async () => {
    ensureDefined()
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    const openExternal = vi.fn()
    const menu = document.createElement('context-menu') as ContextMenu
    document.body.appendChild(menu)
    menu.show(20, 20, items({'open-external': openExternal}))
    await settle(menu)

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'o', ctrlKey: true, cancelable: true}))
    expect(openExternal).toHaveBeenCalledTimes(1)

    const openExternalAndroid = vi.fn()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    menu.show(20, 20, items({'open-external': openExternalAndroid}))
    await settle(menu)

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'o', ctrlKey: true, cancelable: true}))
    expect(openExternalAndroid).not.toHaveBeenCalled()
  })

  it('delegates menu mechanics to cv-context-menu and emits hide on scroll close', async () => {
    ensureDefined()
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    const menu = document.createElement('context-menu') as ContextMenu
    const hideEvents: Event[] = []
    menu.addEventListener('hide', (event) => hideEvents.push(event))
    document.body.appendChild(menu)

    menu.show(20, 24, items())
    const inner = await settleContextMenu(menu)

    expect(menu.shadowRoot?.querySelectorAll('cv-context-menu')).toHaveLength(1)
    expect(inner?.open).toBe(true)
    expect(inner?.anchorX).toBe(20)
    expect(inner?.anchorY).toBe(24)
    expect(inner?.hasAttribute('close-on-scroll')).toBe(true)

    document.dispatchEvent(new Event('scroll'))
    await settleContextMenu(menu)

    expect(inner?.open).toBe(false)
    expect(hideEvents).toHaveLength(1)
  })
})
