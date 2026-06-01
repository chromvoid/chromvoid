const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
}))

import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {NavigationRail} from '../../src/features/file-manager/components/navigation-rail'
import {navigationRailModel} from '../../src/features/file-manager/components/navigation-rail.model'
import {ChromVoidAppModel} from '../../src/routes/app.route.model'
import {
  clearAppContext,
  createMockAppContext,
  getAppContext,
  initAppContext,
} from '../../src/shared/services/app-context'

type LayoutMode = 'desktop' | 'mobile'

function setupContext(layoutModeValue: LayoutMode = 'desktop') {
  navigationModel.disconnect()
  window.history.replaceState({}, '', '/dashboard?surface=files&path=%2F')

  const layoutMode = atom<LayoutMode>(layoutModeValue)
  const sidebarOpen = atom(false)
  const theme = atom<'light' | 'dark' | 'system'>('dark')
  const selectedNodeIds = atom<number[]>([])
  const vaultLockPending = atom(false)
  const notifications: Array<{type: string; message: string}> = []

  const store = {
    layoutMode,
    sidebarOpen,
    setSidebarOpen: (next: boolean) => sidebarOpen.set(next),
    theme,
    switchTheme: () => theme.set(theme() === 'dark' ? 'light' : 'dark'),
    selectedNodeIds,
    vaultLockPending,
    beginVaultLockRequest: () => vaultLockPending.set(true),
    finishVaultLockRequest: () => vaultLockPending.set(false),
    setSelectedItems: vi.fn((next: number[]) => selectedNodeIds.set(next)),
    pushNotification: vi.fn((type: string, message: string) => notifications.push({type, message})),
  }

  initAppContext(
    createMockAppContext({
      store: store as any,
    }),
  )

  navigationModel.reset()
  return {store, notifications}
}

function createKeyEvent(key: string, init: Partial<KeyboardEvent> = {}) {
  return {
    key,
    code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    defaultPrevented: init.defaultPrevented ?? false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent
}

async function renderRail() {
  NavigationRail.define()
  const rail = document.createElement('navigation-rail') as NavigationRail
  document.body.appendChild(rail)
  await rail.updateComplete
  return rail
}

afterEach(() => {
  navigationModel.disconnect()
  navigationRailModel.expanded.set(false)
  document.querySelectorAll('navigation-rail').forEach((el) => el.remove())
  document.querySelectorAll('input').forEach((el) => el.remove())
  tauriInvoke.mockReset()
  vi.unstubAllGlobals()
  resetRuntimeCapabilities()
  clearAppContext()
})

describe('NavigationRail shortcut labels and vault lock shortcut', () => {
  it('renders macOS navigation action hints from the shortcut model', async () => {
    setupContext('desktop')
    setRuntimeCapabilities({platform: 'macos', desktop: true})

    const rail = await renderRail()

    expect(rail.shadowRoot?.textContent).toContain('⌘K')
    expect(rail.shadowRoot?.textContent).toContain('⌘L')
  })

  it('renders Ctrl navigation action hints on Windows/Linux desktop', async () => {
    setupContext('desktop')
    setRuntimeCapabilities({platform: 'linux', desktop: true})

    const rail = await renderRail()

    expect(rail.shadowRoot?.textContent).toContain('Ctrl+K')
    expect(rail.shadowRoot?.textContent).toContain('Ctrl+L')
  })

  it('hides desktop navigation action hints on Android mobile', async () => {
    setupContext('mobile')
    setRuntimeCapabilities({platform: 'android', mobile: true})

    const rail = await renderRail()
    const text = rail.shadowRoot?.textContent ?? ''

    expect(text).not.toContain('⌘K')
    expect(text).not.toContain('⌘L')
    expect(text).not.toContain('Ctrl+K')
    expect(text).not.toContain('Ctrl+L')
  })

  it('disables the lock action while a vault lock request is pending', async () => {
    setupContext('mobile')
    getAppContext().store.vaultLockPending.set(true)

    const rail = await renderRail()
    const lockButton = Array.from(rail.shadowRoot?.querySelectorAll('cv-button.item') ?? []).find((button) =>
      (button.textContent ?? '').includes('Lock'),
    )

    expect(lockButton?.hasAttribute('disabled')).toBe(true)
    expect(lockButton?.getAttribute('aria-busy')).toBe('true')
  })

  it('locks the vault through the global platform shortcut when focus is not editable', async () => {
    setupContext('desktop')
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    tauriInvoke.mockResolvedValue({ok: true, result: null})
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const event = createKeyEvent('l', {code: 'KeyL', ctrlKey: true})

    model.handleKeydown(event, () => false)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith('rpc_dispatch', {
        args: {v: 1, command: 'vault:lock', data: {}},
      })
    })
  })

  it('does not lock the vault from desktop shortcuts on Android', async () => {
    setupContext('mobile')
    setRuntimeCapabilities({platform: 'android', mobile: true})
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const event = createKeyEvent('l', {code: 'KeyL', ctrlKey: true})

    model.handleKeydown(event, () => false)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('does not lock the vault while an editable element is focused', () => {
    setupContext('desktop')
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const model = new ChromVoidAppModel(
      () => {},
      async () => {},
    )
    const event = createKeyEvent('l', {code: 'KeyL', metaKey: true})

    model.handleKeydown(event, () => false)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(tauriInvoke).not.toHaveBeenCalled()
  })
})
