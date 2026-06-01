import {atom, type Atom} from '@reatom/core'
import {Entry, type OTP} from '@project/passmanager/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMEntryOTP} from '../../src/features/passmanager/components/card/pm-entry-otp'
import {PMEntryOTPModel} from '../../src/features/passmanager/components/card/pm-entry-otp.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

let defined = false

type ShowElementAtom = {
  (): unknown
  set(value: unknown): void
  emit?(): void
  subscribe?: (listener: () => void) => () => void
}

type SubscribedSignal<T> = {
  (): T
  set(value: T): void
  emit(): void
  subscribe(listener: () => void): () => void
  readonly subscribeCalls: number
  readonly unsubscribeCalls: number
}

function ensureDefined() {
  if (defined) {
    return
  }

  PMEntryOTP.define()
  defined = true
}

function createOtp(id: string, label: string): OTP {
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
    loadCode: vi.fn(async () => undefined),
    leftSeconds: 30,
    otpLeftPercent: 100,
  } as unknown as OTP
}

function createSubscribedSignal<T>(initialValue: T): SubscribedSignal<T> {
  let value = initialValue
  const listeners = new Set<() => void>()
  const signal = Object.assign(
    () => value,
    {
      subscribeCalls: 0,
      unsubscribeCalls: 0,
      set(nextValue: T) {
        value = nextValue
        for (const listener of listeners) {
          listener()
        }
      },
      emit() {
        for (const listener of listeners) {
          listener()
        }
      },
      subscribe(listener: () => void) {
        signal.subscribeCalls += 1
        listeners.add(listener)
        listener()
        return () => {
          signal.unsubscribeCalls += 1
          listeners.delete(listener)
        }
      },
    },
  )
  return signal
}

function createEntry(
  id: string,
  title: string,
  otps: OTP[] | SubscribedSignal<OTP[]>,
) {
  const entry = Object.create(Entry.prototype) as Entry
  Object.defineProperty(entry, 'id', {value: id, configurable: true, enumerable: true})
  Object.defineProperty(entry, 'title', {value: title, configurable: true, enumerable: true})
  ;(entry as Entry & {otps: Atom<OTP[]> | SubscribedSignal<OTP[]>}).otps = Array.isArray(otps) ? atom(otps) : otps
  return entry
}

function createWindowPassmanager(showElement: ShowElementAtom) {
  const root = {showElement}
  ;(window as any).passmanager = root
  setPassmanagerRoot(root as never)
}

function getOtpIds(element: PMEntryOTP): string[] {
  return Array.from(element.shadowRoot?.querySelectorAll('pm-entry-otp-item') ?? []).map((item) => {
    const otp = (item as HTMLElement & {otp?: OTP}).otp
    return otp?.id ?? ''
  })
}

afterEach(() => {
  document.querySelectorAll('pm-entry-otp').forEach((el) => el.remove())
  setPassmanagerRoot(undefined)
  delete (window as any).passmanager
  vi.restoreAllMocks()
})

describe('PMEntryOTP', () => {
  it('defines idempotently and renders the empty state when the active entry has no OTPs', async () => {
    ensureDefined()
    expect(() => PMEntryOTP.define()).not.toThrow()

    const entry = createEntry('entry-empty', 'Empty', [])
    const showElement = atom(entry)
    createWindowPassmanager(showElement)

    const element = document.createElement('pm-entry-otp') as PMEntryOTP
    document.body.appendChild(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.empty-state')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.otp-list')).toBeNull()
  })

  it('switches the rendered OTP list when showElement changes to another entry', async () => {
    ensureDefined()

    const entryA = createEntry('entry-a', 'Entry A', [createOtp('otp-a', 'Primary')])
    const entryB = createEntry('entry-b', 'Entry B', [createOtp('otp-b', 'Backup')])
    const showElement = atom<Entry | undefined>(entryA)
    createWindowPassmanager(showElement)

    const element = document.createElement('pm-entry-otp') as PMEntryOTP
    document.body.appendChild(element)
    await element.updateComplete

    expect(getOtpIds(element)).toEqual(['otp-a'])

    showElement.set(entryB)
    await Promise.resolve()
    await element.updateComplete

    expect(getOtpIds(element)).toEqual(['otp-b'])

    entryA.otps.set([createOtp('otp-a-next', 'Primary 2')])
    await Promise.resolve()
    await element.updateComplete

    expect(getOtpIds(element)).toEqual(['otp-b'])
  })

  it('disconnects from the active entry and stops reacting to later source changes', async () => {
    const entryA = createEntry('entry-a', 'Entry A', [createOtp('otp-a', 'Primary')])
    const entryB = createEntry('entry-b', 'Entry B', [createOtp('otp-b', 'Backup')])
    const showElement = atom<Entry | undefined>(entryA)
    createWindowPassmanager(showElement)

    const model = new PMEntryOTPModel()
    model.actions.connect()

    expect(model.state.entry()).toBe(entryA)
    expect(model.state.otps().map((otp) => otp.id)).toEqual(['otp-a'])

    showElement.set(entryB)
    await Promise.resolve()

    expect(model.state.entry()).toBe(entryB)
    expect(model.state.otps().map((otp) => otp.id)).toEqual(['otp-b'])

    model.actions.disconnect()

    showElement.set(entryA)
    entryB.otps.set([createOtp('otp-b-next', 'Backup 2')])
    await Promise.resolve()

    expect(model.state.entry()).toBeUndefined()
    expect(model.state.otps()).toEqual([])
  })

  it('suppresses duplicate OTP binding during initial and repeated same-entry sync', async () => {
    const otpsSignal = createSubscribedSignal<OTP[]>([createOtp('otp-a', 'Primary')])
    const entry = createEntry('entry-a', 'Entry A', otpsSignal)
    const showElement = createSubscribedSignal<Entry | undefined>(entry)
    createWindowPassmanager(showElement)

    const model = new PMEntryOTPModel()
    model.actions.connect()

    expect(otpsSignal.subscribeCalls).toBe(1)
    expect(otpsSignal.unsubscribeCalls).toBe(0)
    expect(model.state.entry()).toBe(entry)
    expect(model.state.otps().map((otp) => otp.id)).toEqual(['otp-a'])

    ;(model as PMEntryOTPModel & {syncFromShowElement: () => void}).syncFromShowElement()

    expect(otpsSignal.subscribeCalls).toBe(1)
    expect(otpsSignal.unsubscribeCalls).toBe(0)

    otpsSignal.set([createOtp('otp-b', 'Backup')])
    await Promise.resolve()

    expect(model.state.otps().map((otp) => otp.id)).toEqual(['otp-b'])
  })
})
