import {atom} from '@reatom/core'
import type {PropertyValues} from 'lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('root/app/bootstrap/Initialize', () => ({
  init: vi.fn(),
}))

vi.mock('root/app/bootstrap/startup-readiness', () => ({
  markStartupContentReadyWhenStable: vi.fn(),
}))

import {markStartupContentReadyWhenStable} from '../../src/app/bootstrap/startup-readiness'
import type {Routes} from '../../src/app/router/router'
import type {TransportLike} from '../../src/core/transport/transport'
import {ChromVoidApp} from '../../src/routes/app.route.impl'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type StartupReadinessLifecycle = {
  firstUpdated(changedProperties: PropertyValues): void
}

let app: ChromVoidApp | undefined

function startApp(options: {
  route: Routes
  kind: TransportLike['kind']
  connected: boolean
  connecting: boolean
}) {
  const route = atom<Routes>(options.route)
  const connected = atom(options.connected)
  const connecting = atom(options.connecting)

  initAppContext(
    createMockAppContext({
      router: {route} as never,
      ws: {kind: options.kind, connected, connecting} as never,
    }),
  )

  app = new ChromVoidApp()
  ;(app as unknown as StartupReadinessLifecycle).firstUpdated(new Map())
  return {app, route, connected, connecting}
}

describe('ChromVoidApp startup readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(markStartupContentReadyWhenStable).mockClear()
  })

  afterEach(() => {
    app?.disconnectedCallback()
    app = undefined
    vi.clearAllTimers()
    vi.useRealTimers()
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('keeps the transient web no-connection route off startup readiness before welcome', async () => {
    const {route, connected, connecting} = startApp({
      route: 'no-connection',
      kind: 'ws',
      connected: false,
      connecting: true,
    })

    await vi.advanceTimersByTimeAsync(361)
    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()

    connected.set(true)
    connecting.set(false)
    route.set('welcome')
    await vi.advanceTimersByTimeAsync(361)

    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()
  })

  it('marks a real web no-connection screen when the connection attempt ends without connecting', async () => {
    const {app, route, connecting} = startApp({
      route: 'no-connection',
      kind: 'ws',
      connected: false,
      connecting: true,
    })

    await vi.advanceTimersByTimeAsync(361)
    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()

    connecting.set(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(route()).toBe('no-connection')
    await vi.advanceTimersByTimeAsync(359)
    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(markStartupContentReadyWhenStable).toHaveBeenCalledExactlyOnceWith(app, {
      criticalSelectors: ['.route-content[data-route="no-connection"]'],
    })
  })

  it('keeps disconnected Tauri no-connection transient even when it is not connecting', async () => {
    startApp({
      route: 'no-connection',
      kind: 'tauri',
      connected: false,
      connecting: false,
    })

    await vi.advanceTimersByTimeAsync(720)

    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()
  })

  it('marks no-connection after a fatal bootstrap error with an already connected transport', async () => {
    const {app} = startApp({
      route: 'no-connection',
      kind: 'ws',
      connected: true,
      connecting: false,
    })

    await vi.advanceTimersByTimeAsync(359)
    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(markStartupContentReadyWhenStable).toHaveBeenCalledExactlyOnceWith(app, {
      criticalSelectors: ['.route-content[data-route="no-connection"]'],
    })
  })

  it('marks dashboard after the route settles', async () => {
    const {app} = startApp({
      route: 'dashboard',
      kind: 'ws',
      connected: true,
      connecting: false,
    })

    await vi.advanceTimersByTimeAsync(359)
    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(markStartupContentReadyWhenStable).toHaveBeenCalledExactlyOnceWith(app, {
      criticalSelectors: ['.route-content[data-route="dashboard"]'],
    })
  })

  it('cancels pending readiness and stops subscribing when disconnected', async () => {
    const started = startApp({
      route: 'dashboard',
      kind: 'ws',
      connected: true,
      connecting: false,
    })

    started.app.disconnectedCallback()
    app = undefined
    started.route.set('no-connection')
    await vi.advanceTimersByTimeAsync(720)

    expect(markStartupContentReadyWhenStable).not.toHaveBeenCalled()
  })
})
