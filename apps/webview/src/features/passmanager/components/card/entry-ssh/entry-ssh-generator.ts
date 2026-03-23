import type {State} from '@statx/core'
import {XLitElement} from '@statx/lit'
import {css, html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import type {SshKeyType} from '@project/passmanager'
import type {CVInputInputEvent} from '@chromvoid/uikit'

import {entrySshSharedStyles} from './entry-ssh.styles'

export interface PMEntrySshGeneratorResult {
  fingerprint: string
  keyType: string
  pending?: boolean
}

export interface PMEntrySshKeyTypeChangeDetail {
  keyType: SshKeyType
}

export interface PMEntrySshCommentInputDetail {
  value: string
}

export type PMEntrySshGeneratorOnKeyTypeChange = (keyType: SshKeyType) => void
export type PMEntrySshGeneratorOnCommentInput = (value: string) => void
export type PMEntrySshGeneratorOnGenerate = () => void
export type PMEntrySshGeneratorOnCancel = () => void

export type PMEntrySshKeyTypeChangeEvent = CustomEvent<PMEntrySshKeyTypeChangeDetail>
export type PMEntrySshCommentInputEvent = CustomEvent<PMEntrySshCommentInputDetail>
export type PMEntrySshGenerateEvent = CustomEvent<Record<string, never>>
export type PMEntrySshCancelEvent = CustomEvent<Record<string, never>>

export class PMEntrySshGenerator extends XLitElement {
  static elementName = 'pm-entry-ssh-generator' as const

  static properties = {
    keyType: {type: String, attribute: 'key-type'},
    comment: {type: String},
    generating: {type: Boolean},
    result: {attribute: false},
    radioGroup: {type: String, attribute: 'radio-group'},
    showCancel: {type: Boolean, attribute: 'show-cancel'},
    allowCopy: {type: Boolean, attribute: 'allow-copy'},
    hideGenerateWhenResult: {type: Boolean, attribute: 'hide-generate-when-result'},
    onKeyTypeChange: {type: Function, attribute: false},
    onCommentInput: {type: Function, attribute: false},
    onGenerate: {type: Function, attribute: false},
    onCancel: {type: Function, attribute: false},
  }

  static styles = [
    entrySshSharedStyles,
    css`
      .entry-ssh-generator {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 0;
      }

      .entry-ssh-generator-title {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--cv-color-text);
      }

      .entry-ssh-options {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }

      .entry-ssh-option {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        font-size: 13px;
      }

      .entry-ssh-result {
        gap: 8px;
        padding: 4px 0;
        font-size: 13px;
        color: var(--cv-color-success);
      }

      .entry-ssh-result-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .entry-ssh-generator-actions {
        justify-content: flex-end;
      }
    `,
  ]

  declare keyType: SshKeyType | State<SshKeyType>
  declare comment: string | State<string>
  declare generating: boolean | State<boolean>
  declare result: PMEntrySshGeneratorResult | null | State<PMEntrySshGeneratorResult | null>
  declare radioGroup: string
  declare showCancel: boolean
  declare allowCopy: boolean
  declare hideGenerateWhenResult: boolean
  declare onKeyTypeChange?: PMEntrySshGeneratorOnKeyTypeChange
  declare onCommentInput?: PMEntrySshGeneratorOnCommentInput
  declare onGenerate?: PMEntrySshGeneratorOnGenerate
  declare onCancel?: PMEntrySshGeneratorOnCancel

  constructor() {
    super()
    this.keyType = 'ed25519'
    this.comment = ''
    this.generating = false
    this.result = null
    this.radioGroup = 'ssh-key-type'
    this.showCancel = false
    this.allowCopy = false
    this.hideGenerateWhenResult = false
  }

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private isStateValue<T>(value: T | State<T>): value is State<T> {
    return typeof value === 'function' && 'set' in value && typeof value.set === 'function'
  }

  private readValue<T>(value: T | State<T>): T {
    if (this.isStateValue(value)) {
      return value()
    }

    return value
  }

  private setStateValue<T>(source: T | State<T>, value: T): void {
    if (this.isStateValue(source)) {
      source.set(value)
    }
  }

  private keyTypeValue(): SshKeyType {
    return this.readValue(this.keyType)
  }

  private commentValue(): string {
    return this.readValue(this.comment)
  }

  private generatingValue(): boolean {
    return this.readValue(this.generating)
  }

  private resultValue(): PMEntrySshGeneratorResult | null {
    return this.readValue(this.result)
  }

  private emitKeyTypeChange(keyType: SshKeyType) {
    this.setStateValue(this.keyType, keyType)
    this.onKeyTypeChange?.(keyType)
    this.dispatchEvent(
      new CustomEvent<PMEntrySshKeyTypeChangeDetail>('pm-entry-ssh-key-type-change', {
        detail: {keyType},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private emitCommentInput(value: string) {
    this.setStateValue(this.comment, value)
    this.onCommentInput?.(value)
    this.dispatchEvent(
      new CustomEvent<PMEntrySshCommentInputDetail>('pm-entry-ssh-comment-input', {
        detail: {value},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private emitGenerate() {
    this.onGenerate?.()
    this.dispatchEvent(
      new CustomEvent<Record<string, never>>('pm-entry-ssh-generate', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private emitCancel() {
    this.onCancel?.()
    this.dispatchEvent(
      new CustomEvent<Record<string, never>>('pm-entry-ssh-cancel', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleKeyTypeChange(event: Event) {
    const target = event.target as HTMLInputElement
    if (!target.checked) return
    this.emitKeyTypeChange(target.value as SshKeyType)
  }

  private handleCommentInput(event: CVInputInputEvent) {
    this.emitCommentInput(event.detail.value)
  }

  private handleGenerate() {
    this.emitGenerate()
  }

  private handleCancel() {
    this.emitCancel()
  }

  private renderOption(value: SshKeyType, label: string) {
    return html`
      <label class="entry-ssh-option">
        <input
          type="radio"
          name=${this.radioGroup}
          value=${value}
          ?checked=${this.keyTypeValue() === value}
          @change=${this.handleKeyTypeChange}
        />
        ${label}
      </label>
    `
  }

  private renderResult() {
    const result = this.resultValue()
    if (!result) return nothing

    return html`
      <div class="entry-ssh-result entry-ssh-inline">
        <cv-icon name="check-circle"></cv-icon>
        ${result.pending
          ? html`<cv-badge size="small" variant="warning">${result.keyType.toUpperCase()}</cv-badge>`
          : html`<span class="entry-ssh-result-value entry-ssh-mono">${result.fingerprint}</span>`}
        ${this.allowCopy && result.fingerprint
          ? html`<cv-copy-button .value=${result.fingerprint} size="small"></cv-copy-button>`
          : nothing}
      </div>
    `
  }

  protected override render() {
    const hideGenerate = this.hideGenerateWhenResult && this.resultValue() != null
    return html`
      <div class="entry-ssh-generator">
        <label class="entry-ssh-generator-title">${i18n('ssh:key_type')}</label>

        <div class="entry-ssh-options">
          ${this.renderOption('ed25519', i18n('ssh:key_type:ed25519'))}
          ${this.renderOption('rsa', i18n('ssh:key_type:rsa'))}
          ${this.renderOption('ecdsa', i18n('ssh:key_type:ecdsa'))}
        </div>

        <cv-input
          size="small"
          .value=${this.commentValue()}
          placeholder=${i18n('ssh:comment:placeholder')}
          @cv-input=${this.handleCommentInput}
        >
          <span slot="label">${i18n('ssh:comment')}</span>
        </cv-input>

        ${this.renderResult()}
        ${hideGenerate && !this.showCancel
          ? nothing
          : html`
              <div class="entry-ssh-actions entry-ssh-generator-actions">
                ${this.showCancel
                  ? html`
                      <cv-button size="small" variant="default" @click=${this.handleCancel}>
                        ${i18n('button:cancel')}
                      </cv-button>
                    `
                  : nothing}
                ${hideGenerate
                  ? nothing
                  : html`
                      <cv-button
                        size="small"
                        variant="primary"
                        @click=${this.handleGenerate}
                        ?disabled=${this.generatingValue()}
                      >
                        <cv-icon
                          slot="prefix"
                          name=${this.generatingValue() ? 'arrow-clockwise' : 'key'}
                        ></cv-icon>
                        ${this.generatingValue() ? i18n('ssh:generating') : i18n('button:generate')}
                      </cv-button>
                    `}
              </div>
            `}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-ssh-generator': PMEntrySshGenerator
  }
}
