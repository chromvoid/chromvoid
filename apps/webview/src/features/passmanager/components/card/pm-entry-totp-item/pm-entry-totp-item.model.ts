import {state} from '@statx/core'

import {i18n, timer} from '@project/passmanager'
import type {OTP} from '@project/passmanager'

const ARC_RADIUS = 16
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS

export interface PMEntryTOTPItemViewState {
  readonly label: string
  readonly leftSeconds: number
  readonly isVisible: boolean
  readonly firstHalf: string[]
  readonly secondHalf: string[]
  readonly isUrgent: boolean
  readonly baseColor: string
  readonly lightColor: string
  readonly arcOffset: number
}

export class PMEntryTOTPItemModel {
  readonly otp = state<OTP | undefined>(undefined)

  private readonly tick = state(0)

  private intervalId: number | undefined
  private lastLoadedSlot: number | undefined

  setOtp(value: OTP | undefined): void {
    this.otp.set(value)
    this.lastLoadedSlot = undefined
    this.bumpTick()
  }

  connect(): void {
    if (this.intervalId) {
      return
    }

    this.intervalId = window.setInterval(() => {
      this.refreshVisibleCode(false)
      this.bumpTick()
    }, 1000)
  }

  disconnect(): void {
    this.otp.peek()?.hide()
    this.lastLoadedSlot = undefined

    if (this.intervalId) {
      window.clearInterval(this.intervalId)
      this.intervalId = undefined
    }
  }

  toggleCode(): void {
    const otp = this.otp.peek()
    if (!otp) {
      return
    }

    if (!otp.isShow()) {
      otp.show()
      this.lastLoadedSlot = undefined
      this.refreshVisibleCode(true)
      this.bumpTick()
      return
    }

    otp.hide()
    this.lastLoadedSlot = undefined
    this.bumpTick()
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

  getViewState(): PMEntryTOTPItemViewState | undefined {
    this.tick()
    timer()

    const otp = this.otp()
    if (!otp) {
      return undefined
    }

    const period = this.getPeriod(otp)
    const leftSeconds = otp.leftSeconds
    const ratio = Math.max(0, Math.min(1, leftSeconds / period))

    let baseColor = 'var(--cv-color-success)'
    let lightColor = 'color-mix(in oklch, var(--cv-color-success) 24%, var(--cv-color-surface-2))'

    if (ratio <= 0.2) {
      baseColor = 'var(--cv-color-danger)'
      lightColor = 'color-mix(in oklch, var(--cv-color-danger) 24%, var(--cv-color-surface-2))'
    } else if (ratio <= 0.5) {
      baseColor = 'var(--cv-color-warning)'
      lightColor = 'color-mix(in oklch, var(--cv-color-warning) 24%, var(--cv-color-surface-2))'
    }

    const arcOffset = ARC_CIRCUMFERENCE * (1 - ratio)
    const isVisible = otp.isShow()
    const code = otp.currentOtp()

    const digitCount = otp.data.digits ?? 6
    const mid = Math.ceil(digitCount / 2)
    const chars = isVisible && code ? code.split('') : Array<string>(digitCount).fill('\u2022')

    return {
      label: otp.data.label || i18n('otp:totp_short'),
      leftSeconds,
      isVisible,
      firstHalf: chars.slice(0, mid),
      secondHalf: chars.slice(mid),
      isUrgent: ratio <= 0.2,
      baseColor,
      lightColor,
      arcOffset,
    }
  }

  private getPeriod(otp: OTP): number {
    const periodRaw = Number(otp.data.period ?? 30)
    if (!Number.isFinite(periodRaw) || periodRaw <= 0) {
      return 30
    }

    return periodRaw
  }

  private getSlot(otp: OTP): number {
    return Math.floor(Date.now() / 1000 / this.getPeriod(otp))
  }

  private refreshVisibleCode(force: boolean): void {
    const otp = this.otp.peek()
    if (!otp || !otp.isShow()) {
      return
    }

    const slot = this.getSlot(otp)
    if (!force && this.lastLoadedSlot === slot) {
      return
    }

    this.lastLoadedSlot = slot
    void otp.loadCode().finally(() => this.bumpTick())
  }

  private bumpTick(): void {
    this.tick.set(this.tick.peek() + 1)
  }
}
