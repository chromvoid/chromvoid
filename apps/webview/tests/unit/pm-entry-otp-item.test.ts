import {atom} from '@reatom/core'
import type {OTP} from '@project/passmanager/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMEntryOTPItem} from '../../src/features/passmanager/components/card/pm-entry-otp-item'

let defined = false

function ensureDefined() {
  if (defined) {
    return
  }

  PMEntryOTPItem.define()
  defined = true
}

function createOtp(id: string, label: string, code = '123456'): OTP {
  let visible = false

  return {
    id,
    data: {
      id,
      label,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      encoding: 'base32',
      type: 'TOTP',
      counter: 0,
    },
    type: atom<'TOTP'>('TOTP'),
    currentOtp: () => undefined,
    isShow: () => visible,
    show: vi.fn(() => {
      visible = true
    }),
    hide: vi.fn(() => {
      visible = false
    }),
    loadCode: vi.fn(async () => code),
    leftSeconds: 30,
    otpLeftPercent: 100,
  } as unknown as OTP
}

function installClipboardInvokeSpy() {
  const invoke = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke},
  })
  return invoke
}

async function settle(element: PMEntryOTPItem) {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

async function waitForCondition(check: () => void, attempts = 10) {
  let lastError: unknown
  for (let index = 0; index < attempts; index += 1) {
    try {
      check()
      return
    } catch (error) {
      lastError = error
      await flushMicrotasks()
    }
  }

  throw lastError
}

function getCodeText(element: PMEntryOTPItem): string {
  const item = element.shadowRoot?.querySelector('pm-entry-totp-item')
  const digits = item?.shadowRoot?.querySelectorAll('.totp-digit')
  if (!digits) return ''

  return Array.from(digits)
    .map((digit) => digit.textContent?.trim() ?? '')
    .join('')
}

afterEach(() => {
  document.body.innerHTML = ''
  delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
  vi.restoreAllMocks()
})

describe('PMEntryOTPItem', () => {
  it('renders remove action only when removable is enabled', async () => {
    ensureDefined()

    const element = document.createElement('pm-entry-otp-item') as PMEntryOTPItem
    element.otp = createOtp('otp-1', 'Main')
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.otp-remove-action')).toBeNull()

    element.removable = true
    await settle(element)

    expect(element.shadowRoot?.querySelector('.otp-remove-action')).not.toBeNull()
  })

  it('dispatches pm-entry-otp-remove with otpId from the component boundary', async () => {
    ensureDefined()

    const wrapper = document.createElement('div')
    const listener = vi.fn()
    wrapper.addEventListener('pm-entry-otp-remove', listener)

    const element = document.createElement('pm-entry-otp-item') as PMEntryOTPItem
    element.otp = createOtp('otp-42', 'Backup')
    element.removable = true
    wrapper.append(element)
    document.body.append(wrapper)
    await settle(element)

    const button = element.shadowRoot?.querySelector('.otp-remove-action') as HTMLButtonElement | null
    expect(button).not.toBeNull()

    button?.click()

    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0]?.[0] as CustomEvent<{otpId: string}>).detail).toEqual({otpId: 'otp-42'})
  })

  it('does not copy the TOTP code when the remove action is clicked', async () => {
    ensureDefined()
    const invoke = installClipboardInvokeSpy()
    const listener = vi.fn()

    const element = document.createElement('pm-entry-otp-item') as PMEntryOTPItem
    element.addEventListener('pm-entry-otp-remove', listener)
    element.otp = createOtp('otp-99', 'Removable', '999000')
    element.removable = true
    document.body.append(element)
    await settle(element)

    const button = element.shadowRoot?.querySelector('.otp-remove-action') as HTMLButtonElement | null
    button?.click()
    await Promise.resolve()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not hide a pending TOTP when the same OTP is assigned again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    ensureDefined()
    const otp = createOtp('otp-pending', 'Pending', '246810')
    let resolveCode!: (value: string) => void
    vi.mocked(otp.loadCode).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveCode = resolve
        }),
    )

    const element = document.createElement('pm-entry-otp-item') as PMEntryOTPItem
    element.otp = otp
    document.body.append(element)
    await settle(element)

    element.otp = otp
    resolveCode('246810')
    await settle(element)

    await waitForCondition(() => {
      expect(getCodeText(element)).toBe('246810')
    })
  })
})
