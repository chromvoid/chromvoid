import type {OTP} from '@project/passmanager'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMEntryTOTPItem} from '../../src/features/passmanager/components/card/pm-entry-totp-item'
import {PMEntryTOTPItemMobile} from '../../src/features/passmanager/components/card/pm-entry-totp-item/pm-entry-totp-item-mobile'

let defined = false

type TestOTP = {
  data: OTP['data']
  isShow: () => boolean
  show: () => void
  hide: () => void
  loadCode: () => Promise<string>
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

function getTotpCard(el: PMEntryTOTPItem): HTMLElement | null {
  return el.shadowRoot?.querySelector('.totp-card') as HTMLElement | null
}

function getLabelText(el: PMEntryTOTPItem): string {
  return el.shadowRoot?.querySelector('.totp-label-text')?.textContent?.trim() ?? ''
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
    vi.restoreAllMocks()
  })

  it('reveals OTP code after pressing eye toggle', async () => {
    ensureDefined()
    const otp = createOTPFixture({code: '654321'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    expect(getCodeText(item)).toBe('••••••')

    const toggle = item.shadowRoot?.querySelector('.totp-actions cv-button') as HTMLElement | null
    expect(toggle).toBeTruthy()
    toggle?.click()

    await Promise.resolve()
    await item.updateComplete

    expect(otp.show).toHaveBeenCalledTimes(1)
    expect(otp.loadCode).toHaveBeenCalledTimes(1)
    expect(getCodeText(item)).toBe('654321')
  })

  it('renders a compact label row for the OTP card', async () => {
    ensureDefined()
    const otp = createOTPFixture({code: '123456'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    expect(item.shadowRoot?.querySelector('.totp-header')).toBeTruthy()
    expect(getLabelText(item)).toBe('Primary')
  })

  it('hides OTP code after second toggle press', async () => {
    ensureDefined()
    const otp = createOTPFixture({code: '111222'})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    const toggle = item.shadowRoot?.querySelector('.totp-actions cv-button') as HTMLElement | null
    expect(toggle).toBeTruthy()

    toggle?.click()
    await Promise.resolve()
    await item.updateComplete
    expect(getCodeText(item)).toBe('111222')

    toggle?.click()
    await Promise.resolve()
    await item.updateComplete

    expect(otp.hide).toHaveBeenCalledTimes(1)
    expect(getCodeText(item)).toBe('••••••')
  })

  it('uses green color when more than 50% time remains', async () => {
    ensureDefined()
    const otp = createOTPFixture({leftSeconds: 16, period: 30})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    const card = getTotpCard(item)
    expect(card).toBeTruthy()
    expect(item.style.getPropertyValue('--totp-color').trim()).toBe('var(--cv-color-success)')
    expect(card?.hasAttribute('data-urgent')).toBe(false)
  })

  it('uses warning color between 50% and 20% time remaining', async () => {
    ensureDefined()
    const otp = createOTPFixture({leftSeconds: 15, period: 30})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    const card = getTotpCard(item)
    expect(card).toBeTruthy()
    expect(item.style.getPropertyValue('--totp-color').trim()).toBe('var(--cv-color-warning)')
    expect(card?.hasAttribute('data-urgent')).toBe(false)
  })

  it('uses danger color and urgent state at 20% or less', async () => {
    ensureDefined()
    const otp = createOTPFixture({leftSeconds: 6, period: 30})
    const item = document.createElement('pm-entry-totp-item') as PMEntryTOTPItem
    item.otp = otp as OTP

    document.body.appendChild(item)
    await item.updateComplete

    const card = getTotpCard(item)
    expect(card).toBeTruthy()
    expect(item.style.getPropertyValue('--totp-color').trim()).toBe('var(--cv-color-danger)')
    expect(card?.hasAttribute('data-urgent')).toBe(true)
  })

  it('keeps mobile TOTP layout in a two-row grid with dedicated timer/actions areas', () => {
    const cssText = PMEntryTOTPItemMobile.styles.map((style) => style.cssText).join('\n')

    expect(cssText).toContain('grid-template-areas:')
    expect(cssText).toContain("'timer actions'")
    expect(cssText).toContain('--cv-copy-button-size: 32px;')
  })
})
