import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {css, nothing, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import type {NavigationBlockerIntent} from 'root/app/navigation/navigation.types'
import {
  getPassmanagerRoot,
  isPassmanagerReadOnlyOrMissing,
} from 'root/features/passmanager/models/pm-root.adapter'
import {markMobileKeyboardProgrammaticScroll} from 'root/shared/services/mobile-keyboard-scroll-intent'
import {transientBackModel} from 'root/shared/services/transient-back.model'
import {MobileBottomActionFooter} from 'root/shared/ui/mobile-bottom-action-footer'
import {PMEntryCreateBase} from './entry-create-base'
import {PMEntryWebsiteEditor} from '../entry-website-editor'
import {PMEntryCreateDetailsSheet} from './entry-create-details-sheet'
import {PMEntryCreateLocationSheet} from './entry-create-location-sheet'
import type {PMEntryCreateOptionalDetail} from './entry-create.model'

const pmEntryCreateMobileStyles = css`
  :host {
    display: block;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
    contain: layout style paint;
    container-type: inline-size;
    color: var(--cv-color-text);
    background: var(--cv-color-bg);
  }

  cv-guidance-anchor,
  form {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }

  .create-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--cv-space-4);
    min-block-size: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: var(--cv-space-3) var(--cv-space-3) var(--cv-space-4);
    scroll-padding-block-end: var(--cv-space-4);
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .create-scroll > * {
    flex: 0 0 auto;
  }

  .entry-type-switch {
    display: block;
    inline-size: 100%;
  }

  .entry-type-switch::part(base) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cv-space-1);
    inline-size: 100%;
    padding: var(--cv-space-1);
    border-color: var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-2);
  }

  .entry-type-option {
    min-inline-size: 0;
    inline-size: 100%;
    font-weight: var(--cv-font-weight-semibold);
  }

  .entry-type-option::part(base) {
    justify-content: center;
    box-sizing: border-box;
    min-block-size: 44px;
    inline-size: 100%;
    border-radius: var(--cv-radius-2);
  }

  .entry-type-option::part(label) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .entry-type-option cv-icon {
    flex: 0 0 auto;
  }

  .entry-type-option span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .location-field {
    display: grid;
    gap: var(--cv-space-1);
  }

  .location-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-3);
    inline-size: 100%;
    min-block-size: 52px;
    padding: var(--cv-space-2) var(--cv-space-3);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-3);
    color: var(--cv-color-text);
    background: var(--cv-gradient-surface-primary);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .location-row:focus-visible,
  .details-row:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .location-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 36px;
    block-size: 36px;
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-primary);
    background: var(--cv-color-primary-surface);
  }

  .location-copy,
  .form-heading-copy {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .location-label,
  .section-label {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .location-value {
    overflow: hidden;
    font-weight: var(--cv-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-sm);
    line-height: 1.35;
  }

  .form-surface {
    overflow: hidden;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface);
  }

  .form-surface:focus-within {
    border-color: var(--cv-color-primary-border);
  }

  .form-heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--cv-space-3);
    padding: var(--cv-space-3);
    border-block-end: 1px solid var(--cv-color-border-muted);
    background: var(--cv-color-surface-2);
  }

  .form-heading-title {
    color: var(--cv-color-text-strong);
    font-weight: var(--cv-font-weight-semibold);
  }

  .form-heading-subtitle {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.35;
  }

  .field-row {
    padding: var(--cv-space-3);
  }

  .field-row + .field-row {
    border-block-start: 1px solid var(--cv-color-border-muted);
  }

  cv-field,
  cv-input,
  cv-textarea {
    inline-size: 100%;
  }

  .optional-label {
    color: var(--cv-color-text-muted);
    font-weight: var(--cv-font-weight-regular);
  }

  .password-suffix {
    display: grid;
    place-items: center;
    block-size: 100%;
    border-inline-start: 1px solid var(--cv-color-border-muted);
  }

  .password-input::part(base) {
    padding-inline-end: 0;
  }

  .password-input::part(suffix) {
    align-self: stretch;
  }

  .generate-button {
    inline-size: 48px;
    block-size: 100%;
    min-block-size: 40px;
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

  .expiry-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cv-space-2);
  }

  .details-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--cv-space-3);
    inline-size: 100%;
    min-block-size: 60px;
    padding: var(--cv-space-2) var(--cv-space-3);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    color: var(--cv-color-text);
    background: var(--cv-color-surface-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .details-row:hover {
    border-color: var(--cv-color-primary-border);
    background: var(--cv-color-surface-highlight);
  }

  .details-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 36px;
    block-size: 36px;
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-primary);
    background: var(--cv-color-primary-surface);
  }

  .details-copy {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .details-title {
    color: var(--cv-color-text-strong);
    font-weight: var(--cv-font-weight-semibold);
  }

  .details-summary {
    overflow: hidden;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .details-count {
    display: inline-grid;
    place-items: center;
    min-inline-size: 26px;
    block-size: 26px;
    padding-inline: var(--cv-space-1);
    border-radius: var(--cv-radius-pill);
    color: var(--cv-color-primary);
    background: var(--cv-color-primary-surface);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
  }

  .create-footer {
    --app-mobile-block-end-action-padding: var(--cv-space-2) var(--cv-space-3);
  }

  .create-submit {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--cv-button-gap, var(--cv-space-2));
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 48px;
    box-sizing: border-box;
    padding: var(--cv-button-padding-block, var(--cv-space-2))
      var(--cv-button-padding-inline, var(--cv-space-4));
    border: 1px solid
      var(--cv-button-action-primary-border-color, var(--cv-color-primary-border-strong));
    border-radius: var(--cv-button-border-radius, var(--cv-radius-sm));
    background: var(--cv-button-action-primary-background, var(--cv-color-primary-dark));
    color: var(--cv-button-action-primary-text-color, var(--cv-color-on-primary));
    font: inherit;
    font-size: var(--cv-button-font-size-large, var(--cv-font-size-md));
    font-weight: var(--cv-button-font-weight-medium, inherit);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    transition:
      background var(--cv-duration-fast) var(--cv-easing-standard),
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .create-submit:hover:not(:disabled) {
    background: var(--cv-button-action-primary-background-hover, var(--cv-color-primary));
    border-color: var(
      --cv-button-action-primary-border-color-hover,
      var(--cv-color-primary-border-strong)
    );
    color: var(--cv-button-action-primary-text-color-hover, var(--cv-color-on-primary));
  }

  .create-submit:active:not(:disabled) {
    background: var(--cv-button-action-primary-background-active, var(--cv-color-primary-darker));
    border-color: var(
      --cv-button-action-primary-border-color-active,
      var(--cv-color-primary-border-strong)
    );
    color: var(--cv-button-action-primary-text-color-active, var(--cv-color-on-primary));
  }

  .create-submit:focus-visible {
    outline: 2px solid
      var(--cv-button-action-primary-focus-ring-color, var(--cv-color-primary-ring));
    outline-offset: 2px;
  }

  .create-submit:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .create-submit[aria-busy='true'] {
    cursor: progress;
  }

  .discard-action::part(base) {
    inline-size: 100%;
    min-block-size: 48px;
  }

  cv-bottom-sheet::part(footer) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cv-space-2);
    padding: 0 var(--cv-space-4) max(var(--cv-space-4), env(safe-area-inset-bottom));
    border-block-start: 0;
  }

  @supports (-webkit-touch-callout: none) {
    cv-input::part(input),
    cv-textarea::part(textarea) {
      font-size: 16px;
    }
  }

  @container (max-width: 380px) {
    .create-scroll {
      padding-inline: var(--cv-space-2);
    }

    .entry-type-option::part(label) {
      gap: var(--cv-space-1);
    }

    .entry-type-option::part(base) {
      padding-inline: var(--cv-space-1);
    }

    .entry-type-option {
      font-size: var(--cv-font-size-sm);
    }
  }
`

export class PMEntryCreateMobile extends PMEntryCreateBase {
  static styles = [pmEntryCreateMobileStyles]

  private unregisterNavigationBlocker?: () => void
  private unregisterTransientBack?: () => void

  static define() {
    CVBottomSheet.define()
    MobileBottomActionFooter.define()
    PMEntryCreateDetailsSheet.define()
    PMEntryCreateLocationSheet.define()
    PMEntryWebsiteEditor.define()
    if (!customElements.get('pm-entry-create-mobile')) {
      customElements.define('pm-entry-create-mobile', this)
    }
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterNavigationBlocker = navigationModel.registerNavigationBlocker((intent, resume) =>
      this.handleNavigationIntent(intent, resume),
    )
    this.unregisterTransientBack = transientBackModel.register(() => this.model.consumeTransientBack(), {
      priority: 80,
    })
  }

  public override disconnectedCallback(): void {
    this.unregisterNavigationBlocker?.()
    this.unregisterNavigationBlocker = undefined
    this.unregisterTransientBack?.()
    this.unregisterTransientBack = undefined
    super.disconnectedCallback()
  }

  protected override prepareInitialViewport(): void {
    markMobileKeyboardProgrammaticScroll('entry-create-prepare-initial-viewport')
    const scroll = this.shadowRoot?.querySelector<HTMLElement>('.create-scroll')
    if (scroll) {
      scroll.scrollTop = 0
      scroll.scrollLeft = 0
    }
    this.scrollTop = 0
    this.scrollLeft = 0
  }

  private handleNavigationIntent(intent: NavigationBlockerIntent, resume: () => void): boolean {
    if (intent.current.surface !== 'passwords' || intent.current.passwords?.kind !== 'create-entry') {
      return false
    }
    if (intent.next.surface === 'passwords' && intent.next.passwords?.kind === 'create-entry') {
      return false
    }
    return this.model.requestDiscard(resume)
  }

  private handleLocationClick(): void {
    this.model.openLocationSheet()
  }

  private handleAddDetailsClick(): void {
    this.model.openDetailsSheet()
  }

  private handleDiscardSheetChange(event: CustomEvent<{open?: boolean}>): void {
    if (event.target !== event.currentTarget || event.detail.open !== false) return
    this.model.cancelDiscard()
  }

  private handleDiscardCancel(): void {
    this.model.cancelDiscard()
  }

  private handleDiscardConfirm(): void {
    this.model.confirmDiscard()
  }

  private renderTypeSelector(): TemplateResult {
    return html`
      <cv-radio-group
        class="entry-type-switch"
        variant="segmented"
        .value=${this.model.entryType()}
        aria-label=${i18n('entry:type')}
        @cv-change=${this.onEntryTypeChange}
      >
        <cv-radio class="entry-type-option" value="login">
          <cv-icon name="person-circle" aria-hidden="true"></cv-icon>
          <span>${i18n('entry:type:login')}</span>
        </cv-radio>
        <cv-radio class="entry-type-option" value="payment_card">
          <cv-icon name="credit-card" aria-hidden="true"></cv-icon>
          <span>${i18n('entry:type:payment_card')}</span>
        </cv-radio>
      </cv-radio-group>
    `
  }

  private renderLocation(): TemplateResult {
    const root = getPassmanagerRoot()
    const error = this.model.targetGroupError()
    const label = this.model.targetGroupLabel() || root?.name || i18n('root:title')

    return html`
      <div class="location-field">
        <button
          class="location-row"
          type="button"
          aria-invalid=${String(Boolean(error))}
          aria-describedby=${error ? 'entry-create-location-error' : nothing}
          @click=${this.handleLocationClick}
        >
          <span class="location-icon"><cv-icon name="folder" aria-hidden="true"></cv-icon></span>
          <span class="location-copy">
            <span class="location-label">${i18n('entry:create:location' as never)}</span>
            <span class="location-value">${label}</span>
          </span>
          <cv-icon name="chevron-right" aria-hidden="true"></cv-icon>
        </button>
        ${error ? html`<span id="entry-create-location-error" class="field-error">${error}</span>` : nothing}
      </div>
    `
  }

  private renderField(
    label: string,
    field: TemplateResult,
    error: string,
    options: {required?: boolean; optional?: boolean} = {},
  ): TemplateResult {
    return html`
      <div class="field-row">
        <cv-field ?invalid=${Boolean(error)} ?required=${Boolean(options.required)}>
          <span slot="label">
            ${label}${options.optional ? html` <span class="optional-label">(${i18n('optional:title')})</span>` : nothing}
          </span>
          ${field}
          ${error ? html`<span slot="error" class="field-error">${error}</span>` : nothing}
        </cv-field>
      </div>
    `
  }

  private renderFormHeading(): TemplateResult {
    const isPaymentCard = this.model.entryType() === 'payment_card'
    return html`
      <header class="form-heading">
        <span class="location-icon" aria-hidden="true">
          <cv-icon name=${isPaymentCard ? 'credit-card' : 'shield-lock'}></cv-icon>
        </span>
        <span class="form-heading-copy">
          <span class="form-heading-title">
            ${i18n(isPaymentCard ? 'entry:create-card-title' : 'entry:create-login-title')}
          </span>
          <span class="form-heading-subtitle">
            ${i18n(isPaymentCard ? 'entry:create-card-subtitle' : 'entry:create-login-subtitle')}
          </span>
        </span>
      </header>
    `
  }

  private renderTitleField(): TemplateResult {
    const error = this.model.titleError()
    return this.renderField(
      i18n('title'),
      html`
        <cv-input
          control-id="passwords.create.title"
          name="title"
          type="text"
          size="large"
          autocomplete="off"
          aria-label=${i18n('title')}
          placeholder=${i18n('title:placeholder')}
          .value=${this.model.title()}
          ?invalid=${Boolean(error)}
          @cv-input=${this.onTitleInput}
          @blur=${this.onTitleBlur}
        ></cv-input>
      `,
      error,
      {required: true},
    )
  }

  private renderLoginFields(): TemplateResult {
    const usernameError = this.model.usernameError()
    const passwordError = this.model.passwordError()

    return html`
      <div class="form-surface">
        ${this.renderFormHeading()} ${this.renderTitleField()}
        ${this.renderField(
          i18n('username'),
          html`
            <cv-input
              control-id="passwords.create.username"
              name="username"
              type="text"
              size="large"
              autocomplete="username"
              aria-label=${i18n('username')}
              placeholder=${i18n('username:placeholder')}
              .value=${this.model.username()}
              ?invalid=${Boolean(usernameError)}
              @cv-input=${this.onUsernameInput}
              @blur=${this.onUsernameBlur}
            ></cv-input>
          `,
          usernameError,
        )}
        ${this.renderField(
          i18n('password'),
          html`
            <cv-input
              control-id="passwords.create.password"
              class="password-input"
              name="password"
              type="password"
              size="large"
              autocomplete="new-password"
              password-toggle
              aria-label=${i18n('password')}
              placeholder=${i18n('password:placeholder')}
              .value=${this.model.password()}
              ?invalid=${Boolean(passwordError)}
              @cv-input=${this.onPasswordInput}
              @blur=${this.onPasswordBlur}
            >
              <span class="password-suffix" slot="suffix">
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
            ${this.renderStrength()}
          `,
          passwordError,
          {required: true},
        )}
        <pm-entry-website-editor .model=${this.model.websiteEditor}></pm-entry-website-editor>
      </div>
    `
  }

  private renderStrength(): TemplateResult | typeof nothing {
    const score = this.model.passwordStrengthScore()
    if (score === null) return nothing

    return html`
      <div class="strength" aria-label=${i18n('password:strength', {label: this.model.passwordStrengthLabel()})}>
        <span class="strength-copy">${i18n('password:strength', {label: this.model.passwordStrengthLabel()})}</span>
        <span class="strength-segments" aria-hidden="true">
          ${[0, 1, 2, 3, 4].map(
            (index) => html`<span data-active=${String(index <= score)}></span>`,
          )}
        </span>
      </div>
    `
  }

  private renderPaymentCardFields(): TemplateResult {
    const cardholderError = this.model.cardholderNameError()
    const cardNumberError = this.model.cardNumberError()
    const monthError = this.model.cardExpMonthError()
    const yearError = this.model.cardExpYearError()

    return html`
      <div class="form-surface">
        ${this.renderFormHeading()} ${this.renderTitleField()}
        ${this.renderField(
          i18n('payment-card:cardholder'),
          html`
            <cv-input
              name="cardholderName"
              type="text"
              size="large"
              autocomplete="cc-name"
              .value=${this.model.cardholderName()}
              ?invalid=${Boolean(cardholderError)}
              @cv-input=${this.onCardholderInput}
              @blur=${this.onCardholderBlur}
            ></cv-input>
          `,
          cardholderError,
          {required: true},
        )}
        ${this.renderField(
          i18n('payment-card:number'),
          html`
            <cv-input
              name="cardNumber"
              type="password"
              size="large"
              inputmode="numeric"
              autocomplete="cc-number"
              password-toggle
              .value=${this.model.cardNumber()}
              ?invalid=${Boolean(cardNumberError)}
              @cv-input=${this.onCardNumberInput}
              @blur=${this.onCardNumberBlur}
            ></cv-input>
          `,
          cardNumberError,
          {required: true},
        )}
        <div class="field-row expiry-row">
          <cv-field ?invalid=${Boolean(monthError)} required>
            <span slot="label">${i18n('payment-card:exp-month')}</span>
            <cv-input
              name="cardExpMonth"
              type="text"
              size="large"
              inputmode="numeric"
              autocomplete="cc-exp-month"
              maxlength="2"
              placeholder="MM"
              .value=${this.model.cardExpMonth()}
              ?invalid=${Boolean(monthError)}
              @cv-input=${this.onCardExpMonthInput}
              @blur=${this.onCardExpMonthBlur}
            ></cv-input>
            ${monthError ? html`<span slot="error" class="field-error">${monthError}</span>` : nothing}
          </cv-field>
          <cv-field ?invalid=${Boolean(yearError)} required>
            <span slot="label">${i18n('payment-card:exp-year')}</span>
            <cv-input
              name="cardExpYear"
              type="text"
              size="large"
              inputmode="numeric"
              autocomplete="cc-exp-year"
              maxlength="2"
              placeholder="YY"
              .value=${this.model.cardExpYear()}
              ?invalid=${Boolean(yearError)}
              @cv-input=${this.onCardExpYearInput}
              @blur=${this.onCardExpYearBlur}
            ></cv-input>
            ${yearError ? html`<span slot="error" class="field-error">${yearError}</span>` : nothing}
          </cv-field>
        </div>
        ${this.renderField(
          i18n('payment-card:cvv'),
          html`
            <cv-input
              name="cardCvv"
              type="password"
              size="large"
              inputmode="numeric"
              autocomplete="cc-csc"
              password-toggle
              .value=${this.model.cardCvv()}
              @cv-input=${this.onCardCvvInput}
            ></cv-input>
          `,
          '',
          {optional: true},
        )}
      </div>
    `
  }

  private getDetailLabel(detail: PMEntryCreateOptionalDetail): string {
    switch (detail) {
      case 'icon':
        return i18n('entry:create:detail-icon' as never)
      case 'tags':
        return i18n('tags:title')
      case 'otp':
        return i18n('entry:create:detail-otp' as never)
      case 'note':
        return i18n('note:use')
    }
  }

  private renderDetailsSummary(): TemplateResult {
    const configured = this.model.configuredOptionalDetails()
    const configuredCount = this.model.configuredOptionalDetailCount()
    const summaryDetails = configured.length > 0 ? configured : this.model.supportedOptionalDetails()
    const summary = summaryDetails.map((detail) => this.getDetailLabel(detail)).join(' · ')

    return html`
      <button
        class="details-row"
        type="button"
        data-details-hub-trigger
        @click=${this.handleAddDetailsClick}
      >
        <span class="details-icon"><cv-icon name="list-plus" aria-hidden="true"></cv-icon></span>
        <span class="details-copy">
          <span class="details-title">${i18n('entry:create:add-details' as never)}</span>
          <span class="details-summary">${summary}</span>
        </span>
        <span class="details-count" aria-hidden="true">${configuredCount}</span>
        <cv-icon name="chevron-right" aria-hidden="true"></cv-icon>
      </button>
    `
  }

  private renderDiscardSheet(): TemplateResult {
    return html`
      <cv-bottom-sheet
        .open=${this.model.discardSheetOpen()}
        @cv-change=${this.handleDiscardSheetChange}
      >
        <span slot="title">${i18n('entry:create:discard-title' as never)}</span>
        <span slot="description">${i18n('entry:create:discard-message' as never)}</span>
        <cv-button
          class="discard-action"
          slot="footer"
          type="button"
          variant="default"
          size="large"
          aria-label=${i18n('button:cancel')}
          @click=${this.handleDiscardCancel}
        >
          ${i18n('button:cancel')}
        </cv-button>
        <cv-button
          class="discard-action"
          slot="footer"
          type="button"
          variant="danger"
          size="large"
          aria-label=${i18n('button:discard')}
          @click=${this.handleDiscardConfirm}
        >
          ${i18n('button:discard')}
        </cv-button>
      </cv-bottom-sheet>
    `
  }

  private renderFooter(): TemplateResult {
    const isSubmitting = this.model.isSubmitting()
    return html`
      <mobile-bottom-action-footer class="create-footer" flow>
        <button
          id="passwords.create.submit"
          class="create-submit"
          type="submit"
          ?disabled=${isPassmanagerReadOnlyOrMissing() || isSubmitting}
          aria-label=${i18n('button:create_entry')}
          aria-busy=${isSubmitting ? 'true' : nothing}
        >
          ${isSubmitting ? html`<cv-spinner aria-hidden="true"></cv-spinner>` : nothing}
          <cv-icon name="shield-check" aria-hidden="true"></cv-icon>
          <span>${isSubmitting ? i18n('entry:creating') : i18n('button:create_entry')}</span>
        </button>
      </mobile-bottom-action-footer>
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (!getPassmanagerRoot()) return nothing

    return html`
      <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
        <form novalidate @submit=${this.onSubmit}>
          <div class="create-scroll">
            ${this.renderTypeSelector()} ${this.renderLocation()}
            ${this.model.entryType() === 'payment_card'
              ? this.renderPaymentCardFields()
              : this.renderLoginFields()}
            ${this.renderDetailsSummary()}
          </div>
          ${this.renderFooter()}
        </form>
        <pm-entry-create-details-sheet .model=${this.model}></pm-entry-create-details-sheet>
        <pm-entry-create-location-sheet .model=${this.model}></pm-entry-create-location-sheet>
        ${this.renderDiscardSheet()}
      </cv-guidance-anchor>
    `
  }
}
