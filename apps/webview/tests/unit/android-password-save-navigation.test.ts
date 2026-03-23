import {afterEach, describe, expect, it, vi} from 'vitest'

const {invokeMock} = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => ({ok: true})),
}))

vi.mock('root/core/runtime/runtime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: invokeMock,
}))

import {ManagerRoot} from '@project/passmanager'
import {
  consumeAndroidPasswordSavePrefill,
  finishAndroidPasswordSave,
  stageAndroidPasswordSavePrefill,
} from '../../src/features/passmanager/models/android-password-save-prefill'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

describe('android password save navigation', () => {
  let originalPassmanager: typeof window.passmanager

  afterEach(async () => {
    window.passmanager = originalPassmanager
    passmanagerNavigationController.reset()
    await finishAndroidPasswordSave('dismissed')
    invokeMock.mockClear()
  })

  it('finishes Android password save as dismissed when backing out of create entry', async () => {
    originalPassmanager = window.passmanager
    const root = new ManagerRoot({} as any)
    window.passmanager = root

    stageAndroidPasswordSavePrefill({
      token: 'token-back',
      title: 'github.com',
      username: 'alice@example.com',
      password: 'pw-123',
      urls: 'https://github.com/login',
    })
    consumeAndroidPasswordSavePrefill()
    root.showElement.set('createEntry')

    const handled = pmModel.goBackFromCurrent()

    expect(handled).toBe(true)
    expect(root.showElement()).toBe(root)
    expect(invokeMock).toHaveBeenCalledWith('android_password_save_finish', {
      token: 'token-back',
      outcome: 'dismissed',
    })
  })
})
