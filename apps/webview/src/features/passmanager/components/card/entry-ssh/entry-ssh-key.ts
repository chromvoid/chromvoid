import {css, nothing, type TemplateResult} from 'lit'

import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {i18n} from '@project/passmanager/i18n'
import type {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {defaultLogger} from 'root/core/logger'

import {entrySshSharedStyles} from './entry-ssh.styles'
import {renderPMCopyButton} from '../../pm-copy-button'

export class PMEntrySshKey extends ReatomLitElement {
  static properties = {
    keyId: {attribute: false},
    keyType: {attribute: false},
    fingerprint: {attribute: false},
    name: {attribute: false},
    comment: {attribute: false},
    publicKey: {attribute: false},
    publicKeyProvider: {attribute: false},
    removable: {type: Boolean},
  }

  static define() {
    if (!customElements.get('pm-entry-ssh-key')) {
      customElements.define('pm-entry-ssh-key', this)
    }
  }

  static styles = [
    entrySshSharedStyles,
    css`
      .entry-ssh-key {
        display: grid;
        gap: var(--cv-space-2);
        padding: 0;
      }

      .entry-ssh-key-head {
        min-inline-size: 0;
        justify-content: space-between;
        align-items: center;
      }

      .entry-ssh-key-view {
        border: none;
        border-radius: 0;
        background: transparent;
      }

      .entry-ssh-key-meta {
        display: flex;
        align-items: center;
        gap: var(--cv-space-2);
        flex: 1;
        min-inline-size: 0;
      }

      .entry-ssh-fingerprint {
        flex: 1;
        min-inline-size: 0;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .entry-ssh-public {
        display: -webkit-box;
        font-size: 0.8125rem;
        color: var(--cv-color-text);
        line-height: 1.5;
        overflow: hidden;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .entry-ssh-comment {
        font-size: 0.75rem;
        color: var(--cv-color-text-muted);
        line-height: 1.4;
        overflow-wrap: anywhere;
      }

      .entry-ssh-summary-copy {
        display: grid;
        gap: 0.1875rem;
        min-inline-size: 0;
      }

      .entry-ssh-name {
        overflow: hidden;
        color: var(--cv-color-text);
        font-size: 0.875rem;
        font-weight: var(--cv-font-weight-semibold);
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .entry-ssh-meta-line {
        overflow: hidden;
        color: var(--cv-color-text-muted);
        font-size: 0.75rem;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      cv-copy-button {
        --cv-copy-button-size: 36px;
      }

      .ssh-remove-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 36px;
        block-size: 36px;
        padding: 0;
        border: 1px solid var(--cv-color-border-strong);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        cursor: pointer;
        transition:
          border-color 0.2s ease,
          background 0.2s ease,
          color 0.2s ease;
      }

      .ssh-remove-action:hover {
        border-color: var(--cv-color-danger-border, var(--cv-color-danger));
        background: var(--cv-color-danger-surface, var(--cv-color-surface-highlight));
        color: var(--cv-color-danger);
      }

      .ssh-remove-action:focus-visible {
        outline: 2px solid var(--cv-color-danger);
        outline-offset: 2px;
      }

      .ssh-remove-action cv-icon {
        font-size: 18px;
      }

      @media (width < 560px) {
        .entry-ssh-key {
          padding: 12px 14px;
        }
      }
    `,
  ]

  declare keyId: string
  declare keyType: string
  declare fingerprint: string
  declare name: string | undefined
  declare comment: string | undefined
  declare publicKey: string
  declare publicKeyProvider: (() => Promise<string>) | undefined
  declare removable: boolean
  private readonly logger = defaultLogger

  constructor() {
    super()
    this.keyId = ''
    this.keyType = ''
    this.fingerprint = ''
    this.name = undefined
    this.comment = undefined
    this.publicKey = ''
    this.publicKeyProvider = undefined
    this.removable = false
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties)
    if (!this.keyId) return
    if (
      !changedProperties.has('publicKey') &&
      !changedProperties.has('keyId') &&
      !changedProperties.has('removable')
    )
      return

    try {
      this.logger.debug('[PassManager][EntrySSH] key component update', {
        keyId: this.keyId,
        removable: this.removable,
        hasPublicKey: this.publicKey.length > 0,
        valueLength: this.publicKey.length,
      })
    } catch {}
  }

  protected render() {
    return this.renderKey()
  }

  private renderField(
    label: string,
    value: string,
    valueClasses = '',
    actions: TemplateResult | typeof nothing = nothing,
    fieldClasses = '',
  ): TemplateResult {
    return html`
      <div class=${`entry-ssh-field ${fieldClasses}`.trim()}>
        <div class="entry-ssh-field-head">
          <span class="entry-ssh-label">${label}</span>
          ${actions === nothing ? nothing : html`<div class="entry-ssh-field-actions">${actions}</div>`}
        </div>

        <div class="entry-ssh-field-content">
          <div class=${`entry-ssh-value ${valueClasses}`.trim()}>${value}</div>
        </div>
      </div>
    `
  }

  private renderKeySummary(): TemplateResult {
    const title = this.name || this.comment || this.keyTypeLabel()
    const meta = [this.keyTypeLabel(), this.fingerprint].filter(Boolean).join(' · ')

    return html`
      <div class="entry-ssh-key-summary">
        <span class="entry-ssh-summary-copy">
          <span class="entry-ssh-name">${title}</span>
          ${meta ? html`<span class="entry-ssh-meta-line">${meta}</span>` : nothing}
          ${this.name && this.comment ? html`<span class="entry-ssh-comment">${this.comment}</span>` : nothing}
        </span>
      </div>
    `
  }

  private keyTypeLabel(): string {
    const keyType = this.keyType || ''
    if (keyType === 'ed25519') return i18n('ssh:key_type:ed25519')
    if (keyType === 'rsa') return i18n('ssh:key_type:rsa')
    if (keyType === 'ecdsa') return i18n('ssh:key_type:ecdsa')
    return keyType.toUpperCase()
  }

  private renderFieldActions(): TemplateResult | typeof nothing {
    const copyValue = this.publicKeyProvider ?? this.publicKey
    const hasCopyAction = Boolean(this.publicKeyProvider || this.publicKey)
    if (!hasCopyAction && !this.removable) {
      return nothing
    }

    return html`
      ${hasCopyAction ? renderPMCopyButton({value: copyValue}) : nothing}
      ${this.removable
        ? html`
            <cv-button unstyled class="ssh-remove-action" type="button" @click=${this.onRemoveClick} aria-label=${i18n('ssh:remove')}>
              <cv-icon name="trash" aria-hidden="true"></cv-icon>
            </cv-button>
          `
        : nothing}
    `
  }

  private renderKey(): TemplateResult {
    const publicKey = this.publicKey || '...'

    return html`
      <div class="entry-ssh-key entry-ssh-key-view">
        <div class="entry-ssh-inline entry-ssh-key-head">
          <div class="entry-ssh-key-meta">
            <cv-badge size="small" variant="warning">${(this.keyType || '').toUpperCase() || '—'}</cv-badge>
            ${this.renderKeySummary()}
          </div>
        </div>

        ${this.renderField(
          i18n('ssh:public_key'),
          publicKey,
          'entry-ssh-public entry-ssh-mono',
          this.renderFieldActions(),
          'entry-ssh-field-flat',
        )}
      </div>
    `
  }

  private onRemoveClick() {
    this.dispatchEvent(
      new CustomEvent('pm-entry-ssh-key-remove', {
        detail: {
          keyId: this.keyId,
        },
        bubbles: true,
        composed: true,
      }),
    )
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-ssh-key': PMEntrySshKey
    'cv-icon': CVIcon
  }
}
