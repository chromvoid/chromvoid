import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {i18n as passmanagerI18n} from '@project/passmanager/i18n'
import {css, nothing, type PropertyValues, type TemplateResult} from 'lit'

import {i18n as appI18n} from 'root/i18n'

import {
  otpImportReviewModel,
  type OtpImportAvailability,
  type OtpImportFocusField,
} from './otp-import-review.model'

const focusIds: Record<OtpImportFocusField, string> = {
  target: 'otp-import-target-existing',
  title: 'otp-import-title',
  website: 'otp-import-website',
  label: 'otp-import-label',
  duplicate: 'otp-import-duplicate',
  alert: 'otp-import-alert',
}

export class OtpImportReview extends ReatomLitElement {
  static elementName = 'otp-import-review'

  static define(): void {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = [
    css`
      :host {
        display: contents;
      }

      cv-dialog {
        --cv-dialog-width: min(44rem, calc(100vw - var(--cv-space-8)));
        --cv-dialog-max-height: calc(100dvh - var(--cv-space-8));
      }

      .review-form,
      .state,
      .form-body,
      .target-fields,
      .target-options,
      .duplicate-options {
        display: grid;
      }

      .review-form,
      .state,
      .form-body {
        gap: var(--cv-space-4);
      }

      .state {
        justify-items: start;
        padding-block: var(--cv-space-3);
      }

      .state-icon {
        display: grid;
        place-items: center;
        inline-size: 2.75rem;
        block-size: 2.75rem;
        color: var(--cv-color-primary);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-md);
        background: var(--cv-color-surface);
      }

      .state h3,
      .state p,
      .section-title,
      .field-warning {
        margin: 0;
      }

      .state h3,
      .section-title {
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-md);
        font-weight: var(--cv-font-weight-semibold);
      }

      .state p,
      .field-warning,
      .summary dt {
        color: var(--cv-color-text-muted);
      }

      .summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--cv-space-3);
        padding: var(--cv-space-3);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-md);
        background: var(--cv-color-surface);
      }

      .summary > div {
        min-inline-size: 0;
      }

      .summary dt {
        font-size: var(--cv-font-size-xs);
      }

      .summary dd {
        overflow: hidden;
        margin: var(--cv-space-1) 0 0;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      fieldset {
        min-inline-size: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }

      legend {
        padding: 0;
      }

      .target-options,
      .duplicate-options {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--cv-space-2);
        margin-block-start: var(--cv-space-2);
      }

      .choice {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: var(--cv-space-2);
        align-items: start;
        min-inline-size: 0;
        padding: var(--cv-space-3);
        color: var(--cv-color-text);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-md);
        background: var(--cv-color-surface);
        cursor: pointer;
      }

      .choice:has(input:checked) {
        border-color: var(--cv-color-primary);
        background: var(--cv-color-primary-subtle);
      }

      .choice:has(input:focus-visible) {
        outline: 2px solid var(--cv-color-focus-ring);
        outline-offset: 2px;
      }

      .choice input {
        margin: 0.15rem 0 0;
        accent-color: var(--cv-color-primary);
      }

      .choice strong,
      .choice small {
        display: block;
      }

      .choice small {
        margin-block-start: var(--cv-space-1);
        color: var(--cv-color-text-muted);
      }

      .target-fields {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--cv-space-3);
        padding-block-start: var(--cv-space-3);
      }

      .target-fields cv-field:first-child,
      .target-fields .span-all {
        grid-column: 1 / -1;
      }

      input:not([type='radio']),
      select {
        box-sizing: border-box;
        inline-size: 100%;
        min-block-size: 2.5rem;
        padding-inline: var(--cv-space-3);
        color: var(--cv-color-text);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-sm);
        background: var(--cv-color-surface);
        font: inherit;
      }

      input:not([type='radio']):focus-visible,
      select:focus-visible {
        outline: 2px solid var(--cv-color-focus-ring);
        outline-offset: 1px;
      }

      input[aria-invalid='true'],
      select[aria-invalid='true'] {
        border-color: var(--cv-color-danger);
      }

      .field-warning {
        font-size: var(--cv-font-size-xs);
        line-height: 1.4;
      }

      .notice {
        display: grid;
        gap: var(--cv-space-2);
        padding: var(--cv-space-3);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-md);
        background: var(--cv-color-surface);
      }

      .notice.danger {
        border-color: var(--cv-color-danger);
      }

      .notice p {
        margin: 0;
      }

      .footer {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--cv-space-2);
      }

      @media (max-width: 39rem) {
        cv-dialog {
          --cv-dialog-width: calc(100vw - var(--cv-space-4));
          --cv-dialog-max-height: calc(100dvh - var(--cv-space-4));
        }

        .summary,
        .target-options,
        .duplicate-options,
        .target-fields {
          grid-template-columns: minmax(0, 1fr);
        }

        .target-fields cv-field:first-child,
        .target-fields .span-all {
          grid-column: auto;
        }

        .footer cv-button {
          flex: 1 1 10rem;
        }
      }
    `,
  ]

  private readonly model = otpImportReviewModel
  private lastFocusToken = 0

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    const request = this.model.focusRequest()
    if (!request || request.token === this.lastFocusToken) return
    this.lastFocusToken = request.token
    this.renderRoot.querySelector<HTMLElement>(`#${focusIds[request.field]}`)?.focus()
  }

  private handleDialogChange(event: CustomEvent<{open?: boolean}>): void {
    if (event.target !== event.currentTarget || event.detail?.open !== false) return
    void this.model.cancel()
  }

  private handleCancel(): void {
    void this.model.cancel()
  }

  private handleSubmit(event: SubmitEvent): void {
    event.preventDefault()
    void this.model.submit()
  }

  private handleSave(): void {
    void this.model.submit()
  }

  private handleTargetChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement
    if (target.value === 'existing' || target.value === 'new') {
      this.model.setTargetMode(target.value)
    }
  }

  private handleExistingEntryChange(event: Event): void {
    this.model.setSelectedEntryId((event.currentTarget as HTMLSelectElement).value)
  }

  private handleTitleInput(event: Event): void {
    this.model.setNewTitle((event.currentTarget as HTMLInputElement).value)
  }

  private handleUsernameInput(event: Event): void {
    this.model.setNewUsername((event.currentTarget as HTMLInputElement).value)
  }

  private handleWebsiteInput(event: Event): void {
    this.model.setNewWebsite((event.currentTarget as HTMLInputElement).value)
  }

  private handleLabelInput(event: Event): void {
    this.model.setOtpLabel((event.currentTarget as HTMLInputElement).value)
  }

  private handleDuplicateChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement
    if (target.value === 'replace' || target.value === 'rename') {
      this.model.setDuplicateResolution(target.value)
    }
  }

  private renderWaiting(availability: OtpImportAvailability): TemplateResult {
    const copy: Record<OtpImportAvailability, {title: string; message: string; icon: string}> = {
      ready: {
        title: passmanagerI18n('otp:preview'),
        message: passmanagerI18n('otp:description'),
        icon: 'loader-circle',
      },
      local_core_required: {
        title: appI18n('remote:mode-label-local'),
        message: appI18n('otp-import:local-description'),
        icon: 'monitor',
      },
      vault_required: {
        title: appI18n('welcome:unlock-vault'),
        message: appI18n('welcome:unlock-desc'),
        icon: 'lock-keyhole',
      },
      passmanager_loading: {
        title: passmanagerI18n('loading'),
        message: passmanagerI18n('otp:quick_view:unavailable:description'),
        icon: 'loader-circle',
      },
      read_only: {
        title: passmanagerI18n('group:create:readonly-title'),
        message: passmanagerI18n('credentials:unavailable:description'),
        icon: 'shield-alert',
      },
    }

    const state = copy[availability]
    return html`
      <div class="state" aria-live="polite">
        <span class="state-icon" aria-hidden="true"><cv-icon name=${state.icon}></cv-icon></span>
        <h3>${state.title}</h3>
        <p>${state.message}</p>
      </div>
    `
  }

  private renderSummary(): TemplateResult {
    const metadata = this.model.parseMetadata()
    const otp = this.model.otpDraft
    const isHotp = otp.otpType() === 'HOTP'
    return html`
      <dl class="summary">
        <div>
          <dt>${appI18n('otp-import:issuer')}</dt>
          <dd title=${metadata?.issuer || ''}>${metadata?.issuer || passmanagerI18n('no_title')}</dd>
        </div>
        <div>
          <dt>${passmanagerI18n('username')}</dt>
          <dd title=${metadata?.account || ''}>${metadata?.account || passmanagerI18n('no_title')}</dd>
        </div>
        <div>
          <dt>${passmanagerI18n('otp:type')}</dt>
          <dd>${passmanagerI18n(isHotp ? 'otp:type:hotp' : 'otp:type:totp')}</dd>
        </div>
        <div>
          <dt>${passmanagerI18n('otp:custom')}</dt>
          <dd>
            ${otp.digits()} ${passmanagerI18n('otp:digits')} ·
            ${isHotp
              ? `${passmanagerI18n('otp:counter')} ${otp.counter()}`
              : `${otp.period()} ${passmanagerI18n('otp:period:unit')}`}
          </dd>
        </div>
      </dl>
    `
  }

  private renderTarget(): TemplateResult {
    const mode = this.model.targetMode()
    const targetError = this.model.targetError()
    return html`
      <fieldset aria-describedby=${targetError ? 'otp-import-target-error' : nothing}>
        <legend class="section-title">${passmanagerI18n('entry:create:location-title')}</legend>
        <div class="target-options">
          <label class="choice">
            <input
              id="otp-import-target-existing"
              type="radio"
              name="otp-import-target"
              value="existing"
              .checked=${mode === 'existing'}
              @change=${this.handleTargetChange}
            />
            <span>
              <strong>${passmanagerI18n('entry:type:login')}</strong>
              <small>${passmanagerI18n('entry:create:location-description')}</small>
            </span>
          </label>
          <label class="choice">
            <input
              type="radio"
              name="otp-import-target"
              value="new"
              .checked=${mode === 'new'}
              @change=${this.handleTargetChange}
            />
            <span>
              <strong>${passmanagerI18n('entry:create-login-title')}</strong>
              <small>${passmanagerI18n('entry:create-login-subtitle')}</small>
            </span>
          </label>
        </div>
        ${targetError
          ? html`<p id="otp-import-target-error" class="field-warning" role="alert">${targetError}</p>`
          : nothing}
      </fieldset>
      ${mode === 'existing' ? this.renderExistingTarget() : nothing}
      ${mode === 'new' ? this.renderNewTarget() : nothing}
    `
  }

  private renderExistingTarget(): TemplateResult {
    const entries = this.model.existingEntries()
    return html`
      <div class="target-fields">
        <cv-field class="span-all" ?invalid=${Boolean(this.model.targetError())} required>
          <span slot="label">${passmanagerI18n('entry:type:login')}</span>
          <select @change=${this.handleExistingEntryChange} .value=${this.model.selectedEntryId()}>
            <option value="">${passmanagerI18n('entry:create:location-select')}</option>
            ${entries.map(
              (entry) => html`
                <option value=${entry.id}>
                  ${entry.suggested ? '★ ' : ''}${entry.title}${entry.username ? ` — ${entry.username}` : ''}
                </option>
              `,
            )}
          </select>
          ${entries.length === 0
            ? html`<span slot="description">${passmanagerI18n('credentials:unavailable:title')}</span>`
            : nothing}
        </cv-field>
      </div>
    `
  }

  private renderNewTarget(): TemplateResult {
    const website = this.model.newWebsite()
    return html`
      <div class="target-fields">
        <cv-field ?invalid=${Boolean(this.model.titleError())} required>
          <span slot="label">${passmanagerI18n('title')}</span>
          <input
            id="otp-import-title"
            autocomplete="off"
            .value=${this.model.newTitle()}
            @input=${this.handleTitleInput}
          />
          <span slot="error">${this.model.titleError()}</span>
        </cv-field>
        <cv-field>
          <span slot="label">${passmanagerI18n('username')}</span>
          <input
            autocomplete="username"
            .value=${this.model.newUsername()}
            @input=${this.handleUsernameInput}
          />
        </cv-field>
        <cv-field class="span-all" ?invalid=${Boolean(this.model.websiteError())}>
          <span slot="label">${passmanagerI18n('website')}</span>
          <input
            id="otp-import-website"
            inputmode="url"
            autocomplete="url"
            placeholder="https://example.com"
            .value=${website}
            @input=${this.handleWebsiteInput}
          />
          ${website.trim()
            ? nothing
            : html` <span slot="description">${appI18n('otp-import:website-warning')}</span> `}
          <span slot="error">${this.model.websiteError()}</span>
        </cv-field>
      </div>
    `
  }

  private renderDuplicate(): TemplateResult | typeof nothing {
    if (!this.model.duplicateOtp()) return nothing
    const resolution = this.model.duplicateResolution()
    return html`
      <fieldset
        id="otp-import-duplicate"
        class="notice ${this.model.duplicateError() ? 'danger' : ''}"
        tabindex="-1"
        aria-describedby=${this.model.duplicateError() ? 'otp-import-duplicate-error' : nothing}
      >
        <legend class="section-title">${appI18n('otp-import:duplicate-title')}</legend>
        <p>${appI18n('otp-import:duplicate-description')}</p>
        <div class="duplicate-options">
          <label class="choice">
            <input
              type="radio"
              name="otp-import-duplicate"
              value="replace"
              .checked=${resolution === 'replace'}
              @change=${this.handleDuplicateChange}
            />
            <span>
              <strong>${appI18n('otp-import:duplicate-replace')}</strong>
              <small>${appI18n('otp-import:duplicate-replace-description')}</small>
            </span>
          </label>
          <label class="choice">
            <input
              type="radio"
              name="otp-import-duplicate"
              value="rename"
              .checked=${resolution === 'rename'}
              @change=${this.handleDuplicateChange}
            />
            <span>
              <strong>${passmanagerI18n('button:edit')}</strong>
              <small>${appI18n('otp-import:duplicate-rename-description')}</small>
            </span>
          </label>
        </div>
        ${this.model.duplicateError()
          ? html`<p id="otp-import-duplicate-error" role="alert">${this.model.duplicateError()}</p>`
          : nothing}
      </fieldset>
    `
  }

  private renderReview(): TemplateResult {
    const submitError = this.model.submitError()
    return html`
      <form id="otp-import-review-form" class="review-form" @submit=${this.handleSubmit} novalidate>
        <div class="form-body">
          ${this.renderSummary()} ${this.renderTarget()}
          <cv-field ?invalid=${Boolean(this.model.labelError())} required>
            <span slot="label">${passmanagerI18n('otp:label')}</span>
            <input
              id="otp-import-label"
              autocomplete="off"
              .value=${this.model.otpDraft.label()}
              @input=${this.handleLabelInput}
            />
            <span slot="description">${passmanagerI18n('otp:label.placeholder')}</span>
            <span slot="error">${this.model.labelError()}</span>
          </cv-field>
          ${this.renderDuplicate()}
          ${submitError
            ? html`<div id="otp-import-alert" class="notice danger" role="alert" tabindex="-1">
                ${submitError}
              </div>`
            : nothing}
        </div>
      </form>
    `
  }

  protected override render(): TemplateResult {
    const visible = this.model.visible()
    const phase = this.model.phase()
    const submitError = this.model.submitError()
    return html`
      <cv-dialog
        .open=${visible}
        .closeOnEscape=${true}
        .closeOnOutsidePointer=${false}
        .closeOnOutsideFocus=${false}
        .initialFocusId=${phase === 'review'
          ? 'otp-import-target-existing'
          : phase === 'error'
            ? 'otp-import-alert'
            : ''}
        @cv-change=${this.handleDialogChange}
      >
        <span slot="title">${passmanagerI18n('otp:add')}</span>
        <span slot="description">${passmanagerI18n('otp:description')}</span>
        ${phase === 'review'
          ? this.renderReview()
          : phase === 'error'
            ? html`
                <div class="state">
                  <span class="state-icon" aria-hidden="true"><cv-icon name="circle-alert"></cv-icon></span>
                  <h3>${passmanagerI18n('import:error:title')}</h3>
                  <p id="otp-import-alert" role="alert" tabindex="-1">${submitError}</p>
                </div>
              `
            : this.renderWaiting(this.model.availability())}
        ${phase === 'review'
          ? html`
              <div class="footer" slot="footer">
                <cv-button type="button" variant="default" @click=${this.handleCancel}
                  >${passmanagerI18n('button:cancel')}</cv-button
                >
                <cv-button
                  type="button"
                  variant="primary"
                  ?disabled=${this.model.isSubmitting() || !this.model.canMutate()}
                  .loading=${this.model.isSubmitting()}
                  @click=${this.handleSave}
                >
                  ${passmanagerI18n('otp:save')}
                </cv-button>
              </div>
            `
          : html`
              <div class="footer" slot="footer">
                <cv-button variant="default" @click=${this.handleCancel}
                  >${passmanagerI18n('button:cancel')}</cv-button
                >
              </div>
            `}
      </cv-dialog>
    `
  }
}
