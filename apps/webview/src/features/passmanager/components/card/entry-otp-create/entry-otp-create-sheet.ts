import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {css, nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {PMEntryOTPCreate} from './entry-otp-create'
import {PMEntryOtpCreateModel} from './entry-otp-create.model'

export class PMEntryOTPCreateSheet extends ReatomLitElement {
  static elementName = 'pm-entry-otp-create-sheet'

  static properties = {
    model: {attribute: false},
    open: {type: Boolean, reflect: true},
    saving: {type: Boolean, reflect: true},
    title: {type: String},
    description: {type: String},
    primaryLabel: {type: String, attribute: 'primary-label'},
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet::part(body) {
      padding: 0 var(--cv-space-5) var(--cv-space-5);
    }

    cv-bottom-sheet::part(header) {
      padding: var(--cv-space-5) var(--cv-space-5) var(--cv-space-4);
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
      padding: 0 var(--cv-space-5) max(var(--cv-space-5), env(safe-area-inset-bottom));
      border-block-start: 0;
      background: var(--cv-color-surface);
    }

    .sheet-body {
      display: grid;
      gap: 1rem;
    }

    .primary-action {
      inline-size: 100%;
    }

    .primary-action::part(base) {
      inline-size: 100%;
      min-block-size: 3.25rem;
      border-radius: var(--cv-radius-2);
      font-size: 1rem;
      font-weight: var(--cv-font-weight-semibold);
    }
  `

  declare model: PMEntryOtpCreateModel
  declare open: boolean
  declare saving: boolean
  declare title: string
  declare description: string
  declare primaryLabel: string

  constructor() {
    super()
    this.model = new PMEntryOtpCreateModel()
    this.open = false
    this.saving = false
    this.title = i18n('otp:add')
    this.description = ''
    this.primaryLabel = i18n('otp:save')
  }

  static define() {
    CVBottomSheet.define()
    CVButton.define()
    PMEntryOTPCreate.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private onClose(event?: Event) {
    if (this.model.qrScannerScanning()) {
      event?.stopPropagation()
      return
    }

    this.dispatchEvent(
      new CustomEvent('pm-entry-otp-create-sheet-close', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleSheetChange(event: CustomEvent<{open?: boolean}>) {
    if (event.target !== event.currentTarget) return
    if (event.detail.open !== false) return
    this.onClose(event)
  }

  private onPrimary() {
    this.dispatchEvent(
      new CustomEvent('pm-entry-otp-create-sheet-primary', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render() {
    const qrScannerActive = this.model.qrScannerScanning()

    return html`
      <cv-bottom-sheet
        .open=${this.open}
        .closable=${!qrScannerActive}
        .closeOnEscape=${!qrScannerActive}
        .closeOnOutsidePointer=${!qrScannerActive}
        .closeOnOutsideFocus=${!qrScannerActive}
        .dragToClose=${!qrScannerActive}
        initial-focus-id="otp-secret-input"
        @cv-change=${this.handleSheetChange}
      >
        <span slot="title">${this.title}</span>
        ${this.description ? html`<span slot="description">${this.description}</span>` : nothing}
        <div class="sheet-body">
          <pm-entry-otp-create layout="card" .model=${this.model}></pm-entry-otp-create>
        </div>
        <cv-button
          class="primary-action"
          slot="footer"
          type="button"
          variant="primary"
          size="large"
          .disabled=${this.saving || !this.model.canSubmit()}
          .loading=${this.saving}
          @click=${this.onPrimary}
        >
          ${this.primaryLabel}
        </cv-button>
      </cv-bottom-sheet>
    `
  }
}
