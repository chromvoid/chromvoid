import {html, render} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {renderDesktopUsbRemoteSession} from '../../src/routes/remote/remote-usb-session.render'
import type {DesktopUsbRemoteSessionPresentation} from '../../src/routes/remote/remote-usb-session.contract'

function session(
  overrides: Partial<DesktopUsbRemoteSessionPresentation> = {},
): DesktopUsbRemoteSessionPresentation {
  return {
    stage: 'waiting_host_unlock',
    host: {
      hostId: 'usb-host-1',
      label: 'OnePlus 13',
      platform: 'android',
      bridgeKind: 'android_aoa',
    },
    access: 'pending',
    writerLockHolder: null,
    sync: {
      state: 'synced',
      progress: null,
      lastSyncMs: 1_730_000_000_000,
      writerLock: null,
      errorMessage: null,
    },
    errorCode: null,
    errorText: null,
    switchingToLocal: false,
    ...overrides,
  }
}

function renderSession(
  value: DesktopUsbRemoteSessionPresentation,
  actions: {onRetryUsb?: () => void; onForgetUsb?: () => void} = {},
): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  render(
    html`${renderDesktopUsbRemoteSession({
      session: value,
      formatLastSyncTime: () => '12:00',
      onRequestWriteLock: vi.fn(),
      onReconnectUsb: vi.fn(),
      onRetryUsb: actions.onRetryUsb ?? vi.fn(),
      onForgetUsb: actions.onForgetUsb ?? vi.fn(),
      actionBusy: false,
      onUseLocal: vi.fn(),
    })}`,
    container,
  )
  return container
}

describe('desktop USB Remote session renderer', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('makes local host unlock the only next step without claiming write access', () => {
    const container = renderSession(session())

    expect(container.querySelector('[data-usb-session-stage="waiting_host_unlock"]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Open the vault on OnePlus 13')
    expect(container.textContent).toContain('Available after the phone is ready')
    expect(container.textContent).not.toContain('You have write access')
  })

  it('shows ready sync and write access in the same status surface', () => {
    const container = renderSession(session({stage: 'ready', access: 'write'}))

    expect(container.textContent).toContain('Remote vault is ready')
    expect(container.textContent).toContain('Vault open')
    expect(container.textContent).toContain('You have write access')
    expect(container.textContent).toContain('Last sync: 12:00')
    expect(container.textContent).toContain('Disconnect USB and use Local')
  })

  it('shows the writer holder and request action for a ready read-only session', () => {
    const container = renderSession(
      session({stage: 'ready', access: 'read_only', writerLockHolder: 'Office Mac'}),
    )

    expect(container.textContent).toContain('Write locked by Office Mac')
    expect(container.textContent).toContain('Request Lock')
  })

  it('announces cable loss as an alert with recovery actions', () => {
    const container = renderSession(session({stage: 'connection_lost'}))

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('USB connection lost')
    expect(alert?.getAttribute('aria-live')).toBe('assertive')
    expect(container.textContent).toContain('Reconnect via USB')
    expect(container.textContent).toContain('Use Local')
    expect(container.textContent).toContain('Not connected')
    expect(container.textContent).toContain('Unavailable while disconnected')
  })

  it('explains a silent phone and offers retry and forgetting as separate user actions', () => {
    const retry = vi.fn()
    const forget = vi.fn()
    const container = renderSession(
      session({stage: 'error', errorCode: 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING'}),
      {onRetryUsb: retry, onForgetUsb: forget},
    )
    const alert = container.querySelector('[role="alert"]')
    const buttons = Array.from(alert?.querySelectorAll<HTMLElement>('cv-button') ?? [])

    expect(alert?.textContent).toContain('The phone did not answer')
    expect(alert?.textContent).toContain('If ChromVoid was reinstalled or replaced on the phone')
    expect(retry).not.toHaveBeenCalled()
    expect(forget).not.toHaveBeenCalled()
    buttons.find((button) => button.textContent?.includes('Try again'))?.click()
    buttons.find((button) => button.textContent?.includes('Forget phone'))?.click()

    expect(retry).toHaveBeenCalledOnce()
    expect(forget).toHaveBeenCalledOnce()
  })

  it('keeps retry available without offering to forget an unknown silent phone', () => {
    const retry = vi.fn()
    const forget = vi.fn()
    const container = renderSession(
      session({stage: 'error', host: null, errorCode: 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING'}),
      {onRetryUsb: retry, onForgetUsb: forget},
    )
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('cv-button'))

    expect(container.querySelector('h2')?.textContent).toBe('Phone')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('The phone did not answer')
    expect(container.textContent).not.toContain('OnePlus 13')
    expect(container.textContent).not.toContain('usb-host-1')
    expect(container.textContent).not.toContain('Android')
    expect(container.textContent).not.toContain('Forget phone')
    buttons.find((button) => button.textContent?.includes('Try again'))?.click()

    expect(retry).toHaveBeenCalledOnce()
    expect(forget).not.toHaveBeenCalled()
  })

  it.each(['ERR_USB_MOBILE_HANDSHAKE_FAILED', 'ERR_USB_MOBILE_STALE_PAIRING'] as const)(
    'preserves the existing session recovery for %s',
    (errorCode) => {
      const container = renderSession(session({stage: 'error', errorCode}))

      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'USB connection needs attention',
      )
      expect(container.textContent).toContain('Reconnect via USB')
      expect(container.textContent).not.toContain('The phone did not answer')
    },
  )
})
