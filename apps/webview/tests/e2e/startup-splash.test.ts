import {mkdir, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'
import sharp from 'sharp'
import {expect, test} from 'vitest'

import type {AppContext} from '../../src/shared/services/app-context'

type StartupSample = {
  at: number
  color: string
  state: string | undefined
  children: number
  backgroundImage: string
  filter: string
}

type StartupHarness = {
  readyAt?: number
  readyExitState?: string
  releasedAt?: number
  samples: StartupSample[]
  appearances: number[]
  running: boolean
}

declare global {
  interface Window {
    __startupSplashE2e: StartupHarness
  }
}

const require = createRequire(import.meta.url)
const {PNG} = require('pngjs') as {
  PNG: {sync: {read(buffer: Buffer): {data: Buffer; width: number; height: number}}}
}
const artifactDirectory = path.resolve(__dirname, '../../../../.artifacts/web-splash')

test('startup keeps the active login canvas and releases directly into one brand appearance', async (ctx) => {
  const browser = globalThis.__E2E_BROWSER__
  if (!browser) return ctx.skip()
  const browserName = browser.browserType().name()

  for (const saved of [false, true]) {
    for (const theme of ['light', 'dark'] as const) {
      const name = `${saved ? 'saved' : 'system'}-${theme}`
      const directory = path.join(artifactDirectory, browserName, name)
      await mkdir(directory, {recursive: true})
      const context = await browser.newContext({
        viewport: {width: 1280, height: 900},
        colorScheme: saved ? (theme === 'light' ? 'dark' : 'light') : theme,
        reducedMotion: 'no-preference',
      })
      const page = await context.newPage()
      const frames: {buffer: Buffer; timestamp: number}[] = []
      let frameClockOffset: number | undefined
      let resolveFirstFrame: () => void
      const firstFrame = new Promise<void>((resolve) => {
        resolveFirstFrame = resolve
      })

      try {
        await page.addInitScript(
          ({savedTheme}) => {
            if (savedTheme) {
              localStorage.setItem(
                'theme-state',
                JSON.stringify({data: savedTheme, version: 0, to: Date.now() + 86_400_000}),
              )
            } else {
              localStorage.removeItem('theme-state')
            }
            const harness: StartupHarness = {samples: [], appearances: [], running: true}
            window.__startupSplashE2e = harness
            document.addEventListener(
              'chromvoid:startup-content-ready',
              () => {
                harness.readyAt = performance.now()
                queueMicrotask(() => {
                  harness.readyExitState = document.getElementById('loading-native')?.dataset['splashState']
                })
              },
              {once: true},
            )
            document.addEventListener(
              'chromvoid:startup-splash-released',
              () => {
                harness.releasedAt = performance.now()
              },
              {once: true},
            )

            const animate = Element.prototype.animate
            Element.prototype.animate = function (keyframes, options) {
              const animation = animate.call(this, keyframes, options)
              const root = this.getRootNode()
              if (
                this.id === 'spiralTrace' &&
                root instanceof ShadowRoot &&
                root.host.localName === 'welcome-chromvoid-icon' &&
                animation.effect?.getTiming().duration === 1080
              ) {
                harness.appearances.push(performance.now())
              }
              return animation
            }
            const sample = () => {
              const splash = document.getElementById('loading-native')
              if (splash && document.documentElement.hasAttribute('loading')) {
                const style = getComputedStyle(splash)
                if (style.display !== 'none')
                  harness.samples.push({
                    at: performance.now(),
                    color: style.backgroundColor,
                    state: splash.dataset['splashState'],
                    children: splash.childElementCount,
                    backgroundImage: style.backgroundImage,
                    filter: style.filter,
                  })
              }
              if (harness.running) requestAnimationFrame(sample)
            }
            requestAnimationFrame(sample)
          },
          {savedTheme: saved ? theme : null},
        )
        await page.screencast.start({
          size: {width: 1280, height: 900},
          quality: 100,
          onFrame: ({data, timestamp}) => {
            // Engines use different clock origins; align them before navigation.
            frameClockOffset ??= Date.now() - timestamp
            frames.push({buffer: data, timestamp: timestamp + frameClockOffset})
            resolveFirstFrame()
          },
        })
        await firstFrame
        await page.goto('http://localhost:4400/index.html?preview=welcome&layout=desktop', {
          waitUntil: 'domcontentloaded',
        })
        await page.locator('welcome-chromvoid-icon[animated]').waitFor()
        await page.waitForFunction(() => window.__startupSplashE2e.appearances.length > 0)
        await page.waitForTimeout(1500)
        await page.screenshot({path: path.join(directory, 'login.png')})
        await page.screencast.stop()

        const result = await page.locator('welcome-page-desktop-layout').evaluate((welcome) => {
          window.__startupSplashE2e.running = false
          const color = getComputedStyle(welcome).backgroundColor
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const paint = canvas.getContext('2d')
          if (!paint) throw new Error('Canvas color conversion is unavailable')
          paint.fillStyle = color
          paint.fillRect(0, 0, 1, 1)
          return {
            ...window.__startupSplashE2e,
            color,
            rgb: [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3),
            theme: document.documentElement.dataset['theme'],
            firstPaint:
              performance.timeOrigin + (performance.getEntriesByName('first-paint')[0]?.startTime ?? 0),
          }
        })
        // Exclude the preceding about:blank frame. Keep every paint of this document,
        // including its empty initial canvas, the opacity fade and the login appearance.
        const documentFrames = await Promise.all(
          frames
            .filter((frame) => frame.timestamp >= result.firstPaint)
            .map(async (frame) => ({...frame, buffer: await sharp(frame.buffer).png().toBuffer()})),
        )
        await Promise.all(
          documentFrames.map((frame, index) =>
            writeFile(path.join(directory, `frame-${String(index + 1).padStart(4, '0')}.png`), frame.buffer),
          ),
        )

        expect(result.theme, name).toBe(theme)
        expect(result.readyAt, name).toBeDefined()
        expect(result.readyExitState, `${name}: readiness starts exit in the same task`).toBe('exiting')
        expect(result.releasedAt, name).toBeDefined()
        const fadeMs = (result.releasedAt ?? 0) - (result.readyAt ?? 0)
        expect(fadeMs, `${name}: normal opacity fade`).toBeGreaterThanOrEqual(230)
        expect(fadeMs, `${name}: no minimum visibility hold`).toBeLessThan(500)
        expect(result.appearances, `${name}: one login appearance`).toHaveLength(1)
        expect(result.appearances[0], `${name}: appearance follows release`).toBeGreaterThanOrEqual(
          result.releasedAt ?? 0,
        )
        expect(result.samples.length, `${name}: observed the visible startup canvas`).toBeGreaterThan(0)
        for (const sample of result.samples) {
          expect(sample.color, `${name} at ${sample.at.toFixed(1)}ms`).toBe(result.color)
          expect(sample.children, name).toBe(0)
          expect(sample.backgroundImage, name).toBe('none')
          expect(sample.filter, name).toBe('none')
        }
        expect(documentFrames.length, `${name}: recorded startup frame series`).toBeGreaterThan(3)
        for (const [index, frame] of documentFrames.entries()) {
          const image = PNG.sync.read(frame.buffer)
          // Welcome's protected gradients/grid appear during the fade. Corners may
          // vary slightly, but must never flash the opposite theme's canvas.
          for (const [x, y] of [
            [2, 2],
            [image.width - 3, 2],
            [2, image.height - 3],
            [image.width - 3, image.height - 3],
          ]) {
            const offset = ((y ?? 0) * image.width + (x ?? 0)) * 4
            const delta = Math.max(
              ...result.rgb.map((channel, channelIndex) =>
                Math.abs(channel - (image.data[offset + channelIndex] ?? 0)),
              ),
            )
            expect(delta, `${name}: frame ${index + 1} canvas corner`).toBeLessThan(40)
          }
        }
        console.info(
          `startup-splash ${name}: ${documentFrames.length} frames, ${result.samples.length} canvas samples, ready→released=${fadeMs.toFixed(1)}ms, ${directory}`,
        )
        if (saved && theme === 'dark') {
          for (const change of [
            {setting: 'light', system: 'dark', resolved: 'light'},
            {setting: 'system', system: 'light', resolved: 'light'},
            {setting: 'system', system: 'dark', resolved: 'dark'},
          ] as const) {
            await page.emulateMedia({colorScheme: change.system})
            // Theme is a welcome fixture mutation; yield a frame so Chromium 149 retains the result.
            await page.evaluate(async (setting) => {
              const load = new Function('return import("/shared/services/app-context.ts")') as () => Promise<{
                getAppContext(): AppContext
              }>
              const {getAppContext} = await load()
              getAppContext().store.setTheme(setting)
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            }, change.setting)
            await page.waitForFunction((resolved) => {
              return (
                document.documentElement.getAttribute('data-theme') === resolved &&
                document.documentElement.getAttribute('theme') === resolved
              )
            }, change.resolved)
            expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
              change.resolved,
            )
          }
        }
      } finally {
        await page.screencast.stop()
        await context.close()
      }
    }
  }
}, 120000)
