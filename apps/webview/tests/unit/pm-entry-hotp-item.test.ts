import type {OTP} from '@project/passmanager'
import {describe, expect, it, vi} from 'vitest'

import {PMEntryHOTPItemModel} from '../../src/features/passmanager/components/card/pm-entry-hotp-item/pm-entry-hotp-item.model'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('PMEntryHOTPItemModel', () => {
  it('dedupes generateCode while a previous generate is still in flight', async () => {
    const model = new PMEntryHOTPItemModel()
    const loadDeferred = deferred<string | undefined>()
    let visible = false
    let current: string | undefined

    const otp = {
      data: {
        id: 'otp-id',
        label: 'Primary',
        digits: 6,
        algorithm: 'SHA1',
        encoding: 'base32',
        type: 'HOTP',
        counter: 7,
      },
      isShow: () => visible,
      show: vi.fn(() => {
        visible = true
      }),
      hide: vi.fn(() => {
        visible = false
      }),
      loadCode: vi.fn(async (_counter?: number) => {
        const code = await loadDeferred.promise
        current = code
        return code
      }),
      currentOtp: () => current,
    } as unknown as OTP

    model.actions.setOtp(otp)

    const first = model.actions.generateCode()
    const second = model.actions.generateCode()

    expect(otp.loadCode).toHaveBeenCalledTimes(1)
    expect(otp.loadCode).toHaveBeenCalledWith(7)

    loadDeferred.resolve('654321')
    await Promise.all([first, second])

    expect(model.state.isVisible()).toBe(true)
    expect(model.state.code()).toBe('654321')
  })

  it('returns the current code for copy without forcing a reload', async () => {
    const model = new PMEntryHOTPItemModel()

    const otp = {
      data: {
        id: 'otp-id',
        label: 'Primary',
        digits: 6,
        algorithm: 'SHA1',
        encoding: 'base32',
        type: 'HOTP',
        counter: 0,
      },
      isShow: () => true,
      show: vi.fn(),
      hide: vi.fn(),
      loadCode: vi.fn(async () => '111111'),
      currentOtp: () => '123456',
    } as unknown as OTP

    model.actions.setOtp(otp)

    await expect(model.actions.loadCodeForCopy()).resolves.toBe('123456')
    expect(otp.loadCode).not.toHaveBeenCalled()
  })

  it('loads copy code with the selected HOTP counter when no code is visible', async () => {
    const model = new PMEntryHOTPItemModel()

    const otp = {
      data: {
        id: 'otp-id',
        label: 'Primary',
        digits: 6,
        algorithm: 'SHA1',
        encoding: 'base32',
        type: 'HOTP',
        counter: 7,
      },
      isShow: () => false,
      show: vi.fn(),
      hide: vi.fn(),
      loadCode: vi.fn(async () => '777777'),
      currentOtp: () => undefined,
    } as unknown as OTP

    model.actions.setOtp(otp)

    await expect(model.actions.loadCodeForCopy()).resolves.toBe('777777')
    expect(otp.loadCode).toHaveBeenCalledWith(7)
  })
})
