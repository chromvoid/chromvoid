import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {envRuntimeI18n as t} from './env-runtime.i18n'
import {envRuntimeModel} from './env-runtime.model'
import {EnvRuntimePageDialogs} from './env-runtime-page.dialogs'
import type {
  AgentPresetDraft,
  AgentProfileDraft,
  DevicePreset,
  EnvProfileMetadata,
  PreparedPresetFacts,
  ProposalReview,
} from './env-runtime.types'

export abstract class EnvRuntimePageReviews extends EnvRuntimePageDialogs {
  protected renderRunApprovalDialog(): TemplateResult {
    const approval = envRuntimeModel.selectedRunApproval()
    const pending = envRuntimeModel.runApprovalPending()
    const secondsLeft = envRuntimeModel.runApprovalSecondsLeft()
    const envSources = envRuntimeModel.selectedRunApprovalEnvSources()
    const approvalReadiness = envRuntimeModel.runApprovalReadiness()
    return html`
      <cv-dialog
        class="env-dialog wide review-dialog"
        .open=${Boolean(approval)}
        .type=${'alertdialog'}
        .closable=${!pending}
        .closeOnEscape=${!pending}
        .closeOnOutsidePointer=${false}
        .closeOnOutsideFocus=${false}
        .initialFocusId=${'run-approval-reject'}
        .preventInitialTextFocus=${true}
        @cv-change=${this.handleRunApprovalDialogChange}
      >
        ${approval
          ? html`
              <span slot="title">${t('runReviewTitle')}</span>
              <span slot="description">
                ${t('runReviewDescription')}
                <strong class="countdown" data-run-approval-countdown>
                  ${t('reviewCountdown', {seconds: secondsLeft})}
                </strong>
              </span>
              <div class="dialog-body" data-run-approval-review>
                ${approvalReadiness.ready ? nothing : this.renderReadinessWarning(approvalReadiness)}
                <dl class="review-grid review-grid-dense">
                  <div class="review-item">
                    <dt>${t('runActor')}</dt>
                    <dd>
                      <strong
                        ><bdi dir="auto"
                          >${approval.actor_label || envRuntimeModel.actorLabel(approval.run.actor_id)}</bdi
                        ></strong
                      >
                      <code dir="ltr">${approval.run.actor_id}</code>
                    </dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('runProfile')}</dt>
                    <dd>
                      <strong><bdi dir="auto">${approval.profile_label}</bdi></strong>
                      <code dir="ltr">${approval.run.profile_id}</code>
                      <span>${t('revision', {revision: approval.profile_revision})}</span>
                    </dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('runPreset')}</dt>
                    <dd>
                      <strong><bdi dir="auto">${approval.preset_label}</bdi></strong>
                      <code dir="ltr">${approval.run.preset_id}</code>
                      <span>${t('revision', {revision: approval.preset_revision})}</span>
                    </dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('presetWorkspace')}</dt>
                    <dd><code dir="ltr">${approval.workspace_root}</code></dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('presetCwd')}</dt>
                    <dd><code dir="ltr">${approval.cwd}</code></dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('presetExecutable')}</dt>
                    <dd><code dir="ltr">${approval.executable}</code></dd>
                  </div>
                  <div class="review-item span-all">
                    <dt>${t('presetHash')}</dt>
                    <dd><code dir="ltr">${approval.executable_sha256}</code></dd>
                  </div>
                  <div class="review-item span-all">
                    <dt>${t('presetArgs')}</dt>
                    <dd><code dir="ltr">${this.formatCommand(approval.executable, approval.args)}</code></dd>
                  </div>
                </dl>

                <section class="review-section" aria-labelledby="run-passthrough-heading">
                  <h3 id="run-passthrough-heading">${t('presetPassthrough')}</h3>
                  ${approval.passthrough_env.length
                    ? html`
                        <div class="chip-row">
                          ${approval.passthrough_env.map(
                            (name) => html`<code class="chip" dir="ltr">${name}</code>`,
                          )}
                        </div>
                      `
                    : html`<p class="helper">${t('none')}</p>`}
                </section>

                <section class="review-section" aria-labelledby="run-env-heading">
                  <h3 id="run-env-heading">${t('runEnvironment')}</h3>
                  <dl class="source-list">
                    ${envSources.map(
                      (source) => html`
                        <div class="source-row">
                          <dt><code dir="ltr">${source.name}</code></dt>
                          <dd>
                            <span><bdi dir="auto">${source.secret_label || t('unknown')}</bdi></span>
                            ${source.secret_id ? html`<code dir="ltr">${source.secret_id}</code>` : nothing}
                            ${source.overrides_passthrough
                              ? html`<span class="collision-note">${t('runPassthroughOverride')}</span>`
                              : nothing}
                          </dd>
                        </div>
                      `,
                    )}
                  </dl>
                </section>

                <section class="untrusted-note" aria-labelledby="run-reason-heading">
                  <div>
                    <span class="eyebrow">${t('runReasonUntrusted')}</span>
                    <h3 id="run-reason-heading">${t('runReason')}</h3>
                  </div>
                  <p><bdi dir="auto">${approval.reason || t('notProvided')}</bdi></p>
                </section>

                <p class="security-warning security-warning-prominent" data-security-warning role="note">
                  <cv-icon name="alert-triangle" aria-hidden="true"></cv-icon>
                  <span>${t('runPlaintextWarning')}</span>
                </p>
                ${envRuntimeModel.runApprovalError()
                  ? html`<p class="form-error" role="alert">${envRuntimeModel.runApprovalError()}</p>`
                  : nothing}
              </div>

              <div class="dialog-actions" slot="footer">
                <cv-button ?disabled=${pending} @click=${this.handleCloseRunApproval}>
                  ${t('close')}
                </cv-button>
                <cv-button
                  id="run-approval-reject"
                  ?disabled=${pending}
                  .loading=${pending}
                  @click=${this.handleRejectRunApproval}
                >
                  ${t('reject')}
                </cv-button>
                <cv-button
                  variant="primary"
                  ?disabled=${pending || !approvalReadiness.ready || secondsLeft === 0}
                  .loading=${pending}
                  @click=${this.handleApproveRunApproval}
                >
                  ${t('approve')}
                </cv-button>
              </div>
            `
          : nothing}
      </cv-dialog>
    `
  }

  protected renderProposalDialog(): TemplateResult {
    const proposal = envRuntimeModel.selectedProposal()
    const draft = proposal?.draft
    const profileDraft = envRuntimeModel.proposalProfileDraft()
    const pending = envRuntimeModel.proposalPending()
    const secondsLeft = envRuntimeModel.proposalSecondsLeft()
    const approvalReadiness = envRuntimeModel.proposalApprovalReadiness()
    return html`
      <cv-dialog
        class="env-dialog wide review-dialog"
        .open=${Boolean(proposal)}
        .type=${'alertdialog'}
        .closable=${!pending}
        .closeOnEscape=${!pending}
        .closeOnOutsidePointer=${false}
        .closeOnOutsideFocus=${false}
        .initialFocusId=${'proposal-reject'}
        .preventInitialTextFocus=${true}
        @cv-change=${this.handleProposalDialogChange}
      >
        ${proposal
          ? html`
              <span slot="title">${t('proposalReview')}</span>
              <span slot="description">
                ${t('proposalReviewDescription')}
                <strong class="countdown" data-proposal-countdown>
                  ${t('reviewCountdown', {seconds: secondsLeft})}
                </strong>
              </span>
              <div class="dialog-body" data-proposal-review>
                ${approvalReadiness.ready ? nothing : this.renderReadinessWarning(approvalReadiness)}
                <dl class="review-grid review-grid-dense">
                  <div class="review-item">
                    <dt>${t('proposalActor')}</dt>
                    <dd>
                      <strong
                        ><bdi dir="auto"
                          >${envRuntimeModel.actorLabel(proposal.metadata.actor_id)}</bdi
                        ></strong
                      >
                      <code dir="ltr">${proposal.metadata.actor_id}</code>
                    </dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('proposalOperationLabel')}</dt>
                    <dd>
                      ${t('proposalOperation', {
                        operation: proposal.metadata.operation,
                        resource: proposal.metadata.resource_kind,
                      })}
                    </dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('proposalTarget')}</dt>
                    <dd data-proposal-target>
                      ${proposal.target
                        ? html`<code dir="ltr">${proposal.target}</code>`
                        : html`<bdi dir="auto">${t('notProvided')}</bdi>`}
                      ${proposal.base_revision == null
                        ? nothing
                        : html`<span>${t('revision', {revision: proposal.base_revision})}</span>`}
                    </dd>
                  </div>
                  <div class="review-item">
                    <dt>${t('expires')}</dt>
                    <dd>
                      <strong>${t('reviewCountdown', {seconds: secondsLeft})}</strong>
                      <span>${envRuntimeModel.formatTime(proposal.metadata.expires_at_epoch_ms)}</span>
                    </dd>
                  </div>
                </dl>

                ${proposal.metadata.resource_kind === 'profile'
                  ? this.renderProfileProposal(proposal, profileDraft)
                  : proposal.metadata.resource_kind === 'preset'
                    ? this.renderPresetProposal(
                        proposal,
                        draft?.resource_kind === 'preset' ? draft.draft : null,
                      )
                    : html`<p class="form-error" role="alert">${t('proposalUnknownResource')}</p>`}
                ${envRuntimeModel.proposalError()
                  ? html`<p class="form-error" role="alert">${envRuntimeModel.proposalError()}</p>`
                  : nothing}
              </div>

              <div class="dialog-actions" slot="footer">
                <cv-button ?disabled=${pending} @click=${this.handleCloseProposal}>${t('close')}</cv-button>
                <cv-button
                  id="proposal-reject"
                  ?disabled=${pending}
                  .loading=${pending}
                  @click=${this.handleRejectProposal}
                >
                  ${t('reject')}
                </cv-button>
                <cv-button
                  variant="primary"
                  ?disabled=${pending || secondsLeft === 0 || !approvalReadiness.ready}
                  .loading=${pending}
                  @click=${this.handleApproveProposal}
                >
                  ${t('approve')}
                </cv-button>
              </div>
            `
          : nothing}
      </cv-dialog>
    `
  }

  protected renderProfileProposal(proposal: ProposalReview, draft: AgentProfileDraft | null): TemplateResult {
    const current = envRuntimeModel.selectedProposalCurrentProfile()
    const deleting = proposal.metadata.operation === 'delete'
    return html`
      <div class="review-comparison" data-resource-kind="profile">
        <section class="comparison-pane" aria-labelledby="profile-before-heading">
          <span class="comparison-kicker">${t('proposalBefore')}</span>
          <h3 id="profile-before-heading">${t('proposalCurrentProfile')}</h3>
          ${current
            ? this.renderCurrentProfileFacts(current)
            : html`<p class="comparison-empty">${t('proposalNoCurrentResource')}</p>`}
        </section>
        <section class="comparison-pane" aria-labelledby="profile-after-heading">
          <span class="comparison-kicker">${t('proposalAfter')}</span>
          <h3 id="profile-after-heading">
            ${deleting ? t('proposalDeleteResult') : t('proposalProposedProfile')}
          </h3>
          ${deleting
            ? this.renderDeleteResult('profile')
            : draft
              ? this.renderProposedProfileFacts(draft)
              : html`<p class="form-error" role="alert">${t('proposalMissingDraft')}</p>`}
        </section>
      </div>
    `
  }

  protected renderCurrentProfileFacts(profile: EnvProfileMetadata): TemplateResult {
    return html`
      <dl class="fact-list">
        <div>
          <dt>${t('profileLabel')}</dt>
          <dd><bdi dir="auto">${profile.label}</bdi></dd>
        </div>
        <div>
          <dt>${t('profileSlug')}</dt>
          <dd><code dir="ltr">${profile.slug}</code></dd>
        </div>
        <div>
          <dt>${t('revisionLabel')}</dt>
          <dd>${profile.revision}</dd>
        </div>
        <div>
          <dt>${t('profileDescription')}</dt>
          <dd><bdi dir="auto">${profile.description || t('notProvided')}</bdi></dd>
        </div>
      </dl>
      <div class="binding-review" aria-label=${t('profileVariables')}>
        ${profile.variables.map(
          (variable) => html`
            <div class="binding-fact">
              <code dir="ltr">${variable.name}</code>
              <span><bdi dir="auto">${envRuntimeModel.secretLabel(variable.secret_id)}</bdi></span>
            </div>
          `,
        )}
      </div>
    `
  }

  protected renderProposedProfileFacts(draft: AgentProfileDraft): TemplateResult {
    const errors = envRuntimeModel.proposalRowErrors()
    return html`
      <dl class="fact-list">
        <div>
          <dt>${t('profileLabel')}</dt>
          <dd><bdi dir="auto">${draft.label}</bdi></dd>
        </div>
        <div>
          <dt>${t('profileSlug')}</dt>
          <dd><code dir="ltr">${draft.slug}</code></dd>
        </div>
        <div>
          <dt>${t('profileDescription')}</dt>
          <dd><bdi dir="auto">${draft.description || t('notProvided')}</bdi></dd>
        </div>
      </dl>
      <div class="binding-editor">
        <p class="helper">${t('proposalBindingHint')}</p>
        <div class="mapping-list">
          ${draft.variables.map(
            (variable, index) => html`
              <div class="mapping-row">
                <div
                  class="field-stack"
                  id=${`proposal-variable-name-${index}`}
                  tabindex=${errors[index]?.name ? -1 : nothing}
                  aria-invalid=${errors[index]?.name ? 'true' : nothing}
                  aria-describedby=${errors[index]?.name
                    ? `proposal-variable-name-${index}-error`
                    : nothing}
                >
                  <span class="eyebrow">${t('profileVariableName')}</span>
                  <code class="command" dir="ltr">${variable.name}</code>
                  ${errors[index]?.name
                    ? html`<span
                        id=${`proposal-variable-name-${index}-error`}
                        class="field-error"
                        >${errors[index]?.name}</span
                      >`
                    : nothing}
                </div>
                ${envRuntimeModel.proposalVariableIsBindable(index)
                  ? html`
                <cv-field required ?invalid=${Boolean(errors[index]?.secret)}>
                  <span slot="label">${t('profileVariableSecret')}</span>
                  <cv-select
                    id=${`proposal-variable-secret-${index}`}
                    required
                    data-index=${index}
                    .value=${variable.secret_id ?? ''}
                    .placeholder=${t('profileNoSecret')}
                    ?invalid=${Boolean(errors[index]?.secret)}
                    aria-required="true"
                    aria-describedby=${errors[index]?.secret
                      ? `proposal-variable-secret-${index}-error`
                      : nothing}
                    @cv-change=${this.handleProposalSecretChange}
                  >
                    ${envRuntimeModel
                      .secrets()
                      .map(
                        (secret) => html`
                          <cv-select-option .value=${secret.id}
                            ><bdi dir="auto">${secret.label}</bdi></cv-select-option
                          >
                        `,
                      )}
                  </cv-select>
                  ${errors[index]?.secret
                    ? html`<span id=${`proposal-variable-secret-${index}-error`} slot="error"
                        >${errors[index]?.secret}</span
                      >`
                    : nothing}
                </cv-field>
                    `
                  : html`
                      <div class="field-stack" data-proposal-binding-readonly>
                        <span class="eyebrow">${t('profileVariableSecret')}</span>
                        <span><bdi dir="auto">${envRuntimeModel.secretLabel(variable.secret_id)}</bdi></span>
                        <code dir="ltr">${variable.secret_id}</code>
                      </div>
                    `}
              </div>
            `,
          )}
        </div>
      </div>
    `
  }

  protected renderPresetProposal(proposal: ProposalReview, draft: AgentPresetDraft | null): TemplateResult {
    const current = envRuntimeModel.selectedProposalCurrentPreset()
    const deleting = proposal.metadata.operation === 'delete'
    return html`
      <div class="review-comparison" data-resource-kind="preset">
        <section class="comparison-pane" aria-labelledby="preset-before-heading">
          <span class="comparison-kicker">${t('proposalBefore')}</span>
          <h3 id="preset-before-heading">${t('proposalCurrentPreset')}</h3>
          ${current
            ? this.renderCurrentPresetFacts(current)
            : html`<p class="comparison-empty">${t('proposalNoCurrentResource')}</p>`}
        </section>
        <section class="comparison-pane" aria-labelledby="preset-after-heading">
          <span class="comparison-kicker">${t('proposalAfter')}</span>
          <h3 id="preset-after-heading">
            ${deleting ? t('proposalDeleteResult') : t('proposalProposedPreset')}
          </h3>
          ${deleting
            ? this.renderDeleteResult('preset')
            : draft && proposal.prepared_preset
              ? this.renderProposedPresetFacts(draft, proposal.prepared_preset)
              : html`<p class="form-error" role="alert">${t('proposalMissingDraft')}</p>`}
        </section>
      </div>
    `
  }

  protected renderCurrentPresetFacts(preset: DevicePreset): TemplateResult {
    return html`
      <dl class="fact-list fact-list-command">
        <div>
          <dt>${t('presetLabel')}</dt>
          <dd><bdi dir="auto">${preset.label}</bdi></dd>
        </div>
        <div>
          <dt>${t('presetSlug')}</dt>
          <dd><code dir="ltr">${preset.slug}</code></dd>
        </div>
        <div>
          <dt>${t('revisionLabel')}</dt>
          <dd>${preset.revision}</dd>
        </div>
        <div>
          <dt>${t('presetProfile')}</dt>
          <dd><bdi dir="auto">${envRuntimeModel.profileLabel(preset.profile_id)}</bdi></dd>
        </div>
        <div>
          <dt>${t('presetWorkspace')}</dt>
          <dd><code dir="ltr">${preset.workspace_root}</code></dd>
        </div>
        <div>
          <dt>${t('presetCwd')}</dt>
          <dd><code dir="ltr">${preset.cwd}</code></dd>
        </div>
        <div>
          <dt>${t('presetExecutable')}</dt>
          <dd><code dir="ltr">${preset.executable}</code></dd>
        </div>
        <div>
          <dt>${t('presetHash')}</dt>
          <dd><code dir="ltr">${preset.executable_sha256}</code></dd>
        </div>
        <div>
          <dt>${t('presetArgs')}</dt>
          <dd><code dir="ltr">${JSON.stringify(preset.args)}</code></dd>
        </div>
        <div>
          <dt>${t('presetPassthrough')}</dt>
          <dd data-current-passthrough>
            ${preset.passthrough_env.length
              ? html`<code dir="ltr">${preset.passthrough_env.join(', ')}</code>`
              : html`<bdi dir="auto">${t('none')}</bdi>`}
          </dd>
        </div>
      </dl>
    `
  }

  protected renderProposedPresetFacts(
    draft: AgentPresetDraft,
    prepared: PreparedPresetFacts,
  ): TemplateResult {
    return html`
      <dl class="fact-list fact-list-command" data-prepared-preset-facts>
        <div>
          <dt>${t('presetLabel')}</dt>
          <dd><bdi dir="auto">${draft.label}</bdi></dd>
        </div>
        <div>
          <dt>${t('presetSlug')}</dt>
          <dd><code dir="ltr">${draft.slug}</code></dd>
        </div>
        <div>
          <dt>${t('presetProfile')}</dt>
          <dd><bdi dir="auto">${envRuntimeModel.profileLabel(prepared.profile_id)}</bdi></dd>
        </div>
        <div>
          <dt>${t('presetWorkspace')}</dt>
          <dd><code dir="ltr">${prepared.workspace_root}</code></dd>
        </div>
        <div>
          <dt>${t('presetCwd')}</dt>
          <dd><code dir="ltr">${prepared.cwd}</code></dd>
        </div>
        <div>
          <dt>${t('presetExecutable')}</dt>
          <dd><code dir="ltr">${prepared.executable}</code></dd>
        </div>
        <div>
          <dt>${t('presetHash')}</dt>
          <dd><code dir="ltr">${prepared.executable_sha256}</code></dd>
        </div>
        <div>
          <dt>${t('presetArgs')}</dt>
          <dd><code dir="ltr">${JSON.stringify(prepared.args)}</code></dd>
        </div>
        <div>
          <dt>${t('presetPassthrough')}</dt>
          <dd data-proposed-passthrough>
            ${prepared.passthrough_env.length
              ? html`<code dir="ltr">${prepared.passthrough_env.join(', ')}</code>`
              : html`<bdi dir="auto">${t('none')}</bdi>`}
          </dd>
        </div>
      </dl>
    `
  }

  protected renderDeleteResult(resource: 'profile' | 'preset'): TemplateResult {
    return html`
      <div class="delete-result" role="note">
        <cv-icon name="trash" aria-hidden="true"></cv-icon>
        <div>
          <strong>${t('proposalDeleteResult')}</strong>
          <p>${t('proposalDeleteDescription', {resource})}</p>
        </div>
      </div>
    `
  }
}
