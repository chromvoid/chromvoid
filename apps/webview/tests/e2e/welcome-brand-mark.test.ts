import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {expect, test} from 'vitest'
import type {Page} from 'playwright'

import type {AppContext} from '../../src/shared/services/app-context'
import type {WelcomeModel} from '../../src/routes/welcome/welcome.model'

type BrandAnimation = {animation: Animation; target: SVGElement; startedAt: number}
type UnlockResponse = {
  ok: boolean
  result?: {command: string; result: object}
  error?: string
  code?: string
}

type MarkHarness = {
  animations: BrandAnimation[]
  context?: AppContext
  model?: WelcomeModel
  resolveUnlock?: (response: UnlockResponse) => void
  unlockRequestedAt?: number
  completionAt?: number
  openedAt?: number
  navigationAt?: number
}

declare global {
  interface Window {
    __welcomeMarkE2e: MarkHarness
  }
}

const require = createRequire(import.meta.url)
const {PNG} = require('pngjs') as {
  PNG: {sync: {read(buffer: Buffer): {data: Buffer; width: number; height: number}}}
}

function cyanPixelsOutsideCore(buffer: Buffer): number {
  const image = PNG.sync.read(buffer)
  let cyanPixels = 0
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      // The core is at (143,118) in the 256×256 artboard. Only ribbon pixels count.
      if (Math.hypot(x - (image.width * 143) / 256, y - (image.height * 118) / 256) < image.width * 0.18)
        continue
      const offset = (y * image.width + x) * 4
      const red = image.data[offset] ?? 0
      const green = image.data[offset + 1] ?? 0
      const blue = image.data[offset + 2] ?? 0
      if (blue > 140 && blue - red > 35 && green - red > 25) cyanPixels += 1
    }
  }
  return cyanPixels
}

const icon = 'welcome-chromvoid-icon[animated]'
const screenshotDirectory = process.env['BRAND_MARK_SCREENSHOTS_DIR']

async function screenshot(page: Page, name: string) {
  if (!screenshotDirectory) return
  await mkdir(screenshotDirectory, {recursive: true})
  await page.screenshot({path: path.join(screenshotDirectory, `${name}.png`)})
}

async function openWelcome(page: Page, theme: 'light' | 'dark', reducedMotion = false) {
  await page.emulateMedia({colorScheme: theme, reducedMotion: reducedMotion ? 'reduce' : 'no-preference'})
  await page.goto(`http://localhost:4400/index.html?preview=welcome&layout=desktop&e2eTheme=${theme}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.locator(icon).waitFor()
  await page.waitForFunction(() => document.documentElement.dataset['startupSplashReleased'] === 'true')
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe(theme)
}

// Chromium 149 can collect an evaluate result while Lit/Reatom flushes its final mutation.
// Fixture and animation mutations yield a frame; user actions use Playwright input.
async function connectUnlockHarness(page: Page) {
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<{
      getAppContext(): AppContext
    }>
    const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
    const context = getAppContext()
    if (context.ws.constructor.name !== 'MockTransport') throw new Error('Expected the actual MockTransport')

    context.state.update({NeedUserInitialization: false, StorageOpened: false})
    const layout = (() => {
      function find(root: Document | ShadowRoot): HTMLElement | null {
        const found = root.querySelector<HTMLElement>('welcome-page-desktop-layout')
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const inner = find(element.shadowRoot)
            if (inner) return inner
          }
        }
        return null
      }
      return find(document)
    })() as (HTMLElement & {model: WelcomeModel}) | null
    if (!layout?.model) throw new Error('Welcome model is unavailable')

    const harness = window.__welcomeMarkE2e
    harness.context = context
    harness.model = layout.model
    const update = context.state.update.bind(context.state)
    context.state.update = (data) => {
      if (data.StorageOpened === true) harness.navigationAt = performance.now()
      update(data)
    }
    const finish = layout.model.setup.icon.finishDerivation.bind(layout.model.setup.icon)
    layout.model.setup.icon.finishDerivation = async () => {
      await finish()
      harness.completionAt = performance.now()
    }
    const opened = layout.model.setup.icon.opened.bind(layout.model.setup.icon)
    layout.model.setup.icon.opened = () => {
      harness.openedAt = performance.now()
      opened()
    }

    // Install only after boot: the app and all catalog calls keep their real MockTransport.
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke(command: string, payload?: {args?: {command?: string}}) {
          if (command === 'unlock_debug_log') return Promise.resolve(null)
          if (command !== 'rpc_dispatch' || payload?.args?.command !== 'vault:unlock') {
            return Promise.reject(new Error(`Unexpected native command during unlock: ${command}`))
          }
          harness.unlockRequestedAt = performance.now()
          return new Promise<UnlockResponse>((resolve) => {
            harness.resolveUnlock = resolve
          })
        },
      },
    })
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await page.locator('[id="welcome.unlock-submit"]').waitFor()
}

// Fill the rendered control after the splash releases input; see connectUnlockHarness.
async function startUnlock(page: Page) {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })
  await page.locator('[control-id="welcome.unlock-password"] input').fill('brand mark e2e')
  await page.locator('[id="welcome.unlock-submit"]').click()
  await page.waitForFunction(() => Boolean(window.__welcomeMarkE2e.resolveUnlock))
  await page.locator(`${icon} [data-icon-state="active"]`).waitFor()
}

test('welcome brand mark follows actual unlock, process lifetime and reduced-motion contracts in both themes', async (ctx) => {
  const page = globalThis.__E2E_PAGE__
  if (!page) return ctx.skip()
  await page.setViewportSize({width: 1280, height: 900})
  await page.addInitScript(() => {
    localStorage.removeItem('theme-state')
    window.__welcomeMarkE2e = {animations: []}
    const animate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options)
      const root = this.getRootNode()
      if (
        this instanceof SVGElement &&
        root instanceof ShadowRoot &&
        root.host.localName === 'welcome-chromvoid-icon'
      ) {
        window.__welcomeMarkE2e.animations.push({animation, target: this, startedAt: performance.now()})
      }
      return animation
    }
  })

  for (const theme of ['dark', 'light'] as const) {
    // Match the old static reference exactly: desktop, first run, reduced motion, 1280×900.
    await openWelcome(page, theme, true)
    await page.waitForTimeout(500)
    expect(
      await page.locator(`${icon} svg`).evaluate((svg) => svg.getAnimations({subtree: true}).length),
    ).toBe(0)
    await screenshot(page, `after-static-${theme}`)

    await openWelcome(page, theme)
    await page.waitForFunction(() =>
      window.__welcomeMarkE2e.animations.some(
        (record) =>
          record.target.id === 'spiralTrace' && record.animation.effect?.getTiming().duration === 1080,
      ),
    )
    expect(
      await page.evaluate(
        () =>
          window.__welcomeMarkE2e.animations.filter((record) => record.target.id === 'spiralTrace').length,
      ),
    ).toBe(2)
    if (theme === 'dark') {
      // Paused sampling changes animation state, so yield before returning the evaluate result.
      await page.evaluate(async () => {
        for (const {animation} of window.__welcomeMarkE2e.animations) {
          animation.pause()
          animation.currentTime = 600
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      })
      await screenshot(page, 'appearance-dark')
    }
    await page.waitForTimeout(1500)
    expect(
      await page.locator(`${icon} svg`).evaluate((svg) => svg.getAnimations({subtree: true}).length),
    ).toBe(0)

    await connectUnlockHarness(page)
    await startUnlock(page)
    // The temporary color probe changes DOM; yield as in connectUnlockHarness.
    const unlockAccent = await page.locator('[id="welcome.unlock-submit"]').evaluate(async (button) => {
      const probe = document.createElement('span')
      probe.style.color = 'var(--cv-color-primary)'
      button.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return color
    })
    // Capture the paused sample before yielding past the animation and DOM mutations.
    const signal = await page.locator(`${icon} svg`).evaluate(async (svg) => {
      const latestSignal = [...window.__welcomeMarkE2e.animations]
        .reverse()
        .find((record) => record.target.classList.contains('brandMarkSignal'))
      if (!latestSignal) throw new Error('Pending signal animation is unavailable')
      latestSignal.animation.pause()
      latestSignal.animation.currentTime = 500
      for (const animation of svg.getAnimations({subtree: true})) {
        animation.pause()
        animation.currentTime = 500
      }
      const element = svg.querySelector('.brandMarkSignal')
      if (!element) throw new Error('Brand signal geometry is unavailable')
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      probe.style.color = 'var(--brand-mark-signal-color)'
      element.append(probe)
      const expectedStroke = getComputedStyle(probe).color
      probe.remove()
      const sample = {
        opacity: Number(getComputedStyle(element).opacity),
        dashoffset: Number(getComputedStyle(element).strokeDashoffset.replace('px', '')),
        stroke: getComputedStyle(element).stroke,
        expectedStroke,
        animated: element.getAnimations().length,
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return sample
    })
    expect(signal.opacity).toBeGreaterThan(0.8)
    expect(signal.dashoffset).toBeLessThan(0)
    expect(signal.animated).toBeGreaterThan(0)
    expect(signal.stroke).toBe(signal.expectedStroke)
    const bounds = await page.locator(`${icon} svg`).boundingBox()
    if (!bounds) throw new Error('Brand mark is outside the rendered viewport')
    const pendingRaster = await page.screenshot({clip: bounds})
    expect(cyanPixelsOutsideCore(pendingRaster)).toBeGreaterThanOrEqual(8)
    if (theme === 'light') await screenshot(page, 'derivation-light')

    // Releasing the held RPC updates the app; retain its timestamp, then yield a frame.
    const resolvedAt = await page.evaluate(async () => {
      const harness = window.__welcomeMarkE2e
      harness.resolveUnlock?.({ok: true, result: {command: 'vault:unlock', result: {}}})
      const resolvedAt = performance.now()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return resolvedAt
    })
    await page.waitForFunction(() => window.__welcomeMarkE2e.navigationAt !== undefined)
    const timing = await page.evaluate(() => {
      const {completionAt, openedAt, navigationAt} = window.__welcomeMarkE2e
      return {completionAt: completionAt ?? 0, openedAt: openedAt ?? 0, navigationAt: navigationAt ?? 0}
    })
    expect(timing.completionAt - resolvedAt).toBeGreaterThanOrEqual(0)
    expect(
      await page.evaluate(() =>
        window.__welcomeMarkE2e.animations.some(
          (record) =>
            record.target.classList.contains('brandMarkSignal') &&
            record.animation.effect?.getTiming().duration === 220,
        ),
      ),
    ).toBe(true)
    expect(timing.openedAt).toBeGreaterThanOrEqual(timing.completionAt)
    expect(timing.navigationAt - timing.openedAt).toBeGreaterThanOrEqual(149)
    console.info(
      `brand-mark ${theme}: finish=${(timing.completionAt - resolvedAt).toFixed(1)}ms, opened→navigation=${(timing.navigationAt - timing.openedAt).toFixed(1)}ms`,
    )

    // Keep the deterministic ring sample, then yield past the paused animation mutation.
    const openedRing = await page.locator(`${icon} .brandMarkOpenedRing`).evaluate(async (element) => {
      const record = [...window.__welcomeMarkE2e.animations].reverse().find((item) => item.target === element)
      if (!record) throw new Error('Opened ring animation is unavailable')
      record.animation.pause()
      record.animation.currentTime = 100
      const sample = {
        opacity: Number(getComputedStyle(element).opacity),
        stroke: getComputedStyle(element).stroke,
        animated: element.getAnimations().length,
        duration: record.animation.effect?.getTiming().duration,
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return sample
    })
    expect(openedRing.opacity).toBeGreaterThan(0)
    expect(openedRing.animated).toBe(1)
    expect(openedRing.duration).toBe(550)
    expect(openedRing.stroke).toBe(unlockAccent)
    if (theme === 'dark') await screenshot(page, 'opened-dark')

    const priorAppearanceCount = await page.evaluate(
      () =>
        window.__welcomeMarkE2e.animations.filter(
          (record) =>
            record.target.id === 'spiralTrace' && record.animation.effect?.getTiming().duration === 1080,
        ).length,
    )
    // The next welcome instance needs a locked app state; yield after restoring it.
    await page.evaluate(async () => {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
      window.__welcomeMarkE2e.context?.state.update({StorageOpened: false})
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    // MockTransport intentionally pins the preview route. Mount the next route instance in this
    // same JavaScript process, exactly as a native lock does, and yield after its Lit mount.
    await page.locator('welcome-page-desktop-layout').evaluate(async (layout) => {
      layout.replaceWith(document.createElement('welcome-page-desktop-layout'))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    await page.locator(icon).waitFor()
    await page.waitForFunction(() =>
      window.__welcomeMarkE2e.animations.some(
        (record) => record.target.id === 'coreStage' && record.animation.effect?.getTiming().duration === 350,
      ),
    )
    expect(
      await page.evaluate(
        () =>
          window.__welcomeMarkE2e.animations.filter(
            (record) =>
              record.target.id === 'spiralTrace' && record.animation.effect?.getTiming().duration === 1080,
          ).length,
      ),
    ).toBe(priorAppearanceCount)
    await page.waitForTimeout(400)

    // Longer than the removed 3.2 s idle wave: no fresh animation may appear.
    const animationCount = await page.evaluate(() => window.__welcomeMarkE2e.animations.length)
    await page.waitForTimeout(3300)
    expect(await page.evaluate(() => window.__welcomeMarkE2e.animations.length)).toBe(animationCount)
    expect(
      await page.locator(`${icon} svg`).evaluate((svg) => svg.getAnimations({subtree: true}).length),
    ).toBe(0)
  }

  await openWelcome(page, 'light', true)
  await connectUnlockHarness(page)
  await startUnlock(page)
  const reduced = await page.locator(`${icon} svg`).evaluate((svg) =>
    svg.getAnimations({subtree: true}).map((animation) => ({
      target: ((animation.effect as KeyframeEffect).target as SVGElement).id,
      properties: Object.keys((animation.effect as KeyframeEffect).getKeyframes()[0] ?? {}),
    })),
  )
  expect(reduced).toHaveLength(1)
  expect(reduced[0]?.target).toBe('coreStage')
  expect(reduced[0]?.properties).toContain('opacity')
  expect(reduced[0]?.properties).not.toContain('transform')
  // Error delivery also updates the app; yield as in the successful RPC release above.
  await page.evaluate(async () => {
    window.__welcomeMarkE2e.resolveUnlock?.({ok: false, error: 'Disk is unavailable', code: 'IO_ERROR'})
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  await page.locator(`${icon} [data-icon-state="idle"]`).waitFor()
  expect(await page.locator(`${icon} svg`).evaluate((svg) => svg.getAnimations({subtree: true}).length)).toBe(
    0,
  )
}, 120000)
