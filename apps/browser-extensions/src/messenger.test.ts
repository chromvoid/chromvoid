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
  it('sends to the captured tab without querying active state again', async () => {
    let queryCount = 0
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
        query: (_queryInfo: unknown, callback: (tabs: Array<{id?: number}>) => void) => {
          queryCount += 1
          callback([{id: 99}])
        },
        sendMessage: (tabId: number, message: unknown, callback?: (response: unknown) => void) => {
          sentTabId = tabId
          sentPayload = message as MessageEnvelope
          callback?.({ok: true})
        },
      },
    })

    const messenger = new PopupMessenger()
    const response = await messenger.sendToTab(44, 'fill_otp', {
      id: 'entry-2',
      username: 'alice',
      otp: '123456',
      expectedOrigin: 'https://example.test',
    })

    assert.equal(sentTabId, 44)
    assert.equal(queryCount, 0)
    assert.deepEqual(sentPayload, {
      action: 'fill_otp',
      from: 'popup_script',
      data: {
        id: 'entry-2',
        username: 'alice',
        otp: '123456',
        expectedOrigin: 'https://example.test',
      },
    })
    assert.deepEqual(response, {ok: true})
  })
})
