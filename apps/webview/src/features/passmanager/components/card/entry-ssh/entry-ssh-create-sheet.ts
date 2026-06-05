import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {css, nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'

import {PMEntrySshCreate} from './entry-ssh-create'
import {PMEntrySshCreateModel} from './entry-ssh-create.model'

export class PMEntrySshCreateSheet extends ReatomLitElement {
  static elementName = 'pm-entry-ssh-create-sheet' as const

  static properties = {
    model: {attribute: false},
    open: {type: Boolean, reflect: true},
    saving: {type: Boolean, reflect: true},
    title: {type: String},
    description: {type: String},
    primaryLabel: {type: String, attribute: 'primary-label'},
    doneLabel: {type: String, attribute: 'done-label'},
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet::part(header) {
      padding: var(--cv-space-5) var(--cv-space-5) var(--cv-space-4);
    }

    cv-bottom-sheet::part(body) {
      padding: 0 var(--cv-space-5) var(--cv-space-5);
    }

    cv-bottom-sheet::part(title) {
      font-size: 1.375rem;
      font-weight: var(--cv-font-weight-bold);
      line-height: 1.15;
    }

    cv-bottom-sheet::part(description) {
      font-size: 1rem;
      line-height: 1.35;
    }

    cv-bottom-sheet::part(footer) {
      display: grid;
      gap: 0.75rem;
      padding: 0 var(--cv-space-5) max(var(--cv-space-5), env(safe-area-inset-bottom));
      border-block-start: 0;
      background: var(--cv-color-surface);
    }

    .sheet-body {
      display: grid;
      gap: 1rem;
    }

    .primary-action,
    .done-action {
      inline-size: 100%;
    }

    .primary-action::part(base),
    .done-action::part(base) {
      inline-size: 100%;
      min-block-size: 3.25rem;
      border-radius: var(--cv-radius-2);
      font-size: 1rem;
      font-weight: var(--cv-font-weight-semibold);
    }
  `

  declare model: PMEntrySshCreateModel
  declare open: boolean
  declare saving: boolean
  declare title: string
  declare description: string
  declare primaryLabel: string
  declare doneLabel: string

  constructor() {
    super()
    this.model = new PMEntrySshCreateModel()
    this.open = false
    this.saving = false
    this.title = i18n('ssh:add')
    this.description = ''
    this.primaryLabel = i18n('ssh:generate')
    this.doneLabel = i18n('button:done')
  }

  static define() {
    CVBottomSheet.define()
    CVButton.define()
    PMEntrySshCreate.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private onClose() {
    this.dispatchEvent(new CustomEvent('pm-entry-ssh-create-sheet-close', {bubbles: true, composed: true}))
  }

  private handleSheetChange(event: CustomEvent<{open?: boolean}>) {
    if (event.target !== event.currentTarget) return
    if (event.detail.open !== false) return
    this.onClose()
  }

  private onPrimary() {
    this.dispatchEvent(new CustomEvent('pm-entry-ssh-create-sheet-primary', {bubbles: true, composed: true}))
  }

  private onDone() {
    this.dispatchEvent(new CustomEvent('pm-entry-ssh-create-sheet-done', {bubbles: true, composed: true}))
  }

  protected override render() {
    const result = this.model.state.result()
    const resultReady = Boolean(result && !result.pending)
    const primaryDisabled = resultReady
      ? !result?.publicKey
      : this.saving || !this.model.state.canSubmit()

    return html`
      <cv-bottom-sheet
        .open=${this.open}
        initial-focus-id="ssh-name-input"
        @cv-change=${this.handleSheetChange}
      >
        <span slot="title">${this.title}</span>
        ${this.description ? html`<span slot="description">${this.description}</span>` : nothing}
        <div class="sheet-body">
          <pm-entry-ssh-create layout="sheet" .model=${this.model}></pm-entry-ssh-create>
        </div>
        <cv-button
          class="primary-action"
          slot="footer"
          type="button"
          variant="primary"
          size="large"
          .disabled=${primaryDisabled}
          .loading=${this.saving && !resultReady}
          @click=${this.onPrimary}
        >
          <cv-icon slot="prefix" name=${resultReady ? 'copy' : 'key'} aria-hidden="true"></cv-icon>
          ${this.primaryLabel}
        </cv-button>
        ${resultReady
          ? html`
              <cv-button
                class="done-action"
                slot="footer"
                type="button"
                variant="default"
                size="large"
                @click=${this.onDone}
              >
                ${this.doneLabel}
              </cv-button>
            `
          : nothing}
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-ssh-create-sheet': PMEntrySshCreateSheet
  }
}
