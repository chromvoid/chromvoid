import {css, html, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager'
import {PMEntryCreateBase} from './entry-create-base'
import {pmEntryCardStyles, pmEntryCreateStyles, pmEntryGenerateStyles} from './styles'

export class PMEntryCreateMobile extends PMEntryCreateBase {
  static define() {
    if (!customElements.get('pm-entry-create-mobile')) {
      customElements.define('pm-entry-create-mobile', this)
    }
  }

  static styles = [
    pmEntryCardStyles,
    pmEntryGenerateStyles,
    pmEntryCreateStyles,
    css`
      :host {
        --pm-mobile-footer-size: calc(4.5rem + var(--safe-area-bottom-active));
        --pm-mobile-footer-clearance: calc(var(--visual-viewport-bottom-inset) + var(--cv-space-2));
        overflow-y: auto;
        overflow-x: hidden;
        contain: layout style paint;
        overscroll-behavior-y: contain;
        scrollbar-width: none;
        scroll-padding-block-end: calc(var(--pm-mobile-footer-size) + var(--pm-mobile-footer-clearance));
        -webkit-overflow-scrolling: touch;
      }

      form {
        box-sizing: border-box;
        padding-block-end: var(--pm-mobile-footer-clearance);
      }

      .create-footer {
        position: sticky;
        inset-block-end: var(--visual-viewport-bottom-inset);
        z-index: 10;
        padding: 0.5rem 0.75rem;
        padding-block-end: calc(0.5rem + var(--safe-area-bottom-active));
        background: linear-gradient(
          145deg,
          color-mix(in oklch, var(--cv-color-surface-2) 88%, var(--cv-color-primary) 12%) 0%,
          color-mix(in oklch, var(--cv-color-surface-2) 94%, var(--cv-color-primary) 6%) 100%
        );
        border: 1px solid color-mix(in oklch, var(--cv-color-border) 75%, var(--cv-color-primary) 25%);
        border-radius: var(--cv-radius-2);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 -4px 14px color-mix(in oklch, black 10%, transparent);
      }

      .create-footer cv-button {
        inline-size: 100%;
      }

      .create-footer cv-button::part(base) {
        min-block-size: 44px;
        border-radius: var(--cv-radius-2);
        font-weight: var(--cv-font-weight-semibold);
      }
    `,
  ]

  protected override renderSubmitSection(): TemplateResult | typeof nothing {
    return nothing
  }

  protected override shouldAutofocusTitleInput(): boolean {
    return false
  }

  protected override shouldPreventScrollOnInitialFocus(): boolean {
    return true
  }

  protected override prepareInitialViewport(): void {
    this.scrollTop = 0
    this.scrollLeft = 0

    try {
      this.scrollTo({top: 0, left: 0})
    } catch {
      this.scrollTop = 0
      this.scrollLeft = 0
    }
  }

  protected override renderFormFooter(): TemplateResult {
    return html`
      <footer class="create-footer">
        <cv-button .disabled=${window.passmanager.isReadOnly()} size="small" variant="primary" type="submit"
          >${i18n('button:createNew')}</cv-button
        >
      </footer>
    `
  }
}
