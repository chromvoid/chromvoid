import {css, html, nothing, type TemplateResult} from 'lit'

import {XLitElement} from '@statx/lit'
import {i18n} from '@project/passmanager'
import type {CVIcon} from '@chromvoid/uikit'
import {defaultLogger} from 'root/core/logger'

import {entrySshSharedStyles} from './entry-ssh.styles'

type PMEntrySshKeyMode = 'view' | 'edit'

export class PMEntrySshKey extends XLitElement {
  static properties = {
    keyId: {attribute: false},
    keyType: {attribute: false},
    fingerprint: {attribute: false},
    comment: {attribute: false},
    publicKey: {attribute: false},
    publicKeyProvider: {attribute: false},
    mode: {type: String},
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
        padding: 14px;
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
        color: color-mix(in oklch, var(--cv-color-text) 80%, var(--cv-color-text-muted));
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

      cv-copy-button {
        --cv-copy-button-size: 36px;
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
  declare comment: string | undefined
  declare publicKey: string
  declare publicKeyProvider: (() => Promise<string>) | undefined
  declare mode: PMEntrySshKeyMode
  private readonly logger = defaultLogger

  constructor() {
    super()
    this.keyId = ''
    this.keyType = ''
    this.fingerprint = ''
    this.comment = undefined
    this.publicKey = ''
    this.publicKeyProvider = undefined
    this.mode = 'view'
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties)
    if (!this.keyId) return
    if (!changedProperties.has('publicKey') && !changedProperties.has('keyId') && !changedProperties.has('mode')) return

    try {
      this.logger.debug('[PassManager][EntrySSH] key component update', {
        keyId: this.keyId,
        mode: this.mode,
        hasPublicKey: this.publicKey.length > 0,
        valueLength: this.publicKey.length,
      })
    } catch {}
  }

  protected render() {
    return this.mode === 'edit' ? this.renderEdit() : this.renderView()
  }

  private renderField(
    label: string,
    value: string,
    valueClasses = '',
    copyValue?: string,
    fieldClasses = '',
  ): TemplateResult {
    return html`
      <div class=${`entry-ssh-field ${fieldClasses}`.trim()}>
        <div class="entry-ssh-field-head">
          <span class="entry-ssh-label">${label}</span>
          ${copyValue
            ? html`
                <div class="entry-ssh-field-actions">
                  <cv-copy-button .value=${copyValue}></cv-copy-button>
                </div>
              `
            : nothing}
        </div>

        <div class="entry-ssh-field-content">
          <div class=${`entry-ssh-value ${valueClasses}`.trim()}>${value}</div>
        </div>
      </div>
    `
  }

  private renderKeySummary(): TemplateResult {
    return html`
      <div class="entry-ssh-key-summary">
        ${this.comment ? html`<span class="entry-ssh-comment">${this.comment}</span>` : nothing}
      </div>
    `
  }

  private renderView(): TemplateResult {
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
          publicKey !== '...' ? publicKey : undefined,
          'entry-ssh-field-flat',
        )}
      </div>
    `
  }

  private renderEdit(): TemplateResult {
    return html`
      <div class="entry-ssh-key entry-ssh-surface">
        <div class="entry-ssh-inline entry-ssh-key-head">
          <div class="entry-ssh-key-meta">
            <cv-badge size="small" variant="warning">${(this.keyType || '').toUpperCase() || '—'}</cv-badge>
            ${this.renderKeySummary()}
          </div>
        </div>

        <div class="entry-ssh-actions">
          <cv-tooltip arrow show-delay="150" hide-delay="0">
            <cv-copy-button slot="trigger" .value=${this.publicKeyProvider ?? (async () => '')}></cv-copy-button>
            <span slot="content">${i18n('ssh:copy_public_key')}</span>
          </cv-tooltip>
          <cv-button size="small" variant="danger" @click=${this.onRemoveClick}>
            <cv-icon slot="prefix" name="trash"></cv-icon>
            ${i18n('ssh:remove')}
          </cv-button>
        </div>
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
