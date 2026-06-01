import {action, atom, computed, isAbort, withAbort, withAsync, wrap} from '@reatom/core'

import type {OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

export class PMEntryHOTPItemModel {
  private readonly otpState = atom<OTP | undefined>(undefined, 'passmanager.entryHotp.otp')
  private readonly counterState = atom(0, 'passmanager.entryHotp.counter')

  private readonly refreshVersionState = atom(0, 'passmanager.entryHotp.refreshVersion')
  private generateCodePromise: Promise<void> | undefined
  private loadCodeForCopyPromise: Promise<string> | undefined

  private readonly generateCodeAction = action(async (): Promise<void> => {
    const otp = this.otpState()
    if (!otp) {
      return
    }

    otp.show()
    await wrap(otp.loadCode(this.counterState()))
    this.touch()
  }, 'passmanager.entryHotp.generateCode').extend(withAbort('first-in-win'), withAsync({status: true}))

  private readonly loadCodeForCopyAction = action(async (): Promise<string> => {
    const otp = this.otpState()
    if (!otp) {
      return ''
    }

    const current = otp.currentOtp()
    if (current) {
      return current
    }

    return (await wrap(otp.loadCode())) ?? ''
  }, 'passmanager.entryHotp.loadCodeForCopy').extend(withAsync({status: true}))

  readonly state = {
    otp: this.otpState,
    counter: this.counterState,
    isVisible: computed(() => {
      this.refreshVersionState()
      return this.otpState()?.isShow() ?? false
    }, 'passmanager.entryHotp.isVisible'),
    code: computed(() => {
      this.refreshVersionState()
      return this.otpState()?.currentOtp() ?? ''
    }, 'passmanager.entryHotp.code'),
    label: computed(() => this.otpState()?.data.label || i18n('otp:hotp_short'), 'passmanager.entryHotp.label'),
  }

  readonly actions = {
    setOtp: action((value: OTP | undefined) => {
      this.otpState.set(value)
      this.counterState.set(this.readCounter(value))
      this.touch()
    }, 'passmanager.entryHotp.setOtp'),

    disconnect: action(() => {
      this.generateCodeAction.abort('entry-hotp disconnect')
      this.otpState()?.hide()
    }, 'passmanager.entryHotp.disconnect'),

    setCounter: action((value: number) => {
      const nextValue = Math.max(0, Number.isFinite(value) ? value : 0)
      this.counterState.set(nextValue)

      const otp = this.otpState()
      if (otp && (otp.data as Record<string, unknown>)['counter'] !== undefined) {
        ;(otp.data as Record<string, unknown>)['counter'] = nextValue
      }
    }, 'passmanager.entryHotp.setCounter'),

    generateCode: action(async () => {
      if (this.generateCodePromise) {
        return this.generateCodePromise
      }

      const promise = this.generateCodeAction()
        .catch((error) => {
          if (!isAbort(error)) {
            throw error
          }
        })
        .finally(() => {
          if (this.generateCodePromise === promise) {
            this.generateCodePromise = undefined
          }
        })

      this.generateCodePromise = promise
      return promise
    }, 'passmanager.entryHotp.generateCodeProxy'),

    toggleCode: action(async () => {
      const otp = this.otpState()
      if (!otp) {
        return
      }

      if (!otp.isShow()) {
        await this.actions.generateCode()
        return
      }

      otp.hide()
      this.touch()
    }, 'passmanager.entryHotp.toggleCode'),

    loadCodeForCopy: action(async () => {
      if (this.loadCodeForCopyPromise) {
        return this.loadCodeForCopyPromise
      }

      const promise = this.loadCodeForCopyAction().finally(() => {
        if (this.loadCodeForCopyPromise === promise) {
          this.loadCodeForCopyPromise = undefined
        }
      })

      this.loadCodeForCopyPromise = promise
      return promise
    }, 'passmanager.entryHotp.loadCodeForCopyProxy'),
  }

  private readCounter(otp: OTP | undefined): number {
    const value = (otp?.data as Record<string, unknown> | undefined)?.['counter']
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value)
    }

    return 0
  }

  private touch(): void {
    this.refreshVersionState.set(this.refreshVersionState() + 1)
  }
}
