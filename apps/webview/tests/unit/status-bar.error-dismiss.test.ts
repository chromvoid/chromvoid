import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {atom} from '@reatom/core'

import {Store} from '../../src/app/state/store'
import {ChromVoidState} from '../../src/core/state/app-state'
import {clearAppContext, initAppContext} from '../../src/shared/services/app-context'
import {StatusBar} from '../../src/features/shell/components/status-bar'

describe('status-bar error dismiss', () => {
  beforeEach(() => {
    StatusBar.define()

    const ws = {
      kind: 'ws' as const,
      connected: atom(false),
      connecting: atom(false),
      lastError: atom<string | undefined>('Transport failed'),
      connect() {},
      disconnect() {},
      on() {},
      off() {},
      sendCatalog: async () => undefined,
      sendPassmanager: async () => undefined,
      uploadFile: async () => undefined,
      downloadFile: async function* () {},
      readSecret: async function* () {},
      writeSecret: async () => undefined,
      eraseSecret: async () => undefined,
      generateOTP: async () => '',
      setOTPSecret: async () => undefined,
      removeOTPSecret: async () => undefined,
    }

    const catalog = {
      syncing: atom(false),
      lastError: atom<string | null>(null),
    }

    const state = new ChromVoidState()
    const store = new Store(ws as any, state, catalog as any)
    initAppContext({store, ws: ws as any, catalog: catalog as any, state})
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('removes the error banner after clicking dismiss', async () => {
    const element = document.createElement('status-bar') as StatusBar
    document.body.append(element)
    await element.updateComplete
    await Promise.resolve()

    const callout = element.shadowRoot?.querySelector('cv-callout.status-error-callout')
    expect(callout).not.toBeNull()

    callout?.dispatchEvent(new CustomEvent('cv-close', {bubbles: true, composed: true}))
    await element.updateComplete
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('cv-callout.status-error-callout')).toBeNull()
  })
})
