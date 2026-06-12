import {atom, computed, wrap} from '@reatom/core'

import type {SurfaceId} from 'root/app/navigation/navigation.types'
import {
  runtimeCapabilitiesAtom,
  type RuntimeCapabilities,
} from 'root/core/runtime/runtime-capabilities'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

export const PRO_FEATURE_KEYS = [
  'remote',
  'credential-provider',
  'ssh-agent',
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
}

const DEFAULT_STATES: ModuleAccessState[] = [
  {feature_key: 'remote', status: 'entitlement_unavailable', denial_code: 'ENTITLEMENT_UNAVAILABLE'},
  {
    feature_key: 'credential-provider',
    status: 'entitlement_unavailable',
    denial_code: 'ENTITLEMENT_UNAVAILABLE',
  },
  {feature_key: 'ssh-agent', status: 'entitlement_unavailable', denial_code: 'ENTITLEMENT_UNAVAILABLE'},
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
  readonly loading = atom(false)
  readonly error = atom<string | null>(null)
  readonly entitlement = atom<EntitlementSnapshot | null>(null)
  readonly licenseSeatStatus = atom<LicenseSeatStatus | null>(null)
  readonly licenseSeatLoading = atom(false)
  readonly licenseSeatError = atom<string | null>(null)

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
    this.rawStates.set(DEFAULT_STATES)
    this.loading.set(false)
    this.error.set(null)
    this.entitlement.set(null)
    this.licenseSeatStatus.set(null)
    this.licenseSeatLoading.set(false)
    this.licenseSeatError.set(null)
  }

  clearError(): void {
    this.error.set(null)
    this.licenseSeatError.set(null)
  }

  async refresh(): Promise<void> {
    if (!isTauriRuntime()) {
      this.rawStates.set(getNonTauriModuleAccessFallbackStates())
      this.entitlement.set(null)
      this.licenseSeatStatus.set(null)
      this.licenseSeatError.set(null)
      this.error.set(null)
      return
    }

    this.loading.set(true)
    try {
      const [access, entitlement] = await wrap(
        Promise.all([
          tauriInvoke<RpcResult<ModuleAccessState[]>>('module_access_snapshot'),
          tauriInvoke<RpcResult<EntitlementSnapshot>>('license_status'),
        ]),
      )
      let errorMessage: string | null = null
      if (access.ok) {
        this.rawStates.set(access.result)
      } else {
        errorMessage = access.error
      }
      if (entitlement.ok) {
        this.entitlement.set(entitlement.result)
        if (!entitlement.result.licensed) {
          this.licenseSeatStatus.set(null)
          this.licenseSeatError.set(null)
        }
      } else {
        errorMessage ??= entitlement.error
      }
      this.error.set(errorMessage)
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error))
    } finally {
      this.loading.set(false)
    }
  }

  async activateWithActivationCode(activationCode: string): Promise<boolean> {
    if (!isTauriRuntime()) return false
    this.error.set(null)
    this.loading.set(true)
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
      this.loading.set(false)
    }
  }

  async createLicenseCabinetHandoff(): Promise<LicenseCabinetHandoffResult | null> {
    if (!isTauriRuntime()) return null
    this.error.set(null)
    this.licenseSeatError.set(null)
    this.loading.set(true)
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
      this.loading.set(false)
    }
  }

  async refreshLicenseSeatStatus(): Promise<boolean> {
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
    case 'crypto-wallet':
    case 'emergency-access':
      return false
  }
}

export const moduleAccessModel = new ModuleAccessModel()
