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

export const PRO_FEATURE_KEYS = [
  'remote',
  'credential-provider',
  'ssh-agent',
  'env-runtime',
  'crypto-wallet',
  'emergency-access',
  'browser-extension',
  'mounted-vault',
] as const

export type ProFeatureKey = (typeof PRO_FEATURE_KEYS)[number]

export const MODULE_ACCESS_STATUSES = [
  'unsupported',
  'disabled_by_rollout',
  'entitlement_unavailable',
  'locked_pro',
  'enabled',
] as const

export type ModuleAccessStatus = (typeof MODULE_ACCESS_STATUSES)[number]

export type EntitlementSnapshot = {
  licensed: boolean
  plan: 'free' | 'pro'
  feature_keys: ProFeatureKey[]
  source_core: 'local' | 'remote_host' | string
  build_policy: 'enforce' | 'bypass'
}

export type ModuleAccessState = {
  feature_key: ProFeatureKey
  status: ModuleAccessStatus
  denial_code?: string | null
}

export type ModuleAccessSurfaceGate =
  | {kind: 'checking'}
  | {kind: 'open'}
  | {kind: 'blocked'; access: ModuleAccessState}

export type ActiveCoreAccessReadiness = 'pending' | 'ready'

type ActiveCoreAccessLifecycle = 'pending' | 'resolving' | 'resolved'

type ActiveCoreResolutionRequest = {
  context: ActiveCoreAccessContext
  revision: number
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export type LicenseSeatDevice = {
  device_fingerprint: string
  activated_at: string
  current_device: boolean
}

export type LicenseSeatStatus = {
  seat_limit: number
  seats_used: number
  seats_available: number
  current_device_active: boolean
  purchase_id?: string | null
  devices: LicenseSeatDevice[]
}

export type LicenseCabinetHandoffResult = {
  cabinet_url: string
  expires_at: string
}

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

const PRO_SURFACE_FEATURES: Partial<Record<SurfaceId, ProFeatureKey>> = {
  remote: 'remote',
  gateway: 'browser-extension',
  'remote-storage': 'mounted-vault',
  wallet: 'crypto-wallet',
}

const DEFAULT_STATES: ModuleAccessState[] = [
  {feature_key: 'remote', status: 'entitlement_unavailable', denial_code: 'ENTITLEMENT_UNAVAILABLE'},
  {
    feature_key: 'credential-provider',
    status: 'entitlement_unavailable',
    denial_code: 'ENTITLEMENT_UNAVAILABLE',
  },
  {feature_key: 'ssh-agent', status: 'entitlement_unavailable', denial_code: 'ENTITLEMENT_UNAVAILABLE'},
  {feature_key: 'env-runtime', status: 'entitlement_unavailable', denial_code: 'ENTITLEMENT_UNAVAILABLE'},
  {feature_key: 'crypto-wallet', status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'},
  {
    feature_key: 'emergency-access',
    status: 'unsupported',
    denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
  },
  {
    feature_key: 'browser-extension',
    status: 'entitlement_unavailable',
    denial_code: 'ENTITLEMENT_UNAVAILABLE',
  },
  {feature_key: 'mounted-vault', status: 'entitlement_unavailable', denial_code: 'ENTITLEMENT_UNAVAILABLE'},
]

class ModuleAccessModel {
  readonly rawStates = atom<ModuleAccessState[]>(DEFAULT_STATES)
  readonly error = atom<string | null>(null)
  readonly entitlement = atom<EntitlementSnapshot | null>(null)
  readonly licenseSeatStatus = atom<LicenseSeatStatus | null>(null)
  readonly licenseSeatLoading = atom(false)
  readonly licenseSeatError = atom<string | null>(null)
  readonly supportsExternalPro = computed(
    () => runtimeCapabilitiesAtom().supports_external_pro,
    'moduleAccess.supportsExternalPro',
  )
  readonly activeCoreContext = atom<ActiveCoreAccessContext>(
    {sourceCore: 'local'},
    'moduleAccess.activeCoreContext',
  )
  readonly activeCoreReadiness = atom<ActiveCoreAccessReadiness>(
    'pending',
    'moduleAccess.activeCoreReadiness',
  )
  readonly activeCoreLifecycle = atom<ActiveCoreAccessLifecycle>(
    'pending',
    'moduleAccess.activeCoreLifecycle',
  )

  private readonly operationLoading = atom(false, 'moduleAccess.operationLoading')
  private contextRevision = 0
  private activeResolution: Promise<void> | null = null

  private readonly resolveActiveCoreAccess = action(
    async (request: ActiveCoreResolutionRequest): Promise<void> => {
      try {
        const [access, entitlement] = await wrap(
          Promise.all([
            tauriInvoke<RpcResult<ModuleAccessState[]>>('module_access_snapshot'),
            tauriInvoke<RpcResult<EntitlementSnapshot>>('license_status'),
          ]),
        )
        if (!this.isCurrentResolution(request)) return

        let errorMessage: string | null = null
        if (access.ok) {
          this.rawStates.set(access.result)
        } else {
          this.rawStates.set(DEFAULT_STATES)
          errorMessage = access.error
        }

        if (entitlement.ok && entitlement.result.source_core === request.context.sourceCore) {
          this.entitlement.set(entitlement.result)
          if (!entitlement.result.licensed) {
            this.licenseSeatStatus.set(null)
            this.licenseSeatError.set(null)
          }
        } else {
          this.entitlement.set(null)
          if (entitlement.ok) {
            this.rawStates.set(DEFAULT_STATES)
            errorMessage = `License source mismatch: expected ${request.context.sourceCore}`
          } else {
            errorMessage ??= entitlement.error
          }
        }
        this.error.set(errorMessage)
      } catch (error) {
        if (isAbortError(error) || !this.isCurrentResolution(request)) return
        this.rawStates.set(DEFAULT_STATES)
        this.entitlement.set(null)
        this.error.set(error instanceof Error ? error.message : String(error))
      } finally {
        if (this.isCurrentResolution(request)) this.activeCoreLifecycle.set('resolved')
      }
    },
    'moduleAccess.resolveActiveCoreAccess',
  ).extend(withAsync(), withAbort('last-in-win'))

  readonly loading = computed(
    () => this.operationLoading() || this.resolveActiveCoreAccess.pending() > 0,
    'moduleAccess.loading',
  )

  readonly states = computed(() => {
    const capabilities = runtimeCapabilitiesAtom()
    return this.rawStates().map((state) => applyRuntimeSupport(state, capabilities))
  })

  readonly byFeature = computed(() => {
    const map = new Map<ProFeatureKey, ModuleAccessState>()
    for (const state of this.states()) {
      map.set(state.feature_key, state)
    }
    return map
  })

  surfaceFeature(surface: SurfaceId): ProFeatureKey | null {
    return PRO_SURFACE_FEATURES[surface] ?? null
  }

  surfaceAccess(surface: SurfaceId): ModuleAccessState | null {
    const feature = this.surfaceFeature(surface)
    return feature ? this.featureAccess(feature) : null
  }

  surfaceGate(surface: SurfaceId): ModuleAccessSurfaceGate {
    const access = this.surfaceAccess(surface)
    if (!access) return {kind: 'open'}
    if (access.status === 'unsupported') return {kind: 'blocked', access}
    if (this.activeCoreLifecycle() !== 'resolved') return {kind: 'checking'}
    return access.status === 'enabled' ? {kind: 'open'} : {kind: 'blocked', access}
  }

  featureAccess(feature: ProFeatureKey): ModuleAccessState {
    return this.byFeature().get(feature) ?? {
      feature_key: feature,
      status: 'entitlement_unavailable',
      denial_code: 'ENTITLEMENT_UNAVAILABLE',
    }
  }

  canOpenSurface(surface: SurfaceId): boolean {
    const access = this.surfaceAccess(surface)
    return !access || access.status === 'enabled'
  }

  isSurfaceVisible(surface: SurfaceId): boolean {
    const access = this.surfaceAccess(surface)
    return !access || access.status !== 'unsupported'
  }

  preferredSurfaceFallback(): SurfaceId {
    return this.isSurfaceVisible('remote') ? 'remote' : 'files'
  }

  reset(): void {
    this.resolveActiveCoreAccess.abort('module access reset')
    this.contextRevision += 1
    this.activeResolution = null
    this.rawStates.set(DEFAULT_STATES)
    this.operationLoading.set(false)
    this.error.set(null)
    this.entitlement.set(null)
    this.licenseSeatStatus.set(null)
    this.licenseSeatLoading.set(false)
    this.licenseSeatError.set(null)
    this.activeCoreContext.set({sourceCore: 'local'})
    this.activeCoreReadiness.set('pending')
    this.activeCoreLifecycle.set('pending')
  }

  clearError(): void {
    this.error.set(null)
    this.licenseSeatError.set(null)
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
    if (this.activeCoreLifecycle() === 'resolved') return
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
    if (!this.supportsExternalPro()) {
      this.rawStates.set(DEFAULT_STATES)
      this.entitlement.set(null)
      this.licenseSeatStatus.set(null)
      this.error.set(null)
      this.activeCoreLifecycle.set('resolved')
      return
    }
    if (!isTauriRuntime()) {
      this.rawStates.set(getNonTauriModuleAccessFallbackStates())
      this.entitlement.set(null)
      this.licenseSeatStatus.set(null)
      this.licenseSeatError.set(null)
      this.error.set(null)
      this.activeCoreLifecycle.set('resolved')
      return
    }

    const context = this.activeCoreContext()
    const request = {
      context,
      revision: this.contextRevision,
    }
    this.activeCoreLifecycle.set('resolving')
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
    this.rawStates.set(DEFAULT_STATES)
    this.entitlement.set(null)
    this.licenseSeatStatus.set(null)
    this.licenseSeatError.set(null)
    this.error.set(null)
    this.activeCoreLifecycle.set('pending')
  }

  private isCurrentResolution(request: ActiveCoreResolutionRequest): boolean {
    return (
      request.revision === this.contextRevision &&
      activeCoreAccessContextKey(request.context) ===
        activeCoreAccessContextKey(this.activeCoreContext()) &&
      this.activeCoreReadiness() === 'ready'
    )
  }

  async activateWithActivationCode(activationCode: string): Promise<boolean> {
    if (!this.supportsExternalPro()) return false
    if (!isTauriRuntime()) return false
    this.error.set(null)
    this.operationLoading.set(true)
    try {
      const response = await wrap(
        tauriInvoke<RpcResult<EntitlementSnapshot>>('license_activation_code_activate', {
          args: {activation_code: activationCode},
        }),
      )
      if (!response.ok) {
        this.error.set(response.error)
        return false
      }
      this.entitlement.set(response.result)
      await wrap(this.refresh())
      await wrap(this.refreshLicenseSeatStatus())
      return true
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      this.operationLoading.set(false)
    }
  }

  async createLicenseCabinetHandoff(): Promise<LicenseCabinetHandoffResult | null> {
    if (!this.supportsExternalPro()) return null
    if (!isTauriRuntime()) return null
    this.error.set(null)
    this.licenseSeatError.set(null)
    this.operationLoading.set(true)
    try {
      const response = await wrap(
        tauriInvoke<RpcResult<LicenseCabinetHandoffResult>>('license_account_cabinet_handoff'),
      )
      if (!response.ok) {
        this.error.set(response.error)
        return null
      }
      return response.result
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      this.operationLoading.set(false)
    }
  }

  async refreshLicenseSeatStatus(): Promise<boolean> {
    if (!this.supportsExternalPro()) {
      this.licenseSeatStatus.set(null)
      this.licenseSeatError.set(null)
      return false
    }
    if (!isTauriRuntime()) return false
    if (!this.entitlement()?.licensed) {
      this.licenseSeatStatus.set(null)
      this.licenseSeatError.set(null)
      return false
    }

    this.licenseSeatLoading.set(true)
    this.licenseSeatError.set(null)
    try {
      const response = await wrap(
        tauriInvoke<RpcResult<LicenseSeatStatus>>('license_seat_status', {
          args: {},
        }),
      )
      if (!response.ok) {
        this.licenseSeatError.set(response.error)
        return false
      }
      this.licenseSeatStatus.set(response.result)
      return true
    } catch (error) {
      this.licenseSeatError.set(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      this.licenseSeatLoading.set(false)
    }
  }

  async releaseCurrentSeat(): Promise<boolean> {
    if (!this.supportsExternalPro()) return false
    if (!isTauriRuntime()) return false
    this.licenseSeatLoading.set(true)
    this.licenseSeatError.set(null)
    try {
      const response = await wrap(
        tauriInvoke<RpcResult<LicenseSeatStatus>>('license_current_seat_deactivate'),
      )
      if (!response.ok) {
        this.licenseSeatError.set(response.error)
        return false
      }
      this.licenseSeatStatus.set(response.result)
      await wrap(this.refresh())
      if (!this.entitlement()?.licensed) {
        this.licenseSeatStatus.set(null)
      }
      return true
    } catch (error) {
      this.licenseSeatError.set(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      this.licenseSeatLoading.set(false)
    }
  }
}

function getNonTauriModuleAccessFallbackStates(): ModuleAccessState[] {
  if (!isExplicitDevBypassRuntime()) {
    return DEFAULT_STATES
  }

  return DEFAULT_STATES.map((state): ModuleAccessState =>
    state.status === 'entitlement_unavailable'
      ? {...state, status: 'enabled' as const, denial_code: null}
      : state,
  )
}

function isExplicitDevBypassRuntime(): boolean {
  return typeof window !== 'undefined' && window.env === 'dev'
}

function applyRuntimeSupport(
  state: ModuleAccessState,
  capabilities: RuntimeCapabilities,
): ModuleAccessState {
  if (!capabilities.supports_external_pro) {
    return {
      ...state,
      status: 'unsupported',
      denial_code: 'FEATURE_UNAVAILABLE_IN_DISTRIBUTION',
    }
  }

  if (isFeatureSupportedByRuntime(state.feature_key, capabilities)) {
    return state
  }

  if (state.status === 'unsupported' && state.denial_code === 'FEATURE_UNSUPPORTED_ON_PLATFORM') {
    return state
  }

  return {
    ...state,
    status: 'unsupported',
    denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM',
  }
}

function isFeatureSupportedByRuntime(
  feature: ProFeatureKey,
  capabilities: RuntimeCapabilities,
): boolean {
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
