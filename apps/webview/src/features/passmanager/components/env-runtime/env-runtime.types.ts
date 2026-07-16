export type EnvRuntimeSection = 'secrets' | 'profiles' | 'presets' | 'activity' | 'cli'

export type EnvVariableMapping = {
  name: string
  secret_id: string
}

export type AgentVariableMapping = {
  name: string
  secret_id: string | null
}

export type EnvSecretMetadata = {
  id: string
  label: string
  revision: number
  usage_count: number
}

export type EnvProfileMetadata = {
  id: string
  slug: string
  label: string
  description: string | null
  revision: number
  variables: EnvVariableMapping[]
}

export type AgentProfileDraft = {
  slug: string
  label: string
  description: string | null
  variables: AgentVariableMapping[]
}

export type AgentPresetDraft = {
  profile_id: string
  slug: string
  label: string
  workspace_root: string
  cwd: string
  executable: string
  args: string[]
  passthrough_env: string[]
}

export type DevicePreset = AgentPresetDraft & {
  id: string
  revision: number
  executable_sha256: string
  created_at_epoch_ms: number
  updated_at_epoch_ms: number
}

export type MutationOperation = 'create' | 'update' | 'delete'
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'stale'

export type AgentProposalMetadata = {
  id: string
  actor_id: string
  resource_kind: 'profile' | 'preset' | string
  operation: MutationOperation
  status: ProposalStatus
  created_at_epoch_ms: number
  expires_at_epoch_ms: number
}

export type ProposalDraft =
  | {resource_kind: 'profile'; draft: AgentProfileDraft}
  | {resource_kind: 'preset'; draft: AgentPresetDraft}

export type PreparedPresetFacts = {
  profile_id: string
  workspace_root: string
  cwd: string
  executable: string
  executable_sha256: string
  args: string[]
  passthrough_env: string[]
}

export type ProposalReview = {
  metadata: AgentProposalMetadata
  target: string | null
  base_revision: number | null
  draft: ProposalDraft | null
  prepared_preset: PreparedPresetFacts | null
}

export type ProfileSecretBinding = {
  name: string
  secret_id: string
}

export type EnvRuntimeReadiness = {
  ready: boolean
  denial_code: string | null
}

export type AgentRunStatus =
  | 'approval_pending'
  | 'starting'
  | 'running'
  | 'exited'
  | 'signaled'
  | 'cancelled'
  | 'spawn_failed'

export type AgentRunMetadata = {
  id: string
  actor_id: string
  profile_id: string
  preset_id: string
  status: AgentRunStatus
  process_id: number | null
  started_at_epoch_ms: number | null
  finished_at_epoch_ms: number | null
  exit_code: number | null
  signal: number | null
}

export type RunEnvSourceSnapshot = {
  name: string
  secret_id: string | null
  secret_label: string | null
}

export type RunApprovalSnapshot = {
  run: AgentRunMetadata
  actor_label: string | null
  profile_label: string
  profile_revision: number
  preset_label: string
  preset_revision: number
  workspace_root: string
  executable: string
  executable_sha256: string
  args: string[]
  cwd: string
  passthrough_env: string[]
  env_sources: RunEnvSourceSnapshot[]
  reason: string | null
  created_at_epoch_ms: number
  expires_at_epoch_ms: number
}

export type EnvRuntimeStatus = {
  platform_supported: boolean
  vault_unlocked: boolean
  device_store_available: boolean
  device_store_error_code: string | null
  active_runs: number
  pending_approvals: number
  pending_proposals: number
}

export type EnvRuntimeDesktopSnapshot = {
  status: EnvRuntimeStatus
  presets: DevicePreset[]
  proposals: ProposalReview[]
  approvals: RunApprovalSnapshot[]
  runs: AgentRunMetadata[]
}

export type ProductCliInstallStatus = {
  supported: boolean
  bundled_path: string | null
  bundled_version: string | null
  installed_path: string | null
  installed_version: string | null
  installed: boolean
  managed_link: boolean
}

export type PairedAgent = {
  id: string
  created_at_ms: number
  last_active_ms: number | null
  revoked: boolean
  label: string | null
}

export type AgentPairingInfo = {
  actor_kind: 'cli_agent'
  pairing_token: string
  pairing_expires_at_ms: number
  pin: string
  pin_expires_at_ms: number
  attempts_left: number
  locked_until_ms: number | null
}

export type RevealedSecret = {
  id: string
  value: string
  expires_at_epoch_ms: number
}

export type RpcResult<T> = {ok: true; result: T} | {ok: false; error: string; code?: string | null}
