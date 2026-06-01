import {sha256} from '@project/utils'
import {atom, peek} from '@reatom/core'
import {v4} from 'uuid'

import {i18n} from '../i18n'
import {confirmPassManagerAction} from './dialog'
import type {Entry} from './entry'
import type {OTPOptions} from './types'

const SHA256_CRYPTO_UNAVAILABLE_MESSAGES = new Set([
  'No crypto implementation available',
  'Web Crypto API not available or failed',
  'Node.js crypto module not available',
])

function isSha256CryptoUnavailable(error: unknown): boolean {
  return error instanceof Error && SHA256_CRYPTO_UNAVAILABLE_MESSAGES.has(error.message)
}

export class OTP {
  static async create(entry: Entry, otpParams: Omit<OTPOptions, 'id'>) {
    const randomId = v4()
    let id: string

    try {
      id = await sha256(entry.id + ':otp:' + randomId + entry.root.salt)
    } catch (error) {
      if (!isSha256CryptoUnavailable(error)) {
        throw error
      }

      id = `otp:${randomId}`
    }

    delete otpParams.secret

    const otp = new OTP(entry, {
      ...otpParams,
      id,
    })

    return otp
  }
  currentOtp = atom<string | undefined>(undefined)
  isShow = atom(false)
  isRemoved = false
  interval = 0
  type = atom<'TOTP' | 'HOTP'>('TOTP')
  private inFlightCodeRequest: {requestKey: number; promise: Promise<string | undefined>} | undefined
  private resolvedCodeCache: {requestKey: number; value: string | undefined} | undefined

  constructor(
    private entry: Entry,
    public data: Omit<OTPOptions, 'secret'>,
  ) {
    // Initialize the type from the data
    if (data.type) {
      this.type.set(data.type)
    }
  }

  updateData(next: Omit<OTPOptions, 'secret'>) {
    const prev = this.data
    const codeConfigChanged =
      prev.id !== next.id ||
      prev.algorithm !== next.algorithm ||
      prev.digits !== next.digits ||
      prev.period !== next.period ||
      prev.encoding !== next.encoding ||
      prev.type !== next.type ||
      prev.counter !== next.counter

    this.data = next
    this.type.set(next.type ?? 'TOTP')

    if (codeConfigChanged) {
      this.inFlightCodeRequest = undefined
      this.resolvedCodeCache = undefined
      this.currentOtp.set(undefined)
    }
  }

  get id() {
    return this.data.id
  }
  get label() {
    return this.data.label
  }
  show() {
    this.isShow.set(true)
  }
  hide() {
    this.isShow.set(false)
  }
  async loadCode(counter = Math.floor(Date.now() / 1000)) {
    const requestKey = this.getRequestKey(counter)
    const pending = this.inFlightCodeRequest
    if (pending && pending.requestKey === requestKey) {
      return pending.promise
    }

    if (this.resolvedCodeCache?.requestKey === requestKey) {
      return this.resolvedCodeCache.value
    }

    const request = (async () => {
      try {
        await this.entry.flushPendingPersistence()
        const {algorithm, ...data} = {...this.data}
        const code = await this.entry.root.managerSaver.getOTP({
          ...data,
          period: peek(this.type) === 'HOTP' ? 1 : this.data.period,
          ts: requestKey,
          ha: algorithm,
          entryId: this.entry.id,
          label: this.data.label,
          entryTitle: this.entry.title,
          entryGroupPath: this.entry.groupPath,
        })
        this.currentOtp.set(code)
        this.resolvedCodeCache = {requestKey, value: code}
        return code
      } catch {
        return undefined
      } finally {
        if (this.inFlightCodeRequest?.requestKey === requestKey) {
          this.inFlightCodeRequest = undefined
        }
      }
    })()

    this.inFlightCodeRequest = {requestKey, promise: request}
    return request
  }

  get leftSeconds() {
    const period = this.data.period
    if (!period) {
      return 30
    }
    const prev = Date.now()
    return Math.round(period - ((prev / 1000) % period))
  }

  get otpLeftPercent() {
    const period = this.data.period
    if (!period) {
      return 100
    }
    return Math.round((this.leftSeconds / period) * 100)
  }

  clean() {
    return this.entry.root.managerSaver.removeOTP(this.id)
  }

  private getRequestKey(counter: number): number {
    if (peek(this.type) === 'HOTP') {
      return counter
    }

    const period = Number(this.data.period ?? 30)
    if (!Number.isFinite(period) || period <= 0) {
      return counter
    }

    return Math.floor(counter / period) * period
  }

  async remove(silent = false) {
    if (this.isRemoved) {
      return true
    }

    if (!silent) {
      const confirmed = await confirmPassManagerAction({
        title: i18n('remove:dialog:title'),
        message: i18n('remove:dialog:text'),
        variant: 'danger',
        confirmVariant: 'danger',
      })
      if (!confirmed) {
        return false
      }
    }

    await this.entry.removeOTP(this, silent)
    this.isRemoved = true
    clearInterval(this.interval)
    return true
  }

  setLabel(value: string) {
    const prevLabel = this.data.label
    this.data.label = value
    void this.persistLabel(prevLabel)
  }

  async export() {
    return {
      ...this.toJSON(),
      secret: (await this.entry.root.managerSaver.getOTPSeckey(this.id)) ?? '',
    }
  }

  toJSON() {
    return {
      id: this.id,
      label: this.data.label,
      period: this.data.period,
      digits: this.data.digits,
      algorithm: this.data.algorithm,
      encoding: this.data.encoding,
      type: this.data.type,
      counter: this.data.counter,
    }
  }

  private async persistLabel(prevLabel: string) {
    try {
      const ok = await this.entry.root.managerSaver.saveEntryMeta({
        id: this.entry.id,
        title: this.entry.title,
        urls: this.entry.urls,
        username: this.entry.username,
        iconRef: this.entry.iconRef,
        otps: this.entry.otps().map((o) => ({
          id: o.id,
          label: o.data.label,
          algorithm: o.data.algorithm,
          digits: o.data.digits,
          period: o.data.period,
          encoding: o.data.encoding,
          type: o.data.type,
          counter: o.data.counter,
        })),
        groupPath: this.entry.groupPath,
      })
      if (!ok) {
        throw new Error('saveEntryMeta failed')
      }
    } catch {
      this.data.label = prevLabel
    }
  }
}
