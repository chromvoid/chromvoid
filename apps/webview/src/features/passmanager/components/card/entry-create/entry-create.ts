import type {CVSelectChangeEvent} from '@chromvoid/uikit/components/cv-select'
import {html} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {
  getPassmanagerRoot,
  isPassmanagerReadOnlyOrMissing,
} from 'root/features/passmanager/models/pm-root.adapter'
import {pmEntryTagsStyles} from '../entry-tags/entry-tags.styles'
import {PMEntryWebsiteEditor} from '../entry-website-editor'
import {PMWorkspaceHeader} from '../pm-workspace-header'
import {PMEntryCreateBase} from './entry-create-base'
import {pmEntryCardStyles} from './styles'

const pmEntryCreateDesktopStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
    container-type: inline-size;
  }

  form {
    display: grid;
    align-content: start;
    gap: var(--cv-space-3);
    inline-size: min(100%, 1080px);
    min-inline-size: 0;
    margin-inline: auto;
    padding: 4px 8px var(--cv-space-6);
    color: var(--cv-color-text);
  }

  cv-input,
  cv-textarea,
  cv-select {
    inline-size: 100%;
  }

  cv-select {
    --cv-select-inline-size: 100%;
  }

  pm-workspace-header {
    --pm-workspace-header-avatar-fallback-background: var(--cv-color-surface);
    --pm-workspace-header-avatar-fallback-color: var(--cv-color-text-strong);
  }

  .create-action::part(base) {
    min-block-size: 44px;
    padding-inline: var(--cv-space-4);
    font-weight: var(--cv-font-weight-semibold);
  }

  .workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
    gap: var(--cv-space-4);
    align-items: start;
    min-inline-size: 0;
  }

  .main-column,
  .configuration-rail {
    display: grid;
    align-content: start;
    gap: var(--cv-space-3);
    min-inline-size: 0;
  }

  .primary-surface,
  .configuration-surface,
  .otp-surface {
    min-inline-size: 0;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface);
  }

  .primary-surface {
    display: grid;
    gap: var(--cv-space-5);
    padding: var(--cv-space-5);
    container: entry-create-main / inline-size;
  }

  .configuration-surface {
    display: grid;
    gap: 0;
    padding: 0 var(--cv-space-4);
  }

  .otp-surface {
    display: grid;
    gap: var(--cv-space-3);
    padding: var(--cv-space-4);
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--cv-space-3);
    min-inline-size: 0;
  }

  .section-heading-icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    inline-size: 36px;
    block-size: 36px;
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-text-muted);
    background: var(--cv-color-surface-2);
  }

  .section-heading-icon cv-icon {
    inline-size: 17px;
    block-size: 17px;
  }

  .section-heading-copy {
    display: grid;
    gap: 3px;
    min-inline-size: 0;
  }

  .section-heading h2,
  .rail-heading,
  .rail-switch-title {
    margin: 0;
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.3;
  }

  .section-heading p,
  .rail-switch-description {
    margin: 0;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
  }

  .credentials-grid,
  .card-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cv-space-3);
    min-inline-size: 0;
  }

  .field-cell {
    min-inline-size: 0;
  }

  .primary-surface cv-field > [slot='label'] {
    color: var(--cv-color-text-secondary);
    font-weight: var(--cv-font-weight-medium);
  }

  .primary-surface cv-input {
    --cv-input-border-radius: var(--cv-radius-2);
    --cv-input-border-color: var(--cv-color-border-muted);
    --cv-input-background: var(--cv-color-surface-2);
    --cv-input-placeholder-color: var(--cv-color-text-subtle);
  }

  .primary-surface cv-textarea {
    --cv-textarea-border-radius: var(--cv-radius-2);
    --cv-textarea-border-color: var(--cv-color-border-muted);
    --cv-textarea-background: var(--cv-color-surface-2);
    --cv-textarea-placeholder-color: var(--cv-color-text-subtle);
  }

  .field-icon {
    inline-size: 1rem;
    block-size: 1rem;
  }

  .field-error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-xs);
  }

  .password-input::part(base) {
    padding-inline-end: 0;
  }

  .password-input::part(suffix) {
    align-self: stretch;
  }

  .password-suffix {
    display: grid;
    place-items: center;
    block-size: 100%;
    border-inline-start: 1px solid var(--cv-color-border-faint);
  }

  .generate-button {
    inline-size: 46px;
    block-size: 100%;
    min-block-size: 36px;
    color: var(--cv-color-primary);
  }

  .strength {
    display: grid;
    gap: var(--cv-space-1);
    margin-block-start: var(--cv-space-2);
  }

  .strength-copy {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
  }

  .strength-segments {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 3px;
  }

  .strength-segments span {
    block-size: 3px;
    border-radius: 999px;
    background: var(--cv-color-border-muted);
  }

  .strength-segments span[data-active='true'] {
    background: var(--cv-color-primary);
  }

  .content-divider {
    block-size: 1px;
    background: var(--cv-color-border-faint);
  }

  .note-field cv-textarea::part(textarea) {
    min-block-size: 88px;
  }

  .rail-section {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
    padding: var(--cv-space-4) 0;
  }

  .rail-section + .rail-section {
    border-block-start: 1px solid var(--cv-color-border-faint);
  }

  .configuration-surface cv-select {
    --cv-select-border-radius: var(--cv-radius-2);
    --cv-select-background: var(--cv-color-surface-2);
  }

  .configuration-surface .entry-tags-combobox {
    --cv-combobox-min-height: 40px;
    --cv-combobox-border-color: var(--cv-color-border-muted);
    --cv-combobox-border-radius: var(--cv-radius-2);
    --cv-combobox-background: var(--cv-color-surface-2);
  }

  .configuration-surface .entry-tags-combobox::part(input-wrapper) {
    border-color: var(--cv-color-border-muted);
    background: var(--cv-color-surface-2);
  }

  .configuration-surface .entry-tags-combobox::part(input),
  .configuration-surface .entry-tags-combobox::part(trigger) {
    min-block-size: 40px;
  }

  .configuration-surface .entry-tags-combobox::part(label) {
    color: var(--cv-color-text-subtle);
  }

  .configuration-surface .entry-tags-manage::part(base) {
    min-block-size: 40px;
    border-color: var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
  }

  .entry-type-switch {
    display: block;
    inline-size: 100%;
    --cv-radio-group-gap: var(--cv-space-1);
  }

  .entry-type-switch::part(base) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    gap: var(--cv-space-1);
    padding: var(--cv-space-1);
    border-color: var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
  }

  .entry-type-option {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    block-size: 40px;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
  }

  .entry-type-option::part(base) {
    box-sizing: border-box;
    justify-content: center;
    inline-size: 100%;
    gap: var(--cv-space-1);
    block-size: 100%;
    padding-inline: var(--cv-space-2);
    border: 1px solid transparent;
    border-radius: calc(var(--cv-radius-2) - 4px);
    background: transparent;
  }

  .entry-type-option[checked] {
    color: var(--cv-color-text-strong);
  }

  .entry-type-option[checked]::part(base) {
    border-color: var(--cv-color-primary-border);
    color: inherit;
    background: var(--cv-color-primary-surface-strong);
  }

  .entry-type-option cv-icon {
    inline-size: 15px;
    block-size: 15px;
  }

  .rail-switch-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-3);
  }

  .rail-switch-copy {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .rail-switch-title {
    display: flex;
    align-items: center;
    gap: var(--cv-space-1);
  }

  .rail-switch-title cv-icon {
    inline-size: 14px;
    block-size: 14px;
    color: var(--cv-color-text-subtle);
  }

  .rail-otp-section[data-enabled='true'] .rail-switch-title cv-icon {
    color: var(--cv-color-primary);
  }

  @container entry-create-main (width >= 560px) {
    .credentials-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .card-holder-field,
    .card-number-field {
      grid-column: 1 / -1;
    }
  }

  @container (width < 840px) {
    .workbench {
      grid-template-columns: minmax(0, 1fr);
    }

    .configuration-surface {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 var(--cv-space-4);
    }

    .rail-section + .rail-section {
      border-block-start: 0;
    }

    .rail-section:nth-child(n + 3) {
      border-block-start: 1px solid var(--cv-color-border-faint);
    }
  }

  @container (width < 600px) {
    form {
      padding-inline: var(--cv-space-2);
    }

    .configuration-surface {
      grid-template-columns: minmax(0, 1fr);
    }

    .rail-section + .rail-section,
    .rail-section:nth-child(n + 3) {
      border-block-start: 1px solid var(--cv-color-border-faint);
    }
  }
`

export class PMEntryCreateDesktop extends PMEntryCreateBase {
  static define() {
    if (!customElements.get('pm-entry-create-desktop')) {
      customElements.define('pm-entry-create-desktop', this)
    }
    PMEntryWebsiteEditor.define()
    PMWorkspaceHeader.define()
  }

  static styles = [pmEntryCardStyles, pmEntryTagsStyles, pmEntryCreateDesktopStyles]

  private onWorkspaceHeaderTitleInput(event: CustomEvent<{value: string}>): void {
    this.model.setTitle(event.detail.value)
  }

  private onLocationChange(event: CVSelectChangeEvent): void {
    if (event.detail.value) this.model.setTargetGroupId(event.detail.value)
  }

  private renderWorkspaceHeader(): TemplateResult {
    const isCard = this.model.entryType() === 'payment_card'
    const disabled = isPassmanagerReadOnlyOrMissing() || this.model.isSubmitting()

    return html`
      <pm-workspace-header
        .density=${'compact'}
        .title=${this.model.title()}
        .titleError=${this.model.titleError()}
        .titlePlaceholder=${i18n('title:placeholder')}
        .supportText=${isCard ? i18n('entry:create-card-subtitle') : i18n('entry:create-login-subtitle')}
        .avatarIcon=${isCard ? 'credit-card' : 'person-circle'}
        .avatarIconRef=${this.model.avatarId()}
        .editableTitle=${true}
        .avatarInteractive=${true}
        @pm-workspace-header-title-input=${this.onWorkspaceHeaderTitleInput}
        @pm-icon-change=${this.onIconChange}
      >
        <cv-button
          slot="actions"
          class="create-action"
          data-create-entry-submit
          type="submit"
          variant="primary"
          preset="action-primary"
          size="large"
          .disabled=${disabled}
          .loading=${this.model.isSubmitting()}
        >
          <cv-icon slot="prefix" name="shield-check"></cv-icon>
          ${this.model.isSubmitting() ? i18n('entry:creating') : i18n('button:create_entry')}
        </cv-button>
      </pm-workspace-header>
    `
  }

  private renderSectionHeading(icon: string, title: string, description?: string): TemplateResult {
    return html`
      <header class="section-heading">
        <span class="section-heading-icon" aria-hidden="true"><cv-icon name=${icon}></cv-icon></span>
        <span class="section-heading-copy">
          <h2>${title}</h2>
          ${description ? html`<p>${description}</p>` : nothing}
        </span>
      </header>
    `
  }

  private renderStrength(): TemplateResult | typeof nothing {
    const score = this.model.passwordStrengthScore()
    if (score === null) return nothing

    const label = this.model.passwordStrengthLabel()
    return html`
      <div class="strength" aria-label=${i18n('password:strength', {label})}>
        <span class="strength-copy">${i18n('password:strength', {label})}</span>
        <span class="strength-segments" aria-hidden="true">
          ${[0, 1, 2, 3, 4].map((index) => html`<span data-active=${String(index <= score)}></span>`)}
        </span>
      </div>
    `
  }

  private renderCredentials(): TemplateResult {
    const usernameError = this.model.usernameError()
    const passwordError = this.model.passwordError()

    return html`
      <div class="credentials-grid">
        <div class="field-cell">
          <cv-field ?invalid=${Boolean(usernameError)}>
            <span slot="label">${i18n('username')}</span>
            <cv-input
              type="text"
              size="large"
              name="username"
              autocomplete="username"
              placeholder=${i18n('username:placeholder')}
              .value=${this.model.username()}
              @cv-input=${this.onUsernameInput}
              @blur=${this.onUsernameBlur}
              ?invalid=${Boolean(usernameError)}
            >
              <cv-icon slot="prefix" class="field-icon" name="person-circle"></cv-icon>
            </cv-input>
            ${usernameError ? html`<span slot="error" class="field-error">${usernameError}</span>` : nothing}
          </cv-field>
        </div>
        <div class="field-cell">
          <cv-field ?invalid=${Boolean(passwordError)} required>
            <span slot="label">${i18n('password')}</span>
            <cv-input
              id="password"
              class="password-input"
              type="password"
              size="large"
              name="password"
              autocomplete="new-password"
              placeholder=${i18n('password:placeholder')}
              password-toggle
              required
              .value=${this.model.password()}
              @cv-input=${this.onPasswordInput}
              @blur=${this.onPasswordBlur}
              ?editing=${this.model.isEditingPassword()}
              ?invalid=${Boolean(passwordError)}
            >
              <cv-icon slot="prefix" class="field-icon" name="lock"></cv-icon>
              <span slot="suffix" class="password-suffix">
                <cv-button
                  class="generate-button"
                  unstyled
                  type="button"
                  title=${i18n('button:generate')}
                  aria-label=${i18n('button:generate')}
                  @click=${this.generate}
                >
                  <cv-icon name="arrow-repeat" aria-hidden="true"></cv-icon>
                </cv-button>
              </span>
            </cv-input>
            ${passwordError ? html`<span slot="error" class="field-error">${passwordError}</span>` : nothing}
            ${this.renderStrength()}
          </cv-field>
        </div>
      </div>
    `
  }

  private renderPaymentCardFields(): TemplateResult {
    const cardholderNameError = this.model.cardholderNameError()
    const cardNumberError = this.model.cardNumberError()
    const cardExpMonthError = this.model.cardExpMonthError()
    const cardExpYearError = this.model.cardExpYearError()

    return html`
      <div class="card-grid">
        <div class="field-cell card-holder-field">
          <cv-field ?invalid=${Boolean(cardholderNameError)} required>
            <span slot="label">${i18n('payment-card:cardholder')}</span>
            <cv-input
              type="text"
              size="large"
              name="cardholderName"
              autocomplete="cc-name"
              required
              .value=${this.model.cardholderName()}
              @cv-input=${this.onCardholderInput}
              @blur=${this.onCardholderBlur}
              ?invalid=${Boolean(cardholderNameError)}
            ></cv-input>
            ${cardholderNameError
              ? html`<span slot="error" class="field-error">${cardholderNameError}</span>`
              : nothing}
          </cv-field>
        </div>
        <div class="field-cell card-number-field">
          <cv-field ?invalid=${Boolean(cardNumberError)} required>
            <span slot="label">${i18n('payment-card:number')}</span>
            <cv-input
              type="text"
              size="large"
              name="cardNumber"
              inputmode="numeric"
              autocomplete="cc-number"
              required
              .value=${this.model.cardNumber()}
              @cv-input=${this.onCardNumberInput}
              @blur=${this.onCardNumberBlur}
              ?invalid=${Boolean(cardNumberError)}
            ></cv-input>
            ${cardNumberError
              ? html`<span slot="error" class="field-error">${cardNumberError}</span>`
              : nothing}
          </cv-field>
        </div>
        <div class="field-cell">
          <cv-field ?invalid=${Boolean(cardExpMonthError)} required>
            <span slot="label">${i18n('payment-card:exp-month')}</span>
            <cv-input
              type="text"
              size="large"
              name="cardExpMonth"
              inputmode="numeric"
              autocomplete="cc-exp-month"
              required
              .value=${this.model.cardExpMonth()}
              @cv-input=${this.onCardExpMonthInput}
              @blur=${this.onCardExpMonthBlur}
              ?invalid=${Boolean(cardExpMonthError)}
            ></cv-input>
            ${cardExpMonthError
              ? html`<span slot="error" class="field-error">${cardExpMonthError}</span>`
              : nothing}
          </cv-field>
        </div>
        <div class="field-cell">
          <cv-field ?invalid=${Boolean(cardExpYearError)} required>
            <span slot="label">${i18n('payment-card:exp-year')}</span>
            <cv-input
              type="text"
              size="large"
              name="cardExpYear"
              placeholder="YY"
              inputmode="numeric"
              maxlength=${2}
              autocomplete="cc-exp-year"
              required
              .value=${this.model.cardExpYear()}
              @cv-input=${this.onCardExpYearInput}
              @blur=${this.onCardExpYearBlur}
              ?invalid=${Boolean(cardExpYearError)}
            ></cv-input>
            ${cardExpYearError
              ? html`<span slot="error" class="field-error">${cardExpYearError}</span>`
              : nothing}
          </cv-field>
        </div>
        <div class="field-cell">
          <cv-field>
            <span slot="label">CVV</span>
            <cv-input
              type="text"
              size="large"
              name="cardCvv"
              inputmode="numeric"
              autocomplete="cc-csc"
              .value=${this.model.cardCvv()}
              @cv-input=${this.onCardCvvInput}
            ></cv-input>
          </cv-field>
        </div>
      </div>
    `
  }

  private renderPrimarySurface(): TemplateResult {
    const isCard = this.model.entryType() === 'payment_card'

    return html`
      <section class="primary-surface" aria-label=${i18n('entry:details')}>
        ${this.renderSectionHeading(
          isCard ? 'credit-card' : 'shield-lock',
          isCard ? i18n('entry:type:payment_card') : i18n('entry:credentials'),
        )}
        ${isCard
          ? this.renderPaymentCardFields()
          : html`
              ${this.renderCredentials()}
              <div class="content-divider"></div>
              <pm-entry-website-editor
                .model=${this.model.websiteEditor}
                .controlSize=${'large'}
              ></pm-entry-website-editor>
              <div class="content-divider"></div>
              <div class="note-field">
                <cv-field>
                  <span slot="label">${i18n('note:title')}</span>
                  <cv-textarea
                    size="medium"
                    name="note"
                    placeholder=${i18n('note:placeholder')}
                    rows="3"
                    .value=${this.model.note()}
                    @cv-input=${this.onNoteInput}
                  ></cv-textarea>
                </cv-field>
              </div>
            `}
      </section>
    `
  }

  private renderTypeSection(): TemplateResult {
    return html`
      <section class="rail-section rail-type-section" aria-labelledby="entry-create-type-heading">
        <h2 id="entry-create-type-heading" class="rail-heading">${i18n('entry:type')}</h2>
        <cv-radio-group
          class="entry-type-switch"
          variant="segmented"
          .value=${this.model.entryType()}
          aria-label=${i18n('entry:type')}
          @cv-change=${this.onEntryTypeChange}
        >
          <cv-radio class="entry-type-option" value="login">
            <cv-icon name="person-circle"></cv-icon>
            <span>${i18n('entry:type:login')}</span>
          </cv-radio>
          <cv-radio class="entry-type-option" value="payment_card">
            <cv-icon name="credit-card"></cv-icon>
            <span>${i18n('entry:type:payment_card')}</span>
          </cv-radio>
        </cv-radio-group>
      </section>
    `
  }

  private renderLocationSection(): TemplateResult {
    const error = this.model.targetGroupError()
    const selectedId = this.model.targetGroupId() ?? ''

    return html`
      <section class="rail-section rail-location-section">
        <cv-field ?invalid=${Boolean(error)} required>
          <span slot="label">${i18n('entry:create:location' as never)}</span>
          <cv-select
            size="large"
            required
            .value=${selectedId}
            aria-label=${i18n('entry:create:location' as never)}
            ?invalid=${Boolean(error)}
            @cv-change=${this.onLocationChange}
          >
            ${this.model
              .targetGroupOptions()
              .map(
                (option) => html`<cv-select-option .value=${option.id}>${option.label}</cv-select-option>`,
              )}
          </cv-select>
          ${error ? html`<span slot="error" class="field-error">${error}</span>` : nothing}
        </cv-field>
      </section>
    `
  }

  private renderTagsSection(): TemplateResult {
    return html`
      <section class="rail-section rail-tags-section" aria-labelledby="entry-create-tags-heading">
        <h2 id="entry-create-tags-heading" class="rail-heading">${i18n('tags:title')}</h2>
        ${this.renderTagsEditor()}
      </section>
    `
  }

  private renderOtpSection(): TemplateResult | typeof nothing {
    if (this.model.entryType() !== 'login') return nothing

    return html`
      <section class="rail-section rail-otp-section" data-enabled=${String(this.model.useOtp())}>
        <div class="rail-switch-row">
          <span class="rail-switch-copy">
            <span class="rail-switch-title">
              <cv-icon name="shield-check" aria-hidden="true"></cv-icon>
              ${i18n('otp:use')}
            </span>
            <span class="rail-switch-description">${i18n('otp:description')}</span>
          </span>
          <cv-switch
            aria-label=${i18n('otp:use')}
            ?checked=${this.model.useOtp()}
            @cv-change=${this.changeSwitch}
          ></cv-switch>
        </div>
      </section>
    `
  }

  private renderConfigurationRail(): TemplateResult {
    return html`
      <aside class="configuration-rail" aria-label=${i18n('entry:details')}>
        <div class="configuration-surface">
          ${this.renderTypeSection()} ${this.renderLocationSection()} ${this.renderTagsSection()}
          ${this.renderOtpSection()}
        </div>
      </aside>
    `
  }

  private renderOtpEditor(): TemplateResult | typeof nothing {
    if (this.model.entryType() !== 'login' || !this.model.useOtp()) return nothing

    return html`
      <section class="otp-surface" aria-label=${i18n('otp:use')}>
        ${this.renderSectionHeading('shield-check', i18n('otp:use'), i18n('otp:description'))}
        <pm-entry-otp-create short .model=${this.model.otp}></pm-entry-otp-create>
      </section>
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (!getPassmanagerRoot()) return nothing

    return html`
      <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
        <form novalidate @submit=${this.onSubmit}>
          ${this.renderWorkspaceHeader()}
          <div class="workbench">
            <main class="main-column">${this.renderPrimarySurface()} ${this.renderOtpEditor()}</main>
            ${this.renderConfigurationRail()}
          </div>
        </form>
      </cv-guidance-anchor>
    `
  }
}
