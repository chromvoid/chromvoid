import {html} from '@chromvoid/uikit/reatom-lit'
import {isolateLtrText} from '@project/i18n/pure'
import {nothing, type TemplateResult} from 'lit'

import {envRuntimeI18n as t} from './env-runtime.i18n'
import {envRuntimeModel} from './env-runtime.model'
import {EnvRuntimePageBase} from './env-runtime-page.base'
import type {
  AgentRunMetadata,
  EnvRuntimeReadiness,
  ProposalReview,
  RunApprovalSnapshot,
} from './env-runtime.types'

export abstract class EnvRuntimePageSections extends EnvRuntimePageBase {
  protected renderReadinessWarning(readiness: EnvRuntimeReadiness): TemplateResult {
    const description = envRuntimeModel.readinessDescription(readiness)
    return html`
      <div
        class="device-store-warning"
        data-readiness-warning
        data-denial-code=${readiness.denial_code ?? 'ENV_RUNTIME_UNAVAILABLE'}
        role="status"
      >
        <cv-icon name="alert-triangle" aria-hidden="true"></cv-icon>
        <div>
          <strong>${envRuntimeModel.readinessTitle(readiness)}</strong>
          <p>
            ${description ? html`<bdi dir="auto">${description}</bdi> · ` : nothing}<code dir="ltr"
              >${readiness.denial_code ?? 'ENV_RUNTIME_UNAVAILABLE'}</code
              >
          </p>
          ${envRuntimeModel.canRetryAccess()
            ? html`
                <div class="inline-actions">
                  <cv-button size="small" @click=${this.handleRetryAccess}>${t('retry')}</cv-button>
                </div>
              `
            : nothing}
          </div>
        </div>
    `
  }

  protected renderLoadingState(): TemplateResult {
    return html`
      <div class="loading-state" role="status">
        <cv-spinner .label=${t('loading')}></cv-spinner>
        <span>${t('loading')}</span>
      </div>
    `
  }

  protected renderStatusBand(): TemplateResult {
    const status = envRuntimeModel.desktopSnapshot()?.status
    const cli = envRuntimeModel.cliStatus()
    const waiting = (status?.pending_approvals ?? 0) + (status?.pending_proposals ?? 0)
    return html`
      <div>
        ${envRuntimeModel.error()
          ? html`
              <div class="page-alert" role="alert">
                <p>${envRuntimeModel.error()}</p>
                <cv-button size="small" variant="ghost" @click=${this.handleClearError}
                  >${t('close')}</cv-button
                >
              </div>
            `
          : nothing}
        <section
          class="status-band"
          aria-label=${t('title')}
          data-mode=${envRuntimeModel.recoveryMode() ? 'recovery' : 'full'}
        >
          <div class="status-item">
            <span class="status-label">${t('statusVault')}</span>
            <span class="status-value" data-state=${status?.vault_unlocked ? 'enabled' : 'warning'}
              >${status?.vault_unlocked ? t('statusVaultUnlocked') : t('statusVaultLocked')}</span
            >
          </div>
          <div class="status-item">
            <span class="status-label">${t('statusRuns')}</span>
            <span class="status-value" data-state=${status?.active_runs ? 'running' : 'idle'}>
              ${status?.active_runs ?? 0}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">${t('statusReviews')}</span>
            <span class="status-value" data-state=${waiting ? 'warning' : 'idle'}>${waiting}</span>
          </div>
          ${envRuntimeModel.recoveryMode()
            ? nothing
            : html`
                <div class="status-item">
                  <span class="status-label">${t('statusCli')}</span>
                  <span class="status-value" data-state=${cli?.installed ? 'enabled' : 'warning'}>
                    ${cli?.installed ? t('statusCliInstalled') : t('statusCliMissing')}
                  </span>
                </div>
              `}
          <div class="status-item">
            <span class="status-label">${t('statusDeviceStore')}</span>
            <span
              class="status-value"
              data-state=${status?.device_store_available === false ? 'warning' : 'enabled'}
            >
              ${status?.device_store_available === false
                ? t('statusDeviceStoreUnavailable')
                : t('statusDeviceStoreAvailable')}
            </span>
          </div>
          <div class="status-actions">
            <cv-button
              size="small"
              .loading=${envRuntimeModel.loading()}
              ?disabled=${envRuntimeModel.loading()}
              @click=${this.handleRefresh}
            >
              <cv-icon slot="prefix" name="refresh-cw" aria-hidden="true"></cv-icon>
              ${t('refresh')}
            </cv-button>
          </div>
        </section>
      </div>
    `
  }

  protected renderSecretsSection(): TemplateResult {
    const readiness = envRuntimeModel.privilegedReadiness()
    const secrets = envRuntimeModel.secrets()
    const revealed = envRuntimeModel.revealedSecret()
    return html`
      <div class="section-scroll">
        <div class="section-stack">
          <section class="section-block">
            ${this.renderSectionHeading(
              t('secretsTitle'),
              t('secretsDescription'),
              t('secretCreate'),
              this.handleCreateSecret,
              !readiness.ready,
            )}
            ${readiness.ready
              ? secrets.length === 0
              ? this.renderEmpty('key', t('secretsEmptyTitle'), t('secretsEmptyDescription'))
              : html`
                  <div class="resource-table">
                    ${secrets.map(
                      (secret) => html`
                        <article class="resource-row">
                          <div class="resource-main">
                            <span class="resource-title"><bdi dir="auto">${secret.label}</bdi></span>
                            <span class="identifier" dir="ltr">${secret.id}</span>
                          </div>
                          <div class="resource-detail">
                            ${revealed?.id === secret.id
                              ? html`
                                  <span class="eyebrow">${t('secretRevealed')}</span>
                                  <code class="secret-value" dir="ltr">${revealed.value}</code>
                                `
                              : html`<span class="meta">${t('secretHidden')}</span>`}
                          </div>
                          <div class="resource-meta">
                              <span class="meta"
                                >${envRuntimeModel.secretUsageLabel(secret.usage_count)}</span
                              >
                            <span class="identifier" dir="ltr">rev ${secret.revision}</span>
                          </div>
                          <div class="row-actions">
                            ${revealed?.id === secret.id
                              ? html`
                                  <cv-button
                                    size="small"
                                    data-secret-id=${secret.id}
                                    @click=${this.handleHideSecret}
                                  >
                                    ${t('hide')}
                                  </cv-button>
                                `
                              : html`
                                  <cv-button
                                    size="small"
                                    data-secret-id=${secret.id}
                                    @click=${this.handleRevealSecret}
                                  >
                                    ${t('secretRevealAction')}
                                  </cv-button>
                                `}
                            <cv-button
                              size="small"
                              data-secret-id=${secret.id}
                              @click=${this.handleEditSecret}
                            >
                              ${t('edit')}
                            </cv-button>
                            <cv-button
                              size="small"
                              variant="danger"
                              data-secret-id=${secret.id}
                              @click=${this.handleDeleteSecret}
                              >${t('delete')}</cv-button
                            >
                          </div>
                        </article>
                      `,
                    )}
                  </div>
                  `
              : this.renderReadinessWarning(readiness)}
          </section>
        </div>
      </div>
    `
  }

  protected renderProfilesSection(): TemplateResult {
    const readiness = envRuntimeModel.privilegedReadiness()
    const profiles = envRuntimeModel.profiles()
    return html`
      <div class="section-scroll">
        <div class="section-stack">
          <section class="section-block">
            ${this.renderSectionHeading(
              t('profilesTitle'),
              t('profilesDescription'),
              t('profileCreate'),
              this.handleCreateProfile,
              !readiness.ready,
            )}
            ${readiness.ready
              ? profiles.length === 0
              ? this.renderEmpty('layers', t('profilesEmptyTitle'), t('profilesEmptyDescription'))
              : html`
                  <div class="resource-table">
                    ${profiles.map(
                      (profile) => html`
                        <article class="resource-row">
                          <div class="resource-main">
                            <span class="resource-title"><bdi dir="auto">${profile.label}</bdi></span>
                            <span class="identifier" dir="ltr">${profile.slug}</span>
                          </div>
                          <div class="resource-detail">
                            <span class="meta"
                              ><bdi dir="auto">${profile.description || t('notProvided')}</bdi></span
                            >
                            <div class="chip-row">
                              ${profile.variables.map(
                                (variable) => html`
                                  <span class="chip"
                                    ><code dir="ltr">${variable.name}</code> →
                                    <bdi dir="auto"
                                      >${envRuntimeModel.secretLabel(variable.secret_id)}</bdi
                                    ></span
                                  >
                                `,
                              )}
                            </div>
                          </div>
                          <div class="resource-meta">
                            <span class="meta"
                              >${envRuntimeModel.profileMappingsLabel(profile.variables.length)}</span
                            >
                            <span class="identifier" dir="ltr">rev ${profile.revision}</span>
                          </div>
                          <div class="row-actions">
                            <cv-button
                              size="small"
                              data-profile-id=${profile.id}
                              @click=${this.handleEditProfile}
                            >
                              ${t('edit')}
                            </cv-button>
                            <cv-button
                              size="small"
                              variant="danger"
                              data-profile-id=${profile.id}
                              @click=${this.handleDeleteProfile}
                              >${t('delete')}</cv-button
                            >
                          </div>
                        </article>
                      `,
                    )}
                  </div>
                  `
              : this.renderReadinessWarning(readiness)}
          </section>
        </div>
      </div>
    `
  }

  protected renderPresetsSection(): TemplateResult {
    const presets = envRuntimeModel.presets()
    const hasProfiles = envRuntimeModel.profiles().length > 0
    const privileged = envRuntimeModel.privilegedReadiness()
    const readiness = envRuntimeModel.devicePresetReadiness()
    const canCreate = hasProfiles && readiness.ready
    return html`
      <div class="section-scroll">
        <div class="section-stack">
          <section class="section-block">
            ${this.renderSectionHeading(
              t('presetsTitle'),
              t('presetsDescription'),
              t('presetCreate'),
              this.handleCreatePreset,
              !canCreate,
            )}
            ${!privileged.ready
              ? this.renderReadinessWarning(privileged)
              : !readiness.ready
                ? this.renderDeviceStoreWarning()
                : nothing}
            ${privileged.ready && !hasProfiles
              ? html`<p class="helper">${t('presetNoProfiles')}</p>`
              : nothing}
            ${privileged.ready && presets.length === 0
              ? this.renderEmpty('terminal', t('presetsEmptyTitle'), t('presetsEmptyDescription'))
              : privileged.ready
                ? html`
                  <div class="resource-table">
                    ${presets.map(
                      (preset) => html`
                        <article class="resource-row">
                          <div class="resource-main">
                            <span class="resource-title"><bdi dir="auto">${preset.label}</bdi></span>
                            <span class="identifier" dir="ltr">${preset.slug}</span>
                          </div>
                          <div class="resource-detail">
                            <code class="command" dir="ltr"
                              >${this.formatCommand(preset.executable, preset.args)}</code
                            >
                            <span class="meta" dir="ltr">${preset.cwd}</span>
                          </div>
                          <div class="resource-meta">
                            <span class="meta" data-preset-profile
                              ><bdi dir="auto"
                                >${envRuntimeModel.profileLabel(preset.profile_id)}</bdi
                              ></span
                            >
                            <span class="identifier" data-preset-hash
                                >${t('presetHash')}: <code dir="ltr">${preset.executable_sha256}</code></span
                            >
                          </div>
                          <div class="row-actions">
                            <cv-button
                              size="small"
                              data-preset-id=${preset.id}
                                ?disabled=${!readiness.ready}
                              @click=${this.handleEditPreset}
                            >
                              ${t('edit')}
                            </cv-button>
                            <cv-button
                              size="small"
                              variant="danger"
                              data-preset-id=${preset.id}
                                ?disabled=${!readiness.ready}
                              @click=${this.handleDeletePreset}
                              >${t('delete')}</cv-button
                            >
                          </div>
                        </article>
                      `,
                    )}
                  </div>
                  `
                : nothing}
          </section>
        </div>
      </div>
    `
  }

  protected renderSectionHeading(
    title: string,
    description: string,
    actionLabel: string,
    handler: (event: Event) => void,
    disabled = false,
  ): TemplateResult {
    return html`
      <header class="section-heading">
        <div class="section-heading-copy">
          <h2>${title}</h2>
          <p>${description}</p>
        </div>
        <cv-button variant="primary" ?disabled=${disabled} @click=${handler}>
          <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>
          ${actionLabel}
        </cv-button>
      </header>
    `
  }

  protected renderEmpty(icon: string, headline: string, description: string): TemplateResult {
    return html`<cv-empty-state
      .icon=${icon}
      .headline=${headline}
      .description=${description}
    ></cv-empty-state>`
  }

  protected renderDeviceStoreWarning(): TemplateResult {
    return html`
      <div class="device-store-warning" data-device-store-warning role="status">
        <cv-icon name="alert-triangle" aria-hidden="true"></cv-icon>
        <div>
          <strong>${t('deviceStoreUnavailableTitle')}</strong>
          <p>${envRuntimeModel.deviceStoreErrorDescription()}</p>
        </div>
      </div>
    `
  }

  protected renderActivitySection(): TemplateResult {
    const approvals = envRuntimeModel.approvals()
    const proposals = envRuntimeModel.pendingProposals()
    const privileged = envRuntimeModel.privilegedReadiness()
    const devicePreset = envRuntimeModel.devicePresetReadiness()
    return html`
      <div class="section-scroll">
        <div class="section-stack">
          ${!privileged.ready
            ? this.renderReadinessWarning(privileged)
            : !devicePreset.ready
              ? this.renderDeviceStoreWarning()
              : nothing}
          <section class="section-block">
            <header class="section-heading">
              <div class="section-heading-copy">
                <h2>${t('approvalsTitle')}</h2>
                <p>${t('approvalsDescription')}</p>
              </div>
            </header>
            ${approvals.length === 0
              ? this.renderEmpty('shield-check', t('approvalsEmptyTitle'), t('approvalsEmptyDescription'))
              : html`<div class="resource-table">
                  ${approvals.map((approval) => this.renderApproval(approval))}
                </div>`}
          </section>

          <section class="section-block">
            <header class="section-heading">
              <div class="section-heading-copy">
                <h2>${t('proposalsTitle')}</h2>
                <p>${t('proposalsDescription')}</p>
              </div>
            </header>
            ${proposals.length === 0
              ? this.renderEmpty('file-text', t('proposalsEmptyTitle'), t('proposalsEmptyDescription'))
              : html`<div class="resource-table">
                  ${proposals.map((proposal) => this.renderProposal(proposal))}
                </div>`}
          </section>

          ${this.renderRunsSection()}
        </div>
      </div>
    `
  }

  protected renderRunsSection(): TemplateResult {
    const runs = envRuntimeModel.runs()
    return html`
      <section class="section-block" data-runtime-runs>
        <header class="section-heading">
          <div class="section-heading-copy">
            <h2>${t('runsTitle')}</h2>
            <p>${t('runsDescription')}</p>
          </div>
        </header>
        ${runs.length === 0
          ? this.renderEmpty('terminal', t('runsEmptyTitle'), t('runsEmptyDescription'))
          : html`<div class="resource-table">${runs.map((run) => this.renderRun(run))}</div>`}
      </section>
    `
  }

  protected renderApproval(approval: RunApprovalSnapshot): TemplateResult {
    const secondsLeft = envRuntimeModel.secondsUntil(approval.expires_at_epoch_ms)
    return html`
      <article class="resource-row" data-kind="approval">
        <div class="resource-main">
          <span class="eyebrow">${t('runActor')}</span>
          <span class="resource-title"
            ><bdi dir="auto"
              >${approval.actor_label || envRuntimeModel.actorLabel(approval.run.actor_id)}</bdi
            ></span
          >
          <span class="identifier" dir="ltr">${approval.run.id}</span>
        </div>
        <div class="resource-detail">
          <span class="eyebrow">${t('runProfilePreset')}</span>
          <span class="resource-title">
            <bdi dir="auto">${approval.profile_label}</bdi> ·
            <bdi dir="auto">${approval.preset_label}</bdi>
          </span>
          <span class="meta">
            ${t('runRevisions', {
              profile: approval.profile_revision,
              preset: approval.preset_revision,
            })}
          </span>
        </div>
        <div class="resource-meta">
          <span class="eyebrow">${t('expires')}</span>
          <span class="status-chip" data-state="pending">
            ${t('reviewCountdown', {seconds: secondsLeft})}
          </span>
          <span class="meta">${envRuntimeModel.formatTime(approval.expires_at_epoch_ms)}</span>
        </div>
        <div class="row-actions">
          <cv-button
            size="small"
            variant="primary"
            data-run-id=${approval.run.id}
            @click=${this.handleOpenRunApproval}
            >${t('runReview')}</cv-button
          >
        </div>
      </article>
    `
  }

  protected renderProposal(proposal: ProposalReview): TemplateResult {
    const resourceLabel = proposal.draft?.resource_kind ?? proposal.metadata.resource_kind
    return html`
      <article class="resource-row" data-kind="proposal">
        <div class="resource-main">
          <span class="resource-title">
            ${t('proposalOperation', {operation: proposal.metadata.operation, resource: resourceLabel})}
          </span>
          <span class="identifier" dir="ltr">${proposal.metadata.id}</span>
        </div>
        <div class="resource-detail">
          <span class="eyebrow">${t('proposalActor')}</span>
          <span class="meta">${envRuntimeModel.actorLabel(proposal.metadata.actor_id)}</span>
        </div>
        <div class="resource-meta">
          ${proposal.target
            ? html`<span class="meta"
                >${t('proposalTarget')}: <span dir="ltr">${proposal.target}</span></span
              >`
            : nothing}
          <span class="meta"
            >${t('proposalExpires', {
              time: envRuntimeModel.formatTime(proposal.metadata.expires_at_epoch_ms),
            })}</span
          >
        </div>
        <div class="row-actions">
          <cv-button
            size="small"
            variant="primary"
            data-proposal-id=${proposal.metadata.id}
            @click=${this.handleOpenProposal}
            >${t('proposalReview')}</cv-button
          >
        </div>
      </article>
    `
  }

  protected renderRun(run: AgentRunMetadata): TemplateResult {
    const active = run.status === 'approval_pending' || run.status === 'starting' || run.status === 'running'
    return html`
      <article class="resource-row" data-kind="run">
        <div class="resource-main">
          <span class="resource-title"
            ><bdi dir="auto">${envRuntimeModel.presetLabel(run.preset_id)}</bdi></span
          >
          <span class="identifier" dir="ltr">${run.id}</span>
        </div>
        <div class="resource-detail">
          <span class="eyebrow">${t('runActor')}</span>
          <span class="meta">${envRuntimeModel.actorLabel(run.actor_id)}</span>
        </div>
        <div class="resource-meta">
          <span class="meta">${t('runStarted')}: ${envRuntimeModel.formatTime(run.started_at_epoch_ms)}</span>
          <span class="meta"
            >${t('runFinished')}: ${envRuntimeModel.formatTime(run.finished_at_epoch_ms)}</span
          >
        </div>
        <div class="resource-detail">
          <span class="status-chip" data-state=${run.status}>${this.formatStatus(run.status)}</span>
          ${active
            ? nothing
            : html`<span class="meta">${t('runExit')}: ${envRuntimeModel.formatRunExit(run)}</span>`}
        </div>
        <div class="row-actions">
          ${active
            ? html`
                <cv-button size="small" variant="danger" data-run-id=${run.id} @click=${this.handleStopRun}
                  >${t('stop')}</cv-button
                >
              `
            : nothing}
        </div>
      </article>
    `
  }

  protected renderCliSection(): TemplateResult {
    const readiness = envRuntimeModel.privilegedReadiness()
    if (!readiness.ready) {
      return html`
        <div class="section-scroll">
          <div class="section-stack">
            <section class="section-block">
              <header class="section-heading">
                <div class="section-heading-copy">
                  <h2>${t('cliTitle')}</h2>
                  <p>${t('cliDescription')}</p>
                </div>
              </header>
              ${this.renderReadinessWarning(readiness)}
            </section>
          </div>
        </div>
      `
    }
    const status = envRuntimeModel.cliStatus()
    const pairing = envRuntimeModel.pairingInfo()
    const agents = envRuntimeModel.pairedActiveAgents()
    return html`
      <div class="section-scroll">
        <div class="section-stack">
          <section class="section-block">
            <header class="section-heading">
              <div class="section-heading-copy">
                <h2>${t('cliTitle')}</h2>
                <p>${t('cliDescription')}</p>
              </div>
            </header>

            <div class="cli-grid">
              <article class="cli-panel">
                <span class="eyebrow">${t('statusCli')}</span>
                <strong class="resource-title">
                  ${status?.installed ? t('statusCliInstalled') : t('statusCliMissing')}
                </strong>
                <span class="meta">
                  ${t('cliBundledVersion', {version: status?.bundled_version ?? t('notProvided')})}
                </span>
                <span class="meta">
                  ${t('cliInstalledVersion', {version: status?.installed_version ?? t('notProvided')})}
                </span>
                ${status?.installed_path
                  ? html`<span class="meta" data-cli-installed-at
                      >${t('cliInstalledAt', {path: isolateLtrText(status.installed_path)})}</span
                    >`
                  : html`<p class="helper">${t('cliInstallConflict')}</p>`}
                <p class="helper">${t('cliPathHint')}</p>
                <div class="inline-actions">
                  <cv-button
                    variant="primary"
                    .loading=${envRuntimeModel.cliInstallPending()}
                    ?disabled=${Boolean(status && !status.supported) || envRuntimeModel.cliInstallPending()}
                    @click=${this.handleInstallCli}
                    >${t('cliInstall')}</cv-button
                  >
                </div>
              </article>

              ${pairing
                ? html`
                    <article class="cli-panel pairing-panel">
                      <span class="eyebrow">${t('cliPairCode')}</span>
                      <strong class="pair-code" dir="ltr">${pairing.pin}</strong>
                      <p class="helper">${t('cliPairInstruction')}</p>
                      <code class="pair-command" dir="ltr">${t('cliPairCommand')}</code>
                      <p class="helper">
                        ${t('cliPairExpiry', {seconds: envRuntimeModel.pairingSecondsLeft()})}
                      </p>
                      <p class="helper">${t('cliPairSecurity')}</p>
                      <div class="inline-actions">
                        <cv-button @click=${this.handleCancelPairing}>${t('cliCancelPairing')}</cv-button>
                      </div>
                    </article>
                  `
                : html`
                    <article class="cli-panel">
                      <span class="eyebrow">${t('cliPair')}</span>
                      <strong class="resource-title">${t('cliPairInstruction')}</strong>
                      <code class="pair-command" dir="ltr">${t('cliPairCommand')}</code>
                      <p class="helper">${t('cliPairSecurity')}</p>
                      <div class="inline-actions">
                        <cv-button
                          variant="primary"
                          .loading=${envRuntimeModel.pairingPending()}
                          ?disabled=${envRuntimeModel.pairingPending()}
                          @click=${this.handleStartPairing}
                          >${t('cliPair')}</cv-button
                        >
                      </div>
                    </article>
                  `}
            </div>
          </section>

          <section class="section-block">
            <header class="section-heading">
              <div class="section-heading-copy"><h2>${t('cliAgents')}</h2></div>
            </header>
            ${agents.length === 0
              ? this.renderEmpty('terminal', t('cliAgentsEmpty'), t('cliDescription'))
              : html`
                  <div class="resource-table">
                    ${agents.map(
                      (agent) => html`
                        <article class="resource-row" data-kind="agent">
                          <div class="resource-main">
                            <span class="resource-title"
                              ><bdi dir="auto">${agent.label || agent.id}</bdi></span
                            >
                            <span class="identifier" dir="ltr">${agent.id}</span>
                          </div>
                          <div class="resource-detail">
                            <span class="meta">${envRuntimeModel.formatTime(agent.created_at_ms)}</span>
                          </div>
                          <div class="resource-meta">
                            <span class="meta">
                              ${agent.last_active_ms
                                ? t('cliLastActive', {
                                    time: envRuntimeModel.formatTime(agent.last_active_ms),
                                  })
                                : t('cliNeverActive')}
                            </span>
                          </div>
                          <div class="row-actions">
                            <cv-button
                              size="small"
                              variant="danger"
                              data-agent-id=${agent.id}
                              @click=${this.handleRevokeAgent}
                              >${t('cliRevoke')}</cv-button
                            >
                          </div>
                        </article>
                      `,
                    )}
                  </div>
                `}
          </section>
        </div>
      </div>
    `
  }
}
