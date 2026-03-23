import {css, html, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager'
import {PMEntryEditBase} from './entry-edit-base'
import {pmEntryEditSharedStyles} from './styles'

export class PMEntryEditMobile extends PMEntryEditBase {
  static define() {
    if (!customElements.get('pm-entry-edit-mobile')) {
      customElements.define('pm-entry-edit-mobile', this)
    }
  }

  static styles = [
    ...pmEntryEditSharedStyles,
    css`
      :host {
        --pm-mobile-footer-size: calc(4.5rem + var(--safe-area-bottom-active));
        --pm-mobile-footer-clearance: calc(var(--visual-viewport-bottom-inset) + var(--cv-space-2));
        display: flex;
        flex: 1;
        flex-direction: column;
        block-size: 100%;
        min-block-size: 0;
        overflow-y: auto;
        overflow-x: hidden;
        contain: style layout;
        overscroll-behavior-y: contain;
        scrollbar-width: none;
        scroll-padding-block-end: calc(var(--pm-mobile-footer-size) + var(--pm-mobile-footer-clearance));
        -webkit-overflow-scrolling: touch;
      }

      .edit-header {
        position: static;
      }

      .edit-wrapper {
        box-sizing: border-box;
        padding-block-end: var(--pm-mobile-footer-clearance);
      }

      .otp-create-screen {
        position: static;
        inset: auto;
        z-index: auto;
        flex: 1;
        min-block-size: 100%;
        padding: 0;
        background: transparent;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        overflow: hidden;
      }

      .edit-sections-accordion {
        --pm-edit-sections-scroll-margin-start: 0px;
        --pm-edit-sections-scroll-margin-end: calc(var(--pm-mobile-footer-size) + var(--pm-mobile-footer-clearance));
      }

      .edit-footer {
        display: flex;
        gap: 0.375rem;
        padding: 0.5rem 0.75rem;
        padding-block-end: calc(0.5rem + var(--safe-area-bottom-active));
        background: linear-gradient(
          145deg,
          color-mix(in oklch, var(--cv-color-surface-2) 88%, var(--cv-color-primary) 12%) 0%,
          color-mix(in oklch, var(--cv-color-surface-2) 94%, var(--cv-color-primary) 6%) 100%
        );
        border: 1px solid color-mix(in oklch, var(--cv-color-border) 75%, var(--cv-color-primary) 25%);
        border-radius: var(--cv-radius-2);
        position: sticky;
        inset-block-end: var(--visual-viewport-bottom-inset);
        z-index: 10;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 -4px 14px color-mix(in oklch, black 10%, transparent);
      }

      .edit-footer cv-button {
        flex: 1;
      }

      .edit-footer cv-button::part(base) {
        min-block-size: 44px;
        border-radius: var(--cv-radius-2);
        font-weight: var(--cv-font-weight-semibold);
      }

      .otp-create-screen-header {
        justify-content: center;
      }

      .otp-create-screen-footer {
        display: flex;
        gap: 0.375rem;
        padding: 0.5rem 0.75rem;
        padding-block-end: calc(0.5rem + var(--safe-area-bottom-active));
        background: linear-gradient(
          145deg,
          color-mix(in oklch, var(--cv-color-surface-2) 88%, var(--cv-color-primary) 12%) 0%,
          color-mix(in oklch, var(--cv-color-surface-2) 94%, var(--cv-color-primary) 6%) 100%
        );
        border: 1px solid color-mix(in oklch, var(--cv-color-border) 75%, var(--cv-color-primary) 25%);
        border-radius: var(--cv-radius-2);
        box-shadow: 0 -4px 14px color-mix(in oklch, black 10%, transparent);
      }

      .otp-create-screen-footer cv-button {
        flex: 1;
      }

      .otp-create-screen-footer cv-button::part(base) {
        min-block-size: 44px;
        border-radius: var(--cv-radius-2);
        font-weight: var(--cv-font-weight-semibold);
      }
    `,
  ]

  protected override renderHeaderActions(): TemplateResult | undefined {
    return undefined
  }

  protected override renderFooterActions(): TemplateResult {
    return html`
      <footer class="edit-footer">
        <cv-button class="edit-cancel-btn" variant="default" size="small" @click=${this.editEnd}>
          <cv-icon slot="prefix" name="x"></cv-icon>
          ${i18n('button:cancel')}
        </cv-button>
        <cv-button class="edit-save-btn" variant="primary" size="small" type="submit">
          <cv-icon slot="prefix" name="check"></cv-icon>
          ${i18n('button:save')}
        </cv-button>
      </footer>
    `
  }

  protected override renderOtpCreateHeaderActions(): TemplateResult | undefined {
    return undefined
  }

  protected override renderOtpCreateFooterActions(): TemplateResult | undefined {
    return this.renderOtpCreateActionButtons()
  }
}
