import {action, atom, computed, wrap, withAsyncData} from '@reatom/core'

import type {OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {DEFAULT_CLIPBOARD_WIPE_MS, copyWithAutoWipe} from '@project/passmanager/password-utils'
import {timer} from '@project/passmanager/timer'
import {defaultLogger} from 'root/core/logger'

const ARC_RADIUS = 17.5
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS

type VisibleCodeState = {
  key: string
  value: string
}

export interface PMEntryTOTPItemViewState {
  readonly label: string
  readonly leftSeconds: number
  readonly isVisible: boolean
  readonly codeText: string
  readonly digitGroups: string[][]
  readonly chars: string[]
  readonly isUrgent: boolean
  readonly baseColor: string
  readonly lightColor: string
  readonly arcOffset: number
  readonly copyFeedback: 'idle' | 'copied'
}

export class PMEntryTOTPItemModel {
  private readonly logger = defaultLogger
  private readonly otpState = atom<OTP | undefined>(undefined, 'passmanager.entryTotp.otp')
  private readonly connectedState = atom(false, 'passmanager.entryTotp.connected')
  private readonly displayedCodeState = atom('', 'passmanager.entryTotp.displayedCode')
  private readonly copyFeedbackState = atom<'idle' | 'copied'>('idle', 'passmanager.entryTotp.copyFeedback')
  private pollTimerId: number | undefined
  private copyFeedbackTimerId: number | undefined
  private pollVersion = 0

  private readonly visibleCodeResource = action(
    async (otp: OTP, slot: number): Promise<VisibleCodeState> => {
      const period = this.getPeriod(otp)
      return {
        key: this.getVisibleCodeKey(otp, slot),
        value: (await wrap(otp.loadCode(slot * period))) ?? '',
      }
    },
    'passmanager.entryTotp.visibleCode',
  ).extend(
    withAsyncData({
      initState: {
        key: '',
        value: '',
      },
    }),
  )

  private readonly refreshVisibleCodeAction = action(
    async (otp: OTP, version: number, allowSlotRetry = true): Promise<void> => {
      try {
        const slot = this.getSlot(otp)
        const result = await wrap(this.visibleCodeResource(otp, slot))
        const currentOtp = this.otpState()
        if (!this.isPollingActive(version, otp) || !currentOtp || currentOtp !== otp || !currentOtp.isShow()) {
          return
        }

        const currentKey = this.getVisibleCodeKey(currentOtp, this.getSlot(currentOtp))
        if (result.key !== currentKey) {
          if (allowSlotRetry && !this.displayedCodeState()) {
            void this.refreshVisibleCodeAction(otp, version, false)
          }

          return
        }

        this.displayedCodeState.set(result.value)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          throw error
        }
      }
    },
    'passmanager.entryTotp.refreshVisibleCode',
  )

  readonly state = {
    otp: this.otpState,
    view: computed<PMEntryTOTPItemViewState | undefined>(() => {
      timer()

      const otp = this.otpState()
      if (!otp) {
        return undefined
      }

      const period = this.getPeriod(otp)
      const leftSeconds = otp.leftSeconds
      const ratio = Math.max(0, Math.min(1, leftSeconds / period))

      let baseColor = 'var(--cv-color-success)'
      let lightColor = 'var(--cv-color-success-surface-strong)'

      if (leftSeconds < 5) {
        baseColor = 'var(--cv-color-danger)'
        lightColor = 'var(--cv-color-danger-surface-strong)'
      } else if (ratio <= 0.5) {
        baseColor = 'var(--cv-color-warning)'
        lightColor = 'var(--cv-color-warning-surface-strong)'
      }

      const arcOffset = ARC_CIRCUMFERENCE * (1 - ratio)
      const isVisible = otp.isShow()
      const displayedCode = this.displayedCodeState()
      const digitGroups = this.groupCode(displayedCode)
      const codeText = digitGroups.map((group) => group.join('')).join(' ')
      const chars = digitGroups.flat()

      return {
        label: otp.data.label || i18n('otp:totp_short'),
        leftSeconds,
        isVisible,
        codeText,
        digitGroups,
        chars,
        isUrgent: leftSeconds < 5,
        baseColor,
        lightColor,
        arcOffset,
        copyFeedback: this.copyFeedbackState(),
      }
    }, 'passmanager.entryTotp.view'),
  }

  readonly actions = {
    setOtp: action((value: OTP | undefined) => {
      this.hideCurrentOtp()
      this.stopPolling()
      this.clearCopyFeedbackTimeout()
      this.copyFeedbackState.set('idle')
      this.displayedCodeState.set('')
      this.otpState.set(value)
      this.showCurrentOtp()
      this.startPolling()
    }, 'passmanager.entryTotp.setOtp'),

    connect: action(() => {
      this.connectedState.set(true)
      this.showCurrentOtp()
      this.startPolling()
    }, 'passmanager.entryTotp.connect'),

    disconnect: action(() => {
      this.stopPolling()
      this.clearCopyFeedbackTimeout()
      this.copyFeedbackState.set('idle')
      this.connectedState.set(false)
      this.displayedCodeState.set('')
      this.hideCurrentOtp()
    }, 'passmanager.entryTotp.disconnect'),

    copyCode: action(async () => {
      const otp = this.otpState()
      if (!otp) {
        return
      }

      const code = (await wrap(otp.loadCode(this.getSlot(otp) * this.getPeriod(otp)))) ?? ''
      if (!code || !this.isCurrentConnectedOtp(otp)) {
        return
      }

      this.displayedCodeState.set(code)
      try {
        await wrap(copyWithAutoWipe(code, DEFAULT_CLIPBOARD_WIPE_MS))
      } catch (error) {
        this.logger.warn('[PassManager][EntryTOTP] copy failed', {
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return
      }
      if (!this.isCurrentConnectedOtp(otp)) {
        return
      }

      this.copyFeedbackState.set('copied')
      this.clearCopyFeedbackTimeout()
      this.copyFeedbackTimerId = window.setTimeout(() => {
        if (this.otpState() === otp) {
          this.copyFeedbackState.set('idle')
        }

        this.copyFeedbackTimerId = undefined
      }, 1500)
    }, 'passmanager.entryTotp.copyCode'),
  }

  private groupCode(code: string): string[][] {
    if (!code) {
      return []
    }

    const chars = code.split('')
    const mid = Math.ceil(chars.length / 2)
    return [chars.slice(0, mid), chars.slice(mid)].filter((group) => group.length > 0)
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

  private getVisibleCodeKey(otp: OTP, slot: number): string {
    const otpId = (otp as OTP & {id?: string}).id ?? otp.data.id
    return `${otpId}:${slot}:true`
  }

  private isPollingActive(version: number, otp: OTP): boolean {
    return this.pollVersion === version && this.connectedState() && this.otpState() === otp && otp.isShow()
  }

  private isCurrentConnectedOtp(otp: OTP): boolean {
    return this.connectedState() && this.otpState() === otp
  }

  private showCurrentOtp(): void {
    const otp = this.otpState()
    if (!otp || !this.connectedState() || otp.isShow()) {
      return
    }

    otp.show()
  }

  private hideCurrentOtp(): void {
    const otp = this.otpState()
    if (otp?.isShow()) {
      otp.hide()
    }
  }

  private stopPolling(): void {
    this.pollVersion += 1
    if (this.pollTimerId !== undefined) {
      window.clearTimeout(this.pollTimerId)
      this.pollTimerId = undefined
    }
  }

  private clearCopyFeedbackTimeout(): void {
    if (this.copyFeedbackTimerId !== undefined) {
      window.clearTimeout(this.copyFeedbackTimerId)
      this.copyFeedbackTimerId = undefined
    }
  }

  private startPolling(): void {
    const otp = this.otpState()
    if (!otp || !this.connectedState()) {
      return
    }

    if (!otp.isShow()) {
      otp.show()
    }

    this.stopPolling()
    const version = this.pollVersion
    const scheduleNextRefresh = () => {
      if (!this.isPollingActive(version, otp)) {
        return
      }

      const periodMs = this.getPeriod(otp) * 1000
      const elapsedMs = Date.now() % periodMs
      const delayMs = Math.max(50, periodMs - elapsedMs + 50)

      this.pollTimerId = window.setTimeout(() => {
        if (!this.isPollingActive(version, otp)) {
          return
        }

        void this.refreshVisibleCodeAction(otp, version)
        scheduleNextRefresh()
      }, delayMs)
    }

    void this.refreshVisibleCodeAction(otp, version)
    scheduleNextRefresh()
  }
}
