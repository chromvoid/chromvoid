import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it} from 'node:test'

import {PopupMessenger} from './messenger'

type MessageEnvelope = {
  action: string
  from: string
  data: unknown
}

let previousChrome: unknown
let hadChrome = false

const setChromeApi = (value: unknown) => {
  Object.defineProperty(globalThis, 'chrome', {
    value,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  hadChrome = Reflect.has(globalThis, 'chrome')
  previousChrome = Reflect.get(globalThis, 'chrome')
  Reflect.deleteProperty(globalThis, 'chrome')
})

afterEach(() => {
  if (!hadChrome) {
    Reflect.deleteProperty(globalThis, 'chrome')
    return
  }

  setChromeApi(previousChrome)
})

describe('popup messenger', () => {
  it('sends fill_form message to active tab', async () => {
    let sentTabId: number | undefined
    let sentPayload: MessageEnvelope | undefined

    setChromeApi({
      runtime: {
        onInstalled: {addListener: () => {}},
        onStartup: {addListener: () => {}},
        onMessage: {addListener: () => {}},
        sendMessage: (_message: unknown, callback?: (response: unknown) => void) => callback?.(undefined),
        lastError: undefined,
      },
      tabs: {
        query: (_queryInfo: unknown, callback: (tabs: Array<{id?: number}>) => void) => callback([{id: 44}]),
        sendMessage: (tabId: number, message: unknown, callback?: (response: unknown) => void) => {
          sentTabId = tabId
          sentPayload = message as MessageEnvelope
          callback?.({ok: true})
        },
      },
      action: {setBadgeText: (_details: unknown, callback?: () => void) => callback?.()},
    })

    const messenger = new PopupMessenger()
    const response = await messenger.sendToActiveTab('fill_form', {
      id: 'entry-1',
      username: 'alice',
      password: 'secret',
    })

    assert.equal(sentTabId, 44)
    assert.equal(sentPayload?.action, 'fill_form')
    assert.equal(sentPayload?.from, 'popup_script')
    assert.deepEqual(sentPayload?.data, {id: 'entry-1', username: 'alice', password: 'secret'})
    assert.deepEqual(response, {ok: true})
  })

  it('returns undefined when active tab does not have id', async () => {
    setChromeApi({
      runtime: {
        onInstalled: {addListener: () => {}},
        onStartup: {addListener: () => {}},
        onMessage: {addListener: () => {}},
        sendMessage: (_message: unknown, callback?: (response: unknown) => void) => callback?.(undefined),
        lastError: undefined,
      },
      tabs: {
        query: (_queryInfo: unknown, callback: (tabs: Array<{id?: number}>) => void) => callback([{}]),
        sendMessage: (_tabId: number, _message: unknown, callback?: (response: unknown) => void) =>
          callback?.({}),
      },
      action: {setBadgeText: (_details: unknown, callback?: () => void) => callback?.()},
    })

    const messenger = new PopupMessenger()
    const response = await messenger.sendToActiveTab('fill_otp', {
      id: 'entry-2',
      username: 'alice',
      otp: '123456',
    })

    assert.equal(response, undefined)
  })
})
