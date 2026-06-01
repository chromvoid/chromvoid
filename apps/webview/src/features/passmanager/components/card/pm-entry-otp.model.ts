import {action, atom} from '@reatom/core'

import {Entry, type OTP} from '@project/passmanager/core'
import {getPassmanagerRoot} from '../../models/pm-root.adapter'
import {subscribeToSignalChanges, type SubscribedSignal} from '../../service/subscribed-signal'

function isSubscribedSignal<T>(value: unknown): value is SubscribedSignal<T> {
  return typeof value === 'function'
}

export class PMEntryOTPModel {
  private readonly entryState = atom<Entry | undefined>(undefined, 'passmanager.entryOtp.entry')
  private readonly otpsState = atom<OTP[]>([], 'passmanager.entryOtp.otps')

  private showElementSource: SubscribedSignal<unknown> | undefined
  private otpsSource: SubscribedSignal<OTP[]> | undefined
  private showElementUnsubscribe: (() => void) | undefined
  private otpsUnsubscribe: (() => void) | undefined

  readonly state = {
    entry: this.entryState,
    otps: this.otpsState,
  }

  readonly actions = {
    connect: action(() => {
      this.attachShowElementSource()
      this.syncFromShowElement()
    }, 'passmanager.entryOtp.connect'),

    disconnect: action(() => {
      this.teardownShowElementSource()
      this.teardownOtpsSource()
      this.entryState.set(undefined)
      this.otpsState.set([])
    }, 'passmanager.entryOtp.disconnect'),
  }

  private getShowElementSignal(): SubscribedSignal<unknown> | undefined {
    return getPassmanagerRoot()?.showElement as SubscribedSignal<unknown> | undefined
  }

  private getCurrentEntry(): Entry | undefined {
    const showElement = this.getShowElementSignal()
    if (!showElement) {
      return undefined
    }

    const current = showElement()
    return current instanceof Entry ? current : undefined
  }

  private getOtpsSignal(entry: Entry): SubscribedSignal<OTP[]> | undefined {
    const otps = entry.otps as unknown as SubscribedSignal<OTP[]> | undefined
    return isSubscribedSignal<OTP[]>(otps) ? otps : undefined
  }

  private readOtps(entry: Entry): OTP[] {
    const otps = this.getOtpsSignal(entry)
    if (!otps) {
      return []
    }

    const current = otps()
    return Array.isArray(current) ? current : []
  }

  private attachShowElementSource(): void {
    const showElement = this.getShowElementSignal()
    if (showElement === this.showElementSource) {
      return
    }

    this.teardownShowElementSource()
    this.showElementSource = showElement
    if (typeof showElement !== 'function') {
      return
    }

    this.showElementUnsubscribe = subscribeToSignalChanges(showElement, () => {
      this.syncFromShowElement()
    })
  }

  private teardownShowElementSource(): void {
    this.showElementUnsubscribe?.()
    this.showElementSource = undefined
    this.showElementUnsubscribe = undefined
  }

  private attachOtpsSource(entry: Entry | undefined): void {
    if (!entry) {
      this.teardownOtpsSource()
      this.otpsState.set([])
      return
    }

    const otps = this.getOtpsSignal(entry)
    this.otpsState.set(this.readOtps(entry))
    if (otps === this.otpsSource) {
      return
    }

    this.teardownOtpsSource()
    this.otpsSource = otps
    if (typeof otps !== 'function') {
      return
    }

    this.otpsUnsubscribe = subscribeToSignalChanges(otps, () => {
      this.otpsState.set(this.readOtps(entry))
    })
  }

  private teardownOtpsSource(): void {
    this.otpsUnsubscribe?.()
    this.otpsSource = undefined
    this.otpsUnsubscribe = undefined
  }

  private syncFromShowElement(): void {
    const next = this.getCurrentEntry()
    const current = this.entryState()
    if (next === current) {
      if (next) {
        this.otpsState.set(this.readOtps(next))
      } else {
        this.otpsState.set([])
      }
      return
    }

    this.entryState.set(next)
    this.attachOtpsSource(next)
  }
}
