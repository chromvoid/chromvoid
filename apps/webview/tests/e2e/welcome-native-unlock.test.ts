import {expect, test} from 'vitest'

import type {AppContext} from '../../src/shared/services/app-context'
import type {WelcomeModel} from '../../src/routes/welcome/welcome.model'

type UnlockResponse = {ok: true; result: {command: string; result: object}}
type UnlockHarness = {
  context: AppContext
  model?: WelcomeModel
  layout?: HTMLElement
  resolveUnlock?: (response: UnlockResponse) => void
  signal?: Animation
  finishStartedAt?: number
  finishedAt?: number
  openedAt?: number
  ringAt?: number
  dashboardAt?: number
  disconnectedAt?: number
  routeAtFinish?: string
  routeAtRing?: string
  connectedAtRing?: boolean
}

declare global {
  interface Window {
    __welcomeNativeUnlockE2e: UnlockHarness
  }
}

test('early native state waits for signal arrival and opened feedback before leaving welcome', async (ctx) => {
  const page = globalThis.__E2E_PAGE__
  if (!page) return ctx.skip()
  await page.setViewportSize({width: 1280, height: 900})
  await page.emulateMedia({colorScheme: 'dark', reducedMotion: 'no-preference'})
  // No preview override: the real Router must select and remove welcome itself.
  await page.goto('http://localhost:4400/index.html?layout=desktop&e2eTheme=dark', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForFunction(() => document.documentElement.dataset['startupSplashReleased'] === 'true')
  // Chromium 149 can collect evaluate results during Lit/Reatom's final mutation flush.
  // Native state delivery stays programmatic and yields a frame before returning.
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<{
      getAppContext(): AppContext
    }>
    const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
    const context = getAppContext()
    if (context.ws.constructor.name !== 'MockTransport' || context.router.constructor.name !== 'Router') {
      throw new Error('Expected the actual transport, router and state from Initialize')
    }
    window.__welcomeNativeUnlockE2e = {context}
    // Keep the full bootstrap and native event handler. Only enable native routing after browser boot.
    const transport = context.ws as unknown as {kind: string; connected: {set(value: boolean): void}}
    transport.kind = 'tauri'
    context.state.update({NeedUserInitialization: false, StorageOpened: false})
    transport.connected.set(false)
    context.router.route()
    transport.connected.set(true)
    if (context.router.route() !== 'welcome') throw new Error('Actual native routing did not select welcome')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  const layout = page.locator('welcome-page-desktop-layout')
  await layout.waitFor()
  await page.locator('welcome-chromvoid-icon[animated] svg').waitFor()
  await page.waitForTimeout(1500)
  await layout.evaluate((element) => {
    const harness = window.__welcomeNativeUnlockE2e
    const model = (element as HTMLElement & {model: WelcomeModel}).model
    harness.model = model
    harness.layout = element as HTMLElement
    const finish = model.setup.icon.finishDerivation.bind(model.setup.icon)
    model.setup.icon.finishDerivation = async () => {
      harness.finishStartedAt = performance.now()
      await finish()
      harness.finishedAt = performance.now()
      harness.routeAtFinish = harness.context.router.route()
    }
    const opened = model.setup.icon.opened.bind(model.setup.icon)
    model.setup.icon.opened = () => {
      harness.openedAt = performance.now()
      opened()
    }
    const disconnect = model.disconnect.bind(model)
    model.disconnect = () => {
      harness.disconnectedAt = performance.now()
      disconnect()
    }
    harness.context.router.route.subscribe((route) => {
      if (route === 'dashboard') harness.dashboardAt = performance.now()
    })
    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options)
      if (this.classList.contains('brandMarkSignal') && animation.effect?.getTiming().duration === 1150) {
        harness.signal = animation
      }
      if (this.classList.contains('brandMarkOpenedRing')) {
        harness.ringAt = performance.now()
        harness.routeAtRing = harness.context.router.route()
        harness.connectedAtRing = harness.layout?.isConnected
      }
      return animation
    }
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke(command: string, payload?: {args?: {command?: string}}) {
          if (command === 'unlock_debug_log') return Promise.resolve(null)
          if (command !== 'rpc_dispatch' || payload?.args?.command !== 'vault:unlock') {
            return Promise.reject(new Error(`Unexpected native command during unlock: ${command}`))
          }
          return new Promise<UnlockResponse>((resolve) => {
            harness.resolveUnlock = resolve
          })
        },
      },
    })
  })
  // Real input reaches the mounted unlock form after the splash releases its hit target.
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })
  await page
    .locator('[control-id="welcome.unlock-password"] input')
    .fill('native event before unlock RPC response')
  await page.locator('[id="welcome.unlock-submit"]').click()
  await page.waitForFunction(() => Boolean(window.__welcomeNativeUnlockE2e.resolveUnlock))
  // Preserve the immediate native-event snapshot, then yield past its reactive updates.
  const earlyState = await page.evaluate(async () => {
    const harness = window.__welcomeNativeUnlockE2e
    if (!harness.signal) throw new Error('Expected a real pending signal animation')
    harness.signal.pause()
    harness.signal.currentTime = 500
    // Reproduce dispatch.rs: emit_basic_state happens before vault:unlock returns.
    const transport = harness.context.ws as unknown as {emit(event: string, data: unknown): void}
    transport.emit('update:state', {StorageOpened: true})
    const snapshot = {
      opened: harness.context.state.data().StorageOpened,
      route: harness.context.router.route(),
      connected: harness.layout?.isConnected,
      finishedAt: harness.finishedAt,
      ringAt: harness.ringAt,
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return snapshot
  })
  expect(earlyState).toEqual({
    opened: true,
    route: 'welcome',
    connected: true,
    finishedAt: undefined,
    ringAt: undefined,
  })
  // Allow the real reactive render to consume the early native event before releasing the RPC.
  await page.waitForTimeout(50)
  expect(await layout.isVisible()).toBe(true)
  expect(await page.evaluate(() => window.__welcomeNativeUnlockE2e.context.router.route())).toBe('welcome')
  // The held native response starts completion feedback; yield before returning.
  await page.evaluate(async () => {
    window.__welcomeNativeUnlockE2e.resolveUnlock?.({
      ok: true,
      result: {command: 'vault:unlock', result: {}},
    })
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await page.waitForFunction(() => window.__welcomeNativeUnlockE2e.disconnectedAt !== undefined)
  const timing = await page.evaluate(() => {
    const h = window.__welcomeNativeUnlockE2e
    return {
      finishStartedAt: h.finishStartedAt ?? 0,
      finishedAt: h.finishedAt ?? 0,
      openedAt: h.openedAt ?? 0,
      ringAt: h.ringAt ?? 0,
      dashboardAt: h.dashboardAt ?? 0,
      disconnectedAt: h.disconnectedAt ?? 0,
      routeAtFinish: h.routeAtFinish,
      routeAtRing: h.routeAtRing,
      connectedAtRing: h.connectedAtRing,
      route: h.context.router.route(),
    }
  })
  expect(timing.finishedAt - timing.finishStartedAt).toBeGreaterThanOrEqual(200)
  expect(timing.openedAt).toBeGreaterThanOrEqual(timing.finishedAt)
  expect(timing.ringAt).toBeGreaterThanOrEqual(timing.openedAt)
  expect(timing.routeAtFinish).toBe('welcome')
  expect(timing.routeAtRing).toBe('welcome')
  expect(timing.connectedAtRing).toBe(true)
  expect(timing.dashboardAt - timing.ringAt).toBeGreaterThanOrEqual(149)
  expect(timing.disconnectedAt).toBeGreaterThanOrEqual(timing.dashboardAt)
  expect(timing.route).toBe('dashboard')
  expect(await layout.count()).toBe(0)
  console.info(
    `native unlock: finish=${(timing.finishedAt - timing.finishStartedAt).toFixed(1)}ms, ring→dashboard=${(timing.dashboardAt - timing.ringAt).toFixed(1)}ms, ring→disconnect=${(timing.disconnectedAt - timing.ringAt).toFixed(1)}ms`,
  )
})
