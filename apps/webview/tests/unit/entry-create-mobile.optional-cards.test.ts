import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../../src/features/passmanager/service/passmanager-ssh-keygen', () => ({
  passmanagerSshKeygen: vi.fn(),
}))

import {CVInput, CVSwitch, CVTextarea} from '@chromvoid/uikit'
import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'
import {
  PMEntryOTPCreate,
  PMEntryOTPCreateSheet,
} from '../../src/features/passmanager/components/card/entry-otp-create'
import {PMEntrySshCreateSheet} from '../../src/features/passmanager/components/card/entry-ssh/entry-ssh-create-sheet'
import {passmanagerSshKeygen} from '../../src/features/passmanager/service/passmanager-ssh-keygen'

const settle = async (component: PMEntryCreateMobile) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

const getOptionalCards = (component: PMEntryCreateMobile) =>
  Array.from(component.shadowRoot?.querySelectorAll('.optional-card') ?? []) as HTMLElement[]

const getCardSwitch = (card: HTMLElement) => card.querySelector('cv-switch') as CVSwitch | null

const clickCardSwitch = async (component: PMEntryCreateMobile, sw: CVSwitch) => {
  const control = sw.shadowRoot?.querySelector('[part="control"]') as HTMLElement | null
  expect(control).not.toBeNull()
  control?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
  await component.updateComplete
  await Promise.resolve()
  await sw.updateComplete
  await component.updateComplete
}

const getOtpSheet = (component: PMEntryCreateMobile) =>
  component.shadowRoot?.querySelector('pm-entry-otp-create-sheet') as
    | (HTMLElement & {shadowRoot?: ShadowRoot | null; updateComplete?: Promise<unknown>})
    | null

const getSshSheet = (component: PMEntryCreateMobile) =>
  component.shadowRoot?.querySelector('pm-entry-ssh-create-sheet') as
    | (HTMLElement & {shadowRoot?: ShadowRoot | null; updateComplete?: Promise<unknown>})
    | null

const setCreateFormReady = (component: PMEntryCreateMobile) => {
  const model = (component as PMEntryCreateMobile & {
    model: {
      setTitle(value: string): void
      setUsername(value: string): void
      setPassword(value: string): void
    }
  }).model
  model.setTitle('OpenAI')
  model.setUsername('user@example.com')
  model.setPassword('secret-password')
}

describe('PMEntryCreateMobile optional cards', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    vi.mocked(passmanagerSshKeygen).mockReset()
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
    } as unknown as typeof window.passmanager

    CVInput.define()
    CVSwitch.define()
    CVTextarea.define()
    PMEntryOTPCreate.define()
    PMEntryOTPCreateSheet.define()
    PMEntrySshCreateSheet.define()
    PMEntryCreateMobile.define()

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    vi.restoreAllMocks()
  })

  it('renders OPTIONAL group with three collapsed cards in order', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const group = component.shadowRoot?.querySelector('.optional-group')
    expect(group).not.toBeNull()

    const groupLabel = group?.querySelector('.section-label')?.textContent?.trim()
    expect(groupLabel?.toLowerCase()).toContain('optional')

    const cards = getOptionalCards(component)
    expect(cards).toHaveLength(3)
    expect(cards.every((card) => card.getAttribute('data-open') === 'false')).toBe(true)

    const titles = cards.map((card) => card.querySelector('.optional-card-title')?.textContent?.trim())
    expect(titles[0]?.toLowerCase()).toContain('otp')
    expect(titles[1]?.toLowerCase()).toContain('ssh')
    expect(titles[2]?.toLowerCase()).toContain('note')
  })

  it('hides each card body until its switch is toggled on', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const cards = getOptionalCards(component)
    expect(cards).toHaveLength(3)

    for (const card of cards) {
      const body = card.querySelector('.optional-card-body') as HTMLElement
      expect(body.hasAttribute('hidden')).toBe(true)
    }
  })

  it('opens the OTP setup sheet when its switch is clicked', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const [otpCard] = getOptionalCards(component)
    expect(otpCard).not.toBeUndefined()
    const sw = getCardSwitch(otpCard!)
    expect(sw).not.toBeNull()

    expect(otpCard!.getAttribute('data-open')).toBe('false')
    expect(component.shadowRoot?.querySelector('pm-entry-otp-create')).toBeNull()

    await clickCardSwitch(component, sw!)
    const otpSheet = getOtpSheet(component)
    await otpSheet?.updateComplete

    expect(otpCard!.getAttribute('data-open')).toBe('false')
    expect(otpSheet?.hasAttribute('open')).toBe(true)
    const otpForm = otpSheet?.shadowRoot?.querySelector('pm-entry-otp-create') as
      | (HTMLElement & {layout?: string})
      | null
    expect(otpForm).not.toBeNull()
    expect(otpForm?.getAttribute('layout')).toBe('card')
  })

  it('does not close the OTP sheet from surface focus changes while native QR scan is active', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const [otpCard] = getOptionalCards(component)
    const sw = getCardSwitch(otpCard!)!
    await clickCardSwitch(component, sw)

    const model = (component as PMEntryCreateMobile & {
      model: {
        otp: {setQrScannerScanning(value: boolean): void}
        otpSheetOpen(): boolean
      }
    }).model
    model.otp.setQrScannerScanning(true)
    await settle(component)

    const otpSheet = getOtpSheet(component)
    await otpSheet?.updateComplete
    const surface = otpSheet?.shadowRoot?.querySelector('adaptive-modal-surface') as HTMLElement | null
    surface?.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
    await settle(component)

    expect(model.otpSheetOpen()).toBe(true)
    expect(otpSheet?.hasAttribute('open')).toBe(true)
  })

  it('enables OTP after a valid Done action in the sheet', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const [otpCard] = getOptionalCards(component)
    const sw = getCardSwitch(otpCard!)!
    await clickCardSwitch(component, sw)

    const model = (component as PMEntryCreateMobile & {
      model: {
        otp: {setSecret(value: string): void}
      }
    }).model
    model.otp.setSecret('JBSWY3DPEHPK3PXP')
    await settle(component)

    const otpSheet = getOtpSheet(component)
    await otpSheet?.updateComplete
    const primary = otpSheet?.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    primary?.click()
    await settle(component)

    expect(otpSheet?.hasAttribute('open')).toBe(false)
    const [updatedOtpCard] = getOptionalCards(component)
    expect(updatedOtpCard!.getAttribute('data-open')).toBe('true')
    expect(updatedOtpCard!.querySelector('.otp-summary')).not.toBeNull()
  })

  it('removes OTP from create submit when the optional card is disabled', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
      createEntry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    setCreateFormReady(component)

    const model = (component as PMEntryCreateMobile & {
      model: {
        otp: {setSecret(value: string): void}
        confirmOtpSheet(): boolean
        disableOtp(): void
        submit(): Promise<{ok: boolean}>
      }
    }).model
    model.otp.setSecret('JBSWY3DPEHPK3PXP')
    expect(model.confirmOtpSheet()).toBe(true)
    model.disableOtp()

    const result = await model.submit()

    expect(result.ok).toBe(true)
    expect(createEntry).toHaveBeenCalledWith(
      expect.any(Object),
      'secret-password',
      '',
      undefined,
    )
  })

  it('blocks create submit when OTP is enabled with an invalid secret', async () => {
    const createEntry = vi.fn()
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
      createEntry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    setCreateFormReady(component)

    const model = (component as PMEntryCreateMobile & {
      model: {
        setUseOtp(value: boolean): void
        otp: {setSecret(value: string): void}
        submit(): Promise<{ok: boolean; reason?: string}>
      }
    }).model
    model.setUseOtp(true)
    model.otp.setSecret('JBSW ???')

    const result = await model.submit()

    expect(result).toMatchObject({ok: false, reason: 'invalid_otp'})
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('opens the SSH setup sheet when its switch is clicked', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const sshCard = getOptionalCards(component)[1]!
    const sw = getCardSwitch(sshCard)!
    await clickCardSwitch(component, sw)

    const sshSheet = getSshSheet(component)
    await sshSheet?.updateComplete

    expect(sshCard.getAttribute('data-open')).toBe('false')
    expect(sshSheet?.hasAttribute('open')).toBe(true)
    const sshForm = sshSheet?.shadowRoot?.querySelector('pm-entry-ssh-create') as
      | (HTMLElement & {layout?: string})
      | null
    expect(sshForm).not.toBeNull()
    expect(sshForm?.getAttribute('layout')).toBe('sheet')
  })

  it('enables SSH after a valid Done action in the sheet', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const sshCard = getOptionalCards(component)[1]!
    await clickCardSwitch(component, getCardSwitch(sshCard)!)

    const sshSheet = getSshSheet(component)
    await sshSheet?.updateComplete
    const primary = sshSheet?.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    primary?.click()
    await settle(component)

    expect(sshSheet?.hasAttribute('open')).toBe(false)
    const updatedSshCard = getOptionalCards(component)[1]!
    expect(updatedSshCard.getAttribute('data-open')).toBe('true')
    expect(updatedSshCard.querySelector('.ssh-summary')).not.toBeNull()
  })

  it('generates configured SSH after the entry is created', async () => {
    const updateSshKeys = vi.fn(async () => {})
    const entry = {
      id: 'entry-with-ssh',
      flushPendingPersistence: vi.fn(async () => {}),
      updateSshKeys,
    }
    const createEntry = vi.fn(() => entry)
    vi.mocked(passmanagerSshKeygen).mockResolvedValue({
      key_id: 'ssh-1',
      public_key_openssh: 'ssh-ed25519 AAAA OpenAI',
      fingerprint: 'SHA256:ssh',
      key_type: 'ed25519',
    })
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
      createEntry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    setCreateFormReady(component)

    const model = (component as PMEntryCreateMobile & {
      model: {
        openSshSheet(): void
        confirmSshSheet(): boolean
        submit(): Promise<{ok: boolean}>
      }
    }).model
    model.openSshSheet()
    expect(model.confirmSshSheet()).toBe(true)

    const result = await model.submit()

    expect(result.ok).toBe(true)
    expect(passmanagerSshKeygen).toHaveBeenCalledWith({
      entryId: 'entry-with-ssh',
      keyType: 'ed25519',
      comment: 'user@example.com@OpenAI',
    })
    expect(updateSshKeys).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'ssh-1',
        type: 'ed25519',
        fingerprint: 'SHA256:ssh',
        name: 'OpenAI SSH',
        comment: 'user@example.com@OpenAI',
      }),
    ])
  })

  it('does not generate SSH after the optional card is disabled', async () => {
    const updateSshKeys = vi.fn(async () => {})
    const entry = {
      id: 'entry-without-ssh',
      flushPendingPersistence: vi.fn(async () => {}),
      updateSshKeys,
    }
    const createEntry = vi.fn(() => entry)
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
      showElement: () => null,
      createEntry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    setCreateFormReady(component)

    const model = (component as PMEntryCreateMobile & {
      model: {
        openSshSheet(): void
        confirmSshSheet(): boolean
        disableSsh(): void
        submit(): Promise<{ok: boolean}>
      }
    }).model
    model.openSshSheet()
    expect(model.confirmSshSheet()).toBe(true)
    model.disableSsh()

    const result = await model.submit()

    expect(result.ok).toBe(true)
    expect(passmanagerSshKeygen).not.toHaveBeenCalled()
    expect(updateSshKeys).not.toHaveBeenCalled()
  })

  it('toggles Notes card open and reveals a textarea bound to note state', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    const noteCard = getOptionalCards(component)[2]!
    const body = noteCard.querySelector('.optional-card-body') as HTMLElement
    expect(body.hasAttribute('hidden')).toBe(true)

    const sw = getCardSwitch(noteCard)!
    await clickCardSwitch(component, sw)

    expect(noteCard.getAttribute('data-open')).toBe('true')
    expect(body.hasAttribute('hidden')).toBe(false)
    expect(noteCard.querySelector('cv-textarea[name="note"]')).not.toBeNull()
  })
})
