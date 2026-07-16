import {render} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  EnvRuntimeModel,
  envRuntimeModel,
  type EnvRuntimeDependencies,
} from '../../src/features/passmanager/components/env-runtime/env-runtime.model'
import {PMEnvRuntimePage} from '../../src/features/passmanager/components/env-runtime/env-runtime-page'
import {PasswordManagerLayoutModel} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import {moduleAccessModel} from '../../src/core/pro/module-access.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setPasswordManagerLang} from '@project/passmanager/i18n'
import type {
  DevicePreset,
  EnvProfileMetadata,
  EnvRuntimeDesktopSnapshot,
  EnvSecretMetadata,
  ProductCliInstallStatus,
  ProposalReview,
  RunApprovalSnapshot,
} from '../../src/features/passmanager/components/env-runtime/env-runtime.types'

const EMPTY_SNAPSHOT: EnvRuntimeDesktopSnapshot = {
  status: {
    platform_supported: true,
    vault_unlocked: true,
    device_store_available: true,
    device_store_error_code: null,
    active_runs: 0,
    pending_approvals: 0,
    pending_proposals: 0,
  },
  presets: [],
  proposals: [],
  approvals: [],
  runs: [],
}

const CLI_STATUS: ProductCliInstallStatus = {
  supported: true,
  bundled_path: '/Applications/ChromVoid.app/Contents/Resources/chromvoid',
  bundled_version: '1.2.3',
  installed_path: null,
  installed_version: null,
  installed: false,
  managed_link: false,
}

const DENIAL_STATES = [
  {status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
  {status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
  {status: 'entitlement_unavailable', denial_code: 'ENTITLEMENT_UNAVAILABLE'},
  {status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'},
  {status: 'unsupported', denial_code: 'REMOTE_CORE_UNSUPPORTED'},
] as const

const PROFILE: EnvProfileMetadata = {
  id: 'profile-1',
  slug: 'backend-dev',
  label: 'Backend development',
  description: 'Current profile description',
  revision: 4,
  variables: [{name: 'API_TOKEN', secret_id: 'secret-1'}],
}

const PRESET: DevicePreset = {
  id: 'preset-1',
  profile_id: PROFILE.id,
  slug: 'tests',
  label: 'Backend tests',
  workspace_root: '/workspace/current',
  cwd: '/workspace/current/api',
  executable: '/opt/homebrew/bin/bun',
  args: ['test', '--watch=false'],
  passthrough_env: ['PATH'],
  revision: 7,
  executable_sha256: 'current-sha256',
  created_at_epoch_ms: 1,
  updated_at_epoch_ms: 2,
}

function runApproval(overrides: Partial<RunApprovalSnapshot> = {}): RunApprovalSnapshot {
  return {
    run: {
      id: 'run-1',
      actor_id: 'agent-1',
      profile_id: PROFILE.id,
      preset_id: PRESET.id,
      status: 'approval_pending',
      process_id: null,
      started_at_epoch_ms: null,
      finished_at_epoch_ms: null,
      exit_code: null,
      signal: null,
    },
    actor_label: 'Local agent',
    profile_label: PROFILE.label,
    profile_revision: PROFILE.revision,
    preset_label: PRESET.label,
    preset_revision: PRESET.revision,
    workspace_root: PRESET.workspace_root,
    executable: PRESET.executable,
    executable_sha256: PRESET.executable_sha256,
    args: [...PRESET.args],
    cwd: PRESET.cwd,
    passthrough_env: ['PATH', 'API_TOKEN'],
    env_sources: [{name: 'API_TOKEN', secret_id: 'secret-1', secret_label: 'API token'}],
    reason: 'Run the backend test suite',
    created_at_epoch_ms: 1_000,
    expires_at_epoch_ms: 121_000,
    ...overrides,
  }
}

function profileProposal(operation: 'create' | 'update' | 'delete' = 'update'): ProposalReview {
  return {
    metadata: {
      id: 'proposal-profile-1',
      actor_id: 'agent-1',
      resource_kind: 'profile',
      operation,
      status: 'pending',
      created_at_epoch_ms: 1_000,
      expires_at_epoch_ms: 601_000,
    },
    target: operation === 'create' ? null : PROFILE.id,
    base_revision: operation === 'create' ? null : PROFILE.revision,
    prepared_preset: null,
    draft:
      operation === 'delete'
        ? null
        : {
            resource_kind: 'profile',
            draft: {
              slug: 'backend-next',
              label: 'Backend next',
              description: 'Proposed profile description',
              variables: [
                {name: 'API_TOKEN', secret_id: 'secret-1'},
                {name: 'DATABASE_URL', secret_id: null},
              ],
            },
          },
  }
}

function presetProposal(operation: 'create' | 'update' | 'delete' = 'update'): ProposalReview {
  return {
    metadata: {
      id: 'proposal-preset-1',
      actor_id: 'agent-1',
      resource_kind: 'preset',
      operation,
      status: 'pending',
      created_at_epoch_ms: 1_000,
      expires_at_epoch_ms: 601_000,
    },
    target: operation === 'create' ? null : PRESET.id,
    base_revision: operation === 'create' ? null : PRESET.revision,
    prepared_preset:
      operation === 'delete'
        ? null
        : {
            profile_id: PROFILE.id,
            workspace_root: '/workspace/next',
            cwd: '/workspace/next/api',
            executable: '/opt/homebrew/bin/bun',
            executable_sha256: 'prepared-sha256',
            args: ['test', '--coverage'],
            passthrough_env: ['PATH', 'CI'],
          },
    draft:
      operation === 'delete'
        ? null
        : {
            resource_kind: 'preset',
            draft: {
              profile_id: PROFILE.id,
              slug: 'tests-next',
              label: 'Backend tests next',
              workspace_root: '/workspace/next',
              cwd: '/workspace/next/api',
              executable: '/opt/homebrew/bin/bun',
              args: ['test', '--coverage'],
              passthrough_env: ['PATH', 'CI'],
            },
          },
  }
}

function createHarness(options?: {
  secrets?: EnvSecretMetadata[]
  rpcResult?: (command: string, data: Record<string, unknown>) => unknown
  invokeResult?: (command: string, args?: Record<string, unknown>) => unknown
  access?: EnvRuntimeDependencies['access']
  now?: () => number
}) {
  const listeners = new Map<string, (payload: unknown) => void>()
  const rpc = vi.fn(async (command: string, data: Record<string, unknown>) => {
    const custom = options?.rpcResult?.(command, data)
    if (custom !== undefined) return custom
    if (command === 'env_runtime:secret:list') return options?.secrets ?? []
    if (command === 'env_runtime:profile:list') return []
    return {}
  })
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    const custom = options?.invokeResult?.(command, args)
    if (custom !== undefined) return custom
    if (command === 'env_runtime_desktop_snapshot') return EMPTY_SNAPSHOT
    if (command === 'env_runtime_cli_install_status') return CLI_STATUS
    if (command === 'gateway_list_paired_agents') return []
    return true
  })
  const confirm = vi.fn(async () => true)
  const listen = vi.fn(async (event: string, handler: (payload: unknown) => void) => {
    listeners.set(event, handler)
    return () => listeners.delete(event)
  })
  const dependencies: EnvRuntimeDependencies = {
    rpc: rpc as EnvRuntimeDependencies['rpc'],
    invoke: invoke as EnvRuntimeDependencies['invoke'],
    listen: listen as EnvRuntimeDependencies['listen'],
    confirm,
    access: options?.access ?? (() => ({feature_key: 'env-runtime', status: 'enabled', denial_code: null})),
    now: options?.now ?? (() => 1_000),
  }
  return {model: new EnvRuntimeModel(dependencies), rpc, invoke, confirm, listen, listeners}
}

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
  envRuntimeModel.desktopSnapshot.set(null)
  envRuntimeModel.secrets.set([])
  envRuntimeModel.profiles.set([])
  envRuntimeModel.pairedAgents.set([])
  envRuntimeModel.runApprovalPending.set(false)
  envRuntimeModel.proposalPending.set(false)
  envRuntimeModel.closeRunApproval()
  envRuntimeModel.closeProposal()
  envRuntimeModel.closeSecretDialog()
  envRuntimeModel.closeProfileDialog()
  envRuntimeModel.closePresetDialog()
  envRuntimeModel.cliStatus.set(null)
  envRuntimeModel.error.set(null)
  envRuntimeModel.setSection('secrets')
  setPasswordManagerLang('en')
})

class EnvRuntimePageHarness extends PMEnvRuntimePage {
  renderForTest() {
    return this.render()
  }
}

customElements.define('test-env-runtime-page', EnvRuntimePageHarness)

describe('EnvRuntimeModel', () => {
  it('validates a secret on submit and keeps invalid data away from Core', async () => {
    const {model, rpc} = createHarness()

    model.openCreateSecret()
    expect(model.secretForm.submit.ready()).toBe(true)

    await expect(model.submitSecret()).resolves.toBe('label')
    expect(rpc).not.toHaveBeenCalledWith('env_runtime:secret:create', expect.anything())

    model.setSecretLabel('Production API token')
    model.setSecretValue('super-secret')
    await expect(model.submitSecret()).resolves.toBeNull()

    expect(rpc).toHaveBeenCalledWith('env_runtime:secret:create', {
      label: 'Production API token',
      value: 'super-secret',
    })
  })

  it('explains the local-Core requirement and formats feature copy consistently', () => {
    const {model} = createHarness({
      access: () => ({
        feature_key: 'env-runtime',
        status: 'unsupported',
        denial_code: 'REMOTE_CORE_UNSUPPORTED',
      }),
    })

    expect(model.accessTitle()).toBe('Env Runtime requires a local vault')
    expect(model.accessDescription()).toContain('remote Core to local Core')
    expect(model.secretUsageLabel(1)).toBe('Used by 1 profile mapping')
    expect(model.profileMappingsLabel(2)).toBe('2 variable mappings')
  })

  it('does not describe a rollout denial as an unsupported device', () => {
    const {model} = createHarness({
      access: () => ({
        feature_key: 'env-runtime',
        status: 'disabled_by_rollout',
        denial_code: 'FEATURE_DISABLED_BY_ROLLOUT',
      }),
    })

    expect(model.accessTitle()).toBe('Env Runtime access is unavailable')
    expect(model.accessDescription()).toBe('')
  })

  it('keeps the desktop Env Runtime toolbar route visible for every access state', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    const layoutModel = new PasswordManagerLayoutModel()

    for (const access of [{status: 'enabled', denial_code: null}, ...DENIAL_STATES] as const) {
      moduleAccessModel.rawStates.set([{feature_key: 'env-runtime', ...access}])
      expect(layoutModel.getDesktopToolbarContext().showEnvRuntimeView).toBe(true)
      expect(
        layoutModel
          .getDesktopToolbarSections()
          .flatMap((section) => section.actions)
          .some((action) => action.id === 'pm-env-runtime-view'),
      ).toBe(true)
    }
  })

  it('loads operational status without requesting vault metadata while locked', async () => {
    const lockedSnapshot: EnvRuntimeDesktopSnapshot = {
      ...EMPTY_SNAPSHOT,
      status: {
        ...EMPTY_SNAPSHOT.status,
        vault_unlocked: false,
        active_runs: 1,
      },
      runs: [
        {
          id: 'run-1',
          actor_id: 'agent-1',
          profile_id: 'profile-1',
          preset_id: 'preset-1',
          status: 'running',
          process_id: 42,
          started_at_epoch_ms: 1,
          finished_at_epoch_ms: null,
          exit_code: null,
          signal: null,
        },
      ],
    }
    const {model, rpc} = createHarness({
      invokeResult: (command) => (command === 'env_runtime_desktop_snapshot' ? lockedSnapshot : undefined),
    })

    await model.refresh()

    expect(model.desktopSnapshot()).toEqual(lockedSnapshot)
    expect(model.desktopSnapshot()?.runs).toHaveLength(1)
    expect(model.error()).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(DENIAL_STATES)(
    'keeps recovery status and Stop available for $status ($denial_code) without privileged reads',
    async ({status, denial_code}) => {
      const activeRun = {
        ...runApproval().run,
        status: 'running' as const,
        process_id: 42,
        started_at_epoch_ms: 500,
      }
      const recoverySnapshot: EnvRuntimeDesktopSnapshot = {
        ...EMPTY_SNAPSHOT,
        status: {
          ...EMPTY_SNAPSHOT.status,
          active_runs: 1,
          pending_approvals: 1,
          pending_proposals: 1,
        },
        presets: [PRESET],
        approvals: [runApproval()],
        proposals: [profileProposal()],
        runs: [activeRun],
      }
      const {model, invoke, rpc} = createHarness({
        access: () => ({feature_key: 'env-runtime', status, denial_code}),
        invokeResult: (command) =>
          command === 'env_runtime_desktop_snapshot' ? recoverySnapshot : undefined,
      })

      await model.refresh()

      expect(model.desktopSnapshot()).toEqual({
        status: recoverySnapshot.status,
        runs: recoverySnapshot.runs,
        presets: [],
        proposals: recoverySnapshot.proposals,
        approvals: recoverySnapshot.approvals,
      })
      expect(model.runs()).toEqual([activeRun])
      expect(model.presets()).toEqual([])
      expect(model.approvals()).toEqual(recoverySnapshot.approvals)
      expect(model.pendingProposals()).toEqual(recoverySnapshot.proposals)
      expect(model.canRecover()).toBe(true)
      expect(model.privilegedReadiness()).toEqual({ready: false, denial_code})
      expect(model.devicePresetReadiness()).toEqual({ready: false, denial_code})
      expect(rpc).not.toHaveBeenCalled()
      expect(invoke.mock.calls.map(([command]) => command)).toEqual(['env_runtime_desktop_snapshot'])

      model.openProposal('proposal-profile-1')
      await model.resolveProposal(false)
      model.openRunApproval('run-1')
      await model.resolveRunApproval(false)
      await model.installCli()
      await model.startPairing()
      await model.stopRun(activeRun.id)

      expect(invoke).toHaveBeenCalledWith('env_runtime_proposal_resolve', {
        proposalId: 'proposal-profile-1',
        approve: false,
        profileBindings: [],
      })
      expect(invoke).toHaveBeenCalledWith('env_runtime_run_approval_resolve', {
        runId: 'run-1',
        approve: false,
      })
      expect(invoke).toHaveBeenCalledWith('env_runtime_run_stop', {runId: activeRun.id})
      expect(invoke.mock.calls.map(([command]) => command)).toEqual([
        'env_runtime_desktop_snapshot',
        'env_runtime_proposal_resolve',
        'env_runtime_desktop_snapshot',
        'env_runtime_run_approval_resolve',
        'env_runtime_desktop_snapshot',
        'env_runtime_run_stop',
        'env_runtime_desktop_snapshot',
      ])
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('requires reauthentication for every reveal and clears plaintext on blur', async () => {
    vi.useFakeTimers()
    const secret: EnvSecretMetadata = {
      id: 'secret-1',
      label: 'API token',
      revision: 2,
      usage_count: 1,
    }
    const {model, rpc} = createHarness({
      secrets: [secret],
      rpcResult: (command) =>
        command === 'env_runtime:secret:reveal' ? {id: secret.id, value: 'revealed-value'} : undefined,
    })
    model.secrets.set([secret])

    model.openRevealSecret(secret.id)
    await expect(model.submitReveal()).resolves.toBe('masterPassword')
    expect(rpc).not.toHaveBeenCalledWith('env_runtime:secret:reveal', expect.anything())

    model.setMasterPassword('master-password')
    model.handleEvent(new Event('blur'))
    expect(model.secretDialog()).toBe('closed')
    expect(model.revealForm.fields.masterPassword()).toBe('')

    model.openRevealSecret(secret.id)
    model.setMasterPassword('master-password')
    await expect(model.submitReveal()).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledWith('env_runtime:secret:reveal', {
      id: secret.id,
      master_password: 'master-password',
    })
    expect(rpc.mock.calls.filter(([command]) => command === 'env_runtime:secret:reveal')).toHaveLength(1)
    expect(model.revealedSecret()).toMatchObject({id: secret.id, value: 'revealed-value'})

    model.handleEvent(new Event('blur'))
    expect(model.revealedSecret()).toBeNull()
  })

  it('discards a reveal response that arrives after blur closed the request', async () => {
    const secret: EnvSecretMetadata = {
      id: 'secret-1',
      label: 'API token',
      revision: 2,
      usage_count: 1,
    }
    let resolveReveal!: (value: {id: string; value: string}) => void
    const reveal = new Promise<{id: string; value: string}>((resolve) => {
      resolveReveal = resolve
    })
    const {model, rpc} = createHarness({
      secrets: [secret],
      rpcResult: (command) => (command === 'env_runtime:secret:reveal' ? reveal : undefined),
    })
    model.secrets.set([secret])
    model.openRevealSecret(secret.id)
    model.setMasterPassword('master-password')

    const pending = model.submitReveal()
    await vi.waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('env_runtime:secret:reveal', {
        id: secret.id,
        master_password: 'master-password',
      })
    })
    model.handleEvent(new Event('blur'))
    resolveReveal({id: secret.id, value: 'must-not-reappear'})

    await expect(pending).resolves.toBeNull()
    expect(model.secretDialog()).toBe('closed')
    expect(model.revealedSecret()).toBeNull()
  })

  it('clears plaintext and discards a late reveal response after section navigation', async () => {
    const secret: EnvSecretMetadata = {
      id: 'secret-1',
      label: 'API token',
      revision: 2,
      usage_count: 1,
    }
    let resolveReveal!: (value: {id: string; value: string}) => void
    const reveal = new Promise<{id: string; value: string}>((resolve) => {
      resolveReveal = resolve
    })
    const {model, rpc} = createHarness({
      secrets: [secret],
      rpcResult: (command) => (command === 'env_runtime:secret:reveal' ? reveal : undefined),
    })
    model.secrets.set([secret])
    model.openRevealSecret(secret.id)
    model.setMasterPassword('master-password')

    const pending = model.submitReveal()
    await vi.waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('env_runtime:secret:reveal', {
        id: secret.id,
        master_password: 'master-password',
      })
    })
    model.setSection('profiles')
    resolveReveal({id: secret.id, value: 'must-not-reappear'})

    await expect(pending).resolves.toBeNull()
    expect(model.section()).toBe('profiles')
    expect(model.secretDialog()).toBe('closed')
    expect(model.revealForm.fields.masterPassword()).toBe('')
    expect(model.revealedSecret()).toBeNull()
  })

  it('clears the password after a failed reveal RPC, preserves the backend alert, and focuses retry', async () => {
    const secret: EnvSecretMetadata = {
      id: 'secret-1',
      label: 'API token',
      revision: 2,
      usage_count: 1,
    }
    const failure = Object.assign(new Error('Master password is incorrect'), {
      code: 'ENV_RUNTIME_REAUTH_FAILED',
    })
    const {model, rpc} = createHarness({
      secrets: [secret],
      rpcResult: (command) => {
        if (command === 'env_runtime:secret:reveal') throw failure
        return undefined
      },
    })
    model.secrets.set([secret])
    model.openRevealSecret(secret.id)
    model.setMasterPassword('must-be-cleared')

    await expect(model.submitReveal()).resolves.toBe('masterPassword')

    expect(rpc).toHaveBeenCalledWith('env_runtime:secret:reveal', {
      id: secret.id,
      master_password: 'must-be-cleared',
    })
    expect(model.revealForm.fields.masterPassword()).toBe('')
    expect(model.revealSubmitError()).toContain('ENV_RUNTIME_REAUTH_FAILED')
    expect(model.secretDialog()).toBe('reveal')
    expect(model.revealedSecret()).toBeNull()
  })

  it('expires plaintext on the reveal timer and invalidates a late response before secret deletion', async () => {
    vi.useFakeTimers()
    const secret: EnvSecretMetadata = {
      id: 'secret-1',
      label: 'API token',
      revision: 2,
      usage_count: 1,
    }
    let resolveReveal!: (value: {id: string; value: string}) => void
    let pendingReveal = false
    const reveal = new Promise<{id: string; value: string}>((resolve) => {
      resolveReveal = resolve
    })
    const {model, rpc} = createHarness({
      secrets: [secret],
      rpcResult: (command) => {
        if (command === 'env_runtime:secret:reveal' && pendingReveal) return reveal
        if (command === 'env_runtime:secret:reveal') return {id: secret.id, value: 'temporary'}
        return undefined
      },
    })
    model.secrets.set([secret])
    model.openRevealSecret(secret.id)
    model.setMasterPassword('master-password')
    await model.submitReveal()
    expect(model.revealedSecret()?.value).toBe('temporary')

    vi.advanceTimersByTime(30_000)
    expect(model.revealedSecret()).toBeNull()

    pendingReveal = true
    model.openRevealSecret(secret.id)
    model.setMasterPassword('master-password')
    const pending = model.submitReveal()
    await vi.waitFor(() => {
      expect(rpc.mock.calls.filter(([command]) => command === 'env_runtime:secret:reveal')).toHaveLength(2)
    })
    await model.deleteSecret(secret.id)
    resolveReveal({id: secret.id, value: 'must-not-reappear'})
    await pending

    expect(model.revealedSecret()).toBeNull()
  })

  it('uses the section transition cleanup for native approvals and clears reveal state on vault lock', async () => {
    const secret: EnvSecretMetadata = {
      id: 'secret-1',
      label: 'API token',
      revision: 2,
      usage_count: 1,
    }
    const {model, listeners} = createHarness({secrets: [secret]})
    model.desktopSnapshot.set(EMPTY_SNAPSHOT)
    model.secrets.set([secret])
    model.openRevealSecret(secret.id)
    model.revealedSecret.set({id: secret.id, value: 'temporary', expires_at_epoch_ms: 31_000})
    model.connect()
    await vi.waitFor(() => {
      expect(listeners.has('env-runtime:run-approval')).toBe(true)
      expect(listeners.has('vault:locked')).toBe(true)
    })

    listeners.get('env-runtime:run-approval')?.(runApproval())
    expect(model.section()).toBe('activity')
    expect(model.secretDialog()).toBe('closed')
    expect(model.revealedSecret()).toBeNull()

    model.setSection('secrets')
    model.openRevealSecret(secret.id)
    model.revealedSecret.set({id: secret.id, value: 'temporary', expires_at_epoch_ms: 31_000})
    model.desktopSnapshot.set({...EMPTY_SNAPSHOT, approvals: [runApproval()]})
    model.openRunApproval('run-1')
    listeners.get('vault:locked')?.(undefined)
    expect(model.secretDialog()).toBe('closed')
    expect(model.revealedSecret()).toBeNull()
    expect(model.desktopSnapshot()?.status.vault_unlocked).toBe(false)
    expect(model.selectedRunApprovalId()).toBe('run-1')
    expect(model.runApprovalReadiness()).toEqual({ready: false, denial_code: 'VAULT_REQUIRED'})
    model.disconnect()
  })

  it('validates profile bindings before sending the canonical Core draft', async () => {
    const {model, rpc} = createHarness()
    model.secrets.set([{id: 'secret-1', label: 'API token', revision: 1, usage_count: 0}])
    model.openCreateProfile()
    model.setProfileField('slug', 'backend-dev')
    model.setProfileField('label', 'Backend development')
    model.setProfileField('description', 'Local API environment')
    model.updateProfileVariable(0, 'name', 'API_TOKEN')

    await expect(model.submitProfile()).resolves.toBe('profile-variable-secret-0')
    expect(rpc).not.toHaveBeenCalledWith('env_runtime:profile:create', expect.anything())

    model.updateProfileVariable(0, 'secret_id', 'secret-1')
    await expect(model.submitProfile()).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledWith('env_runtime:profile:create', {
      slug: 'backend-dev',
      label: 'Backend development',
      description: 'Local API environment',
      variables: [{name: 'API_TOKEN', secret_id: 'secret-1'}],
    })
  })

  it('preserves and resumes a no-secrets profile draft, then selects the newly created secret', async () => {
    const secrets: EnvSecretMetadata[] = []
    const created: EnvSecretMetadata = {
      id: 'secret-created',
      label: 'Created while editing',
      revision: 1,
      usage_count: 0,
    }
    const {model} = createHarness({
      secrets,
      rpcResult: (command) => {
        if (command === 'env_runtime:secret:create') {
          secrets.push(created)
          return created
        }
        return undefined
      },
    })
    model.openCreateProfile()
    model.setProfileField('slug', 'backend-dev')
    model.setProfileField('label', 'Backend development')
    model.setProfileField('description', 'Draft must survive the nested flow')
    model.updateProfileVariable(0, 'name', 'API_TOKEN')

    model.openCreateSecretForProfile(0)
    expect(model.profileDialogOpen()).toBe(false)
    expect(model.secretDialog()).toBe('create')
    model.closeSecretDialog()
    expect(model.profileDialogOpen()).toBe(true)
    expect(model.profileForm()).toMatchObject({
      slug: 'backend-dev',
      label: 'Backend development',
      description: 'Draft must survive the nested flow',
      variables: [{name: 'API_TOKEN', secret_id: null}],
    })

    model.openCreateSecretForProfile(0)
    model.setSecretLabel(created.label)
    model.setSecretValue('created-value')
    await expect(model.submitSecret()).resolves.toBeNull()

    expect(model.secretDialog()).toBe('closed')
    expect(model.profileDialogOpen()).toBe(true)
    expect(model.profileForm.fields.variables()).toEqual([{name: 'API_TOKEN', secret_id: created.id}])
    expect(model.secrets()).toContainEqual(created)
  })

  it('returns stable first-actionable focus ids for empty and dynamic profile/preset rows', async () => {
    const {model, invoke} = createHarness()
    model.openCreateProfile()
    model.setProfileField('slug', 'backend-dev')
    model.setProfileField('label', 'Backend development')
    model.removeProfileVariable(0)

    expect(model.profileForm.submit.ready()).toBe(true)
    await expect(model.submitProfile()).resolves.toBe('profile-add-variable')

    model.addProfileVariable()
    model.updateProfileVariable(0, 'name', 'API_TOKEN')
    await expect(model.submitProfile()).resolves.toBe('profile-create-secret-0')

    model.closeProfileDialog()
    model.profiles.set([PROFILE])
    model.openCreatePreset()
    model.setPresetField('slug', 'tests')
    model.setPresetField('label', 'Backend tests')
    model.setPresetField('workspaceRoot', '/workspace')
    model.setPresetField('cwd', '/workspace')
    model.setPresetField('executable', '/usr/bin/env')
    model.addPresetArg()
    model.updatePresetArg(0, 'valid')
    model.addPresetArg()
    model.updatePresetArg(1, 'x'.repeat(4_097))
    model.addPresetPassthrough()
    model.updatePresetPassthrough(0, 'PATH')
    model.addPresetPassthrough()
    model.updatePresetPassthrough(1, 'PATH')

    expect(model.presetForm.submit.ready()).toBe(true)
    await expect(model.submitPreset()).resolves.toBe('preset-arg-1')
    expect(model.presetArgRowErrors()[0]).toBeUndefined()
    expect(model.presetArgRowErrors()[1]).toContain('4 KiB')

    model.presetForm.fields.args.change(Array.from({length: 129}, (_, index) => `arg-${index}`))
    await expect(model.submitPreset()).resolves.toBe('preset-args-error')
    expect(model.presetArgRowErrors().every((error) => error === undefined)).toBe(true)
    expect(model.presetFieldError('args')).toContain('128')

    model.presetForm.fields.args.change(Array.from({length: 17}, () => 'x'.repeat(4_096)))
    await expect(model.submitPreset()).resolves.toBe('preset-args-error')
    expect(model.presetArgRowErrors().every((error) => error === undefined)).toBe(true)
    expect(model.presetFieldError('args')).toContain('64 KiB')

    model.presetForm.fields.args.change(['valid', 'second'])
    model.updatePresetArg(1, 'second')
    await expect(model.submitPreset()).resolves.toBe('preset-passthrough-1')
    expect(model.presetPassthroughRowErrors()).toEqual([undefined, 'Variable names must be unique.'])
    expect(invoke).not.toHaveBeenCalledWith('env_runtime_preset_save', expect.anything())
  })

  it('keeps invalid form submits enabled and renders row-associated stable controls', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([{feature_key: 'env-runtime', status: 'enabled', denial_code: null}])
    envRuntimeModel.desktopSnapshot.set(EMPTY_SNAPSHOT)
    envRuntimeModel.openCreateProfile()
    envRuntimeModel.setProfileField('slug', 'backend-dev')
    envRuntimeModel.setProfileField('label', 'Backend development')
    envRuntimeModel.updateProfileVariable(0, 'name', 'API_TOKEN')
    await expect(envRuntimeModel.submitProfile()).resolves.toBe('profile-create-secret-0')

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container, {host: page})

    const createSecret = container.querySelector('#profile-create-secret-0') as
      | (HTMLElement & {disabled?: boolean})
      | null
    const secretSelect = container.querySelector('#profile-variable-secret-0')
    const profileSave = Array.from(container.querySelectorAll('cv-dialog.wide form cv-button')).find(
      (button) => button.textContent?.includes('Save'),
    ) as (HTMLElement & {disabled?: boolean}) | undefined
    expect(createSecret?.disabled).toBe(false)
    expect(createSecret?.getAttribute('aria-invalid')).toBe('true')
    expect(createSecret?.getAttribute('aria-describedby')).toBe('profile-variable-secret-0-error')
    expect(container.querySelector('#profile-variable-name-0')?.hasAttribute('required')).toBe(true)
    expect(secretSelect?.hasAttribute('required')).toBe(true)
    expect(secretSelect?.hasAttribute('disabled')).toBe(true)
    expect(secretSelect?.getAttribute('aria-describedby')).toBe('profile-variable-secret-0-error')
    expect(container.querySelector('#profile-variable-secret-0-error')?.textContent).toContain(
      'Choose a secret',
    )
    expect(profileSave?.disabled).toBe(false)
    expect(container.querySelector('#profile-add-variable')).not.toBeNull()
    expect(container.querySelector('cv-field[invalid]')?.textContent).toContain('Choose a secret')

    envRuntimeModel.closeProfileDialog()
    envRuntimeModel.profiles.set([PROFILE])
    envRuntimeModel.openCreatePreset()
    envRuntimeModel.setPresetField('slug', 'tests')
    envRuntimeModel.setPresetField('label', 'Backend tests')
    envRuntimeModel.setPresetField('workspaceRoot', '/workspace')
    envRuntimeModel.setPresetField('cwd', '/workspace')
    envRuntimeModel.setPresetField('executable', '/usr/bin/env')
    envRuntimeModel.presetForm.fields.args.change(
      Array.from({length: 129}, (_, index) => `arg-${index}`),
    )
    await expect(envRuntimeModel.submitPreset()).resolves.toBe('preset-args-error')
    render(page.renderForTest(), container, {host: page})
    const argsGroupError = container.querySelector('#preset-args-error')
    expect(argsGroupError?.getAttribute('role')).toBe('alert')
    expect(argsGroupError?.getAttribute('tabindex')).toBe('-1')
    expect(container.querySelector('[id^="preset-arg-"][invalid]')).toBeNull()
  })

  it('saves device presets and deletes profiles only through guarded Tauri commands', async () => {
    const {model, invoke} = createHarness()
    model.profiles.set([
      {
        id: 'profile-1',
        slug: 'backend-dev',
        label: 'Backend development',
        description: null,
        revision: 4,
        variables: [{name: 'API_TOKEN', secret_id: 'secret-1'}],
      },
    ])

    model.openCreatePreset()
    model.setPresetField('slug', 'tests')
    model.setPresetField('label', 'Backend tests')
    model.setPresetField('workspaceRoot', '/Users/alice/src/backend')
    model.setPresetField('cwd', '/Users/alice/src/backend')
    model.setPresetField('executable', '/opt/homebrew/bin/bun')
    model.addPresetArg()
    model.updatePresetArg(0, 'test')
    model.addPresetPassthrough()
    model.updatePresetPassthrough(0, 'PATH')

    expect(model.presetForm()).toEqual({
      profileId: 'profile-1',
      slug: 'tests',
      label: 'Backend tests',
      workspaceRoot: '/Users/alice/src/backend',
      cwd: '/Users/alice/src/backend',
      executable: '/opt/homebrew/bin/bun',
      args: ['test'],
      passthroughEnv: ['PATH'],
    })
    expect(model.presetForm.validation().errors.map((error) => error.message)).toEqual([])
    await expect(model.submitPreset()).resolves.toBeNull()
    expect(model.presetForm.submit.error()).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('env_runtime_preset_save', {
      id: null,
      baseRevision: null,
      draft: {
        profile_id: 'profile-1',
        slug: 'tests',
        label: 'Backend tests',
        workspace_root: '/Users/alice/src/backend',
        cwd: '/Users/alice/src/backend',
        executable: '/opt/homebrew/bin/bun',
        args: ['test'],
        passthrough_env: ['PATH'],
      },
    })

    model.profiles.set([
      {
        id: 'profile-1',
        slug: 'backend-dev',
        label: 'Backend development',
        description: null,
        revision: 4,
        variables: [{name: 'API_TOKEN', secret_id: 'secret-1'}],
      },
    ])
    await model.deleteProfile('profile-1')
    expect(invoke).toHaveBeenCalledWith('env_runtime_profile_delete', {
      id: 'profile-1',
      baseRevision: 4,
    })
  })

  it('uses explicit Tauri boundaries for run approval, stop, CLI install, and pairing', async () => {
    const running = {
      ...runApproval().run,
      status: 'running' as const,
      process_id: 42,
      started_at_epoch_ms: 1_000,
    }
    const pairing = {
      actor_kind: 'cli_agent' as const,
      pairing_token: 'token',
      pairing_expires_at_ms: 20_000,
      pin: '123456',
      pin_expires_at_ms: 10_000,
      attempts_left: 3,
      locked_until_ms: null,
    }
    const {model, invoke} = createHarness({
      invokeResult: (command) => {
        if (command === 'gateway_start_agent_pairing') return pairing
        if (command === 'env_runtime_cli_install') return {...CLI_STATUS, installed: true}
        if (command === 'env_runtime_desktop_snapshot') {
          return {...EMPTY_SNAPSHOT, status: {...EMPTY_SNAPSHOT.status, active_runs: 1}, runs: [running]}
        }
        return undefined
      },
    })

    model.desktopSnapshot.set({...EMPTY_SNAPSHOT, approvals: [runApproval()], runs: [running]})
    model.openRunApproval('run-1')
    await model.resolveRunApproval(true)
    await model.stopRun('run-1')
    await model.installCli()
    await model.startPairing()

    expect(invoke).toHaveBeenCalledWith('env_runtime_run_approval_resolve', {
      runId: 'run-1',
      approve: true,
    })
    expect(invoke).toHaveBeenCalledWith('env_runtime_run_stop', {runId: 'run-1'})
    expect(invoke).toHaveBeenCalledWith('env_runtime_cli_install')
    expect(invoke).toHaveBeenCalledWith('gateway_start_agent_pairing')
    expect(model.pairingInfo()).toEqual(pairing)
  })

  it('owns run approval review by id, reads the current snapshot, and closes after resolution', async () => {
    let resolveApproval!: (value: boolean) => void
    const approvalResolution = new Promise<boolean>((resolve) => {
      resolveApproval = resolve
    })
    const {model, invoke} = createHarness({
      invokeResult: (command) =>
        command === 'env_runtime_run_approval_resolve' ? approvalResolution : undefined,
    })
    model.desktopSnapshot.set({...EMPTY_SNAPSHOT, approvals: [runApproval()]})
    model.openRunApproval('run-1')

    const pending = model.resolveRunApproval(true)
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('env_runtime_run_approval_resolve', {
        runId: 'run-1',
        approve: true,
      })
    })
    expect(model.runApprovalPending()).toBe(true)

    model.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      approvals: [runApproval({preset_revision: 8, executable_sha256: 'replacement-sha256'})],
    })
    expect(model.selectedRunApproval()?.preset_revision).toBe(8)
    expect(model.selectedRunApproval()?.executable_sha256).toBe('replacement-sha256')

    resolveApproval(true)
    await pending
    expect(model.selectedRunApprovalId()).toBeNull()
    expect(model.runApprovalPending()).toBe(false)
  })

  it('closes a run review on a typed stale-facts error without recording it as rejection', async () => {
    const stale = Object.assign(new Error('Preset changed while approval was pending'), {
      code: 'REVISION_CONFLICT',
    })
    const {model, invoke} = createHarness({
      invokeResult: (command) => {
        if (command === 'env_runtime_run_approval_resolve') throw stale
        return undefined
      },
    })
    model.desktopSnapshot.set({...EMPTY_SNAPSHOT, approvals: [runApproval()]})
    model.openRunApproval('run-1')

    await model.resolveRunApproval(true)

    expect(invoke).toHaveBeenCalledWith('env_runtime_run_approval_resolve', {
      runId: 'run-1',
      approve: true,
    })
    expect(model.selectedRunApprovalId()).toBeNull()
    expect(model.runApprovalError()).toBeNull()
    expect(model.error()).toContain('REVISION_CONFLICT')
  })

  it('keeps a run review open with an actionable recoverable submission error', async () => {
    const failure = Object.assign(new Error('Temporary command failure'), {code: 'INTERNAL'})
    const {model} = createHarness({
      invokeResult: (command) => {
        if (command === 'env_runtime_run_approval_resolve') throw failure
        return undefined
      },
    })
    model.desktopSnapshot.set({...EMPTY_SNAPSHOT, approvals: [runApproval()]})
    model.openRunApproval('run-1')

    await model.resolveRunApproval(false)

    expect(model.selectedRunApprovalId()).toBe('run-1')
    expect(model.runApprovalPending()).toBe(false)
    expect(model.runApprovalError()).toContain('Temporary command failure (INTERNAL)')
  })

  it('closes pending reviews on expiry and disconnect but preserves them during vault recovery', async () => {
    vi.useFakeTimers()
    let now = 1_000
    let snapshot = {...EMPTY_SNAPSHOT, approvals: [runApproval({expires_at_epoch_ms: 2_000})]}
    let rejectApproval!: (error: Error) => void
    const approvalResolution = new Promise<boolean>((_resolve, reject) => {
      rejectApproval = reject
    })
    const {model} = createHarness({
      now: () => now,
      invokeResult: (command) => {
        if (command === 'env_runtime_desktop_snapshot') return snapshot
        if (command === 'env_runtime_run_approval_resolve') return approvalResolution
        return undefined
      },
    })
    await model.refresh()
    model.connect()
    model.openRunApproval('run-1')

    now = 2_000
    vi.advanceTimersByTime(1_000)
    await Promise.resolve()
    expect(model.selectedRunApprovalId()).toBeNull()
    expect(model.error()).toContain('APPROVAL_EXPIRED')

    now = 3_000
    snapshot = {
      ...EMPTY_SNAPSHOT,
      status: {...EMPTY_SNAPSHOT.status, vault_unlocked: false},
      approvals: [runApproval({expires_at_epoch_ms: 10_000})],
    }
    model.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      approvals: [runApproval({expires_at_epoch_ms: 10_000})],
    })
    model.openRunApproval('run-1')
    await model.refresh()
    expect(model.selectedRunApprovalId()).toBe('run-1')
    expect(model.runApprovalReadiness()).toEqual({ready: false, denial_code: 'VAULT_REQUIRED'})

    snapshot = {...EMPTY_SNAPSHOT, approvals: [runApproval({expires_at_epoch_ms: 10_000})]}
    await model.refresh()
    model.openRunApproval('run-1')
    const pending = model.resolveRunApproval(true)
    model.disconnect()
    rejectApproval(Object.assign(new Error('late failure'), {code: 'INTERNAL'}))
    await pending
    expect(model.selectedRunApprovalId()).toBeNull()
    expect(model.runApprovalError()).toBeNull()
  })

  it('keeps locked run and proposal reviews rejectable while blocking approval', async () => {
    const proposal = profileProposal('delete')
    const lockedSnapshot: EnvRuntimeDesktopSnapshot = {
      ...EMPTY_SNAPSHOT,
      status: {...EMPTY_SNAPSHOT.status, vault_unlocked: false},
      approvals: [runApproval()],
      proposals: [proposal],
    }
    const {model, invoke} = createHarness({
      invokeResult: (command) =>
        command === 'env_runtime_desktop_snapshot' ? lockedSnapshot : undefined,
    })

    await model.refresh()
    model.openRunApproval('run-1')
    expect(model.selectedRunApprovalId()).toBe('run-1')
    expect(model.runApprovalReadiness()).toEqual({ready: false, denial_code: 'VAULT_REQUIRED'})
    await model.resolveRunApproval(false)
    expect(invoke).toHaveBeenCalledWith('env_runtime_run_approval_resolve', {
      runId: 'run-1',
      approve: false,
    })

    model.desktopSnapshot.set(lockedSnapshot)
    model.openProposal(proposal.metadata.id)
    expect(model.selectedProposalId()).toBe(proposal.metadata.id)
    expect(model.proposalApprovalReadiness()).toEqual({
      ready: false,
      denial_code: 'VAULT_REQUIRED',
    })
    await model.resolveProposal(false)
    expect(invoke).toHaveBeenCalledWith('env_runtime_proposal_resolve', {
      proposalId: proposal.metadata.id,
      approve: false,
      profileBindings: [],
    })
  })

  it('closes a review when a refreshed snapshot removes its request', async () => {
    let snapshot: EnvRuntimeDesktopSnapshot = {...EMPTY_SNAPSHOT, approvals: [runApproval()]}
    const {model} = createHarness({
      invokeResult: (command) => (command === 'env_runtime_desktop_snapshot' ? snapshot : undefined),
    })
    await model.refresh()
    model.openRunApproval('run-1')

    snapshot = EMPTY_SNAPSHOT
    await model.refresh()

    expect(model.selectedRunApprovalId()).toBeNull()
    expect(model.error()).toContain('APPROVAL_CLOSED')

    const proposal = profileProposal('update')
    snapshot = {...EMPTY_SNAPSHOT, proposals: [proposal]}
    await model.refresh()
    model.openProposal(proposal.metadata.id)
    snapshot = EMPTY_SNAPSHOT
    await model.refresh()

    expect(model.selectedProposalId()).toBeNull()
    expect(model.error()).toContain('PROPOSAL_NOT_FOUND')
  })

  it('keeps unbound profile proposals open and focuses the first missing binding before transport', async () => {
    const proposal = profileProposal('update')
    const {model, invoke} = createHarness()
    model.desktopSnapshot.set({...EMPTY_SNAPSHOT, proposals: [proposal]})
    model.profiles.set([PROFILE])
    model.openProposal(proposal.metadata.id)

    await expect(model.resolveProposal(true)).resolves.toBe('proposal-variable-secret-1')

    expect(invoke).not.toHaveBeenCalledWith('env_runtime_proposal_resolve', expect.anything())
    expect(model.selectedProposalId()).toBe(proposal.metadata.id)
    expect(model.proposalRowErrors()[1]?.secret).toBe('Choose a secret.')
  })

  it('keeps existing proposal references read-only and sends only originally-null bindings', async () => {
    const proposal = profileProposal('update')
    const {model, invoke} = createHarness()
    model.desktopSnapshot.set({...EMPTY_SNAPSHOT, proposals: [proposal]})
    model.profiles.set([PROFILE])
    model.secrets.set([
      {id: 'secret-1', label: 'API token', revision: 1, usage_count: 1},
      {id: 'secret-2', label: 'Database URL', revision: 1, usage_count: 0},
    ])
    model.openProposal(proposal.metadata.id)

    expect(model.proposalVariableIsBindable(0)).toBe(false)
    expect(model.proposalVariableIsBindable(1)).toBe(true)
    model.updateProposalVariable(0, 'secret-2')
    model.updateProposalVariable(1, 'secret-2')
    expect(model.proposalProfileDraft()?.variables).toEqual([
      {name: 'API_TOKEN', secret_id: 'secret-1'},
      {name: 'DATABASE_URL', secret_id: 'secret-2'},
    ])

    await expect(model.resolveProposal(true)).resolves.toBeNull()
    expect(invoke).toHaveBeenCalledWith('env_runtime_proposal_resolve', {
      proposalId: proposal.metadata.id,
      approve: true,
      profileBindings: [{name: 'DATABASE_URL', secret_id: 'secret-2'}],
    })
  })

  it('keeps the plaintext-process warning visible on every run approval', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'enabled',
        denial_code: null,
      },
    ])
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      status: {...EMPTY_SNAPSHOT.status, pending_approvals: 1},
      approvals: [runApproval({expires_at_epoch_ms: Date.now() + 120_000})],
    })

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container, {host: page})

    expect(container.querySelectorAll('cv-tab[slot="nav"]')).toHaveLength(5)
    expect(container.querySelector('[data-kind="approval"]')?.textContent).toContain('Review run')
    expect(container.querySelector('[data-kind="approval"]')?.textContent).not.toContain('Approve')
    ;(container.querySelector('[data-kind="approval"] cv-button') as HTMLElement).click()
    render(page.renderForTest(), container, {host: page})

    const dialog = Array.from(container.querySelectorAll('cv-dialog')).find(
      (candidate) => (candidate as {open?: boolean}).open,
    ) as
      | (HTMLElement & {
          type: string
          initialFocusId: string
          closeOnOutsidePointer: boolean
          closeOnOutsideFocus: boolean
        })
      | undefined
    expect(dialog?.type).toBe('alertdialog')
    expect(dialog?.initialFocusId).toBe('run-approval-reject')
    expect(dialog?.closeOnOutsidePointer).toBe(false)
    expect(dialog?.closeOnOutsideFocus).toBe(false)
    const reviewText = container.querySelector('[data-run-approval-review]')?.textContent
    expect(reviewText).toContain('agent-1')
    expect(reviewText).toContain('Revision 4')
    expect(reviewText).toContain('Revision 7')
    expect(reviewText).toContain('/workspace/current')
    expect(reviewText).toContain('/workspace/current/api')
    expect(reviewText).toContain('/opt/homebrew/bin/bun')
    expect(reviewText).toContain('current-sha256')
    expect(reviewText).toContain('["/opt/homebrew/bin/bun","test","--watch=false"]')
    expect(reviewText).toContain('PATH')
    expect(reviewText).toContain('API token')
    expect(reviewText).toContain('Profile value overrides the passthrough value')
    expect(reviewText).toContain('Untrusted agent text')
    expect(reviewText).toContain('Run the backend test suite')
    expect(
      Array.from(container.querySelectorAll('[data-run-approval-review] code')).every(
        (code) => code.getAttribute('dir') === 'ltr',
      ),
    ).toBe(true)
    expect(
      container.querySelector('[data-run-approval-review] .untrusted-note bdi[dir="auto"]')?.textContent,
    ).toBe('Run the backend test suite')
    expect(container.querySelector('[data-security-warning]')?.textContent).toContain(
      'plaintext environment values',
    )
    expect(container.querySelector('[data-security-warning]')?.textContent).toContain(
      'cannot erase values already passed',
    )

    envRuntimeModel.runApprovalError.set('Temporary failure (INTERNAL)')
    envRuntimeModel.runApprovalPending.set(true)
    render(page.renderForTest(), container, {host: page})
    const pendingDialog = Array.from(container.querySelectorAll('cv-dialog')).find(
      (candidate) => (candidate as {open?: boolean}).open,
    ) as (HTMLElement & {closable: boolean}) | undefined
    expect(pendingDialog?.closable).toBe(false)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Temporary failure (INTERNAL)')
    expect(
      Array.from(container.querySelectorAll('[slot="footer"] cv-button')).every(
        (button) => (button as {disabled?: boolean}).disabled,
      ),
    ).toBe(true)
  })

  it('renders a reveal backend failure as an alert with an empty focused retry target', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'enabled',
        denial_code: null,
      },
    ])
    const secret = {id: 'secret-1', label: 'API token', revision: 1, usage_count: 0}
    envRuntimeModel.desktopSnapshot.set(EMPTY_SNAPSHOT)
    envRuntimeModel.secrets.set([secret])
    envRuntimeModel.openRevealSecret(secret.id)
    envRuntimeModel.revealAttempted.set(true)
    envRuntimeModel.revealRpcError.set('Master password is incorrect (ENV_RUNTIME_REAUTH_FAILED)')

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container, {host: page})

    const retryTarget = container.querySelector('#env-secret-master-password') as
      | (HTMLElement & {value?: string})
      | null
    expect(retryTarget?.value).toBe('')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('ENV_RUNTIME_REAUTH_FAILED')
    const revealAction = Array.from(container.querySelectorAll('form cv-button')).find((button) =>
      button.textContent?.includes('Reveal'),
    ) as (HTMLElement & {disabled?: boolean}) | undefined
    expect(revealAction?.disabled).toBe(false)
  })

  it('renders current and proposed metadata without secret values for profile and preset reviews', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'enabled',
        denial_code: null,
      },
    ])
    envRuntimeModel.profiles.set([PROFILE])
    envRuntimeModel.secrets.set([
      {id: 'secret-1', label: 'API token', revision: 1, usage_count: 1},
      {id: 'secret-2', label: 'Database URL', revision: 1, usage_count: 0},
    ])
    const profileUpdate = profileProposal('update')
    profileUpdate.metadata.expires_at_epoch_ms = Date.now() + 600_000
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      presets: [PRESET],
      proposals: [profileUpdate],
    })
    envRuntimeModel.openProposal(profileUpdate.metadata.id)

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container, {host: page})

    const profileReview = container.querySelector('[data-proposal-review]')
    const proposalDialog = Array.from(container.querySelectorAll('cv-dialog')).find(
      (candidate) => (candidate as {open?: boolean}).open,
    ) as (HTMLElement & {type: string; initialFocusId: string}) | undefined
    expect(proposalDialog?.type).toBe('alertdialog')
    expect(proposalDialog?.initialFocusId).toBe('proposal-reject')
    expect(profileReview?.textContent).toContain('Current saved profile')
    expect(profileReview?.textContent).toContain('Proposed profile')
    expect(profileReview?.textContent).toContain('Current profile description')
    expect(profileReview?.textContent).toContain('Proposed profile description')
    expect(profileReview?.textContent).toContain('API token')
    expect(profileReview?.textContent).toContain('DATABASE_URL')
    expect(
      Array.from(profileReview?.querySelectorAll('code') ?? []).every(
        (code) => code.getAttribute('dir') === 'ltr',
      ),
    ).toBe(true)
    expect(profileReview?.querySelector('bdi[dir="auto"]')?.textContent).toBeTruthy()
    expect(profileReview?.querySelectorAll('[data-proposal-binding-readonly]')).toHaveLength(1)
    expect(profileReview?.querySelector('#proposal-variable-secret-0')).toBeNull()
    expect(profileReview?.querySelector('#proposal-variable-secret-1')).not.toBeNull()
    const proposalActions = Array.from(container.querySelectorAll('[slot="footer"] cv-button'))
    expect((proposalActions.at(-1) as {disabled?: boolean}).disabled).toBe(false)

    envRuntimeModel.closeProposal()
    const presetUpdate = presetProposal('update')
    presetUpdate.metadata.expires_at_epoch_ms = Date.now() + 600_000
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      presets: [PRESET],
      proposals: [presetUpdate],
    })
    envRuntimeModel.openProposal(presetUpdate.metadata.id)
    render(page.renderForTest(), container)

    const presetReview = container.querySelector('[data-proposal-review]')
    expect(presetReview?.textContent).toContain('Current saved preset')
    expect(presetReview?.textContent).toContain('Proposed preset')
    expect(presetReview?.textContent).toContain('/workspace/current')
    expect(presetReview?.textContent).toContain('/workspace/next')
    expect(presetReview?.textContent).toContain('current-sha256')
    expect(presetReview?.textContent).toContain('prepared-sha256')
    expect(presetReview?.querySelector('[data-prepared-preset-facts]')).not.toBeNull()
    expect(presetReview?.textContent).not.toContain('pins the resulting SHA-256')

    envRuntimeModel.closeProposal()
    const presetDelete = presetProposal('delete')
    presetDelete.metadata.expires_at_epoch_ms = Date.now() + 600_000
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      presets: [PRESET],
      proposals: [presetDelete],
    })
    envRuntimeModel.openProposal(presetDelete.metadata.id)
    render(page.renderForTest(), container)

    expect(container.querySelector('[data-proposal-review]')?.textContent).toContain(
      'Resource will be deleted',
    )
    expect(container.querySelector('[data-proposal-review]')?.textContent).toContain(
      'no replacement data is written',
    )
    expect(container.querySelector('[data-proposal-review]')?.textContent).toContain('current-sha256')

    envRuntimeModel.closeProposal()
    const profileDelete = profileProposal('delete')
    profileDelete.metadata.expires_at_epoch_ms = Date.now() + 600_000
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      presets: [PRESET],
      proposals: [profileDelete],
    })
    envRuntimeModel.openProposal(profileDelete.metadata.id)
    render(page.renderForTest(), container)

    expect(container.querySelector('[data-proposal-review]')?.textContent).toContain('Current saved profile')
    expect(container.querySelector('[data-proposal-review]')?.textContent).toContain(
      'Current profile description',
    )
    expect(container.querySelector('[data-proposal-review]')?.textContent).toContain(
      'Resource will be deleted',
    )
  })

  it('renders denial states as recovery-only status and runs without privileged surfaces', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'locked_pro',
        denial_code: 'PRO_REQUIRED',
      },
    ])
    const recoveryProposal = profileProposal()
    recoveryProposal.metadata.expires_at_epoch_ms = Date.now() + 600_000
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      status: {
        ...EMPTY_SNAPSHOT.status,
        active_runs: 1,
        pending_approvals: 1,
        pending_proposals: 1,
      },
      presets: [PRESET],
      approvals: [runApproval({expires_at_epoch_ms: Date.now() + 120_000})],
      proposals: [recoveryProposal],
      runs: [
        {
          ...runApproval().run,
          status: 'running',
          process_id: 42,
          started_at_epoch_ms: Date.now() - 1_000,
        },
      ],
    })
    envRuntimeModel.secrets.set([{id: 'secret-1', label: 'API token', revision: 1, usage_count: 1}])
    envRuntimeModel.profiles.set([PROFILE])
    envRuntimeModel.cliStatus.set(CLI_STATUS)

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container, {host: page})

    expect(container.querySelector('.status-band[data-mode="recovery"]')?.textContent).toContain('1')
    expect(container.querySelector('[data-runtime-runs] [data-kind="run"]')?.textContent).toContain('run-1')
    expect(container.querySelector('[data-runtime-runs] cv-button')?.textContent).toContain('Stop')
    expect(container.textContent).toContain('Manage license')
    expect(container.querySelectorAll('cv-tab[slot="nav"]')).toHaveLength(5)
    expect(container.querySelector('[data-kind="approval"]')).not.toBeNull()
    expect(container.querySelector('[data-kind="proposal"]')).not.toBeNull()
    expect(
      container.querySelector('[data-readiness-warning][data-denial-code="PRO_REQUIRED"]'),
    ).not.toBeNull()
    expect(container.textContent).not.toContain('Install CLI')
    expect(container.textContent).not.toContain('Pair agent')
    expect(container.textContent).toContain('Environment secrets')

    envRuntimeModel.openRunApproval('run-1')
    render(page.renderForTest(), container, {host: page})
    let reviewActions = Array.from(container.querySelectorAll('[slot="footer"] cv-button')) as Array<
      HTMLElement & {disabled?: boolean}
    >
    expect(reviewActions.at(-2)?.textContent).toContain('Reject')
    expect(reviewActions.at(-2)?.disabled).toBe(false)
    expect(reviewActions.at(-1)?.textContent).toContain('Approve')
    expect(reviewActions.at(-1)?.disabled).toBe(true)

    envRuntimeModel.closeRunApproval()
    envRuntimeModel.openProposal(recoveryProposal.metadata.id)
    render(page.renderForTest(), container, {host: page})
    reviewActions = Array.from(container.querySelectorAll('[slot="footer"] cv-button')) as Array<
      HTMLElement & {disabled?: boolean}
    >
    expect(reviewActions.at(-2)?.textContent).toContain('Reject')
    expect(reviewActions.at(-2)?.disabled).toBe(false)
    expect(reviewActions.at(-1)?.textContent).toContain('Approve')
    expect(reviewActions.at(-1)?.disabled).toBe(true)
  })

  it('explains degraded device-store mode without hiding other Env Runtime sections', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'enabled',
        denial_code: null,
      },
    ])
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      status: {
        ...EMPTY_SNAPSHOT.status,
        device_store_available: false,
        device_store_error_code: 'DEVICE_STORE_KEY_UNAVAILABLE',
      },
    })

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container)

    expect(container.querySelector('[data-device-store-warning]')?.textContent).toContain(
      'DEVICE_STORE_KEY_UNAVAILABLE',
    )
    expect(container.textContent).toContain('Environment secrets')
    expect(container.textContent).toContain('Portable profiles')
  })

  it('shows bundled and installed CLI versions with a non-mutating PATH hint', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'enabled',
        denial_code: null,
      },
    ])
    envRuntimeModel.desktopSnapshot.set(EMPTY_SNAPSHOT)
    envRuntimeModel.cliStatus.set({
      ...CLI_STATUS,
      installed_path: '/Users/alice/.local/bin/chromvoid',
      installed_version: '1.2.3',
      installed: true,
      managed_link: true,
    })

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container)

    expect(container.textContent).toContain('Bundled version: 1.2.3')
    expect(container.textContent).toContain('Installed version: 1.2.3')
    expect(container.textContent).toContain('~/.local/bin')
    expect(container.textContent).toContain('never edits shell profiles')
    expect(container.querySelector('[data-cli-installed-at]')?.getAttribute('dir')).toBeNull()
    expect(container.querySelector('[data-cli-installed-at]')?.textContent).toContain(
      '\u2066/Users/alice/.local/bin/chromvoid\u2069',
    )
  })

  it('keeps Arabic fallback copy natural while preset identifiers remain LTR', () => {
    setPasswordManagerLang('ar')
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'enabled',
        denial_code: null,
      },
    ])
    envRuntimeModel.profiles.set([PROFILE])
    envRuntimeModel.setSection('presets')
    const emptyPreset = {...PRESET, passthrough_env: []}
    const createProposal = presetProposal('create')
    createProposal.metadata.expires_at_epoch_ms = Date.now() + 600_000
    if (createProposal.draft?.resource_kind === 'preset') {
      createProposal.draft.draft.passthrough_env = []
    }
    if (createProposal.prepared_preset) createProposal.prepared_preset.passthrough_env = []
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      presets: [emptyPreset],
      proposals: [createProposal],
    })
    envRuntimeModel.openProposal(createProposal.metadata.id)

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness
    render(page.renderForTest(), container, {host: page})

    expect(container.querySelector('[data-preset-profile] bdi[dir="auto"]')).not.toBeNull()
    expect(container.querySelector('[data-preset-hash] code[dir="ltr"]')?.textContent).toBe(
      emptyPreset.executable_sha256,
    )
    expect(container.querySelector('[data-proposal-target] code')).toBeNull()
    expect(container.querySelector('[data-proposal-target] bdi[dir="auto"]')?.textContent).toBe('غير مقدّم')
    expect(container.querySelector('[data-proposed-passthrough] code')).toBeNull()
    expect(container.querySelector('[data-proposed-passthrough] bdi[dir="auto"]')?.textContent).toBe('لا شيء')

    envRuntimeModel.closeProposal()
    const updateProposal = presetProposal('update')
    updateProposal.metadata.expires_at_epoch_ms = Date.now() + 600_000
    if (updateProposal.draft?.resource_kind === 'preset') {
      updateProposal.draft.draft.passthrough_env = []
    }
    if (updateProposal.prepared_preset) updateProposal.prepared_preset.passthrough_env = []
    envRuntimeModel.desktopSnapshot.set({
      ...EMPTY_SNAPSHOT,
      presets: [emptyPreset],
      proposals: [updateProposal],
    })
    envRuntimeModel.openProposal(updateProposal.metadata.id)
    render(page.renderForTest(), container, {host: page})

    expect(container.querySelector('[data-current-passthrough] code')).toBeNull()
    expect(container.querySelector('[data-current-passthrough] bdi[dir="auto"]')?.textContent).toBe('لا شيء')
  })

  it('marks natural labels and technical Env Runtime fields at their DOM boundaries', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'env-runtime',
        status: 'enabled',
        denial_code: null,
      },
    ])
    envRuntimeModel.desktopSnapshot.set(EMPTY_SNAPSHOT)
    envRuntimeModel.profiles.set([PROFILE])

    const container = document.createElement('div')
    const page = document.createElement('test-env-runtime-page') as EnvRuntimePageHarness

    envRuntimeModel.openCreateSecret()
    render(page.renderForTest(), container, {host: page})
    expect(container.querySelector('#env-secret-label')?.getAttribute('dir')).toBe('auto')
    expect(container.querySelector('#env-secret-value')?.getAttribute('dir')).toBe('ltr')

    envRuntimeModel.closeSecretDialog()
    envRuntimeModel.openCreateProfile()
    render(page.renderForTest(), container, {host: page})
    expect(container.querySelector('#profile-slug')?.getAttribute('dir')).toBe('ltr')
    expect(container.querySelector('#profile-label')?.getAttribute('dir')).toBe('auto')
    expect(container.querySelector('#profile-description')?.getAttribute('dir')).toBe('auto')
    expect(container.querySelector('#profile-variable-name-0')?.getAttribute('dir')).toBe('ltr')

    envRuntimeModel.closeProfileDialog()
    envRuntimeModel.openCreatePreset()
    envRuntimeModel.addPresetArg()
    envRuntimeModel.addPresetPassthrough()
    render(page.renderForTest(), container, {host: page})
    expect(container.querySelector('#preset-label')?.getAttribute('dir')).toBe('auto')
    expect(container.querySelector('#preset-workspaceRoot')?.getAttribute('dir')).toBe('ltr')
    expect(container.querySelector('#preset-cwd')?.getAttribute('dir')).toBe('ltr')
    expect(container.querySelector('#preset-executable')?.getAttribute('dir')).toBe('ltr')
    expect(container.querySelector('#preset-arg-0')?.getAttribute('dir')).toBe('ltr')
    expect(container.querySelector('#preset-passthrough-0')?.getAttribute('dir')).toBe('ltr')
  })
})
