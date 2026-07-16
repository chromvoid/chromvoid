import {css, nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {CVField} from '@chromvoid/uikit/components/cv-field'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVRadio} from '@chromvoid/uikit/components/cv-radio'
import {CVRadioGroup, type CVRadioGroupChangeEvent} from '@chromvoid/uikit/components/cv-radio-group'
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
      gap: var(--cv-space-4);
    }

    cv-input,
    cv-radio-group {
      inline-size: 100%;
    }

    cv-input::part(base) {
      border-color: var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
      min-block-size: 48px;
      padding-inline: var(--cv-space-4);
    }

    cv-input[focused]::part(base) {
      border-color: var(--cv-color-primary);
      box-shadow: 0 0 0 2px var(--cv-color-primary-ring);
    }

    .ssh-key-type-label {
      margin: 0;
      padding: 0;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      line-height: 1.3;
    }

    .ssh-key-type {
      display: grid;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .ssh-key-type-options {
      display: block;
      inline-size: 100%;
      --cv-radio-group-gap: 2px;
    }

    .ssh-key-type-options::part(base) {
      padding: 2px;
      border-color: var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
    }

    .ssh-key-type-option::part(base) {
      justify-content: center;
      inline-size: 100%;
      min-block-size: 42px;
      padding-inline: var(--cv-space-2);
      border-radius: calc(var(--cv-radius-2) - 2px);
    }

    .ssh-key-type-option::part(label) {
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      line-height: 1;
    }

    .ssh-key-type-meta {
      display: flex;
      align-items: center;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .ssh-key-type-badge {
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      min-block-size: 18px;
      padding-inline: var(--cv-space-1);
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-medium);
      line-height: 1;
    }

    .ssh-helper {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.4;
    }

    .ssh-error {
      color: var(--cv-color-danger);
    }

    .ssh-result {
      display: grid;
      gap: var(--cv-space-3);
    }

    .ssh-result-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--cv-space-3);
      align-items: center;
      min-block-size: 80px;
      padding: var(--cv-space-3);
      border: 1px solid var(--cv-color-success-border);
      border-radius: var(--cv-radius-3);
      background: var(--cv-color-success-surface);
    }

    .ssh-result-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 44px;
      block-size: 44px;
      border: 1px solid var(--cv-color-success-border);
      border-radius: var(--cv-radius-2);
      color: var(--cv-color-success);
      background: var(--cv-color-surface);
    }

    .ssh-result-icon cv-icon {
      inline-size: 22px;
      block-size: 22px;
    }

    .ssh-result-content {
      display: grid;
      gap: var(--cv-space-1);
      min-inline-size: 0;
    }

    .ssh-result-name {
      overflow: hidden;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-base);
      font-weight: var(--cv-font-weight-semibold);
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ssh-result-meta {
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.4;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ssh-public-field {
      display: grid;
      gap: var(--cv-space-2);
      padding: var(--cv-space-3);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
    }

    .ssh-public-label {
      margin: 0;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      line-height: 1.2;
    }

    .ssh-public-value {
      display: -webkit-box;
      overflow: hidden;
      color: var(--cv-color-text);
      font-family: var(--cv-font-family-code);
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
      overflow-wrap: anywhere;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    :host([layout='card']) .ssh-create {
      gap: var(--cv-space-2);
    }

    :host([layout='card']) .ssh-result-card {
      min-block-size: 72px;
    }

    :host([layout='card']) .ssh-result-icon {
      inline-size: 40px;
      block-size: 40px;
    }

    :host([layout='card']) .ssh-result-icon cv-icon {
      inline-size: 20px;
      block-size: 20px;
    }

    :host([layout='card']) cv-input::part(base),
    :host([layout='card']) .ssh-key-type-option::part(base) {
      min-block-size: 42px;
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
    CVField.define()
    CVInput.define()
    CVRadio.define()
    CVRadioGroup.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  focusNameInput(): void {
    const input = this.shadowRoot?.querySelector<HTMLElement>('#ssh-name-input')
    const nativeInput = input?.shadowRoot?.querySelector<HTMLInputElement>('input')
    const focusTarget = nativeInput ?? input
    focusTarget?.focus()
  }

  private onNameInput(event: CVInputInputEvent) {
    this.model.actions.setName(event.detail.value ?? '')
  }

  private onCommentInput(event: CVInputInputEvent) {
    this.model.actions.setComment(event.detail.value ?? '')
  }

  private onKeyTypeChange(event: CVRadioGroupChangeEvent) {
    const value = event.detail.value
    if (!value || !SSH_KEY_TYPES.includes(value as SshKeyType)) return
    this.model.actions.setKeyType(value as SshKeyType)
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
    const keyType = this.model.state.keyType()

    return html`
      <div class="ssh-key-type">
        <p class="ssh-key-type-label">${i18n('ssh:key_type')}</p>
        <cv-radio-group
          class="ssh-key-type-options"
          name="ssh-key-type"
          variant="segmented"
          .value=${keyType}
          aria-label=${i18n('ssh:key_type')}
          @cv-change=${this.onKeyTypeChange}
        >
          ${SSH_KEY_TYPES.map(
            (type) => html`
              <cv-radio
                class="ssh-key-type-option"
                value=${type}
                aria-label=${type === 'ed25519'
                  ? `${this.keyTypeLabel(type)}, ${i18n('ssh:key_type:recommended')}`
                  : this.keyTypeLabel(type)}
              >
                ${this.keyTypeLabel(type)}
              </cv-radio>
            `,
          )}
        </cv-radio-group>
        <div class="ssh-key-type-meta">
          ${keyType === 'ed25519'
            ? html`<span class="ssh-key-type-badge">${i18n('ssh:key_type:recommended')}</span>`
            : nothing}
          <span class="ssh-helper">${this.keyTypeDescription(keyType)}</span>
        </div>
      </div>

      <cv-field ?invalid=${Boolean(this.model.state.nameError() && !this.model.state.name().trim())}>
        <span slot="label">${i18n('ssh:name')}</span>
        <cv-input
          id="ssh-name-input"
          .value=${this.model.state.name()}
          autocomplete="off"
          size="large"
          placeholder=${i18n('ssh:name:placeholder')}
          ?invalid=${Boolean(this.model.state.nameError() && !this.model.state.name().trim())}
          @cv-input=${this.onNameInput}
        ></cv-input>
        ${this.model.state.nameError() && !this.model.state.name().trim()
          ? html`<div slot="error" class="ssh-helper ssh-error">${this.model.state.nameError()}</div>`
          : nothing}
      </cv-field>

      <cv-field>
        <span slot="label">${i18n('ssh:comment:public_key')}</span>
        <cv-input
          .value=${this.model.state.comment()}
          autocomplete="off"
          size="large"
          placeholder=${i18n('ssh:comment:placeholder')}
          @cv-input=${this.onCommentInput}
        ></cv-input>
        <div slot="description" class="ssh-helper">${i18n('ssh:comment:helper')}</div>
      </cv-field>
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
