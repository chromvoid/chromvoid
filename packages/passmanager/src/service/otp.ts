import {state} from '@statx/core'

import {sha256} from '@project/utils'
import Swal from 'sweetalert2'
import {v4} from 'uuid'

import {i18n} from '../i18n'
import type {Entry} from './entry'
import type {OTPOptions} from './types'

export class OTP {
  static async create(entry: Entry, otpParams: Omit<OTPOptions, 'id'>) {
    const id = await sha256(entry.id + ':otp:' + v4() + entry.root.salt)
    delete otpParams.secret

    const otp = new OTP(entry, {
      ...otpParams,
      id,
    })

    return otp
  }
  currentOtp = state<string | undefined>(undefined)
  isShow = state(false)
  isRemoved = false
  interval = 0
  type = state<'TOTP' | 'HOTP'>('TOTP')
  private inFlightCodeRequest: {counter: number; promise: Promise<string | undefined>} | undefined

  constructor(
    private entry: Entry,
    public data: Omit<OTPOptions, 'secret'>,
  ) {
    // Инициализируем тип из данных
    if (data.type) {
      this.type.set(data.type)
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
    const pending = this.inFlightCodeRequest
    if (pending && pending.counter === counter) {
      return pending.promise
    }

    const request = (async () => {
      try {
        const {algorithm, ...data} = {...this.data}
        const code = await this.entry.root.managerSaver.getOTP({
          ...data,
          period: this.type.peek() === 'HOTP' ? 1 : this.data.period,
          ts: counter,
          ha: algorithm,
          entryId: this.entry.id,
          label: this.data.label,
          entryTitle: this.entry.title,
          entryGroupPath: this.entry.groupPath,
        })
        this.currentOtp.set(code)
        return code
      } catch {
        return undefined
      } finally {
        if (this.inFlightCodeRequest?.counter === counter) {
          this.inFlightCodeRequest = undefined
        }
      }
    })()

    this.inFlightCodeRequest = {counter, promise: request}
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

  async remove(silent = false) {
    if (this.isRemoved) {
      return true
    }

    if (!silent) {
      const res = await Swal.fire({
        title: i18n('remove:dialog:title'),
        text: i18n('remove:dialog:text'),
        showConfirmButton: true,
        showCancelButton: true,
      })
      if (!res.isConfirmed) {
        return false
      }
    }

    await this.clean()
    this.isRemoved = true
    this.entry.removeOTP(this, silent)
    void this.entry.root.managerSaver.saveEntryMeta({
      id: this.entry.id,
      title: this.entry.title,
      urls: this.entry.urls,
      username: this.entry.username,
      iconRef: this.entry.iconRef,
      otps: this.entry
        .otps()
        .filter((o) => !o.isRemoved)
        .map((o) => ({
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
    clearInterval(this.interval)
    return true
  }

  setLabel(value: string) {
    this.data.label = value
    void this.entry.root.managerSaver.saveEntryMeta({
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
}
