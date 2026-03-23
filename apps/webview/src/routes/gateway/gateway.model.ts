import {computed, state} from '@statx/core'

import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

// ---------------------------------------------------------------------------
// Types (mirror Rust structs from gateway::state + lib.rs)
// ---------------------------------------------------------------------------

type RpcResult<T> = {ok: true; result: T} | {ok: false; error: string; code?: string | null}

function unwrap<T>(res: RpcResult<T>): T {
  if (res.ok) return res.result
  throw new Error(res.error)
}

export type AccessDuration = 'until_vault_locked' | 'hour_1' | 'hour_24'

export interface GatewayConfig {
  enabled: boolean
  access_duration: AccessDuration
  paired_extensions: PairedExtension[]
  session_max_duration_mins: number
}

export interface PairedExtension {
  id: string
  created_at_ms: number
  last_active_ms: number | null
  revoked: boolean
  label: string | null
}

export interface GatewayPairingInfo {
  pairing_token: string
  pairing_expires_at_ms: number
  pin: string
  pin_expires_at_ms: number
  attempts_left: number
  locked_until_ms: number | null
}

export type PairingPhase = 'idle' | 'starting' | 'active' | 'pin_expired' | 'locked_out' | 'expired' | 'error'

// ---------------------------------------------------------------------------
// Capability grant types (mirror Rust structs)
// ---------------------------------------------------------------------------

export type AllowedCommands = {type: 'all'} | {type: 'read_only'} | {type: 'custom'; commands: string[]}

export interface CapabilityPolicy {
  extension_id: string
  allowed_commands: AllowedCommands
  require_action_grant: boolean
  require_site_grant: boolean
  site_allowlist: string[]
}

export interface ActionGrant {
  grant_id: string
  extension_id: string
  command: string
  node_id: number | null
  created_at_ms: number
  expires_at_ms: number
  consumed: boolean
}

export interface SiteGrant {
  grant_id: string
  extension_id: string
  origin: string
  created_at_ms: number
  expires_at_ms: number
}

export interface ActiveGrants {
  action_grants: ActionGrant[]
  site_grants: SiteGrant[]
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export class GatewayModel {
  readonly config = state<GatewayConfig | null>(null)
  readonly pairingPhase = state<PairingPhase>('idle')
  readonly pairingInfo = state<GatewayPairingInfo | null>(null)
  readonly pairingError = state<string | null>(null)
  readonly pinSecondsLeft = state(0)
  readonly tokenSecondsLeft = state(0)

  readonly selectedExtensionPolicy = state<CapabilityPolicy | null>(null)
  readonly activeGrants = state<ActiveGrants | null>(null)

  readonly pairedExtensions = computed<PairedExtension[]>(() => {
    const cfg = this.config()
    if (!cfg) return []
    return cfg.paired_extensions.filter((e) => !e.revoked)
  })

  readonly isEnabled = computed<boolean>(() => this.config()?.enabled ?? false)

  private timerId: ReturnType<typeof setInterval> | null = null

  private isSupported(): boolean {
    return getRuntimeCapabilities().supports_gateway
  }

  // ---- Config ----

  async loadConfig(): Promise<void> {
    if (!this.isSupported()) {
      this.config.set(null)
      return
    }
    try {
      const res = await tauriInvoke<RpcResult<GatewayConfig>>('gateway_get_config')
      this.config.set(unwrap(res))
    } catch (e) {
      console.warn('[gateway] loadConfig failed', e)
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.isSupported()) return
    try {
      const res = await tauriInvoke<RpcResult<GatewayConfig>>('gateway_set_enabled', {enabled})
      this.config.set(unwrap(res))
    } catch (e) {
      console.warn('[gateway] setEnabled failed', e)
    }
  }

  async setAccessDuration(duration: AccessDuration): Promise<void> {
    if (!this.isSupported()) return
    try {
      const res = await tauriInvoke<RpcResult<GatewayConfig>>('gateway_set_access_duration', {duration})
      this.config.set(unwrap(res))
    } catch (e) {
      console.warn('[gateway] setAccessDuration failed', e)
    }
  }

  async setSessionDuration(mins: number): Promise<void> {
    if (!this.isSupported()) return
    try {
      const res = await tauriInvoke<RpcResult<number>>('gateway_set_session_duration', {mins})
      const clamped = unwrap(res)
      const cfg = this.config()
      if (cfg) {
        this.config.set({...cfg, session_max_duration_mins: clamped})
      }
    } catch (e) {
      console.warn('[gateway] setSessionDuration failed', e)
    }
  }

  async revokeExtension(id: string): Promise<void> {
    if (!this.isSupported()) return
    try {
      const res = await tauriInvoke<RpcResult<PairedExtension[]>>('gateway_revoke_extension', {id})
      const list = unwrap(res)
      const cfg = this.config()
      if (cfg) {
        this.config.set({...cfg, paired_extensions: list})
      }
    } catch (e) {
      console.warn('[gateway] revokeExtension failed', e)
    }
  }

  // ---- Capability Policy ----

  async loadCapabilityPolicy(extensionId: string): Promise<void> {
    if (!this.isSupported()) return
    try {
      const res = await tauriInvoke<RpcResult<CapabilityPolicy>>('gateway_get_capability_policy', {
        extensionId,
      })
      this.selectedExtensionPolicy.set(unwrap(res))
    } catch (e) {
      console.warn('[gateway] loadCapabilityPolicy failed', e)
    }
  }

  async saveCapabilityPolicy(policy: CapabilityPolicy): Promise<void> {
    if (!this.isSupported()) return
    try {
      const res = await tauriInvoke<RpcResult<CapabilityPolicy>>('gateway_set_capability_policy', {
        policy,
      })
      this.selectedExtensionPolicy.set(unwrap(res))
    } catch (e) {
      console.warn('[gateway] saveCapabilityPolicy failed', e)
    }
  }

  async issueActionGrant(
    extensionId: string,
    command: string,
    nodeId?: number,
  ): Promise<ActionGrant | null> {
    if (!this.isSupported()) return null
    try {
      const res = await tauriInvoke<RpcResult<ActionGrant>>('gateway_issue_action_grant', {
        extensionId,
        command,
        nodeId: nodeId ?? null,
      })
      return unwrap(res)
    } catch (e) {
      console.warn('[gateway] issueActionGrant failed', e)
      return null
    }
  }

  async issueSiteGrant(extensionId: string, origin: string): Promise<SiteGrant | null> {
    if (!this.isSupported()) return null
    try {
      const res = await tauriInvoke<RpcResult<SiteGrant>>('gateway_issue_site_grant', {
        extensionId,
        origin,
      })
      return unwrap(res)
    } catch (e) {
      console.warn('[gateway] issueSiteGrant failed', e)
      return null
    }
  }

  async loadActiveGrants(extensionId: string): Promise<void> {
    if (!this.isSupported()) return
    try {
      const res = await tauriInvoke<RpcResult<ActiveGrants>>('gateway_list_active_grants', {
        extensionId,
      })
      this.activeGrants.set(unwrap(res))
    } catch (e) {
      console.warn('[gateway] loadActiveGrants failed', e)
    }
  }

  async revokeAllGrants(extensionId?: string): Promise<void> {
    if (!this.isSupported()) return
    try {
      await tauriInvoke<RpcResult<unknown>>('gateway_revoke_all_grants', {
        extensionId: extensionId ?? null,
      })
      this.activeGrants.set({action_grants: [], site_grants: []})
    } catch (e) {
      console.warn('[gateway] revokeAllGrants failed', e)
    }
  }

  // ---- Pairing ----

  async startPairing(): Promise<void> {
    if (!this.isSupported()) {
      this.pairingPhase.set('idle')
      return
    }
    this.pairingPhase.set('starting')
    this.pairingError.set(null)
    try {
      const res = await tauriInvoke<RpcResult<GatewayPairingInfo>>('gateway_start_pairing')
      const info = unwrap(res)
      this.pairingInfo.set(info)

      if (info.locked_until_ms != null && info.locked_until_ms > Date.now()) {
        this.pairingPhase.set('locked_out')
      } else {
        this.pairingPhase.set('active')
      }

      this.startCountdown()
    } catch (e) {
      this.pairingError.set(e instanceof Error ? e.message : String(e))
      this.pairingPhase.set('error')
    }
  }

  async cancelPairing(): Promise<void> {
    if (!this.isSupported()) return
    try {
      await tauriInvoke<RpcResult<unknown>>('gateway_cancel_pairing')
    } catch {
      // best-effort
    }
    this.resetPairing()
  }

  // ---- Countdown ----

  private startCountdown(): void {
    this.stopCountdown()
    this.tick()
    this.timerId = setInterval(() => this.tick(), 1000)
  }

  private stopCountdown(): void {
    if (this.timerId != null) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  private tick(): void {
    const info = this.pairingInfo()
    if (!info) {
      this.stopCountdown()
      return
    }

    const now = Date.now()

    // Locked out?
    if (info.locked_until_ms != null && info.locked_until_ms > now) {
      const secs = Math.ceil((info.locked_until_ms - now) / 1000)
      this.pinSecondsLeft.set(secs)
      this.tokenSecondsLeft.set(0)
      this.pairingPhase.set('locked_out')
      return
    }

    // Token expired?
    if (now >= info.pairing_expires_at_ms) {
      this.pinSecondsLeft.set(0)
      this.tokenSecondsLeft.set(0)
      this.pairingPhase.set('expired')
      this.stopCountdown()
      return
    }

    // PIN expired?
    if (now >= info.pin_expires_at_ms) {
      this.pinSecondsLeft.set(0)
      this.tokenSecondsLeft.set(Math.ceil((info.pairing_expires_at_ms - now) / 1000))
      this.pairingPhase.set('pin_expired')
      return
    }

    // Active
    this.pinSecondsLeft.set(Math.ceil((info.pin_expires_at_ms - now) / 1000))
    this.tokenSecondsLeft.set(Math.ceil((info.pairing_expires_at_ms - now) / 1000))
    this.pairingPhase.set('active')
  }

  // ---- Cleanup ----

  private resetPairing(): void {
    this.stopCountdown()
    this.pairingPhase.set('idle')
    this.pairingInfo.set(null)
    this.pairingError.set(null)
    this.pinSecondsLeft.set(0)
    this.tokenSecondsLeft.set(0)
  }

  dispose(): void {
    this.stopCountdown()
  }
}
