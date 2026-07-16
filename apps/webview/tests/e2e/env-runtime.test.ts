import type {Page} from 'playwright'
import {expect, test} from 'vitest'

import {
  createEnvRuntimeFixtureSeed,
  createPresetProposal,
  createRun,
  createRunApproval,
  deepClick,
  deepFill,
  emitEnvRuntimeEvent,
  ENV_RUNTIME_PRESET,
  ENV_RUNTIME_SECRET,
  getDeepActiveChain,
  getDeepControlValue,
  getEnvRuntimeBridgeListenerState,
  getDeepText,
  getEnvRuntimeBridgeCalls,
  hasDeepSelector,
  leaveEnvRuntimeFixture,
  openEnvRuntimeFixture,
  setRevealFailure,
  waitForDeepSelector,
  waitForDeepSelectorAbsent,
} from './env-runtime-fixture'

declare global {
  var __E2E_PAGE__: Page | undefined
}

function getPage(ctx: {skip: () => void}): Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) ctx.skip()
  return page
}

function livePresetProposal(expiresInMs = 600_000) {
  const proposal = createPresetProposal()
  proposal.metadata.created_at_epoch_ms = Date.now()
  proposal.metadata.expires_at_epoch_ms = Date.now() + expiresInMs
  return proposal
}

function liveRunApproval(expiresInMs = 120_000) {
  const approval = createRunApproval()
  approval.created_at_epoch_ms = Date.now()
  approval.expires_at_epoch_ms = Date.now() + expiresInMs
  return approval
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

test('Env Runtime uses the strict bridge and keeps keyboard review inside the real dialog', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  const proposal = livePresetProposal()
  const approval = liveRunApproval()
  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({snapshot: {proposals: [proposal], approvals: [approval]}}),
  )
  await openActivity(page)

  await page.locator(`[data-proposal-id="${proposal.metadata.id}"]`).click()
  await waitForDeepSelector(page, '[data-proposal-review]')
  expect(await getDeepText(page, '[data-prepared-preset-facts]')).toContain(
    proposal.prepared_preset?.workspace_root,
  )
  expect(await getDeepText(page, '[data-prepared-preset-facts]')).toContain(
    proposal.prepared_preset?.executable_sha256,
  )
  expect(await getDeepText(page, '[data-prepared-preset-facts]')).not.toContain('/../')

  let active = await getDeepActiveChain(page)
  expect(active.some((element) => element.id === 'proposal-reject')).toBe(true)
  expect(active.some((element) => element.inOpenDialog)).toBe(true)

  await page.keyboard.press('Tab')
  active = await getDeepActiveChain(page)
  expect(active.some((element) => element.inOpenDialog)).toBe(true)
  expect(active.some((element) => element.text === 'Approve')).toBe(true)
  await page.keyboard.press('Enter')
  await waitForDeepSelectorAbsent(page, '[data-proposal-review]')
  await waitForDeepSelectorAbsent(page, 'cv-dialog[open]')
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __ENV_RUNTIME_E2E__?: {calls: Array<{command: string}>}
        }
      ).__ENV_RUNTIME_E2E__?.calls.filter(
        (call) => call.command === 'env_runtime_desktop_snapshot',
      ).length === 2,
  )

  await page.locator(`[data-run-id="${approval.run.id}"]`).click()
  await waitForDeepSelector(page, '[data-run-approval-review]')
  active = await getDeepActiveChain(page)
  expect(active.some((element) => element.id === 'run-approval-reject')).toBe(true)

  await page.keyboard.press('Escape')
  await waitForDeepSelectorAbsent(page, '[data-run-approval-review]')
  await page.waitForFunction(
    (runId) => {
      let active = document.activeElement as HTMLElement | null
      while (active) {
        if (active.dataset['runId'] === runId) return true
        active = active.shadowRoot?.activeElement as HTMLElement | null
      }
      return false
    },
    approval.run.id,
    {timeout: 2_000},
  )
  active = await getDeepActiveChain(page)
  expect(active.some((element) => element.dataRunId === approval.run.id)).toBe(true)
  await page.keyboard.press('Enter')
  await waitForDeepSelector(page, '[data-run-approval-review]')
  await page.keyboard.press('Enter')
  await waitForDeepSelectorAbsent(page, '[data-run-approval-review]')

  const resolutionCalls = (await getEnvRuntimeBridgeCalls(page)).filter(
    (call) =>
      call.command === 'env_runtime_proposal_resolve' ||
      call.command === 'env_runtime_run_approval_resolve',
  )
  expect(resolutionCalls).toEqual([
    {
      command: 'env_runtime_proposal_resolve',
      args: {proposalId: proposal.metadata.id, approve: true, profileBindings: []},
    },
    {
      command: 'env_runtime_run_approval_resolve',
      args: {runId: approval.run.id, approve: false},
    },
  ])
})

test('reveal failure clears the password, and native approval clears successful plaintext', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  const approval = liveRunApproval()
  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({snapshot: {proposals: [], approvals: [approval]}}),
  )
  await setRevealFailure(page, {
    error: 'Master password is incorrect',
    code: 'ENV_RUNTIME_REAUTH_FAILED',
  })

  await deepClick(page, `cv-button[data-secret-id="${ENV_RUNTIME_SECRET.id}"]`)
  await waitForDeepSelector(page, '#env-secret-master-password')
  await deepFill(page, '#env-secret-master-password', 'must-be-cleared')
  await deepClick(page, 'cv-dialog[open] cv-button[variant="primary"]')
  await waitForDeepSelector(page, 'cv-dialog[open] [role="alert"]')

  expect(await getDeepControlValue(page, '#env-secret-master-password')).toBe('')
  expect(await getDeepText(page, 'cv-dialog[open] [role="alert"]')).toContain(
    'ENV_RUNTIME_REAUTH_FAILED',
  )
  expect((await getDeepActiveChain(page)).some((element) => element.id === 'env-secret-master-password')).toBe(
    true,
  )

  await setRevealFailure(page, null)
  await deepFill(page, '#env-secret-master-password', 'correct-master-password')
  await deepClick(page, 'cv-dialog[open] cv-button[variant="primary"]')
  await waitForDeepSelector(page, '.secret-value')
  expect(await getDeepText(page, '.secret-value')).toBe('fixture-revealed-value')

  await emitEnvRuntimeEvent(page, 'env-runtime:run-approval', approval)
  await waitForDeepSelector(page, '[data-kind="approval"]')
  await waitForDeepSelectorAbsent(page, '.secret-value')
  expect(await hasDeepSelector(page, '#env-secret-master-password')).toBe(false)
})

test('rollout and vault recovery keep Stop available without privileged metadata reads', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  const run = createRun({status: 'running'})
  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({
      access: {status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
      snapshot: {
        status: {vault_unlocked: false},
        proposals: [],
        approvals: [],
        runs: [run],
      },
    }),
  )
  await openActivity(page)

  expect(await getDeepText(page, '[data-readiness-warning]')).toContain(
    'FEATURE_DISABLED_BY_ROLLOUT',
  )
  expect(await hasDeepSelector(page, `cv-button[data-run-id="${run.id}"]`)).toBe(true)
  await deepClick(page, `cv-button[data-run-id="${run.id}"]`)
  await page.waitForFunction(() => {
    const calls = (
      window as unknown as {
        __ENV_RUNTIME_E2E__?: {calls: Array<{command: string}>}
      }
    ).__ENV_RUNTIME_E2E__?.calls
    return calls?.some((call) => call.command === 'env_runtime_run_stop')
  })

  const calls = await getEnvRuntimeBridgeCalls(page)
  expect(calls).toContainEqual({command: 'env_runtime_run_stop', args: {runId: run.id}})
  expect(
    calls.some(
      (call) =>
        call.command === 'rpc_dispatch' ||
        call.command === 'env_runtime_cli_install_status' ||
        call.command === 'gateway_list_paired_agents',
    ),
  ).toBe(false)
})

test('strict bridge deletes a preset and releases native event callbacks on disconnect', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({
      snapshot: {presets: [ENV_RUNTIME_PRESET], proposals: [], approvals: [], runs: []},
    }),
  )
  await deepClick(page, 'cv-tab[value="presets"]')
  const deleteSelector = `cv-button[variant="danger"][data-preset-id="${ENV_RUNTIME_PRESET.id}"]`
  await waitForDeepSelector(page, deleteSelector)
  await deepClick(page, deleteSelector)
  await waitForDeepSelector(page, 'cv-confirm-dialog')
  await deepClick(page, 'cv-button[data-confirm-action="confirm"]')
  await waitForDeepSelectorAbsent(page, deleteSelector)

  expect(await getEnvRuntimeBridgeCalls(page)).toContainEqual({
    command: 'env_runtime_preset_delete',
    args: {id: ENV_RUNTIME_PRESET.id, baseRevision: ENV_RUNTIME_PRESET.revision},
  })
  await page.waitForFunction(() => {
    const state = (
      window as unknown as {
        __ENV_RUNTIME_E2E__?: {listenerState(): {callbacks: number; listeners: number}}
      }
    ).__ENV_RUNTIME_E2E__?.listenerState()
    return state?.callbacks === 2 && state.listeners === 2
  })
  expect(await getEnvRuntimeBridgeListenerState(page)).toEqual({callbacks: 2, listeners: 2})

  await leaveEnvRuntimeFixture(page)
  expect(await getEnvRuntimeBridgeListenerState(page)).toEqual({callbacks: 0, listeners: 0})
  expect(
    (await getEnvRuntimeBridgeCalls(page)).filter((call) => call.command === 'plugin:event|unlisten'),
  ).toHaveLength(2)
})

test('invalid profile submit focuses the exact shadow control and Create Secret resumes the draft', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({
      secrets: [],
      profiles: [],
      snapshot: {presets: [], proposals: [], approvals: [], runs: []},
    }),
  )
  await deepClick(page, 'cv-tab[value="profiles"]')
  await deepClick(page, 'cv-tab-panel[tab="profiles"] .section-heading cv-button[variant="primary"]')
  await waitForDeepSelector(page, 'cv-dialog.wide[open]')
  await waitForDeepSelector(page, '#profile-slug')

  const profileSubmit = page.locator('cv-dialog.wide[open] cv-button[type="submit"]')
  await profileSubmit.click()
  await waitForDeepSelector(page, '#profile-slug[invalid]')
  expect(await hasDeepSelector(page, 'cv-dialog.wide[open]')).toBe(true)
  expect((await getDeepActiveChain(page)).some((element) => element.id === 'profile-slug')).toBe(true)

  await page.locator('#profile-slug').locator('input').fill('backend-dev')
  await page.locator('#profile-label').locator('input').fill('Backend development')
  expect(await hasDeepSelector(page, '#profile-variable-name-0')).toBe(true)
  await page.locator('#profile-variable-name-0').locator('input').fill('API_TOKEN')
  await profileSubmit.click()

  await page.waitForFunction(() => {
    let active = document.activeElement as HTMLElement | null
    while (active) {
      if (active.id === 'profile-create-secret-0') return true
      active = active.shadowRoot?.activeElement as HTMLElement | null
    }
    return false
  }, undefined, {timeout: 2_000})
  expect((await getDeepActiveChain(page)).some((element) => element.id === 'profile-create-secret-0')).toBe(
    true,
  )
  await deepClick(page, '#profile-create-secret-0')
  await waitForDeepSelector(page, '#env-secret-label')
  await page.locator('#env-secret-label').locator('input').fill('Created while editing')
  await page.locator('#env-secret-value').locator('input').fill('fixture-secret-value')
  await page.locator('cv-dialog[open] cv-button[variant="primary"]').click()

  await waitForDeepSelector(page, '#profile-variable-secret-0')
  expect(await getDeepControlValue(page, '#profile-slug')).toBe('backend-dev')
  expect(await getDeepControlValue(page, '#profile-label')).toBe('Backend development')
  expect(await getDeepControlValue(page, '#profile-variable-secret-0')).toBe('secret-created-1')

  await profileSubmit.click()
  await waitForDeepSelectorAbsent(page, 'cv-dialog.wide[open]')
  const rpcCommands = (await getEnvRuntimeBridgeCalls(page))
    .filter((call) => call.command === 'rpc_dispatch')
    .map((call) => (call.args['args'] as {command?: string})?.command)
  expect(rpcCommands).toContain('env_runtime:secret:create')
  expect(rpcCommands).toContain('env_runtime:profile:create')
})

test('expired proposal closes without an approval transport call', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  const proposal = livePresetProposal(4_000)
  await openEnvRuntimeFixture(
    page,
    createEnvRuntimeFixtureSeed({snapshot: {proposals: [proposal], approvals: [], runs: []}}),
  )
  await openActivity(page)
  await deepClick(page, `[data-proposal-id="${proposal.metadata.id}"]`)
  await waitForDeepSelector(page, '[data-proposal-review]')
  await waitForDeepSelectorAbsent(page, '[data-proposal-review]', 7_000)
  await waitForDeepSelector(page, '.page-alert')

  expect(await getDeepText(page, '.page-alert')).toContain('PROPOSAL_EXPIRED')
  expect(
    (await getEnvRuntimeBridgeCalls(page)).some(
      (call) => call.command === 'env_runtime_proposal_resolve',
    ),
  ).toBe(false)
})
