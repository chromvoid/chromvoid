import {action, atom, computed, withAbort, withAsync, wrap} from '@reatom/core'

import type {SurfaceId} from 'root/app/navigation/navigation.types'
import {
  runtimeCapabilitiesAtom,
  type RuntimeCapabilities,
} from 'root/core/runtime/runtime-capabilities'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

import {
  activeCoreAccessContextKey,
  type ActiveCoreAccessContext,
} from './active-core-access-context'

export const MODULE_KEYS = [
  'remote',
  'credential-provider',
  'ssh-agent',
  'env-runtime',
  'crypto-wallet',
  'emergency-access',
  'browser-extension',
  'mounted-vault',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

/**
 * Module access as the active Core answers it: `unsupported` when the platform or the active Core
 * cannot run the module, `disabled_by_rollout` when the release has not enabled it, `enabled` otherwise.
 */
export const MODULE_ACCESS_STATUSES = ['unsupported', 'disabled_by_rollout', 'enabled'] as const

export type ModuleAccessStatus = (typeof MODULE_ACCESS_STATUSES)[number]

export type ModuleAccessState = {
  feature_key: ModuleKey
  status: ModuleAccessStatus
  denial_code?: string | null
}

/**
 * Progress of reading the active Core's module access snapshot. Until it is `resolved`, only what the
 * runtime capabilities already rule out is known; nothing is treated as enabled.
 */
export type ModuleAccessResolution =
  | {phase: 'pending'}
  | {phase: 'resolving'}
  | {phase: 'resolved'; states: readonly ModuleAccessState[]}
  | {phase: 'failed'; error: string}

export type ModuleAccessGate =
  | {kind: 'open'}
  | {kind: 'checking'}
  | {kind: 'check-failed'}
  | {kind: 'unavailable'; access: ModuleAccessState}

export type ActiveCoreAccessReadiness = 'pending' | 'ready'

type ActiveCoreResolutionRequest = {
  context: ActiveCoreAccessContext
  revision: number
}

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

const SURFACE_MODULES: Partial<Record<SurfaceId, ModuleKey>> = {
  remote: 'remote',
  gateway: 'browser-extension',
  'remote-storage': 'mounted-vault',
  wallet: 'crypto-wallet',
}

const PENDING: ModuleAccessResolution = {phase: 'pending'}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isModuleAccessState(value: unknown): value is ModuleAccessState {
  if (typeof value !== 'object' || value === null) return false
  const {feature_key: featureKey, status} = value as {feature_key?: unknown; status?: unknown}
  return (
    (MODULE_KEYS as readonly unknown[]).includes(featureKey) &&
    (MODULE_ACCESS_STATUSES as readonly unknown[]).includes(status)
  )
}

class ModuleAccessModel {
  readonly resolution = atom<ModuleAccessResolution>(PENDING, 'moduleAccess.resolution')
  readonly activeCoreContext = atom<ActiveCoreAccessContext>(
    {sourceCore: 'local'},
    'moduleAccess.activeCoreContext',
  )
  readonly activeCoreReadiness = atom<ActiveCoreAccessReadiness>(
    'pending',
    'moduleAccess.activeCoreReadiness',
  )

  private contextRevision = 0
  private activeResolution: Promise<void> | null = null

  private readonly resolveActiveCoreAccess = action(
    async (request: ActiveCoreResolutionRequest): Promise<void> => {
      try {
        const response = await wrap(
          tauriInvoke<RpcResult<unknown[]>>('module_access_snapshot'),
        )
        if (!this.isCurrentResolution(request)) return
        this.resolution.set(
          response.ok
            ? {phase: 'resolved', states: response.result.filter(isModuleAccessState)}
            : {phase: 'failed', error: response.error},
        )
      } catch (error) {
        if (isAbortError(error) || !this.isCurrentResolution(request)) return
        console.warn('[module-access] snapshot failed', error)
        this.resolution.set({phase: 'failed', error: errorMessage(error)})
      }
    },
    'moduleAccess.resolveActiveCoreAccess',
  ).extend(withAsync(), withAbort('last-in-win'))

  /**
   * Every module whose access is known: the Core's answer once resolved, and at any time the modules the
   * runtime cannot run. A module missing from this map is still being checked or could not be checked.
   */
  readonly states = computed(() => {
    const capabilities = runtimeCapabilitiesAtom()
    const resolution = this.resolution()
    const known = new Map<ModuleKey, ModuleAccessState>()
    if (resolution.phase === 'resolved') {
      for (const state of resolution.states) known.set(state.feature_key, state)
    }
    for (const feature of MODULE_KEYS) {
      if (!isModuleSupportedByRuntime(feature, capabilities)) {
        known.set(feature, {
          feature_key: feature,
          status: 'unsupported',
          denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
        })
      }
    }
    return known
  }, 'moduleAccess.states')

  featureAccess(feature: ModuleKey): ModuleAccessState | null {
    return this.states().get(feature) ?? null
  }

  isFeatureEnabled(feature: ModuleKey): boolean {
    return this.featureAccess(feature)?.status === 'enabled'
  }

  featureGate(feature: ModuleKey): ModuleAccessGate {
    const access = this.featureAccess(feature)
    if (access) return access.status === 'enabled' ? {kind: 'open'} : {kind: 'unavailable', access}
    const phase = this.resolution().phase
    return phase === 'pending' || phase === 'resolving' ? {kind: 'checking'} : {kind: 'check-failed'}
  }

  surfaceGate(surface: SurfaceId): ModuleAccessGate {
    const feature = SURFACE_MODULES[surface]
    return feature ? this.featureGate(feature) : {kind: 'open'}
  }

  canOpenSurface(surface: SurfaceId): boolean {
    return this.surfaceGate(surface).kind === 'open'
  }

  /**
   * Whether the surface is offered as an entry point. A surface whose module is known to be unsupported
   * or disabled by rollout is not offered; one that is still being checked stays offered so the
   * navigation does not jump once access resolves.
   */
  isSurfaceOffered(surface: SurfaceId): boolean {
    return this.surfaceGate(surface).kind !== 'unavailable'
  }

  preferredSurfaceFallback(): SurfaceId {
    return this.isSurfaceOffered('remote') ? 'remote' : 'files'
  }

  reset(): void {
    this.resolveActiveCoreAccess.abort('module access reset')
    this.contextRevision += 1
    this.activeResolution = null
    this.resolution.set(PENDING)
    this.activeCoreContext.set({sourceCore: 'local'})
    this.activeCoreReadiness.set('pending')
  }

  setActiveCoreContext(
    context: ActiveCoreAccessContext,
    readiness: ActiveCoreAccessReadiness,
  ): void {
    const nextKey = activeCoreAccessContextKey(context)
    const currentKey = activeCoreAccessContextKey(this.activeCoreContext())
    const contextChanged = nextKey !== currentKey
    const becamePending = readiness === 'pending' && this.activeCoreReadiness() !== 'pending'

    this.activeCoreContext.set(context)
    this.activeCoreReadiness.set(readiness)
    if (!contextChanged && !becamePending) return

    this.invalidateActiveCoreAccess()
  }

  async ensureActiveCoreAccess(): Promise<void> {
    if (this.activeCoreReadiness() !== 'ready') return
    const phase = this.resolution().phase
    if (phase === 'resolved' || phase === 'failed') return
    if (this.activeResolution) {
      await this.activeResolution
      return
    }
    await this.startActiveCoreResolution()
  }

  async refresh(): Promise<void> {
    if (this.activeCoreReadiness() !== 'ready') return
    this.resolveActiveCoreAccess.abort('module access refresh superseded')
    this.contextRevision += 1
    this.activeResolution = null
    await this.startActiveCoreResolution()
  }

  private async startActiveCoreResolution(): Promise<void> {
    if (!isTauriRuntime()) {
      // Without a Tauri Core (browser dev and mock transport) the runtime capabilities alone decide,
      // except for the wallet: only the Tauri snapshot can confirm that Core supports it.
      this.resolution.set({
        phase: 'resolved',
        states: MODULE_KEYS.map(
          (feature): ModuleAccessState =>
            feature === 'crypto-wallet'
              ? {feature_key: feature, status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'}
              : {feature_key: feature, status: 'enabled', denial_code: null},
        ),
      })
      return
    }

    const request = {
      context: this.activeCoreContext(),
      revision: this.contextRevision,
    }
    this.resolution.set({phase: 'resolving'})
    const pending = this.resolveActiveCoreAccess(request).catch((error: unknown) => {
      if (isAbortError(error)) return
      throw error
    })
    const tracked = pending.finally(() => {
      if (this.activeResolution === tracked) {
        this.activeResolution = null
      }
    })
    this.activeResolution = tracked
    await tracked
  }

  private invalidateActiveCoreAccess(): void {
    this.resolveActiveCoreAccess.abort('active Core changed')
    this.contextRevision += 1
    this.activeResolution = null
    this.resolution.set(PENDING)
  }

  private isCurrentResolution(request: ActiveCoreResolutionRequest): boolean {
    return (
      request.revision === this.contextRevision &&
      activeCoreAccessContextKey(request.context) ===
        activeCoreAccessContextKey(this.activeCoreContext()) &&
      this.activeCoreReadiness() === 'ready'
    )
  }
}

function isModuleSupportedByRuntime(feature: ModuleKey, capabilities: RuntimeCapabilities): boolean {
  switch (feature) {
    case 'remote':
      return capabilities.supports_network_remote
    case 'browser-extension':
      return capabilities.supports_gateway
    case 'mounted-vault':
      return capabilities.supports_volume
    case 'credential-provider':
      return capabilities.supports_autofill
    case 'ssh-agent':
      return capabilities.desktop && !capabilities.mobile
    case 'env-runtime':
      return (
        capabilities.desktop &&
        !capabilities.mobile &&
        (capabilities.platform === 'macos' || capabilities.platform === 'darwin')
      )
    case 'crypto-wallet':
      return true
    case 'emergency-access':
      return false
  }
}

export const moduleAccessModel = new ModuleAccessModel()
