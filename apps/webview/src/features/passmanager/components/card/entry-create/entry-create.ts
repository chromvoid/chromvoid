import {html} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerRoot, isPassmanagerReadOnlyOrMissing} from 'root/features/passmanager/models/pm-root.adapter'
import {PMIconPicker} from '../../pm-icon-picker'
import {pmEntryTagsStyles} from '../entry-tags/entry-tags.styles'
import {PMEntryCreateBase} from './entry-create-base'
import {pmEntryCardStyles, pmEntryGenerateStyles} from './styles'

const pmEntryCreateBaseStyles = css`
  :host {
    display: block;
    container-type: inline-size;
    overflow-y: visible;
  }

  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      cv-input::part(input),
      cv-textarea::part(textarea),
      cv-select::part(trigger) {
        font-size: 16px;
      }
    }
  }

  cv-select {
    --cv-select-inline-size: 100%;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-3);
    padding: var(--cv-space-3);
    max-width: 860px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-2);
    padding: var(--cv-space-3);
    background: var(--cv-color-surface-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);

    &:focus-within {
      border-color: var(--cv-color-primary-border);
    }
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cv-color-text-muted);
    padding-bottom: calc(var(--cv-space-2) * 0.5);

    cv-icon {
      width: 13px;
      height: 13px;
      color: var(--cv-color-text-muted);
      opacity: 0.7;
    }
  }

  .field-cell {
    min-width: 0;
  }

  .entry-type-switch {
    display: inline-flex;
    gap: var(--cv-space-2);
    padding: var(--cv-space-1);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
  }

  .entry-type-option {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    --cv-button-gap: 0.5rem;
    min-height: 2.25rem;
    padding: 0 var(--cv-space-3);
    border: 0;
    border-radius: calc(var(--cv-radius-2) - 4px);
    background: transparent;
    color: var(--cv-color-text-muted);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .entry-type-option[data-active='true'] {
    background: var(--cv-color-primary);
    color: var(--cv-color-on-primary);
  }

  .card-grid {
    display: grid;
    gap: var(--cv-space-3);
    grid-template-columns: minmax(0, 1fr);
  }

  .create-header {
    display: grid;
    gap: 0.375rem;
    padding: var(--cv-space-2) 0;
  }

  .create-header-title {
    margin: 0;
    color: var(--cv-color-text);
    font-size: 1.75rem;
    line-height: 1.1;
    font-weight: 750;
  }

  .create-header-subtitle {
    margin: 0;
    color: var(--cv-color-text-muted);
    font-size: 0.9375rem;
  }

  .advanced-section {
    flex-direction: row;
    align-items: center;
    padding: calc(var(--cv-space-2) * 1.25) var(--cv-space-3);
    background: var(--cv-color-success-surface);
    border-color: var(--cv-color-success-border);
  }

  .switch-otp {
    margin: 0;
  }

  .otp-switch-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;

    cv-icon {
      width: 14px;
      height: 14px;
      color: var(--cv-color-success);
    }
  }

  .strength-bar {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    padding: 8px 2px 0;
    block-size: auto;
  }

  .strength-track {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: var(--cv-color-border-glass);
    overflow: hidden;
  }

  .strength-fill {
    height: 100%;
    border-radius: 2px;
    transition:
      width 0.3s ease,
      background 0.3s ease;
  }

  .strength-fill.strength-0 {
    width: 20%;
    background: var(--cv-color-danger);
  }

  .strength-fill.strength-1 {
    width: 40%;
    background: var(--pm-strength-color-1);
  }

  .strength-fill.strength-2 {
    width: 60%;
    background: var(--cv-color-warning);
  }

  .strength-fill.strength-3 {
    width: 80%;
    background: var(--pm-strength-color-3);
  }

  .strength-fill.strength-4 {
    width: 100%;
    background: var(--cv-color-success);
  }

  .strength-label {
    font-size: 0.625rem;
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  .strength-label.strength-0 {
    color: var(--cv-color-danger);
  }

  .strength-label.strength-1 {
    color: var(--pm-strength-color-1);
  }

  .strength-label.strength-2 {
    color: var(--cv-color-warning);
  }

  .strength-label.strength-3 {
    color: var(--pm-strength-color-3);
  }

  .strength-label.strength-4 {
    color: var(--cv-color-success);
  }

  @container (width >= 700px) {
    form {
      padding: var(--cv-space-4) var(--cv-space-6);
    }

    .section {
      padding: var(--cv-space-4);
    }
  }

  @container (width < 360px) {
    form {
      padding: var(--cv-space-2);
      gap: var(--cv-space-2);
    }

    .section {
      padding: calc(var(--cv-space-2) * 1.25);
      border-radius: var(--cv-radius-1);
    }

    .section-label {
      font-size: 0.625rem;
    }
  }
`

const pmEntryCreateDesktopStyles = css`
  .section-desktop-credentials,
  .section-desktop-notes {
    gap: var(--cv-space-3);
  }

  .title-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'label label'
      'avatar input';
    gap: 0.375rem var(--cv-space-3);
    align-items: end;
  }

  .title-field-label {
    grid-area: label;
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: 600;
    line-height: 1.2;
  }

  .avatar-picker {
    grid-area: avatar;
    position: relative;
    inline-size: 58px;
    block-size: 58px;
    align-self: end;
  }

  .title-row .field-cell {
    grid-area: input;
  }

  .title-input::part(form-control-label) {
    display: none;
  }

  pm-icon-picker {
    --pm-icon-picker-trigger-size: 58px;
    --pm-icon-picker-trigger-radius: var(--cv-radius-2);
    --pm-icon-picker-trigger-bg: var(--cv-color-primary-surface);
    --pm-icon-picker-trigger-border: var(--cv-color-primary-border-strong);
    --pm-icon-picker-trigger-hover-border: var(--cv-color-primary);
  }

  .avatar-edit-badge {
    position: absolute;
    inset-inline-end: -3px;
    inset-block-end: -3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 1.25rem;
    block-size: 1.25rem;
    border-radius: 50%;
    background: var(--cv-color-primary);
    color: var(--cv-color-bg);
    pointer-events: none;

    cv-icon {
      inline-size: 0.75rem;
      block-size: 0.75rem;
    }
  }

  .field-icon {
    inline-size: 1rem;
    block-size: 1rem;
  }

  .field-error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-xs);
  }

  .credentials-desktop-grid {
    display: grid;
    gap: var(--cv-space-3);
    grid-template-columns: minmax(0, 1fr);
  }

  .password-row {
    display: grid;
    gap: var(--cv-space-2);
    grid-template-areas:
      'action'
      'input'
      'strength';
  }

  .password-action-bar {
    grid-area: action;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .password-row > cv-input {
    grid-area: input;
  }

  .password-row > .strength-bar {
    grid-area: strength;
  }

  .section-desktop-notes .details-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .create-footer {
    position: sticky;
    inset-block-end: 0;
    z-index: 4;
    padding-block-start: var(--cv-space-2);
    background: var(--cv-color-bg);
  }

  .create-footer cv-button {
    --cv-button-background: var(--cv-color-primary-dark);
    --cv-button-background-hover: var(--cv-color-primary);
    --cv-button-background-active: var(--cv-color-primary-darker);
    --cv-button-border-color: var(--cv-color-primary-border-strong);
    --cv-button-border-color-hover: var(--cv-color-primary-border-strong);
    --cv-button-border-color-active: var(--cv-color-primary-border-strong);
    --cv-button-text-color: var(--cv-color-on-primary);
    --cv-button-text-color-hover: var(--cv-color-on-primary);
    --cv-button-text-color-active: var(--cv-color-on-primary);
    --cv-button-focus-ring-color: var(--cv-color-primary-ring);
    inline-size: 100%;
  }

  .create-footer cv-button::part(base) {
    --cv-button-background: var(--cv-color-primary-dark);
    --cv-button-background-hover: var(--cv-color-primary);
    --cv-button-background-active: var(--cv-color-primary-darker);
    --cv-button-border-color: var(--cv-color-primary-border-strong);
    --cv-button-border-color-hover: var(--cv-color-primary-border-strong);
    --cv-button-border-color-active: var(--cv-color-primary-border-strong);
    --cv-button-text-color: var(--cv-color-on-primary);
    --cv-button-text-color-hover: var(--cv-color-on-primary);
    --cv-button-text-color-active: var(--cv-color-on-primary);
    min-block-size: 3.25rem;
    border: 1px solid var(--cv-color-primary-border-strong);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-primary-dark);
    color: var(--cv-color-on-primary);
    box-shadow:
      var(--cv-shadow-sm),
      0 0 24px var(--cv-color-primary-ring);
    font-weight: var(--cv-font-weight-semibold);
    justify-content: space-between;
    padding-inline: var(--cv-space-4);
  }

  .create-footer cv-button[disabled]::part(base) {
    filter: saturate(0.5);
    box-shadow: none;
  }

  @container (width >= 520px) {
    .credentials-desktop-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .password-row {
      grid-column: 1 / -1;
    }
  }
`

export class PMEntryCreateDesktop extends PMEntryCreateBase {
  static define() {
    if (!customElements.get('pm-entry-create-desktop')) {
      customElements.define('pm-entry-create-desktop', this)
    }
    PMIconPicker.define()
  }

  static styles = [pmEntryCardStyles, pmEntryGenerateStyles, pmEntryTagsStyles, pmEntryCreateBaseStyles, pmEntryCreateDesktopStyles]

  private renderTypeSwitch(): TemplateResult {
    const entryType = this.model.entryType()

    return html`
      <div class="section">
        <div class="section-label">
          <cv-icon name="grid"></cv-icon>
          ${i18n('entry:type')}
        </div>
        <div class="entry-type-switch" role="tablist" aria-label=${i18n('entry:type')}>
          <cv-button unstyled
            class="entry-type-option"
            type="button"
            data-active=${String(entryType === 'login')}
            @click=${this.selectLoginEntryType}
          >
            <cv-icon slot="prefix" name="person-circle"></cv-icon>
            <span>${i18n('entry:type:login')}</span>
          </cv-button>
          <cv-button unstyled
            class="entry-type-option"
            type="button"
            data-active=${String(entryType === 'payment_card')}
            @click=${this.selectPaymentCardEntryType}
          >
            <cv-icon slot="prefix" name="credit-card"></cv-icon>
            <span>${i18n('entry:type:payment_card')}</span>
          </cv-button>
        </div>
      </div>
    `
  }

  private renderStrengthBar(): TemplateResult | typeof nothing {
    if (this.model.passwordStrengthScore() === null) {
      return nothing
    }

    const score = this.model.passwordStrengthScore()!
    return html`<div class="strength-bar">
      <div class="strength-track">
        <div class="strength-fill strength-${score}"></div>
      </div>
      <span class="strength-label strength-${score}">${this.model.passwordStrengthLabel()}</span>
    </div>`
  }

  private renderOtp(): TemplateResult | typeof nothing {
    if (!this.model.useOtp()) {
      return nothing
    }

    return html`<pm-entry-otp-create short .model=${this.model.otp}></pm-entry-otp-create>`
  }

  private renderHeader(): TemplateResult {
    const isCard = this.model.entryType() === 'payment_card'

    return html`
      <div class="create-header">
        <h1 class="create-header-title">
          ${isCard ? i18n('entry:create-card-title') : i18n('entry:create-login-title')}
        </h1>
        <p class="create-header-subtitle">
          ${isCard ? i18n('entry:create-card-subtitle') : i18n('entry:create-login-subtitle')}
        </p>
      </div>
    `
  }

  private renderPaymentCardSection(): TemplateResult {
    const cardholderNameError = this.model.cardholderNameError()
    const cardNumberError = this.model.cardNumberError()
    const cardExpMonthError = this.model.cardExpMonthError()
    const cardExpYearError = this.model.cardExpYearError()

    return html`
      <div class="section section-desktop-credentials">
        <div class="section-label">
          <cv-icon name="credit-card"></cv-icon>
          ${i18n('entry:type:payment_card')}
        </div>
        <div class="card-grid">
          <div class="field-cell">
            <cv-input
              type="text"
              size="small"
              name="cardholderName"
              .value=${this.model.cardholderName()}
              @cv-input=${this.onCardholderInput}
              ?invalid=${Boolean(cardholderNameError)}
            >
              <span slot="label">${i18n('payment-card:cardholder')}</span>
              ${cardholderNameError
                ? html`<span slot="help-text" class="field-error">${cardholderNameError}</span>`
                : nothing}
            </cv-input>
          </div>
          <div class="field-cell">
            <cv-input
              type="text"
              size="small"
              name="cardNumber"
              .value=${this.model.cardNumber()}
              @cv-input=${this.onCardNumberInput}
              ?invalid=${Boolean(cardNumberError)}
            >
              <span slot="label">${i18n('payment-card:number')}</span>
              ${cardNumberError ? html`<span slot="help-text" class="field-error">${cardNumberError}</span>` : nothing}
            </cv-input>
          </div>
          <div class="field-cell">
            <cv-input
              type="text"
              size="small"
              name="cardExpMonth"
              .value=${this.model.cardExpMonth()}
              @cv-input=${this.onCardExpMonthInput}
              ?invalid=${Boolean(cardExpMonthError)}
            >
              <span slot="label">${i18n('payment-card:exp-month')}</span>
              ${cardExpMonthError
                ? html`<span slot="help-text" class="field-error">${cardExpMonthError}</span>`
                : nothing}
            </cv-input>
          </div>
          <div class="field-cell">
            <cv-input
              type="text"
              size="small"
              name="cardExpYear"
              .value=${this.model.cardExpYear()}
              @cv-input=${this.onCardExpYearInput}
              ?invalid=${Boolean(cardExpYearError)}
            >
              <span slot="label">${i18n('payment-card:exp-year')}</span>
              ${cardExpYearError
                ? html`<span slot="help-text" class="field-error">${cardExpYearError}</span>`
                : nothing}
            </cv-input>
          </div>
          <div class="field-cell">
            <cv-input
              type="text"
              size="small"
              name="cardCvv"
              .value=${this.model.cardCvv()}
              @cv-input=${this.onCardCvvInput}
            >
              <span slot="label">CVV</span>
            </cv-input>
          </div>
        </div>
      </div>
    `
  }

  private renderTitleSection(): TemplateResult {
    const entryType = this.model.entryType()
    const titleError = this.model.titleError()
    const websiteError = this.model.websiteError()

    return html`
      <div class="section section-desktop-details">
        <div class="section-label">
          <cv-icon name="grid"></cv-icon>
          ${i18n('entry:details')}
        </div>
        <div class="details-grid">
          <div class="title-row">
            <label class="title-field-label" for="entry-create-title">${i18n('title')}</label>
            <div class="avatar-picker">
              <pm-icon-picker
                .iconRef=${this.model.avatarId()}
                .icon=${entryType === 'payment_card' ? 'credit-card' : 'person-circle'}
                @pm-icon-change=${this.onIconChange}
              ></pm-icon-picker>
              <span class="avatar-edit-badge"><cv-icon name="pencil"></cv-icon></span>
            </div>
            <div class="field-cell">
              <cv-input
                id="entry-create-title"
                class="title-input"
                type="text"
                size="small"
                name="title"
                required
                autocomplete="card-title"
                placeholder=${i18n('title:placeholder')}
                .value=${this.model.title()}
                @cv-input=${this.onTitleInput}
                ?invalid=${Boolean(titleError)}
              >
                ${titleError ? html`<span slot="help-text" class="field-error">${titleError}</span>` : nothing}
              </cv-input>
            </div>
          </div>
          ${entryType === 'login'
            ? html`
                <div class="field-cell">
                  <cv-input
                    id="urls"
                    type="text"
                    size="small"
                    name="urls"
                    autocomplete="url"
                    placeholder=${i18n('website:placeholder')}
                    .value=${this.model.website()}
                    @cv-input=${this.onUrlsInput}
                    ?invalid=${Boolean(websiteError)}
                  >
                    <span slot="label">${i18n('website:title')}</span>
                    <cv-icon slot="prefix" class="field-icon" name="globe"></cv-icon>
                    ${websiteError ? html`<span slot="help-text" class="field-error">${websiteError}</span>` : nothing}
                  </cv-input>
                </div>
              `
            : nothing}
        </div>
      </div>
    `
  }

  private renderCredentialsSection(): TemplateResult {
    const usernameError = this.model.usernameError()
    const passwordError = this.model.passwordError()

    return html`
      <div class="section section-desktop-credentials">
        <div class="section-label">
          <cv-icon name="shield-lock"></cv-icon>
          ${i18n('entry:credentials')}
        </div>
        <div class="credentials-desktop-grid">
          <div class="field-cell">
            <cv-input
              type="text"
              size="small"
              name="username"
              autocomplete="username"
              placeholder=${i18n('username:placeholder')}
              .value=${this.model.username()}
              @cv-input=${this.onUsernameInput}
              ?invalid=${Boolean(usernameError)}
            >
              <span slot="label">${i18n('username')}</span>
              <cv-icon slot="prefix" class="field-icon" name="person-circle"></cv-icon>
              ${usernameError ? html`<span slot="help-text" class="field-error">${usernameError}</span>` : nothing}
            </cv-input>
          </div>
          <div class="field-cell password-row">
            <div class="password-action-bar">
              <cv-button
                class="desktop-generate-button"
                type="button"
                variant="primary"
                size="small"
                @click=${this.generate}
                title=${i18n('button:generate')}
              >
                <cv-icon slot="prefix" name="arrow-repeat"></cv-icon>
                <span>${i18n('button:generate')}</span>
              </cv-button>
            </div>
            <cv-input
              id="password"
              type="password"
              size="small"
              name="password"
              autocomplete="password"
              placeholder=${i18n('password:placeholder')}
              password-toggle
              .value=${this.model.password()}
              @cv-input=${this.onPasswordInput}
              ?editing=${this.model.isEditingPassword()}
              ?invalid=${Boolean(passwordError)}
            >
              <span slot="label">${i18n('password')}</span>
              <cv-icon slot="prefix" class="field-icon" name="lock"></cv-icon>
              ${passwordError ? html`<span slot="help-text" class="field-error">${passwordError}</span>` : nothing}
            </cv-input>
            ${this.renderStrengthBar()}
          </div>
        </div>
      </div>
    `
  }

  private renderSubmitSection(): TemplateResult | typeof nothing {
    return nothing
  }

  private renderDetailsSection(): TemplateResult {
    return html`
      <div class="section section-desktop-notes">
        <div class="section-label">
          <cv-icon name="globe"></cv-icon>
          ${i18n('entry:additional_information')}
        </div>
        <div class="details-grid">
          <div class="field-cell note-cell">
            <cv-textarea
              size="small"
              name="note"
              placeholder=${i18n('note:placeholder')}
              rows="4"
              .value=${this.model.note()}
              @cv-input=${this.onNoteInput}
            >
              <span slot="label">${i18n('note:title')}</span>
            </cv-textarea>
          </div>
        </div>
      </div>
    `
  }

  private renderTagsSection(): TemplateResult {
    return html`
      <div class="section section-desktop-tags">
        <div class="section-label">
          <cv-icon name="tag"></cv-icon>
          ${i18n('tags:title')}
        </div>
        ${this.renderTagsEditor()}
      </div>
    `
  }

  private renderAdvancedSection(): TemplateResult {
    return html`
      <div class="section advanced-section">
        <cv-switch
          size="small"
          @cv-change=${this.changeSwitch}
          class="switch-otp"
          ?checked=${this.model.useOtp()}
        >
          <div class="otp-switch-label">
            <cv-icon name="shield-check"></cv-icon>
            <span>${i18n('otp:use')}</span>
          </div>
        </cv-switch>
        ${this.renderOtp()}
      </div>
    `
  }

  private renderSshSection(): TemplateResult {
    return html`
      <div class="section advanced-section">
        <cv-switch
          size="small"
          @cv-change=${this.onSshSwitchChange}
          class="switch-otp"
          ?checked=${this.model.useSsh()}
        >
          <div class="otp-switch-label">
            <cv-icon name="key"></cv-icon>
            <span>${i18n('ssh:title')}</span>
          </div>
        </cv-switch>
        ${this.model.showSshGenerator()
          ? html`
              <pm-entry-ssh-generator
                radio-group="ssh-key-type-create"
                hide-generate-when-result
                .keyType=${this.model.sshGenKeyType()}
                .comment=${this.model.sshGenComment()}
                .generating=${this.model.sshGenerating()}
                .result=${this.model.sshGenResult()}
                @pm-entry-ssh-key-type-change=${this.onSshKeyTypeChange}
                @pm-entry-ssh-comment-input=${this.onSshGenCommentInput}
                @pm-entry-ssh-generate=${this.onSshGenerateRequest}
              ></pm-entry-ssh-generator>
            `
          : nothing}
      </div>
    `
  }

  private renderFormFooter(): TemplateResult | typeof nothing {
    const disabled = isPassmanagerReadOnlyOrMissing() || this.model.isSubmitting()

    return html`
      <footer class="create-footer">
        <cv-button .disabled=${disabled} .loading=${this.model.isSubmitting()} size="large" variant="primary" type="submit">
          <cv-icon slot="prefix" name="shield-check"></cv-icon>
          <span>${this.model.isSubmitting() ? i18n('entry:creating') : i18n('button:create_entry')}</span>
          <cv-icon slot="suffix" name="chevron-right"></cv-icon>
        </cv-button>
      </footer>
    `
  }

  private renderFormBody(): TemplateResult {
    const entryType = this.model.entryType()

    return html`
      ${this.renderHeader()} ${this.renderTypeSwitch()} ${this.renderTitleSection()}
      ${entryType === 'payment_card'
        ? html`${this.renderPaymentCardSection()} ${this.renderTagsSection()}`
        : html`
            ${this.renderCredentialsSection()}
            ${this.renderTagsSection()}
            ${this.renderAdvancedSection()}
            ${this.renderSshSection()}
            ${this.renderDetailsSection()}
          `}
      ${this.renderSubmitSection()} ${this.renderFormFooter()}
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (!getPassmanagerRoot()) {
      return nothing
    }

    return html`
      <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
        <form @submit=${this.onSubmit}>${this.renderFormBody()}</form>
      </cv-guidance-anchor>
    `
  }
}
