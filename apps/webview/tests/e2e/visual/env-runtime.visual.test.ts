import type {Page} from 'playwright'
import {expect, test} from 'vitest'

import {
  createEnvRuntimeFixtureSeed,
  createPresetProposal,
  createRun,
  createRunApproval,
  ENV_RUNTIME_SECRET,
  getDeepText,
  hasDeepSelector,
  openEnvRuntimeFixture,
  waitForDeepSelector,
} from '../env-runtime-fixture'
import {installFixedVisualClock} from '../visual-fixtures'
import {assertVisualSnapshot} from '../visual-snapshot'

declare global {
  var __E2E_PAGE__: Page | undefined
}

function getPage(ctx: {skip: () => void}): Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) ctx.skip()
  return page
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme)
    document.documentElement.setAttribute('theme', nextTheme)
  }, theme)
  await settle(page)
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

async function openActivity(page: Page): Promise<void> {
  await page.locator('cv-tab[value="activity"]').click()
  await page.waitForFunction(() => {
    function find(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const child of root.querySelectorAll('*')) {
        if (child.shadowRoot) {
          const nested = find(child.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }
    return (find(document, 'cv-tabs') as (HTMLElement & {value?: string}) | null)?.value === 'activity'
  })
  await waitForDeepSelector(page, '[data-runtime-runs]')
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).resolves.toBe(false)
}

async function expectDeepSelectorsInViewport(page: Page, selectors: string[]): Promise<void> {
  const measurements = await page.evaluate((targets) => {
    function find(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const child of root.querySelectorAll('*')) {
        if (child.shadowRoot) {
          const nested = find(child.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    return targets.map((selector) => {
      const element = find(document, selector)
      const rect = element?.getBoundingClientRect()
      const style = element ? getComputedStyle(element) : null
      let clipTop = 0
      let clipBottom = window.innerHeight
      let ancestor = element?.parentElement ?? null
      while (ancestor) {
        const ancestorStyle = getComputedStyle(ancestor)
        if (/(auto|clip|hidden|scroll)/.test(ancestorStyle.overflowY)) {
          const ancestorRect = ancestor.getBoundingClientRect()
          clipTop = Math.max(clipTop, ancestorRect.top)
          clipBottom = Math.min(clipBottom, ancestorRect.bottom)
        }
        const parent = ancestor.parentElement
        if (parent) {
          ancestor = parent
          continue
        }
        const root = ancestor.getRootNode()
        ancestor = root instanceof ShadowRoot ? root.host : null
      }
      const visible = Boolean(
        rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= clipTop &&
          rect.bottom <= clipBottom &&
          style?.display !== 'none' &&
          style?.visibility !== 'hidden' &&
          Number(style?.opacity ?? 1) > 0,
      )
      return {
        selector,
        visible,
        top: rect?.top ?? null,
        bottom: rect?.bottom ?? null,
        height: rect?.height ?? null,
        clipTop,
        clipBottom,
      }
    })
  }, selectors)

  expect(
    measurements.map(({visible}) => visible),
    JSON.stringify(measurements),
  ).toEqual(selectors.map(() => true))
}

async function scrollDeepSelectorIntoView(
  page: Page,
  selector: string,
  block: ScrollLogicalPosition = 'center',
): Promise<void> {
  await page.evaluate(({target, blockPosition}) => {
    function find(root: Document | ShadowRoot, nestedSelector: string): Element | null {
      const found = root.querySelector(nestedSelector)
      if (found) return found
      for (const child of root.querySelectorAll('*')) {
        if (child.shadowRoot) {
          const nested = find(child.shadowRoot, nestedSelector)
          if (nested) return nested
        }
      }
      return null
    }
    const element = find(document, target)
    if (!element) throw new Error(`Unable to scroll missing visual target: ${target}`)
    element.scrollIntoView({block: blockPosition, inline: 'nearest'})
  }, {target: selector, blockPosition: block})
  await settle(page)
}

test('visual: Env Runtime populated desktop in dark theme', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await page.emulateMedia({reducedMotion: 'reduce'})
  await openEnvRuntimeFixture(page, createEnvRuntimeFixtureSeed(), {width: 1440, height: 1000})
  await setTheme(page, 'dark')
  await waitForDeepSelector(page, `cv-button[data-secret-id="${ENV_RUNTIME_SECRET.id}"]`)

  expect(await getDeepText(page, '.status-band')).toContain('Vault')
  await expectNoDocumentOverflow(page)
  await assertVisualSnapshot(page, 'desktop-populated-dark-1440x1000', {
    suite: 'env-runtime',
    viewport: {width: 1440, height: 1000},
  })
})

test('visual: Env Runtime recovery keeps the running process visible', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  const run = createRun({id: 'run-recovery-visible', status: 'running'})
  await installFixedVisualClock(page)
  await page.emulateMedia({reducedMotion: 'reduce'})
  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({
      access: {
        status: 'disabled_by_rollout',
        denial_code: 'FEATURE_DISABLED_BY_ROLLOUT',
      },
      snapshot: {
        status: {vault_unlocked: false},
        proposals: [],
        approvals: [],
        runs: [run],
      },
    }),
    {width: 960, height: 900},
  )
  await setTheme(page, 'light')
  await openActivity(page)
  await waitForDeepSelector(page, `cv-button[data-run-id="${run.id}"]`)
  await scrollDeepSelectorIntoView(page, `cv-button[data-run-id="${run.id}"]`, 'nearest')

  const activityWarning = 'cv-tab-panel[tab="activity"] [data-readiness-warning]'
  expect(await getDeepText(page, activityWarning)).toContain(
    'FEATURE_DISABLED_BY_ROLLOUT',
  )
  expect(await getDeepText(page, activityWarning)).toContain('Env Runtime access is unavailable')
  expect(await getDeepText(page, activityWarning)).not.toContain('available in the macOS desktop app')
  await expectDeepSelectorsInViewport(page, [
    activityWarning,
    `cv-button[data-run-id="${run.id}"]`,
  ])
  await expectNoDocumentOverflow(page)
  await assertVisualSnapshot(page, 'desktop-recovery-light-960x900', {
    suite: 'env-runtime',
    viewport: {width: 960, height: 900},
  })
})

test('visual: Env Runtime store failure contains canonical long proposal facts', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  const workspaceRoot =
    '/Users/alice/Projects/ChromVoid/production-readiness/workspaces/release-candidate-with-long-name'
  const cwd = `${workspaceRoot}/services/backend/integration-tests`
  const executable =
    '/Applications/ChromVoid Toolchains/Release Candidate/bin/runtime-with-a-deliberately-long-name'
  const args = [
    'run',
    'test:integration',
    '--configuration=release-candidate-with-sanitizers-and-deterministic-fixtures',
    '--reporter=verbose-json-lines',
  ]
  const longProposal = createPresetProposal()
  const profileId = longProposal.prepared_preset!.profile_id
  longProposal.metadata = {
    ...longProposal.metadata,
    id: 'proposal-long-command',
    operation: 'create',
  }
  longProposal.target = null
  longProposal.base_revision = null
  longProposal.draft = {
    resource_kind: 'preset',
    draft: {
      profile_id: profileId,
      slug: 'release-verification',
      label: 'Release verification with intentionally long canonical paths',
      workspace_root: workspaceRoot,
      cwd,
      executable,
      args,
      passthrough_env: ['PATH', 'CI', 'LANG', 'RUST_BACKTRACE'],
    },
  }
  longProposal.prepared_preset = {
    profile_id: profileId,
    workspace_root: workspaceRoot,
    cwd,
    executable,
    executable_sha256: 'c'.repeat(64),
    args,
    passthrough_env: ['PATH', 'CI', 'LANG', 'RUST_BACKTRACE'],
  }
  await installFixedVisualClock(page)
  await page.emulateMedia({reducedMotion: 'reduce'})
  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({
      snapshot: {
        status: {
          device_store_available: false,
          device_store_error_code: 'DEVICE_STORE_CORRUPT',
        },
        presets: [],
        proposals: [longProposal],
        approvals: [],
        runs: [],
      },
    }),
    {width: 1280, height: 900},
  )
  await setTheme(page, 'dark')
  await openActivity(page)
  await page.locator(`[data-proposal-id="${longProposal.metadata.id}"]`).click()
  await waitForDeepSelector(page, '[data-prepared-preset-facts]')

  expect(await getDeepText(page, '[data-device-store-warning]')).toContain('DEVICE_STORE_CORRUPT')
  expect(await getDeepText(page, 'cv-dialog[open] [data-readiness-warning]')).toContain(
    'DEVICE_STORE_CORRUPT',
  )
  const preparedFacts = await getDeepText(page, '[data-prepared-preset-facts]')
  expect(preparedFacts).toContain(workspaceRoot)
  expect(preparedFacts).toContain(executable)
  expect(preparedFacts).toContain(args[2])
  expect(await hasDeepSelector(page, 'cv-dialog[open] cv-button[variant="primary"][disabled]')).toBe(
    true,
  )
  await expectDeepSelectorsInViewport(page, [
    'cv-dialog[open] [data-readiness-warning]',
    'cv-dialog[open] [data-prepared-preset-facts] > div:nth-child(4)',
  ])
  await expectNoDocumentOverflow(page)
  await assertVisualSnapshot(page, 'desktop-store-error-long-command-dark-1280x900', {
    suite: 'env-runtime',
    viewport: {width: 1280, height: 900},
  })
})

test('visual: Env Runtime RTL approval contains a long untrusted reason', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  const approval = createRunApproval({
    reason:
      'سبب غير موثوق مقدم من الوكيل: شغّل مجموعة اختبارات الإصدار الكاملة بعد التحقق من المسارات، ثم احتفظ بالمخرجات في التدفق المرفق فقط. This text is intentionally long to verify wrapping, isolation, and hierarchy without trusting agent-supplied content.',
  })
  await installFixedVisualClock(page)
  await page.addInitScript(() => localStorage.setItem('current-lang', 'ar'))
  await page.emulateMedia({reducedMotion: 'reduce'})
  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({
      snapshot: {proposals: [], approvals: [approval], runs: []},
    }),
    {width: 1280, height: 900},
  )
  await setTheme(page, 'light')
  await openActivity(page)
  await page.locator(`[data-run-id="${approval.run.id}"]`).click()
  await waitForDeepSelector(page, '[data-run-approval-review]')
  await scrollDeepSelectorIntoView(page, '.untrusted-note')

  await expect(
    page.evaluate(() => ({direction: document.documentElement.dir, language: document.documentElement.lang})),
  ).resolves.toEqual({direction: 'rtl', language: 'ar'})
  expect(await getDeepText(page, '.untrusted-note')).toContain('سبب غير موثوق')
  await expectNoDocumentOverflow(page)
  await assertVisualSnapshot(page, 'desktop-approval-long-reason-light-rtl-1280x900', {
    suite: 'env-runtime',
    viewport: {width: 1280, height: 900},
  })
})
