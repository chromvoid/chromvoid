import {beforeEach, describe, expect, it, vi} from 'vitest'

const {invokeMock} = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => ({ok: true})),
}))

vi.mock('root/core/runtime/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: invokeMock,
}))

import {
  consumeAndroidPasswordSavePrefill,
  finishAndroidPasswordSave,
  hasAndroidPasswordSavePrefill,
  stageAndroidPasswordSavePrefill,
} from '../../src/features/passmanager/models/android-password-save-prefill'

describe('android password save prefill', () => {
  beforeEach(async () => {
    invokeMock.mockClear()
    await finishAndroidPasswordSave('dismissed')
  })

  it('keeps token active after consume and finishes with saved outcome', async () => {
    stageAndroidPasswordSavePrefill({
      token: 'token-1',
      title: 'github.com',
      username: 'alice@example.com',
      password: 'pw-123',
      urls: 'https://github.com/login',
    })

    expect(hasAndroidPasswordSavePrefill()).toBe(true)
    const prefill = consumeAndroidPasswordSavePrefill()
    expect(prefill?.token).toBe('token-1')
    expect(hasAndroidPasswordSavePrefill()).toBe(true)

    await finishAndroidPasswordSave('saved')

    expect(invokeMock).toHaveBeenCalledWith('android_password_save_finish', {
      token: 'token-1',
      outcome: 'saved',
    })
    expect(hasAndroidPasswordSavePrefill()).toBe(false)
  })

  it('finishes with dismissed outcome once per token', async () => {
    stageAndroidPasswordSavePrefill({
      token: 'token-2',
      title: 'github.com',
      username: '',
      password: 'pw-123',
      urls: 'https://github.com/login',
    })

    consumeAndroidPasswordSavePrefill()
    await finishAndroidPasswordSave('dismissed')
    await finishAndroidPasswordSave('dismissed')

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('android_password_save_finish', {
      token: 'token-2',
      outcome: 'dismissed',
    })
  })
})
