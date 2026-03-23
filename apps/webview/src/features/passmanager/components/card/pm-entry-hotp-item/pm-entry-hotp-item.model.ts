import {computed, state} from '@statx/core'

import {i18n} from '@project/passmanager'
import type {OTP} from '@project/passmanager'

export class PMEntryHOTPItemModel {
  readonly otp = state<OTP | undefined>(undefined)
  readonly counter = state(0)

  private readonly refreshVersion = state(0)

  readonly isVisible = computed(() => {
    this.refreshVersion()
    return this.otp()?.isShow() ?? false
  })

  readonly code = computed(() => {
    this.refreshVersion()
    return this.otp()?.currentOtp() ?? ''
  })

  readonly label = computed(() => this.otp()?.data.label || i18n('otp:hotp_short'))

  setOtp(value: OTP | undefined): void {
    this.otp.set(value)
    this.counter.set(this.readCounter(value))
    this.touch()
  }

  disconnect(): void {
    this.otp.peek()?.hide()
  }

  setCounter(value: number): void {
    const nextValue = Math.max(0, Number.isFinite(value) ? value : 0)
    this.counter.set(nextValue)

    const otp = this.otp.peek()
    if (otp && (otp.data as Record<string, unknown>)['counter'] !== undefined) {
      ;(otp.data as Record<string, unknown>)['counter'] = nextValue
    }
  }

  async generateCode(): Promise<void> {
    const otp = this.otp.peek()
    if (!otp) {
      return
    }

    otp.show()
    await otp.loadCode(this.counter.peek())
    this.touch()
  }

  async toggleCode(): Promise<void> {
    const otp = this.otp.peek()
    if (!otp) {
      return
    }

    if (!otp.isShow()) {
      await this.generateCode()
      return
    }

    otp.hide()
    this.touch()
  }

  async loadCodeForCopy(): Promise<string> {
    const otp = this.otp.peek()
    if (!otp) {
      return ''
    }

    const current = otp.currentOtp()
    if (current) {
      return current
    }

    return (await otp.loadCode()) ?? ''
  }

  private readCounter(otp: OTP | undefined): number {
    const value = (otp?.data as Record<string, unknown> | undefined)?.['counter']
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value)
    }

    return 0
  }

  private touch(): void {
    this.refreshVersion.set(this.refreshVersion.peek() + 1)
  }
}
