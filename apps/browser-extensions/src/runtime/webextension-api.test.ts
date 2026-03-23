import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it} from 'node:test'

import {queryActiveTab, sendRuntimeMessage, setActionBadgeText} from './webextension-api'

let previousBrowser: unknown
let previousChrome: unknown
let hadBrowser = false
let hadChrome = false

const setGlobalApi = (name: 'browser' | 'chrome', value: unknown) => {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  hadBrowser = Reflect.has(globalThis, 'browser')
  hadChrome = Reflect.has(globalThis, 'chrome')
  previousBrowser = Reflect.get(globalThis, 'browser')
  previousChrome = Reflect.get(globalThis, 'chrome')

  Reflect.deleteProperty(globalThis, 'browser')
  Reflect.deleteProperty(globalThis, 'chrome')
})

afterEach(() => {
  if (!hadBrowser) {
    Reflect.deleteProperty(globalThis, 'browser')
  } else {
    setGlobalApi('browser', previousBrowser)
  }

  if (!hadChrome) {
    Reflect.deleteProperty(globalThis, 'chrome')
  } else {
    setGlobalApi('chrome', previousChrome)
  }
})

describe('webextension runtime adapter', () => {
  it('queries active tab via browser promise api', async () => {
    setGlobalApi('browser', {
      runtime: {
        onInstalled: {addListener: () => {}},
        onStartup: {addListener: () => {}},
        onMessage: {addListener: () => {}},
        sendMessage: async (_message: unknown) => undefined,
      },
      tabs: {
        query: async (_queryInfo: unknown) => [{id: 7, url: 'https://example.test'}],
        sendMessage: async (_tabId: number, _message: unknown) => undefined,
      },
      action: {
        setBadgeText: async (_details: unknown) => undefined,
      },
    })

    const tab = await queryActiveTab()
    assert.equal(tab?.id, 7)
    assert.equal(tab?.url, 'https://example.test')
  })

  it('queries active tab via chrome callback api', async () => {
    setGlobalApi('chrome', {
      runtime: {
        onInstalled: {addListener: () => {}},
        onStartup: {addListener: () => {}},
        onMessage: {addListener: () => {}},
        lastError: undefined,
        sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
          callback?.(undefined)
        },
      },
      tabs: {
        query: (_queryInfo: unknown, callback: (tabs: Array<{id: number; url: string}>) => void) => {
          callback([{id: 12, url: 'https://localhost/login'}])
        },
        sendMessage: (_tabId: number, _message: unknown, callback?: (response: unknown) => void) => {
          callback?.(undefined)
        },
      },
      action: {
        setBadgeText: (_details: unknown, callback?: () => void) => {
          callback?.()
        },
      },
    })

    const tab = await queryActiveTab()
    assert.equal(tab?.id, 12)
    assert.equal(tab?.url, 'https://localhost/login')
  })

  it('rejects chrome runtime message when lastError is set', async () => {
    setGlobalApi('chrome', {
      runtime: {
        onInstalled: {addListener: () => {}},
        onStartup: {addListener: () => {}},
        onMessage: {addListener: () => {}},
        lastError: {message: 'runtime failed'},
        sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
          callback?.(undefined)
        },
      },
      tabs: {
        query: (_queryInfo: unknown, callback: (tabs: Array<{id: number; url: string}>) => void) => {
          callback([{id: 1, url: 'https://example.test'}])
        },
        sendMessage: (_tabId: number, _message: unknown, callback?: (response: unknown) => void) => {
          callback?.(undefined)
        },
      },
      action: {
        setBadgeText: (_details: unknown, callback?: () => void) => {
          callback?.()
        },
      },
    })

    await assert.rejects(async () => sendRuntimeMessage({action: 'ping'}), /runtime failed/)
  })

  it('does not throw when action api is unavailable', async () => {
    setGlobalApi('browser', {
      runtime: {
        onInstalled: {addListener: () => {}},
        onStartup: {addListener: () => {}},
        onMessage: {addListener: () => {}},
        sendMessage: async (_message: unknown) => undefined,
      },
      tabs: {
        query: async (_queryInfo: unknown) => [{id: 7, url: 'https://example.test'}],
        sendMessage: async (_tabId: number, _message: unknown) => undefined,
      },
    })

    await assert.doesNotReject(async () => setActionBadgeText(''))
  })
})
