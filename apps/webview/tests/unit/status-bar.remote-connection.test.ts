import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {atom} from '@reatom/core'

import {Store} from '../../src/app/state/store'
import {ChromVoidState} from '../../src/core/state/app-state'
import {StatusBar} from '../../src/features/shell/components/status-bar'
import {i18n} from '../../src/i18n'
import {clearAppContext, initAppContext} from '../../src/shared/services/app-context'

describe('status-bar remote connection indicator', () => {
  let store: Store

  beforeEach(() => {
    StatusBar.define()

    const ws = {
      kind: 'ws' as const,
      connected: atom(true),
      connecting: atom(false),
      lastError: atom<string | undefined>(undefined),
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
      syncing: atom(true),
      lastError: atom<string | null>(null),
    }

    const state = new ChromVoidState()
    store = new Store(ws as any, state, catalog as any)
    initAppContext({store, ws: ws as any, catalog: catalog as any, state})
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  async function renderStatusBar(): Promise<StatusBar> {
    const element = document.createElement('status-bar') as StatusBar
    document.body.append(element)
    await element.updateComplete
    return element
  }

  it('hides local transport and catalog sync status outside remote sessions', async () => {
    const element = await renderStatusBar()
    const text = element.shadowRoot?.textContent ?? ''

    expect(text).not.toContain(i18n('statusbar:connection:connected'))
    expect(text).not.toContain(i18n('statusbar:catalog:syncing'))
  })

  it('does not render the files selection mode toggle in the global status bar', async () => {
    const element = await renderStatusBar()

    expect(element.shadowRoot?.querySelector('.selection-mode-toggle')).toBeNull()
  })

  it('shows remote connection state when a remote session is ready', async () => {
    store.setRemoteSessionReady('peer-1')

    const element = await renderStatusBar()
    const text = element.shadowRoot?.textContent ?? ''

    expect(text).toContain(i18n('statusbar:remote-connection:ready'))
  })

  it('shows the host lock state while remote mode waits for unlock', async () => {
    store.setRemoteSessionWaiting('peer-1')

    const element = await renderStatusBar()
    const text = element.shadowRoot?.textContent ?? ''

    expect(text).toContain(i18n('statusbar:remote-connection:waiting-host'))
  })
})
