import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {NoConnection} from '../../src/routes/no-connection.route'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

async function settle(element: NoConnection) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('no-connection route', () => {
  beforeEach(() => {
    NoConnection.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('renders translated disconnected state copy', async () => {
    initAppContext(
      createMockAppContext({
        store: {
          wsStatus: atom<'disconnected' | 'connecting' | 'connected'>('disconnected'),
          lastErrorMessage: atom<string | null>('USB transport unavailable'),
        } as any,
        ws: {
          connect: vi.fn(),
        } as any,
      }),
    )

    const element = document.createElement('no-connection') as NoConnection
    document.body.appendChild(element)
    await settle(element)

    const text = (element.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Could not connect to the device.')
    expect(text).toContain('Disconnected')
    expect(text).toContain('Reconnect')
    expect(text).toContain('Reload page')
    expect(text).toContain('USB transport unavailable')
  })

  it('retries the transport connection when pressing reconnect', async () => {
    const connect = vi.fn()

    initAppContext(
      createMockAppContext({
        store: {
          wsStatus: atom<'disconnected' | 'connecting' | 'connected'>('disconnected'),
          lastErrorMessage: atom<string | null>(null),
        } as any,
        ws: {
          connect,
        } as any,
      }),
    )

    const element = document.createElement('no-connection') as NoConnection
    document.body.appendChild(element)
    await settle(element)

    const reconnectButton = [...(element.shadowRoot?.querySelectorAll('cv-button') ?? [])].find((button) =>
      button.textContent?.includes('Reconnect'),
    )
    reconnectButton?.click()

    expect(connect).toHaveBeenCalledTimes(1)
  })
})
