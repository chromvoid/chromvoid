import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {CVBottomSheet, type CVBottomSheetChangeEvent} from '@chromvoid/uikit/components/cv-bottom-sheet'

import {i18n} from '@project/passmanager/i18n'
import {MobileSurfaceLayout} from 'root/shared/ui/mobile-surface-layout'
import {mobileSurfaceLayoutBlockFillStyles} from 'root/shared/ui/mobile-surface-layout.styles'

import {PMSshKeysView} from './ssh-keys-view'
import {sshKeysViewStyles} from './ssh-keys-view.styles'

export class PMSshKeysViewMobile extends PMSshKeysView {
  static styles = [
    sshKeysViewStyles,
    mobileSurfaceLayoutBlockFillStyles,
    css`
      :host {
        padding: 0;
        overflow: hidden;
      }

      .ssh-view__controls {
        padding-inline: var(--app-mobile-surface-gutter-inline);
      }

      .ssh-view__summary-rail {
        z-index: 1;
        max-inline-size: none;
        box-sizing: border-box;
        padding: var(--cv-space-2) var(--cv-space-4) max(var(--cv-space-2), env(safe-area-inset-bottom, 0px));
        background: var(--cv-color-bg);
      }

      cv-bottom-sheet {
        --cv-bottom-sheet-max-height: min(90dvh, calc(100dvh - var(--cv-space-4)));
        --cv-bottom-sheet-border-radius: var(--cv-radius-4) var(--cv-radius-4) 0 0;
        --cv-bottom-sheet-header-padding: 0 var(--cv-space-5) var(--cv-space-3);
      }

      cv-bottom-sheet::part(title) {
        font-size: var(--cv-font-size-xl);
        font-weight: var(--cv-font-weight-bold);
        line-height: 1.15;
      }

      cv-bottom-sheet::part(description) {
        font-size: var(--cv-font-size-sm);
        line-height: 1.4;
      }

      cv-bottom-sheet::part(header-close) {
        inline-size: 40px;
        block-size: 40px;
        border-radius: var(--cv-radius-2);
      }

      cv-bottom-sheet::part(body) {
        padding: 0 var(--cv-space-5) var(--cv-space-5);
      }

      cv-bottom-sheet::part(footer) {
        padding: var(--cv-space-3) var(--cv-space-5) max(var(--cv-space-5), env(safe-area-inset-bottom));
        background: var(--cv-color-surface);
      }

      .ssh-view__sheet-body {
        min-inline-size: 0;
      }

      .ssh-view__sheet-action,
      .ssh-view__sheet-action::part(base) {
        inline-size: 100%;
      }

      .ssh-view__sheet-action {
        --cv-button-border-radius: var(--cv-radius-2);
        --cv-button-gap: var(--cv-space-2);
      }

      .ssh-view__sheet-action::part(base) {
        min-block-size: 52px;
        font-size: var(--cv-font-size-base);
        font-weight: var(--cv-font-weight-semibold);
      }

      .ssh-view__sheet-action::part(label) {
        flex: 0 1 auto;
      }

      .ssh-view__sheet-action cv-icon {
        inline-size: 18px;
        block-size: 18px;
      }
    `,
  ]

  static override define() {
    PMSshKeysView.define()
    CVBottomSheet.define()
    MobileSurfaceLayout.define()
    if (!customElements.get('pm-ssh-keys-view-mobile')) customElements.define('pm-ssh-keys-view-mobile', this)
  }

  private handleCreateSheetChange(event: CVBottomSheetChangeEvent) {
    if (event.target !== event.currentTarget || event.detail.open !== false) return
    this.handleCloseCreate()
  }

  private renderCreateSheet() {
    const result = this.model.createForm.result()
    const resultReady = Boolean(result && !result.pending)

    return html`
      <cv-bottom-sheet
        .open=${this.model.createOpen()}
        show-handle
        drag-to-close
        @cv-change=${this.handleCreateSheetChange}
      >
        <span slot="title">${i18n('ssh:add')}</span>
        <span slot="description">${i18n('ssh:description')}</span>
        <div class="ssh-view__sheet-body">
          <pm-entry-ssh-create layout="sheet" .model=${this.model.createForm}></pm-entry-ssh-create>
        </div>
        ${resultReady
          ? html`
              <cv-button
                class="ssh-view__sheet-action"
                slot="footer"
                type="button"
                variant="primary"
                preset="action-primary"
                size="large"
                @click=${this.handleCloseCreate}
              >
                <cv-icon slot="prefix" name="check-circle" aria-hidden="true"></cv-icon>
                ${i18n('button:done')}
              </cv-button>
            `
          : html`
              <cv-button
                class="ssh-view__sheet-action"
                slot="footer"
                type="button"
                variant="primary"
                preset="action-primary"
                size="large"
                .loading=${this.model.generate.pending() > 0}
                ?disabled=${this.model.generate.pending() > 0}
                @click=${this.handleGenerate}
              >
                <cv-icon slot="prefix" name="key" aria-hidden="true"></cv-icon>
                ${i18n('ssh:generate')}
              </cv-button>
            `}
      </cv-bottom-sheet>
    `
  }

  override render() {
    return html`
      <mobile-surface-layout variant="nested" scroll="owned" data-layout="mobile">
        ${this.renderControls('header')}
        <section class="ssh-view" data-layout="mobile">
          <div class="ssh-view__workspace">${this.renderContent()}</div>
        </section>
        ${this.renderSummaryRail('footer')}
      </mobile-surface-layout>
      ${this.renderCreateSheet()}
    `
  }
}
