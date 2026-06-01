import {createRequire} from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

import {diff} from '@blazediff/core'
import type {Page} from 'playwright'

const require = createRequire(import.meta.url)
const {PNG} = require('pngjs') as {
  PNG: {
    sync: {
      read(buffer: Buffer): {data: Buffer; width: number; height: number}
      write(image: {data: Buffer; width: number; height: number}): Buffer
    }
  }
}

export type VisualSnapshotOptions = {
  suite: string
  viewport?: {width: number; height: number}
  clipSelector?: string
  fullPage?: boolean
  threshold?: number
  maxDiffRatio?: number
}

type ClipRect = {
  x: number
  y: number
  width: number
  height: number
}

const BASELINE_ROOT = path.resolve(__dirname, '__visual-baselines__')
const ARTIFACT_ROOT = path.resolve(__dirname, '../../../../.artifacts/e2e-visual')
const UPDATE_VISUAL_SNAPSHOTS = process.env['UPDATE_VISUAL_SNAPSHOTS'] === '1'

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function waitForStableVisualState(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  })
  await page.evaluate(async () => {
    await document.fonts?.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

async function waitForStartupSplashReleased(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const rootReady = !document.documentElement.hasAttribute('loading')
      const bodyReady = !document.body.hasAttribute('loading')
      const splash = document.getElementById('loading-native')
      const splashHidden =
        !splash ||
        getComputedStyle(splash).display === 'none' ||
        (splash.getBoundingClientRect().width === 0 && splash.getBoundingClientRect().height === 0)

      return rootReady && bodyReady && splashHidden
    },
    undefined,
    {timeout: 12_000},
  )
}

async function getDeepClip(page: Page, selector: string): Promise<ClipRect> {
  const rect = await page.evaluate((sel) => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }

    const element = deepFind(document, sel)
    const bounds = element?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null

    return {
      x: Math.max(0, Math.floor(bounds.left)),
      y: Math.max(0, Math.floor(bounds.top)),
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
    }
  }, selector)

  if (!rect) {
    throw new Error(`visual snapshot clip target not found or empty: ${selector}`)
  }

  return rect
}

function writeArtifactFiles(
  suite: string,
  name: string,
  actual: Buffer,
  diffPng: Buffer | null,
): {actualPath: string; diffPath: string | null} {
  const artifactDir = path.join(ARTIFACT_ROOT, sanitizeSegment(suite), sanitizeSegment(name))
  fs.mkdirSync(artifactDir, {recursive: true})

  const actualPath = path.join(artifactDir, 'actual.png')
  fs.writeFileSync(actualPath, actual)

  if (!diffPng) {
    return {actualPath, diffPath: null}
  }

  const diffPath = path.join(artifactDir, 'diff.png')
  fs.writeFileSync(diffPath, diffPng)
  return {actualPath, diffPath}
}

export async function assertVisualSnapshot(
  page: Page,
  name: string,
  options: VisualSnapshotOptions,
): Promise<void> {
  if (options.viewport) {
    await page.setViewportSize(options.viewport)
  }

  await waitForStartupSplashReleased(page)
  await waitForStableVisualState(page)

  const suite = sanitizeSegment(options.suite)
  const snapshotName = sanitizeSegment(name)
  const baselinePath = path.join(BASELINE_ROOT, suite, `${snapshotName}.png`)
  const clip = options.clipSelector ? await getDeepClip(page, options.clipSelector) : undefined
  const actual = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip,
    fullPage: options.fullPage ?? false,
    scale: 'css',
  })

  if (!fs.existsSync(baselinePath)) {
    if (UPDATE_VISUAL_SNAPSHOTS) {
      fs.mkdirSync(path.dirname(baselinePath), {recursive: true})
      fs.writeFileSync(baselinePath, actual)
      return
    }

    const {actualPath} = writeArtifactFiles(options.suite, name, actual, null)
    throw new Error(
      `Missing visual baseline: ${baselinePath}. Actual screenshot written to ${actualPath}. Run test:e2e:visual:update to create baselines.`,
    )
  }

  const expected = fs.readFileSync(baselinePath)
  const expectedPng = PNG.sync.read(expected)
  const actualPng = PNG.sync.read(actual)

  if (actualPng.width !== expectedPng.width || actualPng.height !== expectedPng.height) {
    if (UPDATE_VISUAL_SNAPSHOTS) {
      fs.writeFileSync(baselinePath, actual)
      return
    }

    const {actualPath} = writeArtifactFiles(options.suite, name, actual, null)
    throw new Error(
      `Visual baseline size mismatch for ${options.suite}/${name}: expected ${expectedPng.width}x${expectedPng.height}, got ${actualPng.width}x${actualPng.height}. Actual screenshot written to ${actualPath}.`,
    )
  }

  const diffData = Buffer.alloc(actualPng.width * actualPng.height * 4)
  const differentPixels = diff(
    expectedPng.data,
    actualPng.data,
    diffData,
    actualPng.width,
    actualPng.height,
    {
      threshold: options.threshold ?? 0.12,
      includeAA: false,
      diffColor: [255, 0, 0],
      aaColor: [255, 255, 0],
    },
  )
  const totalPixels = actualPng.width * actualPng.height
  const diffRatio = differentPixels / totalPixels

  if (diffRatio <= (options.maxDiffRatio ?? 0.003)) {
    return
  }

  if (UPDATE_VISUAL_SNAPSHOTS) {
    fs.writeFileSync(baselinePath, actual)
    return
  }

  const diffPng = PNG.sync.write({data: diffData, width: actualPng.width, height: actualPng.height})
  const {actualPath, diffPath} = writeArtifactFiles(options.suite, name, actual, diffPng)
  throw new Error(
    `Visual snapshot mismatch for ${options.suite}/${name}: ${differentPixels}/${totalPixels} pixels differ (${(diffRatio * 100).toFixed(3)}%). Actual: ${actualPath}. Diff: ${diffPath}.`,
  )
}
