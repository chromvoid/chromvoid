import {css, nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {CVDisclosure, type CVDisclosureEventDetail} from '@chromvoid/uikit/components/cv-disclosure'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVSelect, type CVSelectChangeEvent} from '@chromvoid/uikit/components/cv-select'
import {CVSelectOption} from '@chromvoid/uikit/components/cv-select-option'
import {i18n} from '@project/passmanager/i18n'
import type {SshKeyType} from '@project/passmanager/types'

import {PMEntrySshCreateModel, type PMEntrySshCreateResult} from './entry-ssh-create.model'

type PMEntrySshCreateLayout = 'sheet' | 'card'

const SSH_KEY_TYPES: SshKeyType[] = ['ed25519', 'rsa', 'ecdsa']

export class PMEntrySshCreate extends ReatomLitElement {
  static elementName = 'pm-entry-ssh-create' as const

  static properties = {
    model: {attribute: false},
    layout: {type: String, reflect: true},
  }

  static styles = css`
    :host {
      display: block;
    }

    .ssh-create {
      display: grid;
      gap: 1rem;
    }

    cv-input,
    cv-select {
      inline-size: 100%;
    }

    cv-input::part(base),
    cv-select::part(trigger) {
      border-color: var(--cv-color-border);
      background: var(--cv-color-surface-2);
    }

    cv-input[focused]::part(base),
    cv-select:focus-within::part(trigger) {
      border-color: var(--cv-color-primary);
      box-shadow: 0 0 0 3px var(--cv-color-primary-ring);
    }

    cv-input::part(form-control-label),
    .select-label {
      margin: 0;
      padding: 0 0 0.375rem;
      color: var(--cv-color-text-muted);
      font-size: 0.875rem;
      font-weight: var(--cv-font-weight-medium);
      letter-spacing: 0;
      line-height: 1.2;
      text-transform: none;
    }

    .ssh-key-hero {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.875rem;
      inline-size: 100%;
      min-block-size: 5.75rem;
      padding: 1rem;
      border: 1px solid var(--cv-color-primary-border-strong);
      border-radius: var(--cv-radius-3);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      text-align: start;
      cursor: pointer;
      transition:
        border-color 160ms var(--cv-easing-standard),
        background 160ms var(--cv-easing-standard),
        box-shadow 160ms var(--cv-easing-standard);
    }

    .ssh-key-hero:hover {
      border-color: var(--cv-color-primary);
      background: var(--cv-color-primary-surface);
    }

    .ssh-key-hero:focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: 2px;
    }

    .ssh-key-hero-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 3rem;
      block-size: 3rem;
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
    }

    .ssh-key-hero-icon cv-icon {
      inline-size: 1.5rem;
      block-size: 1.5rem;
    }

    .ssh-key-hero-copy {
      display: grid;
      gap: 0.25rem;
      min-inline-size: 0;
    }

    .ssh-key-hero-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-inline-size: 0;
      flex-wrap: wrap;
    }

    .ssh-key-hero-title {
      color: var(--cv-color-text-strongest);
      font-size: 1rem;
      font-weight: var(--cv-font-weight-bold);
      line-height: 1.2;
    }

    .ssh-key-hero-badge {
      display: inline-flex;
      align-items: center;
      min-block-size: 1.375rem;
      padding: 0 0.5rem;
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-pill);
      color: var(--cv-color-primary);
      background: var(--cv-color-primary-surface);
      font-size: 0.75rem;
      font-weight: var(--cv-font-weight-medium);
      line-height: 1;
    }

    .ssh-key-hero-text,
    .ssh-helper {
      color: var(--cv-color-text-muted);
      font-size: 0.8125rem;
      line-height: 1.35;
    }

    .ssh-key-hero-chevron {
      inline-size: 1rem;
      block-size: 1rem;
      color: var(--cv-color-text-muted);
    }

    .ssh-field {
      display: grid;
      gap: 0.375rem;
    }

    .ssh-error {
      color: var(--cv-color-danger);
    }

    .ssh-advanced {
      display: block;
      margin-block-start: 0.125rem;
    }

    .ssh-advanced::part(trigger) {
      min-block-size: 2.625rem;
      padding-inline: 0.875rem;
      border-color: var(--cv-color-border);
      border-radius: 0.875rem;
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font-size: 0.9375rem;
      font-weight: var(--cv-font-weight-semibold);
    }

    .ssh-advanced-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
      min-inline-size: 0;
    }

    .ssh-advanced-trigger cv-icon {
      inline-size: 1.125rem;
      block-size: 1.125rem;
      color: var(--cv-color-text-muted);
    }

    .ssh-advanced::part(panel) {
      margin-block-start: 0.5rem;
      padding: 0;
      border: 0;
      background: transparent;
    }

    .ssh-advanced-body {
      display: grid;
      gap: 0.875rem;
      padding: 0.25rem 0;
    }

    .ssh-result {
      display: grid;
      gap: 1rem;
    }

    .ssh-result-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.875rem;
      align-items: center;
      min-block-size: 5.75rem;
      padding: 0.875rem;
      border: 1px solid var(--cv-color-success-border);
      border-radius: var(--cv-radius-3);
      background: var(--cv-color-success-surface);
    }

    .ssh-result-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 3rem;
      block-size: 3rem;
      border: 1px solid var(--cv-color-success-border);
      border-radius: var(--cv-radius-2);
      color: var(--cv-color-success);
      background: var(--cv-color-surface);
    }

    .ssh-result-icon cv-icon {
      inline-size: 1.5rem;
      block-size: 1.5rem;
    }

    .ssh-result-content {
      display: grid;
      gap: 0.25rem;
      min-inline-size: 0;
    }

    .ssh-result-name {
      overflow: hidden;
      color: var(--cv-color-text);
      font-size: 1rem;
      font-weight: var(--cv-font-weight-bold);
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ssh-result-meta {
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: 0.8125rem;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ssh-public-field {
      display: grid;
      gap: 0.5rem;
      padding: 0.875rem;
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-3);
      background: var(--cv-color-surface-2);
    }

    .ssh-public-label {
      margin: 0;
      color: var(--cv-color-text-muted);
      font-size: 0.875rem;
      font-weight: var(--cv-font-weight-medium);
      line-height: 1.2;
    }

    .ssh-public-value {
      display: -webkit-box;
      overflow: hidden;
      color: var(--cv-color-text);
      font-family: var(--cv-font-family-code);
      font-size: 0.8125rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
  `

  declare model: PMEntrySshCreateModel
  declare layout: PMEntrySshCreateLayout

  constructor() {
    super()
    this.model = new PMEntrySshCreateModel()
    this.layout = 'sheet'
  }

  static define() {
    CVDisclosure.define()
    CVInput.define()
    CVSelect.define()
    CVSelectOption.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private onNameInput(event: CVInputInputEvent) {
    this.model.actions.setName(event.detail.value ?? '')
  }

  private onCommentInput(event: CVInputInputEvent) {
    this.model.actions.setComment(event.detail.value ?? '')
  }

  private onAdvancedChange(event: CustomEvent<CVDisclosureEventDetail>) {
    this.model.actions.setAdvancedOpen(event.detail.open)
  }

  private onKeyTypeChange(event: CVSelectChangeEvent) {
    const value = event.detail.value
    if (!value) return
    this.model.actions.setKeyType(value as SshKeyType)
  }

  private onKeyHeroClick() {
    this.model.actions.setAdvancedOpen(true)
  }

  protected override render(): TemplateResult {
    const result = this.model.state.result()
    return html`
      <div class="ssh-create" data-layout=${this.layout}>
        ${result && !result.pending ? this.renderResult(result) : this.renderSetup()}
        ${this.model.state.error()
          ? html`<div class="ssh-helper ssh-error" role="alert">${this.model.state.error()}</div>`
          : nothing}
      </div>
    `
  }

  private renderSetup(): TemplateResult {
    return html`
      <button class="ssh-key-hero" type="button" @click=${this.onKeyHeroClick}>
        <span class="ssh-key-hero-icon" aria-hidden="true">
          <cv-icon name="key"></cv-icon>
        </span>
        <span class="ssh-key-hero-copy">
          <span class="ssh-key-hero-title-row">
            <span class="ssh-key-hero-title">${i18n('ssh:key_type:ed25519')}</span>
            <span class="ssh-key-hero-badge">${i18n('ssh:key_type:recommended')}</span>
          </span>
          <span class="ssh-key-hero-text">${i18n('ssh:key_type:ed25519:description')}</span>
        </span>
        <cv-icon class="ssh-key-hero-chevron" name="chevron-right" aria-hidden="true"></cv-icon>
      </button>

      <cv-input
        id="ssh-name-input"
        .value=${this.model.state.name()}
        autocomplete="off"
        size="large"
        placeholder=${i18n('ssh:name:placeholder')}
        ?invalid=${Boolean(this.model.state.nameError() && !this.model.state.name().trim())}
        @cv-input=${this.onNameInput}
      >
        <span slot="label">${i18n('ssh:name')}</span>
        ${this.model.state.nameError() && !this.model.state.name().trim()
          ? html`<div slot="help-text" class="ssh-helper ssh-error">${this.model.state.nameError()}</div>`
          : nothing}
      </cv-input>

      <cv-input
        .value=${this.model.state.comment()}
        autocomplete="off"
        size="large"
        placeholder=${i18n('ssh:comment:placeholder')}
        @cv-input=${this.onCommentInput}
      >
        <span slot="label">${i18n('ssh:comment:public_key')}</span>
        <div slot="help-text" class="ssh-helper">${i18n('ssh:comment:helper')}</div>
      </cv-input>

      <cv-disclosure
        class="ssh-advanced"
        ?open=${this.model.state.advancedOpen()}
        @cv-change=${this.onAdvancedChange}
      >
        <span slot="trigger" class="ssh-advanced-trigger">
          <cv-icon name="gear" aria-hidden="true"></cv-icon>
          <span>${i18n('ssh:advanced')}</span>
        </span>
        <div class="ssh-advanced-body">
          <div class="ssh-field">
            <p class="select-label">${i18n('ssh:key_type')}</p>
            <cv-select
              size="small"
              .value=${this.model.state.keyType()}
              aria-label=${i18n('ssh:key_type')}
              @cv-change=${this.onKeyTypeChange}
            >
              ${SSH_KEY_TYPES.map(
                (type) => html`
                  <cv-select-option value=${type}>
                    ${this.keyTypeLabel(type)}
                  </cv-select-option>
                `,
              )}
            </cv-select>
            <div class="ssh-helper">${this.keyTypeDescription(this.model.state.keyType())}</div>
          </div>
        </div>
      </cv-disclosure>
    `
  }

  private renderResult(result: PMEntrySshCreateResult): TemplateResult {
    return html`
      <div class="ssh-result">
        <section class="ssh-result-card" aria-label=${i18n('ssh:result')}>
          <span class="ssh-result-icon" aria-hidden="true">
            <cv-icon name="check-circle"></cv-icon>
          </span>
          <span class="ssh-result-content">
            <span class="ssh-result-name">${result.name}</span>
            <span class="ssh-result-meta">
              ${this.keyTypeLabel(result.keyType)} · ${result.fingerprint || i18n('ssh:result:pending')}
            </span>
          </span>
        </section>
        <section class="ssh-public-field" aria-label=${i18n('ssh:public_key')}>
          <p class="ssh-public-label">${i18n('ssh:public_key')}</p>
          <div class="ssh-public-value">${result.publicKey || '—'}</div>
        </section>
      </div>
    `
  }

  private keyTypeDescription(value: SshKeyType): string {
    if (value === 'rsa') return i18n('ssh:key_type:rsa:description')
    if (value === 'ecdsa') return i18n('ssh:key_type:ecdsa:description')
    return i18n('ssh:key_type:ed25519:description')
  }

  private keyTypeLabel(value: SshKeyType): string {
    if (value === 'rsa') return i18n('ssh:key_type:rsa')
    if (value === 'ecdsa') return i18n('ssh:key_type:ecdsa')
    return i18n('ssh:key_type:ed25519')
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-ssh-create': PMEntrySshCreate
  }
}
