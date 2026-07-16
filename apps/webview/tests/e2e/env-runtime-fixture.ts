import type {Page} from 'playwright'

import type * as NavigationModelModule from '../../src/app/navigation/navigation.model'
import type {ModuleAccessState} from '../../src/core/pro/module-access.model'
import type * as ModuleAccessModelModule from '../../src/core/pro/module-access.model'
import type * as RuntimeCapabilitiesModule from '../../src/core/runtime/runtime-capabilities'
import type {
  AgentRunMetadata,
  DevicePreset,
  EnvProfileMetadata,
  EnvRuntimeDesktopSnapshot,
  EnvSecretMetadata,
  PairedAgent,
  ProductCliInstallStatus,
  ProposalReview,
  RunApprovalSnapshot,
} from '../../src/features/passmanager/components/env-runtime/env-runtime.types'

const BASE_URL = 'http://localhost:4400/index.html'

export const ENV_RUNTIME_FIXTURE_NOW = 1_700_000_000_000

export const ENV_RUNTIME_SECRET: EnvSecretMetadata = {
  id: 'secret-api-token',
  label: 'Production API token',
  revision: 3,
  usage_count: 1,
}

export const ENV_RUNTIME_PROFILE: EnvProfileMetadata = {
  id: 'profile-backend-dev',
  slug: 'backend-dev',
  label: 'Backend development',
  description: 'Local backend services and worker processes',
  revision: 4,
  variables: [{name: 'API_TOKEN', secret_id: ENV_RUNTIME_SECRET.id}],
}

export const ENV_RUNTIME_PRESET: DevicePreset = {
  id: 'preset-tests',
  profile_id: ENV_RUNTIME_PROFILE.id,
  slug: 'tests',
  label: 'Backend tests',
  workspace_root: '/Users/alice/src/backend',
  cwd: '/Users/alice/src/backend/services/api',
  executable: '/opt/homebrew/bin/bun',
  args: ['run', 'test', '--coverage'],
  passthrough_env: ['PATH', 'CI'],
  revision: 7,
  executable_sha256: 'a'.repeat(64),
  created_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW - 60_000,
  updated_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW - 30_000,
}

export const ENV_RUNTIME_CLI_STATUS: ProductCliInstallStatus = {
  supported: true,
  bundled_path: '/Applications/ChromVoid.app/Contents/MacOS/chromvoid-agent',
  bundled_version: '0.1.0',
  installed_path: '/Users/alice/.local/bin/chromvoid',
  installed_version: '0.1.0',
  installed: true,
  managed_link: true,
}

export const ENV_RUNTIME_AGENT: PairedAgent = {
  id: 'agent-codex-local',
  created_at_ms: ENV_RUNTIME_FIXTURE_NOW - 3_600_000,
  last_active_ms: ENV_RUNTIME_FIXTURE_NOW - 10_000,
  revoked: false,
  label: 'Local coding agent',
}

export type EnvRuntimeRevealFailure = {
  error: string
  code: string
}

export type EnvRuntimeFixtureSeed = {
  access: ModuleAccessState
  snapshot: EnvRuntimeDesktopSnapshot
  secrets: EnvSecretMetadata[]
  profiles: EnvProfileMetadata[]
  cliStatus: ProductCliInstallStatus
  pairedAgents: PairedAgent[]
  revealValue: string
  revealFailure: EnvRuntimeRevealFailure | null
}

export type EnvRuntimeBridgeCall = {
  command: string
  args: Record<string, unknown>
}

type PartialFixtureSeed = Partial<Omit<EnvRuntimeFixtureSeed, 'access' | 'snapshot'>> & {
  access?: Partial<ModuleAccessState>
  snapshot?: Partial<EnvRuntimeDesktopSnapshot> & {
    status?: Partial<EnvRuntimeDesktopSnapshot['status']>
  }
}

export function createRun(
  overrides: Partial<AgentRunMetadata> = {},
): AgentRunMetadata {
  return {
    id: 'run-tests',
    actor_id: ENV_RUNTIME_AGENT.id,
    profile_id: ENV_RUNTIME_PROFILE.id,
    preset_id: ENV_RUNTIME_PRESET.id,
    status: 'running',
    process_id: 42042,
    started_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW - 15_000,
    finished_at_epoch_ms: null,
    exit_code: null,
    signal: null,
    ...overrides,
  }
}

export function createRunApproval(
  overrides: Partial<RunApprovalSnapshot> = {},
): RunApprovalSnapshot {
  return {
    run: createRun({
      id: 'run-approval',
      status: 'approval_pending',
      process_id: null,
      started_at_epoch_ms: null,
    }),
    actor_label: ENV_RUNTIME_AGENT.label,
    profile_label: ENV_RUNTIME_PROFILE.label,
    profile_revision: ENV_RUNTIME_PROFILE.revision,
    preset_label: ENV_RUNTIME_PRESET.label,
    preset_revision: ENV_RUNTIME_PRESET.revision,
    workspace_root: ENV_RUNTIME_PRESET.workspace_root,
    executable: ENV_RUNTIME_PRESET.executable,
    executable_sha256: ENV_RUNTIME_PRESET.executable_sha256,
    args: [...ENV_RUNTIME_PRESET.args],
    cwd: ENV_RUNTIME_PRESET.cwd,
    passthrough_env: [...ENV_RUNTIME_PRESET.passthrough_env, 'API_TOKEN'],
    env_sources: [
      {
        name: 'API_TOKEN',
        secret_id: ENV_RUNTIME_SECRET.id,
        secret_label: ENV_RUNTIME_SECRET.label,
      },
    ],
    reason: 'Run the backend test suite before submitting the change',
    created_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW,
    expires_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW + 120_000,
    ...overrides,
  }
}

export function createPresetProposal(
  overrides: Partial<ProposalReview> = {},
): ProposalReview {
  return {
    metadata: {
      id: 'proposal-preset-update',
      actor_id: ENV_RUNTIME_AGENT.id,
      resource_kind: 'preset',
      operation: 'update',
      status: 'pending',
      created_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW,
      expires_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW + 600_000,
    },
    target: ENV_RUNTIME_PRESET.id,
    base_revision: ENV_RUNTIME_PRESET.revision,
    draft: {
      resource_kind: 'preset',
      draft: {
        profile_id: ENV_RUNTIME_PROFILE.id,
        slug: 'tests',
        label: 'Backend tests with coverage',
        workspace_root: '/Users/alice/src/backend/../backend',
        cwd: '/Users/alice/src/backend/services/../services/api',
        executable: '/opt/homebrew/bin/../bin/bun',
        args: ['run', 'test', '--coverage', '--reporter=dot'],
        passthrough_env: ['PATH', 'CI', 'LANG'],
      },
    },
    prepared_preset: {
      profile_id: ENV_RUNTIME_PROFILE.id,
      workspace_root: ENV_RUNTIME_PRESET.workspace_root,
      cwd: ENV_RUNTIME_PRESET.cwd,
      executable: ENV_RUNTIME_PRESET.executable,
      executable_sha256: 'b'.repeat(64),
      args: ['run', 'test', '--coverage', '--reporter=dot'],
      passthrough_env: ['PATH', 'CI', 'LANG'],
    },
    ...overrides,
  }
}

export function createProfileProposal(
  overrides: Partial<ProposalReview> = {},
): ProposalReview {
  return {
    metadata: {
      id: 'proposal-profile-update',
      actor_id: ENV_RUNTIME_AGENT.id,
      resource_kind: 'profile',
      operation: 'update',
      status: 'pending',
      created_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW,
      expires_at_epoch_ms: ENV_RUNTIME_FIXTURE_NOW + 600_000,
    },
    target: ENV_RUNTIME_PROFILE.id,
    base_revision: ENV_RUNTIME_PROFILE.revision,
    draft: {
      resource_kind: 'profile',
      draft: {
        slug: 'backend-dev',
        label: 'Backend development',
        description: 'Local backend, worker, and release environment',
        variables: [
          {name: 'API_TOKEN', secret_id: ENV_RUNTIME_SECRET.id},
          {name: 'DATABASE_URL', secret_id: null},
        ],
      },
    },
    prepared_preset: null,
    ...overrides,
  }
}

export function createEnvRuntimeFixtureSeed(
  overrides: PartialFixtureSeed = {},
): EnvRuntimeFixtureSeed {
  const proposals = overrides.snapshot?.proposals ?? [createPresetProposal()]
  const approvals = overrides.snapshot?.approvals ?? [createRunApproval()]
  const runs = overrides.snapshot?.runs ?? [createRun()]
  const snapshot: EnvRuntimeDesktopSnapshot = {
    status: {
      platform_supported: true,
      vault_unlocked: true,
      device_store_available: true,
      device_store_error_code: null,
      active_runs: runs.filter((run) =>
        ['approval_pending', 'starting', 'running'].includes(run.status),
      ).length,
      pending_approvals: approvals.length,
      pending_proposals: proposals.length,
      ...overrides.snapshot?.status,
    },
    presets: overrides.snapshot?.presets ?? [ENV_RUNTIME_PRESET],
    proposals,
    approvals,
    runs,
  }

  return {
    access: {
      feature_key: 'env-runtime',
      status: 'enabled',
      denial_code: null,
      ...overrides.access,
    },
    snapshot,
    secrets: overrides.secrets ?? [ENV_RUNTIME_SECRET],
    profiles: overrides.profiles ?? [ENV_RUNTIME_PROFILE],
    cliStatus: overrides.cliStatus ?? ENV_RUNTIME_CLI_STATUS,
    pairedAgents: overrides.pairedAgents ?? [ENV_RUNTIME_AGENT],
    revealValue: overrides.revealValue ?? 'fixture-revealed-value',
    revealFailure: overrides.revealFailure ?? null,
  }
}

export async function openEnvRuntimeFixture(
  page: Page,
  seed = createEnvRuntimeFixtureSeed(),
  viewport = {width: 1280, height: 900},
): Promise<void> {
  await page.setViewportSize(viewport)
  await page.goto(`${BASE_URL}?surface=passwords&layout=desktop`, {waitUntil: 'domcontentloaded'})
  await waitForDeepSelector(page, 'password-manager-desktop-layout')
  await page.waitForFunction(() => Boolean((window as unknown as {passmanager?: unknown}).passmanager))

  const envRuntimeAlreadyLoaded = await page.evaluate(() => Boolean(customElements.get('pm-env-runtime-page')))
  if (envRuntimeAlreadyLoaded) {
    throw new Error('Env Runtime was loaded before its strict E2E Tauri bridge was installed')
  }

  await installEnvRuntimeBridge(page, seed)
  await page.evaluate(async (access) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {setRuntimeCapabilities} = (await dynamicImport(
      '/core/runtime/runtime-capabilities.ts',
    )) as typeof RuntimeCapabilitiesModule
    const {moduleAccessModel} = (await dynamicImport(
      '/core/pro/module-access.model.ts',
    )) as typeof ModuleAccessModelModule
    const {navigationModel} = (await dynamicImport(
      '/app/navigation/navigation.model.ts',
    )) as typeof NavigationModelModule

    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_native_path_io: true,
      supports_gateway: true,
    })
    moduleAccessModel.rawStates.set([access])
    navigationModel.openPassmanagerRoute({kind: 'env-runtime-view'})
  }, seed.access)

  await waitForDeepSelector(page, 'pm-env-runtime-page')
  await waitForDeepSelector(page, '.status-band')
  await page.waitForFunction(() => new URL(location.href).searchParams.get('pm') === 'env-runtime')
  await page.waitForFunction(() => {
    const page = deepFind(document, 'pm-env-runtime-page') as HTMLElement | null
    return Boolean(page?.shadowRoot?.querySelector('.status-band'))

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }
  })
}

async function installEnvRuntimeBridge(page: Page, seed: EnvRuntimeFixtureSeed): Promise<void> {
  await page.evaluate((initialSeed) => {
    type Callback = (payload: unknown) => unknown
    type BridgeState = EnvRuntimeFixtureSeed
    type BridgeApi = {
      calls: EnvRuntimeBridgeCall[]
      state: BridgeState
      emit(event: string, payload: unknown): void
      listenerState(): {callbacks: number; listeners: number}
      setRevealFailure(failure: EnvRuntimeRevealFailure | null): void
    }
    type TauriInternals = {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>
      transformCallback(callback?: Callback, once?: boolean): number
      unregisterCallback(id: number): void
      runCallback(id: number, payload: unknown): void
      callbacks: Map<number, Callback>
      convertFileSrc(path: string): string
    }

    const clone = <T>(value: T): T => structuredClone(value)
    const state = clone(initialSeed)
    const calls: EnvRuntimeBridgeCall[] = []
    const callbacks = new Map<number, Callback>()
    const listeners = new Map<number, {event: string; handler: number}>()
    let callbackId = 100
    let listenerId = 1
    let createdSecretId = 1

    const updateCounts = () => {
      state.snapshot.status.pending_approvals = state.snapshot.approvals.length
      state.snapshot.status.pending_proposals = state.snapshot.proposals.length
      state.snapshot.status.active_runs = state.snapshot.runs.filter((run) =>
        ['approval_pending', 'starting', 'running'].includes(run.status),
      ).length
    }

    const ok = <T>(result: T) => ({ok: true as const, result: clone(result)})
    const rpcOk = <T>(command: string, result: T) =>
      ok({command, result: clone(result)})
    const rpcFailure = (failure: EnvRuntimeRevealFailure) => ({
      ok: false as const,
      error: failure.error,
      code: failure.code,
    })
    const removeListener = (id: number): boolean => {
      const listener = listeners.get(id)
      if (listener) callbacks.delete(listener.handler)
      return listeners.delete(id)
    }

    const handleRpc = (args: Record<string, unknown>): unknown => {
      const request = args['args'] as
        | {v?: number; command?: string; data?: Record<string, unknown>}
        | undefined
      if (request?.v !== 1 || !request.command || !request.data) {
        throw new Error('Invalid rpc_dispatch fixture envelope')
      }
      const {command, data} = request
      switch (command) {
        case 'env_runtime:secret:list':
          return rpcOk(command, state.secrets)
        case 'env_runtime:profile:list':
          return rpcOk(command, state.profiles)
        case 'env_runtime:secret:reveal': {
          if (state.revealFailure) return rpcFailure(state.revealFailure)
          return rpcOk(command, {id: String(data['id']), value: state.revealValue})
        }
        case 'env_runtime:secret:create': {
          const secret: EnvSecretMetadata = {
            id: `secret-created-${createdSecretId++}`,
            label: String(data['label']),
            revision: 1,
            usage_count: 0,
          }
          state.secrets.push(secret)
          return rpcOk(command, secret)
        }
        case 'env_runtime:secret:update': {
          const secret = state.secrets.find((item) => item.id === data['id'])
          if (!secret) return rpcFailure({error: 'Secret not found', code: 'SECRET_NOT_FOUND'})
          secret.label = String(data['label'])
          secret.revision += 1
          return rpcOk(command, secret)
        }
        case 'env_runtime:secret:delete':
          state.secrets = state.secrets.filter((item) => item.id !== data['id'])
          return rpcOk(command, true)
        case 'env_runtime:profile:create': {
          const profile: EnvProfileMetadata = {
            id: `profile-created-${state.profiles.length + 1}`,
            slug: String(data['slug']),
            label: String(data['label']),
            description: (data['description'] as string | null) ?? null,
            revision: 1,
            variables: clone(data['variables'] as EnvProfileMetadata['variables']),
          }
          state.profiles.push(profile)
          return rpcOk(command, profile)
        }
        case 'env_runtime:profile:update': {
          const profile = state.profiles.find((item) => item.id === data['target'])
          if (!profile) return rpcFailure({error: 'Profile not found', code: 'PROFILE_NOT_FOUND'})
          const draft = data['draft'] as Omit<EnvProfileMetadata, 'id' | 'revision'>
          Object.assign(profile, clone(draft), {revision: profile.revision + 1})
          return rpcOk(command, profile)
        }
        default:
          throw new Error(`Unexpected Env Runtime rpc command: ${command}`)
      }
    }

    const invoke = async (command: string, args: Record<string, unknown> = {}): Promise<unknown> => {
      calls.push({command, args: clone(args)})
      switch (command) {
        case 'plugin:event|listen': {
          const id = listenerId++
          listeners.set(id, {event: String(args['event']), handler: Number(args['handler'])})
          return id
        }
        case 'plugin:event|unlisten':
          removeListener(Number(args['eventId']))
          return null
        case 'rpc_dispatch':
          return handleRpc(args)
        case 'env_runtime_desktop_snapshot':
          updateCounts()
          return ok(state.snapshot)
        case 'env_runtime_cli_install_status':
          return ok(state.cliStatus)
        case 'gateway_list_paired_agents':
          return ok(state.pairedAgents)
        case 'env_runtime_proposal_resolve': {
          const proposalId = String(args['proposalId'])
          const proposal = state.snapshot.proposals.find((item) => item.metadata.id === proposalId)
          if (!proposal) return rpcFailure({error: 'Proposal not found', code: 'PROPOSAL_NOT_FOUND'})
          proposal.metadata.status = args['approve'] ? 'approved' : 'rejected'
          state.snapshot.proposals = state.snapshot.proposals.filter(
            (item) => item.metadata.id !== proposalId,
          )
          updateCounts()
          return ok(proposal.metadata)
        }
        case 'env_runtime_run_approval_resolve': {
          const runId = String(args['runId'])
          const approval = state.snapshot.approvals.find((item) => item.run.id === runId)
          if (!approval) return rpcFailure({error: 'Approval not found', code: 'RUN_NOT_FOUND'})
          state.snapshot.approvals = state.snapshot.approvals.filter((item) => item.run.id !== runId)
          const run = state.snapshot.runs.find((item) => item.id === runId)
          if (run) {
            run.status = args['approve'] ? 'starting' : 'cancelled'
            if (!args['approve']) run.finished_at_epoch_ms = Date.now()
          }
          updateCounts()
          return ok(true)
        }
        case 'env_runtime_run_stop': {
          const runId = String(args['runId'])
          const run = state.snapshot.runs.find((item) => item.id === runId)
          if (run) {
            run.status = 'cancelled'
            run.process_id = null
            run.finished_at_epoch_ms = Date.now()
          }
          state.snapshot.approvals = state.snapshot.approvals.filter((item) => item.run.id !== runId)
          updateCounts()
          return ok(true)
        }
        case 'env_runtime_cli_install':
          state.cliStatus = {...state.cliStatus, installed: true, managed_link: true}
          return ok(state.cliStatus)
        case 'gateway_start_agent_pairing':
          return ok({
            actor_kind: 'cli_agent',
            pairing_token: 'fixture-pairing-token',
            pairing_expires_at_ms: Date.now() + 120_000,
            pin: '123456',
            pin_expires_at_ms: Date.now() + 60_000,
            attempts_left: 3,
            locked_until_ms: null,
          })
        case 'gateway_cancel_pairing':
          return ok(true)
        case 'gateway_revoke_agent':
          state.pairedAgents = state.pairedAgents.map((agent) =>
            agent.id === args['id'] ? {...agent, revoked: true} : agent,
          )
          return ok(state.pairedAgents)
        case 'env_runtime_preset_delete': {
          const presetId = String(args['id'])
          const preset = state.snapshot.presets.find((item) => item.id === presetId)
          if (!preset) return rpcFailure({error: 'Preset not found', code: 'PRESET_NOT_FOUND'})
          if (preset.revision !== Number(args['baseRevision'])) {
            return rpcFailure({error: 'Preset revision changed', code: 'REVISION_CONFLICT'})
          }
          state.snapshot.presets = state.snapshot.presets.filter((item) => item.id !== presetId)
          return ok(true)
        }
        case 'env_runtime_preset_save':
        case 'env_runtime_profile_delete':
          return ok(true)
        default:
          throw new Error(`Unexpected Env Runtime Tauri command: ${command}`)
      }
    }

    const unregisterListener = (_event: string, id: number) => removeListener(id)
    const internals: TauriInternals = {
      invoke,
      transformCallback(callback, once = false) {
        const id = callbackId++
        callbacks.set(id, (payload) => {
          if (once) callbacks.delete(id)
          return callback?.(payload)
        })
        return id
      },
      unregisterCallback(id) {
        callbacks.delete(id)
      },
      runCallback(id, payload) {
        callbacks.get(id)?.(payload)
      },
      callbacks,
      convertFileSrc(path) {
        return path
      },
    }
    const api: BridgeApi = {
      calls,
      state,
      emit(event, payload) {
        for (const [id, listener] of listeners) {
          if (listener.event !== event) continue
          callbacks.get(listener.handler)?.({event, id, payload: clone(payload)})
        }
      },
      listenerState() {
        return {callbacks: callbacks.size, listeners: listeners.size}
      },
      setRevealFailure(failure) {
        state.revealFailure = failure ? clone(failure) : null
      },
    }

    Object.assign(window as unknown as Record<string, unknown>, {
      __TAURI_INTERNALS__: internals,
      __TAURI_EVENT_PLUGIN_INTERNALS__: {unregisterListener},
      __ENV_RUNTIME_E2E__: api,
    })
  }, seed)
}

export async function waitForDeepSelector(
  page: Page,
  selector: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    (target) => {
      function find(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const nested = find(element.shadowRoot, selector)
            if (nested) return nested
          }
        }
        return null
      }
      return Boolean(find(document, target))
    },
    selector,
    {timeout},
  )
}

export async function waitForDeepSelectorAbsent(
  page: Page,
  selector: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    (target) => {
      function find(root: Document | ShadowRoot, nestedSelector: string): Element | null {
        const found = root.querySelector(nestedSelector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const nested = find(element.shadowRoot, nestedSelector)
            if (nested) return nested
          }
        }
        return null
      }
      return !find(document, target)
    },
    selector,
    {timeout},
  )
}

export async function hasDeepSelector(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((target) => {
    function find(root: Document | ShadowRoot, nestedSelector: string): Element | null {
      const found = root.querySelector(nestedSelector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = find(element.shadowRoot, nestedSelector)
          if (nested) return nested
        }
      }
      return null
    }
    return Boolean(find(document, target))
  }, selector)
}

export async function getDeepText(page: Page, selector: string): Promise<string> {
  return page.evaluate((target) => {
    function find(root: Document | ShadowRoot, nestedSelector: string): Element | null {
      const found = root.querySelector(nestedSelector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = find(element.shadowRoot, nestedSelector)
          if (nested) return nested
        }
      }
      return null
    }
    return find(document, target)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }, selector)
}

export async function getDeepControlValue(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((target) => {
    function find(root: Document | ShadowRoot, nestedSelector: string): Element | null {
      const found = root.querySelector(nestedSelector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = find(element.shadowRoot, nestedSelector)
          if (nested) return nested
        }
      }
      return null
    }
    const control = find(document, target) as (HTMLElement & {value?: string}) | null
    if (!control) return null
    const native = control.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea, [part="input"], [part="textarea"]',
    )
    return native?.value ?? control.value ?? null
  }, selector)
}

export async function deepClick(
  page: Page,
  selector: string,
  options: {focus?: boolean} = {},
): Promise<void> {
  const clicked = await page.evaluate(
    ({target, shouldFocus}) => {
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
      const element = find(document, target) as HTMLElement | null
      if (!element) return false
      const interactionTarget = element.shadowRoot?.querySelector<HTMLElement>(
        '[part="base"], [part="trigger"], [part="tab"], button, [role="tab"]',
      )
      if (shouldFocus) {
        const focusTarget =
          interactionTarget ??
          element.shadowRoot?.querySelector<HTMLElement>('input, textarea, [tabindex]')
        ;(focusTarget ?? element).focus()
      }
      ;(interactionTarget ?? element).click()
      return true
    },
    {target: selector, shouldFocus: options.focus ?? false},
  )
  if (!clicked) throw new Error(`Deep click target not found: ${selector}`)
}

export async function deepFill(
  page: Page,
  selector: string,
  value: string,
  options: {focus?: boolean} = {},
): Promise<void> {
  await page.waitForFunction((target) => {
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
    const host = find(document, target)
    return Boolean(
      host?.shadowRoot?.querySelector('input, textarea, [part="input"], [part="textarea"]'),
    )
  }, selector)
  const filled = await page.evaluate(
    ({target, nextValue, shouldFocus}) => {
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
      const host = find(document, target) as (HTMLElement & {value?: string}) | null
      if (!host) return false
      const input = host.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea, [part="input"], [part="textarea"]',
      )
      if (!input) return false
      if (shouldFocus) input.focus()
      input.value = nextValue
      input.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, inputType: 'insertText'}))
      return new Promise<boolean>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
      )
    },
    {target: selector, nextValue: value, shouldFocus: options.focus ?? true},
  )
  if (!filled) throw new Error(`Deep input target not found: ${selector}`)
}

export type DeepActiveElement = {
  tag: string
  id: string
  part: string | null
  text: string
  dataRunId: string | null
  dataProposalId: string | null
  inOpenDialog: boolean
}

export async function getDeepActiveChain(page: Page): Promise<DeepActiveElement[]> {
  return page.evaluate(() => {
    const chain: DeepActiveElement[] = []
    let active = document.activeElement as HTMLElement | null
    while (active) {
      chain.push({
        tag: active.tagName.toLowerCase(),
        id: active.id,
        part: active.getAttribute('part'),
        text: active.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        dataRunId: active.dataset['runId'] ?? null,
        dataProposalId: active.dataset['proposalId'] ?? null,
        inOpenDialog: Boolean(active.closest('cv-dialog[open]')),
      })
      active = active.shadowRoot?.activeElement as HTMLElement | null
    }
    return chain
  })
}

export async function getEnvRuntimeBridgeCalls(page: Page): Promise<EnvRuntimeBridgeCall[]> {
  return page.evaluate(() => {
    const api = (window as unknown as {__ENV_RUNTIME_E2E__?: {calls: EnvRuntimeBridgeCall[]}})
      .__ENV_RUNTIME_E2E__
    return structuredClone(api?.calls ?? [])
  })
}

export async function getEnvRuntimeBridgeListenerState(
  page: Page,
): Promise<{callbacks: number; listeners: number}> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __ENV_RUNTIME_E2E__?: {listenerState(): {callbacks: number; listeners: number}}
      }
    ).__ENV_RUNTIME_E2E__
    if (!api) throw new Error('Env Runtime bridge is not installed')
    return api.listenerState()
  })
}

export async function leaveEnvRuntimeFixture(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
    const {navigationModel} = (await dynamicImport(
      '/app/navigation/navigation.model.ts',
    )) as typeof NavigationModelModule
    navigationModel.openPassmanagerRoute({kind: 'root'})
  })
  await waitForDeepSelectorAbsent(page, 'pm-env-runtime-page')
}

export async function setRevealFailure(
  page: Page,
  failure: EnvRuntimeRevealFailure | null,
): Promise<void> {
  await page.evaluate((nextFailure) => {
    const api = (
      window as unknown as {
        __ENV_RUNTIME_E2E__?: {setRevealFailure(value: EnvRuntimeRevealFailure | null): void}
      }
    ).__ENV_RUNTIME_E2E__
    if (!api) throw new Error('Env Runtime bridge is not installed')
    api.setRevealFailure(nextFailure)
  }, failure)
}

export async function emitEnvRuntimeEvent(page: Page, event: string, payload: unknown): Promise<void> {
  await page.evaluate(
    ({eventName, eventPayload}) => {
      const api = (
        window as unknown as {__ENV_RUNTIME_E2E__?: {emit(name: string, value: unknown): void}}
      ).__ENV_RUNTIME_E2E__
      if (!api) throw new Error('Env Runtime bridge is not installed')
      api.emit(eventName, eventPayload)
    },
    {eventName: event, eventPayload: payload},
  )
}
