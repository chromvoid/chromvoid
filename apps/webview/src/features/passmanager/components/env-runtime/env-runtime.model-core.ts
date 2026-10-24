import {atom, computed, reatomEnum, reatomField, reatomForm, wrap} from '@reatom/core'

import type {ModuleAccessState} from 'root/core/modules/module-access.model'
import type {UnlistenFn} from 'root/core/transport/tauri/ipc'

import {envRuntimeI18n as t} from './env-runtime.i18n'
import {
  argErrors,
  byteLength,
  CLOCK_TICK_MS,
  defaultDependencies,
  errorMessage,
  errorMessageWithCode,
  isRunActive,
  MAX_DESCRIPTION_BYTES,
  OPERATIONAL_REFRESH_MS,
  passthroughErrors,
  REVEAL_TTL_MS,
  type EnvRuntimeDependencies,
  validateAbsolutePath,
  validateArgs,
  validateLabel,
  validatePassthrough,
  validateSecretValue,
  validateSlug,
  validateVariables,
  variableErrors,
} from './env-runtime.model.support'
import type {
  AgentPairingInfo,
  AgentProfileDraft,
  AgentVariableMapping,
  DevicePreset,
  EnvProfileMetadata,
  EnvRuntimeDesktopSnapshot,
  EnvRuntimeReadiness,
  EnvRuntimeSection,
  EnvSecretMetadata,
  PairedAgent,
  ProductCliInstallStatus,
  RevealedSecret,
} from './env-runtime.types'

const READY: EnvRuntimeReadiness = {ready: true, denial_code: null}

// Module access has not been confirmed for the active Core yet, or could not be read.
const MODULE_ACCESS_UNKNOWN = 'MODULE_ACCESS_UNKNOWN'

function accessDenialCode(access: ModuleAccessState | null): string | null {
  if (!access) return MODULE_ACCESS_UNKNOWN
  if (access.status === 'enabled') return null
  if (access.denial_code) return access.denial_code
  switch (access.status) {
    case 'unsupported':
      return 'FEATURE_UNSUPPORTED_ON_PLATFORM'
    case 'disabled_by_rollout':
      return 'FEATURE_DISABLED_BY_ROLLOUT'
  }
}

export abstract class EnvRuntimeModelCore implements EventListenerObject {
  readonly section = reatomEnum(
    ['secrets', 'profiles', 'presets', 'activity', 'cli'] as const,
    'envRuntime.section',
  )
  readonly access = computed(() => this.dependencies.access(), 'envRuntime.access')
  readonly canRecover = computed(() => true, 'envRuntime.canRecover')
  readonly privilegedReadiness = computed<EnvRuntimeReadiness>(() => {
    const denialCode = accessDenialCode(this.access())
    if (denialCode) return {ready: false, denial_code: denialCode}
    const status = this.desktopSnapshot()?.status
    if (status && !status.platform_supported) {
      return {ready: false, denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'}
    }
    if (status && !status.vault_unlocked) return {ready: false, denial_code: 'VAULT_REQUIRED'}
    return READY
  }, 'envRuntime.privilegedReadiness')
  readonly devicePresetReadiness = computed<EnvRuntimeReadiness>(() => {
    const privileged = this.privilegedReadiness()
    if (!privileged.ready) return privileged
    const status = this.desktopSnapshot()?.status
    if (status?.device_store_available === false) {
      return {
        ready: false,
        denial_code: status.device_store_error_code ?? 'DEVICE_STORE_UNAVAILABLE',
      }
    }
    return READY
  }, 'envRuntime.devicePresetReadiness')
  readonly privilegedDenial = computed(
    () => this.privilegedReadiness().denial_code,
    'envRuntime.privilegedDenial',
  )
  readonly devicePresetDenial = computed(
    () => this.devicePresetReadiness().denial_code,
    'envRuntime.devicePresetDenial',
  )
  readonly recoveryMode = computed(() => this.privilegedDenial() !== null, 'envRuntime.recoveryMode')
  readonly canRetryAccess = computed(() => this.access() === null, 'envRuntime.canRetryAccess')
  readonly loading = atom(false, 'envRuntime.loading')
  readonly error = atom<string | null>(null, 'envRuntime.error')
  readonly secrets = atom<EnvSecretMetadata[]>([], 'envRuntime.secrets')
  readonly profiles = atom<EnvProfileMetadata[]>([], 'envRuntime.profiles')
  readonly desktopSnapshot = atom<EnvRuntimeDesktopSnapshot | null>(null, 'envRuntime.snapshot')
  readonly cliStatus = atom<ProductCliInstallStatus | null>(null, 'envRuntime.cliStatus')
  readonly cliInstallPending = atom(false, 'envRuntime.cliInstallPending')
  readonly pairedAgents = atom<PairedAgent[]>([], 'envRuntime.pairedAgents')
  readonly pairingInfo = atom<AgentPairingInfo | null>(null, 'envRuntime.pairingInfo')
  readonly pairingPending = atom(false, 'envRuntime.pairingPending')
  readonly clock = atom(0, 'envRuntime.clock')

  readonly presets = computed(() => this.desktopSnapshot()?.presets ?? [], 'envRuntime.presets')
  readonly deviceStoreAvailable = computed(
    () => this.desktopSnapshot()?.status.device_store_available ?? true,
    'envRuntime.deviceStoreAvailable',
  )
  readonly proposals = computed(() => this.desktopSnapshot()?.proposals ?? [], 'envRuntime.proposals')
  readonly approvals = computed(() => this.desktopSnapshot()?.approvals ?? [], 'envRuntime.approvals')
  readonly runs = computed(() => this.desktopSnapshot()?.runs ?? [], 'envRuntime.runs')
  readonly activeRuns = computed(() => this.runs().filter(isRunActive), 'envRuntime.activeRuns')
  readonly pendingProposals = computed(
    () => this.proposals().filter((proposal) => proposal.metadata.status === 'pending'),
    'envRuntime.pendingProposals',
  )
  readonly pairedActiveAgents = computed(
    () => this.pairedAgents().filter((agent) => !agent.revoked),
    'envRuntime.pairedActiveAgents',
  )
  readonly pairingSecondsLeft = computed(() => {
    this.clock()
    const info = this.pairingInfo()
    return info ? Math.max(0, Math.ceil((info.pin_expires_at_ms - this.dependencies.now()) / 1_000)) : 0
  }, 'envRuntime.pairingSecondsLeft')

  readonly selectedRunApprovalId = atom<string | null>(null, 'envRuntime.selectedRunApprovalId')
  readonly selectedRunApproval = computed(() => {
    const id = this.selectedRunApprovalId()
    return id ? (this.approvals().find((approval) => approval.run.id === id) ?? null) : null
  }, 'envRuntime.selectedRunApproval')
  readonly selectedRunApprovalEnvSources = computed(() => {
    const approval = this.selectedRunApproval()
    if (!approval) return []
    const passthrough = new Set(approval.passthrough_env)
    return approval.env_sources.map((source) => ({
      ...source,
      overrides_passthrough: passthrough.has(source.name),
    }))
  }, 'envRuntime.selectedRunApprovalEnvSources')
  readonly runApprovalPending = atom(false, 'envRuntime.runApprovalPending')
  readonly runApprovalError = atom<string | null>(null, 'envRuntime.runApprovalError')
  readonly runApprovalSecondsLeft = computed(() => {
    this.clock()
    const approval = this.selectedRunApproval()
    return approval
      ? Math.max(0, Math.ceil((approval.expires_at_epoch_ms - this.dependencies.now()) / 1_000))
      : 0
  }, 'envRuntime.runApprovalSecondsLeft')

  readonly secretDialog = atom<'closed' | 'create' | 'edit' | 'reveal'>('closed', 'envRuntime.secretDialog')
  readonly secretTarget = atom<EnvSecretMetadata | null>(null, 'envRuntime.secretTarget')
  readonly secretAttempted = atom(false, 'envRuntime.secretAttempted')
  readonly revealedSecret = atom<RevealedSecret | null>(null, 'envRuntime.revealedSecret')

  readonly secretForm = reatomForm(
    {
      label: reatomField('', {
        name: 'envRuntime.secret.label',
        validate: ({value}) => validateLabel(value),
      }),
      value: reatomField('', {
        name: 'envRuntime.secret.value',
        validate: ({value}) => validateSecretValue(value, this.secretTarget() === null),
      }),
    },
    {
      name: 'envRuntime.secretForm',
      validateOnChange: true,
      onSubmit: async (values) => this.persistSecret(values),
    },
  )

  readonly revealAttempted = atom(false, 'envRuntime.revealAttempted')
  readonly revealRpcError = atom<string | null>(null, 'envRuntime.revealRpcError')
  readonly revealForm = reatomForm(
    {
      masterPassword: reatomField('', {
        name: 'envRuntime.reveal.masterPassword',
        validate: ({value}) => (value ? undefined : t('errorMasterPasswordRequired')),
      }),
    },
    {
      name: 'envRuntime.revealForm',
      validateOnChange: true,
      onSubmit: async ({masterPassword}) => this.persistReveal(masterPassword),
    },
  )

  readonly profileDialogOpen = atom(false, 'envRuntime.profileDialogOpen')
  readonly profileTarget = atom<EnvProfileMetadata | null>(null, 'envRuntime.profileTarget')
  readonly profileSecretReturnIndex = atom<number | null>(null, 'envRuntime.profileSecretReturnIndex')
  readonly profileAttempted = atom(false, 'envRuntime.profileAttempted')
  readonly profileForm = reatomForm(
    {
      slug: reatomField('', {
        name: 'envRuntime.profile.slug',
        validate: ({value}) => validateSlug(value),
      }),
      label: reatomField('', {
        name: 'envRuntime.profile.label',
        validate: ({value}) => validateLabel(value),
      }),
      description: reatomField('', {
        name: 'envRuntime.profile.description',
        validate: ({value}) =>
          byteLength(value.trim()) > MAX_DESCRIPTION_BYTES ? t('errorDescriptionTooLong') : undefined,
      }),
      variables: reatomField<AgentVariableMapping[]>([], {
        name: 'envRuntime.profile.variables',
        validate: ({value}) => validateVariables(value),
      }),
    },
    {
      name: 'envRuntime.profileForm',
      validateOnChange: true,
      onSubmit: async (values) => this.persistProfile(values),
    },
  )
  readonly profileRowErrors = computed(
    () => (this.profileAttempted() ? variableErrors(this.profileForm.fields.variables()) : []),
    'envRuntime.profileRowErrors',
  )

  readonly presetDialogOpen = atom(false, 'envRuntime.presetDialogOpen')
  readonly presetTarget = atom<DevicePreset | null>(null, 'envRuntime.presetTarget')
  readonly presetAttempted = atom(false, 'envRuntime.presetAttempted')
  readonly presetForm = reatomForm(
    {
      profileId: reatomField('', {
        name: 'envRuntime.preset.profileId',
        validate: ({value}) => (value ? undefined : t('errorProfileRequired')),
      }),
      slug: reatomField('', {
        name: 'envRuntime.preset.slug',
        validate: ({value}) => validateSlug(value),
      }),
      label: reatomField('', {
        name: 'envRuntime.preset.label',
        validate: ({value}) => validateLabel(value),
      }),
      workspaceRoot: reatomField('', {
        name: 'envRuntime.preset.workspaceRoot',
        validate: ({value}) => validateAbsolutePath(value),
      }),
      cwd: reatomField('', {
        name: 'envRuntime.preset.cwd',
        validate: ({value}) => validateAbsolutePath(value),
      }),
      executable: reatomField('', {
        name: 'envRuntime.preset.executable',
        validate: ({value}) => validateAbsolutePath(value),
      }),
      args: reatomField<string[]>([], {
        name: 'envRuntime.preset.args',
        validate: ({value}) => validateArgs(value),
      }),
      passthroughEnv: reatomField<string[]>([], {
        name: 'envRuntime.preset.passthroughEnv',
        validate: ({value}) => validatePassthrough(value),
      }),
    },
    {
      name: 'envRuntime.presetForm',
      validateOnChange: true,
      onSubmit: async (values) => this.persistPreset(values),
    },
  )
  readonly presetArgRowErrors = computed(
    () => (this.presetAttempted() ? argErrors(this.presetForm.fields.args()) : []),
    'envRuntime.presetArgRowErrors',
  )
  readonly presetPassthroughRowErrors = computed(
    () => (this.presetAttempted() ? passthroughErrors(this.presetForm.fields.passthroughEnv()) : []),
    'envRuntime.presetPassthroughRowErrors',
  )

  readonly selectedProposalId = atom<string | null>(null, 'envRuntime.selectedProposalId')
  readonly selectedProposal = computed(() => {
    const id = this.selectedProposalId()
    return id ? (this.pendingProposals().find((proposal) => proposal.metadata.id === id) ?? null) : null
  }, 'envRuntime.selectedProposal')
  readonly selectedProposalCurrentProfile = computed(() => {
    const proposal = this.selectedProposal()
    if (!proposal?.target || proposal.metadata.resource_kind !== 'profile') return null
    return (
      this.profiles().find((profile) => profile.id === proposal.target || profile.slug === proposal.target) ??
      null
    )
  }, 'envRuntime.selectedProposalCurrentProfile')
  readonly selectedProposalCurrentPreset = computed(() => {
    const proposal = this.selectedProposal()
    if (!proposal?.target || proposal.metadata.resource_kind !== 'preset') return null
    return (
      this.presets().find((preset) => preset.id === proposal.target || preset.slug === proposal.target) ??
      null
    )
  }, 'envRuntime.selectedProposalCurrentPreset')
  readonly proposalSecondsLeft = computed(() => {
    this.clock()
    const proposal = this.selectedProposal()
    return proposal
      ? Math.max(0, Math.ceil((proposal.metadata.expires_at_epoch_ms - this.dependencies.now()) / 1_000))
      : 0
  }, 'envRuntime.proposalSecondsLeft')
  readonly proposalApprovalReadiness = computed<EnvRuntimeReadiness>(() => {
    const proposal = this.selectedProposal()
    if (!proposal) return {ready: false, denial_code: 'PROPOSAL_NOT_FOUND'}
    if (proposal.metadata.resource_kind !== 'preset') return this.privilegedReadiness()
    const readiness = this.devicePresetReadiness()
    if (!readiness.ready) return readiness
    if (proposal.metadata.operation !== 'delete' && !proposal.prepared_preset) {
      return {ready: false, denial_code: 'PREPARED_PRESET_UNAVAILABLE'}
    }
    return READY
  }, 'envRuntime.proposalApprovalReadiness')
  readonly runApprovalReadiness = computed(
    () => this.devicePresetReadiness(),
    'envRuntime.runApprovalReadiness',
  )
  readonly proposalProfileDraft = atom<AgentProfileDraft | null>(null, 'envRuntime.proposalProfileDraft')
  readonly proposalAttempted = atom(false, 'envRuntime.proposalAttempted')
  readonly proposalPending = atom(false, 'envRuntime.proposalPending')
  readonly proposalError = atom<string | null>(null, 'envRuntime.proposalError')
  readonly proposalRowErrors = computed(
    () =>
      this.proposalAttempted() && this.proposalProfileDraft()
        ? variableErrors(this.proposalProfileDraft()!.variables)
        : [],
    'envRuntime.proposalRowErrors',
  )

  protected connected = false
  protected refreshGeneration = 0
  protected operationalRefreshPending = false
  protected revealGeneration = 0
  protected runApprovalGeneration = 0
  protected proposalGeneration = 0
  protected revealTimer: number | undefined
  protected operationalTimer: number | undefined
  protected clockTimer: number | undefined
  protected unlisteners: UnlistenFn[] = []
  protected pairingInitialAgentIds = new Set<string>()

  constructor(protected readonly dependencies: EnvRuntimeDependencies = defaultDependencies) {}

  connect(): void {
    if (this.connected) return
    this.connected = true
    window.addEventListener('blur', this)
    document.addEventListener('visibilitychange', this)
    this.operationalTimer = window.setInterval(
      wrap(() => void this.refreshOperationalState()),
      OPERATIONAL_REFRESH_MS,
    )
    this.clockTimer = window.setInterval(
      wrap(() => this.updateClock()),
      CLOCK_TICK_MS,
    )
    void this.attachNativeListeners()
    void this.refresh()
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    window.removeEventListener('blur', this)
    document.removeEventListener('visibilitychange', this)
    if (this.operationalTimer !== undefined) window.clearInterval(this.operationalTimer)
    if (this.clockTimer !== undefined) window.clearInterval(this.clockTimer)
    this.operationalTimer = undefined
    this.clockTimer = undefined
    for (const unlisten of this.unlisteners.splice(0)) unlisten()
    this.clearReveal()
    this.closeAllDialogs()
  }

  handleEvent(event: Event): void {
    if (
      event.type === 'blur' ||
      (event.type === 'visibilitychange' && document.visibilityState !== 'visible')
    ) {
      this.clearReveal()
      if (this.secretDialog() === 'reveal') this.closeSecretDialog()
    }
  }

  setSection(section: string): void {
    if (['secrets', 'profiles', 'presets', 'activity', 'cli'].includes(section)) {
      const nextSection = section as EnvRuntimeSection
      if (nextSection !== 'secrets') {
        this.clearReveal()
        if (this.secretDialog() === 'reveal') this.closeSecretDialog()
      }
      if (nextSection !== 'activity') {
        this.resetRunApprovalReview()
        this.resetProposalReview()
      }
      this.section.set(nextSection)
    }
  }

  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration
    this.loading.set(true)
    this.error.set(null)
    try {
      const snapshot = await wrap(
        this.dependencies.invoke<EnvRuntimeDesktopSnapshot>('env_runtime_desktop_snapshot'),
      )
      if (generation !== this.refreshGeneration) return
      this.desktopSnapshot.set(snapshot)
      if (!this.privilegedReadiness().ready) {
        this.applyRecoverySnapshot(snapshot)
        return
      }
      this.applyDesktopSnapshot(snapshot)

      const [cliStatus, agents] = await wrap(
        Promise.all([
          this.dependencies.invoke<ProductCliInstallStatus>('env_runtime_cli_install_status'),
          this.dependencies.invoke<PairedAgent[]>('gateway_list_paired_agents'),
        ]),
      )
      if (generation !== this.refreshGeneration) return
      if (!this.privilegedReadiness().ready) {
        this.applyRecoverySnapshot(snapshot)
        return
      }
      this.cliStatus.set(cliStatus)
      this.setPairedAgents(agents)

      const [secrets, profiles] = await wrap(
        Promise.all([
          this.dependencies.rpc<EnvSecretMetadata[]>('env_runtime:secret:list', {}),
          this.dependencies.rpc<EnvProfileMetadata[]>('env_runtime:profile:list', {}),
        ]),
      )
      if (generation !== this.refreshGeneration) return
      if (!this.privilegedReadiness().ready) {
        this.applyRecoverySnapshot(snapshot)
        return
      }
      this.secrets.set(secrets)
      this.profiles.set(profiles)
    } catch (error) {
      if (generation === this.refreshGeneration) this.error.set(errorMessage(error))
    } finally {
      if (generation === this.refreshGeneration) this.loading.set(false)
    }
  }

  clearError(): void {
    this.error.set(null)
  }

  async retryAccess(): Promise<void> {
    if (!this.canRetryAccess()) return
    await wrap(this.dependencies.retryAccess())
  }

  readinessTitle(readiness: EnvRuntimeReadiness): string {
    switch (readiness.denial_code) {
      case 'VAULT_REQUIRED':
        return t('statusVaultLocked')
      case 'DEVICE_STORE_KEY_UNAVAILABLE':
      case 'DEVICE_STORE_LOCKED':
      case 'DEVICE_STORE_CORRUPT':
      case 'DEVICE_STORE_VERSION':
      case 'DEVICE_STORE_UNAVAILABLE':
        return t('deviceStoreUnavailableTitle')
      case 'PREPARED_PRESET_UNAVAILABLE':
        return t('proposalMissingDraft')
      default:
        return this.accessTitle() || t('accessUnavailableTitle')
    }
  }

  readinessDescription(readiness: EnvRuntimeReadiness): string {
    if (readiness.denial_code?.startsWith('DEVICE_STORE_')) return this.deviceStoreErrorDescription()
    if (readiness.denial_code === 'PREPARED_PRESET_UNAVAILABLE') return t('proposalMissingDraft')
    return this.accessDescription()
  }

  readinessError(readiness: EnvRuntimeReadiness): string {
    const code = readiness.denial_code ?? 'ENV_RUNTIME_UNAVAILABLE'
    return `${this.readinessTitle(readiness)} (${code})`
  }

  accessTitle(): string {
    const access = this.access()
    if (!access) return t('accessUnavailableTitle')
    if (access.denial_code === 'REMOTE_CORE_UNSUPPORTED') {
      return t('accessRemoteCoreTitle')
    }
    switch (access.status) {
      case 'unsupported':
        return t('accessUnsupportedTitle')
      case 'disabled_by_rollout':
        return t('accessUnavailableTitle')
      case 'enabled':
        return ''
    }
  }

  accessDescription(): string {
    const access = this.access()
    if (!access) return t('accessUnavailableDescription')
    if (access.denial_code === 'REMOTE_CORE_UNSUPPORTED') {
      return t('accessRemoteCoreDescription')
    }
    switch (access.status) {
      case 'unsupported':
        return t('accessUnsupportedDescription')
      case 'disabled_by_rollout':
      case 'enabled':
        return ''
    }
  }

  deviceStoreErrorDescription(): string {
    const code = this.desktopSnapshot()?.status.device_store_error_code ?? 'DEVICE_STORE_UNAVAILABLE'
    if (code === 'DEVICE_STORE_KEY_UNAVAILABLE' || code === 'DEVICE_STORE_LOCKED') {
      return t('deviceStoreKeyUnavailable', {code})
    }
    if (code === 'DEVICE_STORE_CORRUPT' || code === 'DEVICE_STORE_VERSION') {
      return t('deviceStoreUnreadable', {code})
    }
    return t('deviceStoreUnavailable', {code})
  }

  protected reportReadinessDenial(readiness: EnvRuntimeReadiness): boolean {
    if (readiness.ready) return false
    this.error.set(this.readinessError(readiness))
    return true
  }

  openCreateSecret(): void {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    this.profileSecretReturnIndex.set(null)
    this.openSecretCreator()
  }

  openCreateSecretForProfile(index: number): void {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    if (!this.profileDialogOpen() || !this.profileForm.fields.variables()[index]) return
    this.profileSecretReturnIndex.set(index)
    this.profileDialogOpen.set(false)
    this.openSecretCreator()
  }

  protected openSecretCreator(): void {
    this.clearReveal()
    this.secretTarget.set(null)
    this.secretAttempted.set(false)
    this.resetSecretForm('', '')
    this.secretDialog.set('create')
  }

  openEditSecret(id: string): void {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    const secret = this.secrets().find((item) => item.id === id)
    if (!secret) return
    this.clearReveal()
    this.secretTarget.set(secret)
    this.secretAttempted.set(false)
    this.resetSecretForm(secret.label, '')
    this.secretDialog.set('edit')
  }

  openRevealSecret(id: string): void {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    const secret = this.secrets().find((item) => item.id === id)
    if (!secret) return
    this.clearReveal()
    this.secretTarget.set(secret)
    this.revealAttempted.set(false)
    this.resetRevealForm()
    this.secretDialog.set('reveal')
  }

  closeSecretDialog(): void {
    const profileReturnIndex = this.profileSecretReturnIndex()
    this.secretDialog.set('closed')
    this.secretTarget.set(null)
    this.secretAttempted.set(false)
    this.revealAttempted.set(false)
    this.resetSecretForm('', '')
    this.resetRevealForm()
    this.profileSecretReturnIndex.set(null)
    if (profileReturnIndex !== null) this.profileDialogOpen.set(true)
  }

  setSecretLabel(value: string): void {
    this.secretForm.fields.label.change(value)
  }

  setSecretValue(value: string): void {
    this.secretForm.fields.value.change(value)
  }

  setMasterPassword(value: string): void {
    this.revealRpcError.set(null)
    this.revealForm.fields.masterPassword.change(value)
  }

  secretFieldError(field: 'label' | 'value'): string {
    if (!this.secretAttempted()) return ''
    return this.secretForm.fields[field].validation().error ?? ''
  }

  revealFieldError(): string {
    if (!this.revealAttempted()) return ''
    return this.revealForm.fields.masterPassword.validation().error ?? ''
  }

  secretSubmitError(): string {
    if (this.secretForm.fields.label.validation().error || this.secretForm.fields.value.validation().error)
      return ''
    return this.secretForm.submit.error()?.message ?? ''
  }

  revealSubmitError(): string {
    return this.revealRpcError() ?? ''
  }

  async submitSecret(): Promise<'label' | 'value' | null> {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return null
    this.secretAttempted.set(true)
    try {
      const savedSecret = await wrap(this.secretForm.submit())
      const profileReturnIndex = this.profileSecretReturnIndex()
      this.closeSecretDialog()
      if (profileReturnIndex !== null) {
        this.selectProfileVariableSecret(profileReturnIndex, savedSecret.id)
      }
      return null
    } catch {
      if (this.secretForm.fields.label.validation().error) return 'label'
      if (this.secretForm.fields.value.validation().error) return 'value'
      return null
    }
  }

  async submitReveal(): Promise<'masterPassword' | null> {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return null
    this.revealAttempted.set(true)
    try {
      await wrap(this.revealForm.submit())
      this.closeSecretDialog()
      return null
    } catch {
      return this.revealRpcError() || this.revealForm.fields.masterPassword.validation().error
        ? 'masterPassword'
        : null
    }
  }

  async deleteSecret(id: string): Promise<void> {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    const secret = this.secrets().find((item) => item.id === id)
    if (!secret) return
    const confirmed = await wrap(
      this.dependencies.confirm({
        title: t('secretDeleteTitle'),
        message: t('secretDeleteMessage', {label: secret.label}),
        confirmText: t('delete'),
        cancelText: t('cancel'),
        confirmVariant: 'danger',
        variant: 'warning',
      }),
    )
    if (!confirmed) return
    this.clearReveal()
    try {
      await wrap(
        this.dependencies.rpc('env_runtime:secret:delete', {
          id: secret.id,
          base_revision: secret.revision,
        }),
      )
      if (this.revealedSecret()?.id === secret.id) this.clearReveal()
      await wrap(this.refresh())
    } catch (error) {
      this.error.set(errorMessage(error))
    }
  }

  clearReveal(): void {
    this.revealGeneration += 1
    if (this.revealTimer !== undefined) window.clearTimeout(this.revealTimer)
    this.revealTimer = undefined
    this.revealedSecret.set(null)
  }

  protected resetSecretForm(label: string, value: string): void {
    this.secretForm.fields.label.reset(label)
    this.secretForm.fields.value.reset(value)
    this.secretForm.submitted.set(false)
    this.secretForm.submit.error.set(undefined)
    this.secretForm.submit.data.set(undefined)
  }

  protected selectProfileVariableSecret(index: number, secretId: string): void {
    this.profileForm.fields.variables.change(
      this.profileForm.fields
        .variables()
        .map((variable, itemIndex) =>
          itemIndex === index ? {...variable, secret_id: secretId || null} : variable,
        ),
    )
  }

  protected resetRevealForm(): void {
    this.revealForm.fields.masterPassword.reset('')
    this.revealRpcError.set(null)
    this.revealForm.submitted.set(false)
    this.revealForm.submit.error.set(undefined)
    this.revealForm.submit.data.set(undefined)
  }

  protected async persistSecret(values: {label: string; value: string}): Promise<EnvSecretMetadata> {
    const target = this.secretTarget()
    this.clearReveal()
    const savedSecret = target
      ? await wrap(
          this.dependencies.rpc<EnvSecretMetadata>('env_runtime:secret:update', {
          id: target.id,
          base_revision: target.revision,
          label: values.label.trim(),
          ...(values.value ? {value: values.value} : {}),
        }),
      )
      : await wrap(
          this.dependencies.rpc<EnvSecretMetadata>('env_runtime:secret:create', {
          label: values.label.trim(),
          value: values.value,
        }),
      )
    await wrap(this.refresh())
    return savedSecret
  }

  protected async persistReveal(masterPassword: string): Promise<void> {
    const target = this.secretTarget()
    if (!target) throw new Error('Secret is no longer available')
    const generation = this.revealGeneration
    this.revealRpcError.set(null)
    try {
      const result = await wrap(
        this.dependencies.rpc<{id: string; value: string}>('env_runtime:secret:reveal', {
          id: target.id,
          master_password: masterPassword,
        }),
      )
      if (
        generation !== this.revealGeneration ||
        this.secretDialog() !== 'reveal' ||
        this.secretTarget()?.id !== target.id
      ) {
        return
      }
      this.clearReveal()
      const expiresAt = this.dependencies.now() + REVEAL_TTL_MS
      this.revealedSecret.set({id: result.id, value: result.value, expires_at_epoch_ms: expiresAt})
      this.revealTimer = window.setTimeout(
        wrap(() => this.clearReveal()),
        REVEAL_TTL_MS,
      )
    } catch (error) {
      this.revealRpcError.set(errorMessageWithCode(error))
      throw error
    } finally {
      this.revealForm.fields.masterPassword.reset('')
    }
  }

  protected abstract persistProfile(values: {
    slug: string
    label: string
    description: string
    variables: AgentVariableMapping[]
  }): Promise<void>

  protected abstract persistPreset(values: {
    profileId: string
    slug: string
    label: string
    workspaceRoot: string
    cwd: string
    executable: string
    args: string[]
    passthroughEnv: string[]
  }): Promise<void>

  protected abstract refreshOperationalState(): Promise<void>
  protected abstract setPairedAgents(agents: PairedAgent[]): void
  protected abstract attachNativeListeners(): Promise<void>
  protected abstract applyDesktopSnapshot(snapshot: EnvRuntimeDesktopSnapshot): void
  protected abstract applyRecoverySnapshot(snapshot: EnvRuntimeDesktopSnapshot): void
  protected abstract updateClock(): void
  protected abstract resetRunApprovalReview(): void
  protected abstract resetProposalReview(): void
  protected abstract closeAllDialogs(): void
}
