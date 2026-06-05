import type {OTP} from '@project/passmanager'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMEntryTOTPItem} from '../../src/features/passmanager/components/card/pm-entry-totp-item'
import {PMEntryTOTPItemModel} from '../../src/features/passmanager/components/card/pm-entry-totp-item/pm-entry-totp-item.model'

let defined = false

type TestOTP = {
  data: OTP['data']
  isShow: () => boolean
  show: () => void
  hide: () => void
  loadCode: (counter?: number) => Promise<string>
  currentOtp: () => string | undefined
  leftSeconds: number
  otpLeftPercent: number
}

function ensureDefined() {
  if (defined) return
  PMEntryTOTPItem.define()
  defined = true
}

function getCodeText(el: PMEntryTOTPItem): string {
  const digits = el.shadowRoot?.querySelectorAll('.totp-digit')
  if (!digits) return ''
  return Array.from(digits)
    .map((digit) => digit.textContent?.trim() ?? '')
    .join('')
}

function getDigitGroupSizes(el: PMEntryTOTPItem): number[] {
  const groups = el.shadowRoot?.querySelectorAll('.totp-digit-group')
  if (!groups) return []

  return Array.from(groups).map((group) => group.querySelectorAll('.totp-digit').length)
}

function getDigitNodes(el: PMEntryTOTPItem): HTMLElement[] {
  return Array.from(el.shadowRoot?.querySelectorAll('.totp-digit') ?? []) as HTMLElement[]
}

function getTotpCard(el: PMEntryTOTPItem): HTMLElement | null {
  return el.shadowRoot?.querySelector('.totp-card') as HTMLElement | null
}

function getLabelText(el: PMEntryTOTPItem): string {
  return el.shadowRoot?.querySelector('.totp-label')?.textContent?.trim() ?? ''
}

function getFeedbackText(el: PMEntryTOTPItem): string {
  return el.shadowRoot?.querySelector('.totp-feedback')?.textContent?.trim() ?? ''
}

function getFeedbackMotionNode(el: PMEntryTOTPItem): HTMLElement | null {
  return el.shadowRoot?.querySelector('.totp-feedback .motion-text-swap') as HTMLElement | null
}

function installClipboardInvokeSpy() {
  const invoke = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke},
  })
  return invoke
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

function createOTPFixture({code = '123456', leftSeconds = 30, period = 30} = {}): TestOTP {
  let visible = false
  let current: string | undefined

  return {
    data: {
      id: 'otp-id',
      label: 'Primary',
      period,
      digits: 6,
      algorithm: 'SHA1',
      encoding: 'base32',
      type: 'TOTP',
    },
    isShow: () => visible,
    show: vi.fn(() => {
      visible = true
    }),
    hide: vi.fn(() => {
      visible = false
    }),
    loadCode: vi.fn(async () => {
      current = code
      return code
    }),
    currentOtp: () => current,
    leftSeconds,
    otpLeftPercent: Math.round((leftSeconds / period) * 100),
  } as TestOTP
}

describe('PMEntryTOTPItem', () => {
  afterEach(() => {
    document.querySelectorAll('pm-entry-totp-item').forEach((el) => el.remove())
    delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows OTP code after connect without pressing a reveal control', async () => {
    ensureDefined()
    const otp = createOTPFixture({code: '654321'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    await flushMicrotasks()
    await item.updateComplete

    expect(otp.show).toHaveBeenCalledTimes(1)
    expect(otp.loadCode).toHaveBeenCalledTimes(1)
    await waitForCondition(() => {
      expect(getCodeText(item)).toBe('654321')
    })
  })

  it('does not render separate show or copy buttons in read mode', async () => {
    ensureDefined()
    const otp = createOTPFixture({code: '123456'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    expect(item.shadowRoot?.querySelector('.totp-actions cv-button')).toBeNull()
    expect(item.shadowRoot?.querySelector('cv-copy-button')).toBeNull()
  })

  it('renders a compact label for the OTP card', async () => {
    ensureDefined()
    const otp = createOTPFixture({code: '123456'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    expect(item.shadowRoot?.querySelector('.totp-card')).toBeTruthy()
    expect(getLabelText(item)).toBe('Primary')
  })

  it('renders balanced digit groups for the live OTP code', async () => {
    ensureDefined()
    const otp = createOTPFixture({code: '123456'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete
    await flushMicrotasks()
    await item.updateComplete

    await waitForCondition(() => {
      expect(getDigitGroupSizes(item)).toEqual([3, 3])
    })
  })

  it('replaces digit nodes only when the OTP code value changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    ensureDefined()
    const otp = createOTPFixture({period: 30})
    let calls = 0
    let current = ''
    otp.loadCode = vi.fn(async () => {
      current = calls === 0 ? '111222' : '333444'
      calls += 1
      return current
    })
    otp.currentOtp = () => current
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete
    await flushMicrotasks()
    await item.updateComplete

    await waitForCondition(() => {
      expect(getCodeText(item)).toBe('111222')
    })
    const firstDigit = getDigitNodes(item)[0]

    await vi.advanceTimersByTimeAsync(1_000)
    await item.updateComplete
    expect(getCodeText(item)).toBe('111222')
    expect(getDigitNodes(item)[0]).toBe(firstDigit)

    await vi.advanceTimersByTimeAsync(29_100)
    await flushMicrotasks()
    await waitForCondition(() => {
      expect(getCodeText(item)).toBe('333444')
    })
    expect(getDigitNodes(item)[0]).not.toBe(firstDigit)
  })

  it('copies from the card click and shows copied feedback', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    ensureDefined()
    const invoke = installClipboardInvokeSpy()
    const otp = createOTPFixture({code: '111222'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete
    await flushMicrotasks()
    await item.updateComplete
    await waitForCondition(() => {
      expect(getCodeText(item)).toBe('111222')
    })
    const idleFeedbackNode = getFeedbackMotionNode(item)
    expect(idleFeedbackNode?.textContent?.trim()).toBe('Tap to copy')

    getTotpCard(item)?.click()
    await flushMicrotasks()
    await item.updateComplete

    expect(invoke).toHaveBeenCalledWith(
      'plugin:clipboard-manager|write_text',
      expect.objectContaining({text: '111222'}),
    )
    await waitForCondition(() => {
      expect(getFeedbackText(item)).toBe('Copied')
    })
    const copiedFeedbackNode = getFeedbackMotionNode(item)
    expect(copiedFeedbackNode).not.toBe(idleFeedbackNode)

    await vi.advanceTimersByTimeAsync(1500)
    await item.updateComplete

    expect(getFeedbackText(item)).toBe('Tap to copy')
    expect(getFeedbackMotionNode(item)).not.toBe(copiedFeedbackNode)
  })

  it('renders the copied code when copy finishes before the visible refresh', async () => {
    ensureDefined()
    installClipboardInvokeSpy()
    const otp = createOTPFixture({code: '333444'})
    let calls = 0
    otp.loadCode = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return new Promise<string>(() => {})
      }

      return '333444'
    })
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete
    expect(getCodeText(item)).toBe('')

    getTotpCard(item)?.click()
    await flushMicrotasks()
    await item.updateComplete

    await waitForCondition(() => {
      expect(getCodeText(item)).toBe('333444')
    })
  })

  it('retries the initial visible code when the TOTP slot changes during load', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:29.990Z'))
    const model = new PMEntryTOTPItemModel()
    const otp = createOTPFixture({code: '111222'})
    let calls = 0
    otp.loadCode = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        vi.setSystemTime(new Date('2026-01-01T00:00:30.010Z'))
        return '111222'
      }

      return '333444'
    })

    model.actions.setOtp(otp as OTP)
    model.actions.connect()

    await waitForCondition(() => {
      expect(model.state.view()?.codeText).toBe('333 444')
    })
    expect(otp.loadCode).toHaveBeenCalledTimes(2)

    model.actions.disconnect()
  })

  it.each(['Enter', ' '])('copies from the card on %s', async (key) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    ensureDefined()
    const invoke = installClipboardInvokeSpy()
    const otp = createOTPFixture({code: '333444'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete
    await flushMicrotasks()
    await item.updateComplete

    const event = new KeyboardEvent('keydown', {key, bubbles: true, composed: true, cancelable: true})
    getTotpCard(item)?.dispatchEvent(event)
    await flushMicrotasks()
    await item.updateComplete

    expect(event.defaultPrevented).toBe(true)
    expect(invoke).toHaveBeenCalledWith(
      'plugin:clipboard-manager|write_text',
      expect.objectContaining({text: '333444'}),
    )
  })

  it('ignores clicks from slotted OTP actions', async () => {
    ensureDefined()
    const invoke = installClipboardInvokeSpy()
    const otp = createOTPFixture({code: '555666'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    const action = document.createElement('button')
    action.slot = 'otp-action'
    action.textContent = 'Remove'
    item.otp = otp as OTP
    item.append(action)

    document.body.appendChild(item)
    await item.updateComplete
    await flushMicrotasks()
    await item.updateComplete
    const loadCount = vi.mocked(otp.loadCode).mock.calls.length

    action.click()
    await flushMicrotasks()
    await item.updateComplete

    expect(vi.mocked(otp.loadCode).mock.calls.length).toBe(loadCount)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not mark TOTP card urgent when more than 50% time remains', async () => {
    ensureDefined()
    const otp = createOTPFixture({leftSeconds: 16, period: 30})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    const card = getTotpCard(item)
    expect(card).toBeTruthy()
    expect(card?.hasAttribute('data-urgent')).toBe(false)
  })

  it('does not mark TOTP card urgent between 50% and 20% time remaining', async () => {
    ensureDefined()
    const otp = createOTPFixture({leftSeconds: 15, period: 30})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    const card = getTotpCard(item)
    expect(card).toBeTruthy()
    expect(card?.hasAttribute('data-urgent')).toBe(false)
  })

  it('marks TOTP card urgent below 5 seconds', async () => {
    ensureDefined()
    const otp = createOTPFixture({leftSeconds: 4, period: 30})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    const card = getTotpCard(item)
    expect(card).toBeTruthy()
    expect(card?.hasAttribute('data-urgent')).toBe(true)
  })

  it('stops polling after disconnect', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const model = new PMEntryTOTPItemModel()
    const otp = createOTPFixture({code: '654321'})

    model.actions.setOtp(otp as unknown as OTP)
    model.actions.connect()
    await Promise.resolve()

    expect(otp.loadCode).toHaveBeenCalledTimes(1)

    model.actions.disconnect()
    vi.advanceTimersByTime(5000)
    await Promise.resolve()

    expect(otp.loadCode).toHaveBeenCalledTimes(1)
  })

  it('does not reload TOTP code again before the next slot boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const model = new PMEntryTOTPItemModel()
    const otp = createOTPFixture({code: '654321', period: 30})

    model.actions.setOtp(otp as unknown as OTP)
    model.actions.connect()
    await flushMicrotasks()

    expect(otp.loadCode).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    await flushMicrotasks()

    expect(otp.loadCode).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(25_100)
    await flushMicrotasks()

    expect(otp.loadCode).toHaveBeenCalledTimes(2)
  })

  it('ignores stale slot completions once a newer slot has loaded', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:29Z'))

    const model = new PMEntryTOTPItemModel()
    let visible = false
    let current: string | undefined
    let firstResolve!: (value: string) => void
    let secondResolve!: (value: string) => void
    let loadCount = 0

    const otp = {
      id: 'otp-stale',
      data: {
        id: 'otp-stale',
        label: 'Primary',
        period: 30,
        digits: 6,
        algorithm: 'SHA1',
        encoding: 'base32',
        type: 'TOTP',
      },
      isShow: () => visible,
      show: vi.fn(() => {
        visible = true
      }),
      hide: vi.fn(() => {
        visible = false
      }),
      loadCode: vi.fn(() => {
        loadCount += 1
        return new Promise<string>((resolve) => {
          if (loadCount === 1) {
            firstResolve = (value) => {
              current = value
              resolve(value)
            }
            return
          }

          secondResolve = (value) => {
            current = value
            resolve(value)
          }
        })
      }),
      currentOtp: () => current,
      get leftSeconds() {
        const period = 30
        return Math.round(period - ((Date.now() / 1000) % period))
      },
      otpLeftPercent: 100,
    } as unknown as OTP

    model.actions.setOtp(otp)
    model.actions.connect()
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(1_100)
    await waitForCondition(() => {
      expect(typeof secondResolve).toBe('function')
    })

    secondResolve('222222')
    await flushMicrotasks()
    await waitForCondition(() => {
      const freshView = model.state.view()
      expect(freshView?.codeText).toBe('222 222')
    })

    firstResolve('111111')
    await flushMicrotasks()
    await waitForCondition(() => {
      const finalView = model.state.view()
      expect(finalView?.codeText).toBe('222 222')
    })
  })
})
