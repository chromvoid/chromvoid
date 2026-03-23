import {state} from '@statx/core'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {androidSystemBackModel} from '../../src/app/navigation/android-system-back.model'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function setupContext() {
  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId: state<number | null>(null),
        closeDetailsPanel: () => {},
        currentPath: state('/'),
        setCurrentPath: () => {},
        showRemoteStoragePage: state(false),
        showRemotePage: state(false),
        showGatewayPage: state(false),
        showSettingsPage: state(false),
        showNetworkPairPage: state(false),
        isShowPasswordManager: state(false),
      } as any,
    }),
  )
}

describe('androidSystemBackModel', () => {
  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    delete window.__chromvoidHandleAndroidBack
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    navigationModel.disconnect()
    delete window.__chromvoidHandleAndroidBack
  })

  it('blurs the active editable element before touching app navigation', () => {
    setupContext()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    expect(document.activeElement).toBe(input)
    expect(androidSystemBackModel.handleBack()).toBe(true)
    expect(document.activeElement).not.toBe(input)
  })

  it('returns false on the root screen so Android can move the task to background', () => {
    setupContext()

    expect(androidSystemBackModel.handleBack()).toBe(false)
  })

  it('registers the global Android back handler contract on window', () => {
    setupContext()
    androidSystemBackModel.registerGlobalHandler()

    expect(typeof window.__chromvoidHandleAndroidBack).toBe('function')
    expect(window.__chromvoidHandleAndroidBack?.()).toBe(false)
  })
})
