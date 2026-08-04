import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVCheckbox} from '@chromvoid/uikit/components/cv-checkbox'
import {css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'

import type {WelcomeSectionLayout} from '../welcome-section-layout'
import {
  welcomeSectionCalloutStyles,
  welcomeSectionHostStyles,
  welcomeSectionMobileButtonStyles,
} from '../welcome-section.styles'
import type {WelcomeToolsModel} from '../welcome-tools.model'

export class WelcomeToolsSection extends ReatomLitElement {
  static properties = {
    model: {attribute: false},
    layout: {type: String, reflect: true},
  }

  static styles = [
    welcomeSectionHostStyles,
    welcomeSectionCalloutStyles,
    welcomeSectionMobileButtonStyles,
    css`
      :host {
        display: grid;
        gap: var(--app-spacing-5);
      }

      .tool-card {
        background: var(--cv-color-surface);
        border: 1px solid var(--cv-color-border);
        border-radius: 12px;
        padding: var(--app-spacing-5);
        display: grid;
        gap: var(--app-spacing-4);
      }

      .desktop-utilities {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 18px;
        min-block-size: 48px;
        padding: 0 20px;
        border-block-start: 1px solid var(--cv-color-border-faint);
        background: var(--cv-color-surface-glass-subtle);
      }

      .desktop-utility-actions {
        display: flex;
        flex: 0 0 auto;
        flex-wrap: wrap;
        align-items: center;
        gap: 18px;
        margin-inline-start: auto;
      }

      .desktop-utility-button {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-block-size: 32px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--cv-color-text-muted);
        cursor: pointer;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .desktop-utility-button:hover {
        color: var(--cv-color-text);
      }

      .desktop-utility-button:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 4px;
      }

      .desktop-utility-button:disabled {
        color: var(--cv-color-text-subtle);
        cursor: not-allowed;
      }

      .desktop-utility-button.danger:hover {
        color: var(--cv-color-danger);
      }

      .desktop-utility-button svg {
        inline-size: 14px;
        block-size: 14px;
        flex: 0 0 auto;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }

      .desktop-utility-progress {
        padding: 16px 20px;
        border-block-start: 1px solid var(--cv-color-border-faint);
        background: var(--cv-color-surface);
      }

      :host([layout='desktop']) .utilities-sheet {
        --cv-bottom-sheet-border-radius: 14px;
        --cv-bottom-sheet-body-padding: 0 18px 22px;
        --cv-bottom-sheet-grabber-height: 0px;
        --cv-bottom-sheet-grabber-width: 0px;
        --cv-bottom-sheet-handle-block-size: 18px;
        --cv-bottom-sheet-handle-padding-block: 0;
        --cv-bottom-sheet-max-height: min(86dvh, 620px);
      }

      :host([layout='desktop']) .utilities-sheet::part(content) {
        inline-size: min(460px, 94vw);
        margin-inline: auto;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: 14px;
        background: linear-gradient(180deg, var(--cv-color-surface) 0%, var(--cv-color-bg) 100%);
        box-shadow: 0 30px 80px var(--cv-alpha-black-65);
      }

      .tool-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--cv-color-text-muted);
        border-bottom: 1px solid var(--cv-color-border-muted);
        padding-bottom: var(--app-spacing-2);
      }

      .tool-actions {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .meta-info {
        min-block-size: 48px;
        display: flex;
        align-items: center;
        font-family: var(--cv-font-family-code);
        font-size: 0.75rem;
        color: var(--cv-color-text-muted);
        word-break: break-all;
        background: var(--cv-color-surface-3);
        padding: var(--app-spacing-2);
        border-radius: 6px;
      }

      .privacy-blur {
        filter: blur(4px);
      }

      .privacy-blur:hover {
        filter: blur(0);
      }

      .privacy-toggle {
        display: inline-grid;
        place-items: center;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        color: var(--cv-color-text-muted);
        font: inherit;
        transition: color 0.2s;
      }

      .privacy-toggle:hover {
        color: var(--cv-color-text);
      }

      .privacy-toggle:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 3px;
      }

      .location-actions {
        display: flex;
        align-items: stretch;
        gap: var(--app-spacing-2);
      }

      .location-change-button {
        flex: 1 1 auto;
        min-inline-size: 0;
      }

      .location-reset-button {
        flex: 0 0 auto;
        width: auto;
      }

      .location-reset-button::part(base) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 30px;
        block-size: 30px;
        min-inline-size: 30px;
        padding: 0;
      }

      .location-reset-button svg {
        flex: 0 0 auto;
      }

      .backup-progress {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .backup-progress-header,
      .backup-progress-stats {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-3);
      }

      .backup-progress-phase,
      .backup-progress-percent {
        color: var(--cv-color-text);
        font-size: 0.82rem;
        font-weight: 600;
      }

      .backup-progress-stats {
        color: var(--cv-color-text-subtle);
        font-size: 0.75rem;
        line-height: 1.4;
        flex-wrap: wrap;
      }

      .backup-progress-bar {
        --cv-progress-height: 6px;
        --cv-progress-track-color: var(--cv-color-surface-3);
        --cv-progress-indicator-background: var(--cv-gradient-progress-primary);
      }

      .mobile-support {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .mobile-utilities-button {
        display: flex;
        align-items: center;
        gap: 13px;
        inline-size: 100%;
        padding: 16px 2px 0;
        border: 0;
        border-top: 1px solid var(--welcome-lockscreen-border-faint);
        background: transparent;
        color: inherit;
        text-align: start;
        cursor: pointer;
      }

      .mobile-utilities-button:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 4px;
      }

      .mobile-utilities-button:hover {
        opacity: 0.78;
      }

      .mobile-utilities-icon {
        inline-size: 18px;
        block-size: 18px;
        flex: 0 0 auto;
        color: var(--welcome-lockscreen-foreground-subtle);
      }

      .mobile-utilities-icon svg,
      .mobile-utilities-chevron {
        inline-size: 100%;
        block-size: 100%;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        fill: none;
      }

      .mobile-utilities-copy {
        flex: 1 1 auto;
        min-inline-size: 0;
      }

      .mobile-utilities-label {
        display: block;
        color: var(--welcome-lockscreen-foreground-muted);
        font-size: 0.84375rem;
        font-weight: 650;
      }

      .mobile-utilities-meta {
        display: block;
        margin-block-start: 3px;
        color: var(--welcome-lockscreen-foreground-subtle);
        font-family: var(--cv-font-family-code);
        font-size: 0.65625rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        line-height: 1.35;
      }

      .mobile-utilities-chevron {
        inline-size: 16px;
        block-size: 16px;
        flex: 0 0 auto;
        color: var(--welcome-lockscreen-foreground-subtle);
        stroke-width: 2;
      }

      .utilities-sheet {
        --cv-bottom-sheet-border-radius: 24px 24px 0 0;
        --cv-bottom-sheet-overlay-color: var(--cv-color-overlay);
        --cv-bottom-sheet-max-height: 90dvh;
        --cv-bottom-sheet-body-padding: 0 22px max(24px, calc(env(safe-area-inset-bottom, 0px) + 18px));
        --cv-bottom-sheet-handle-block-size: 32px;
        --cv-bottom-sheet-handle-padding-block: 12px 0;
        --cv-bottom-sheet-grabber-width: 38px;
        --cv-bottom-sheet-grabber-height: 4px;
        --cv-bottom-sheet-grabber-color: var(--welcome-lockscreen-border-strong);
      }

      .utilities-sheet::part(content) {
        border-block-start: 1px solid var(--welcome-lockscreen-border-muted);
        background: var(--welcome-lockscreen-surface);
        box-shadow: 0 -24px 70px var(--cv-alpha-black-62);
      }

      .utilities-sheet-header {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-3);
        margin-block: 16px 6px;
      }

      .utilities-sheet-title {
        flex: 1;
        min-inline-size: 0;
        color: var(--welcome-lockscreen-foreground);
        font-size: 1.0625rem;
        font-weight: 650;
      }

      .utilities-sheet-back,
      .utilities-sheet-close {
        display: inline-grid;
        place-items: center;
        inline-size: 30px;
        block-size: 30px;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--welcome-lockscreen-foreground-subtle);
        cursor: pointer;
      }

      .utilities-sheet-back:focus-visible,
      .utilities-sheet-close:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 2px;
      }

      .utilities-sheet-back svg,
      .utilities-sheet-close svg {
        inline-size: 18px;
        block-size: 18px;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
      }

      .utilities-sheet-note {
        margin: 0 0 20px;
        color: var(--welcome-lockscreen-foreground-subtle);
        font-family: var(--cv-font-family-code);
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1.55;
        letter-spacing: 0.02em;
      }

      .utilities-sheet-view {
        display: grid;
        gap: 0;
      }

      .utilities-subscreen-desc {
        margin: 0 0 18px;
        color: var(--welcome-lockscreen-foreground-muted);
        font-size: 0.84375rem;
        line-height: 1.5;
      }

      .utilities-system-panel {
        display: grid;
        gap: 12px;
        margin-block-end: 20px;
      }

      .utilities-system-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-3);
      }

      .utilities-system-title {
        color: var(--welcome-lockscreen-foreground-subtle);
        font-family: var(--cv-font-family-code);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .utilities-form {
        display: grid;
        gap: 15px;
      }

      .utilities-field {
        display: grid;
        gap: 9px;
      }

      .utilities-field-label {
        color: var(--welcome-lockscreen-foreground-subtle);
        font-family: var(--cv-font-family-code);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .utilities-password-input {
        --cv-input-height: 50px;
        --cv-input-background: var(--welcome-lockscreen-input-background);
        --cv-input-border-color: var(--welcome-lockscreen-border-muted);
        --cv-input-border-radius: 11px;
        --cv-input-color: var(--welcome-lockscreen-foreground);
        --cv-input-placeholder-color: var(--welcome-lockscreen-foreground-subtle);
        --cv-input-padding-inline: 15px;
        --cv-input-focus-border-color: var(--cv-color-primary);
        --cv-input-focus-ring-color: var(--welcome-lockscreen-primary-ring);
      }

      .utilities-password-input::part(input) {
        font-size: 1rem;
        font-weight: 550;
        letter-spacing: 0.06em;
      }

      .utilities-inline-check {
        --cv-color-text: var(--welcome-lockscreen-foreground-muted);
        --cv-color-surface: var(--welcome-lockscreen-input-background);
        --cv-color-border: var(--welcome-lockscreen-border-muted);
        display: block;
        padding: 12px;
        border: 1px solid var(--welcome-lockscreen-border-faint);
        border-radius: 12px;
        color: var(--welcome-lockscreen-foreground-muted);
        font-size: 0.8125rem;
        line-height: 1.45;
      }

      .utilities-inline-check::part(base) {
        align-items: flex-start;
        color: var(--welcome-lockscreen-foreground-muted);
      }

      .utilities-inline-check::part(indicator) {
        margin-block-start: 1px;
        background: var(--welcome-lockscreen-input-background);
        border-color: var(--welcome-lockscreen-border-muted);
      }

      .utilities-form-error {
        border: 1px solid var(--cv-color-danger-border);
        border-radius: 12px;
        background: var(--cv-color-danger-surface);
        color: var(--cv-color-danger);
        padding: 11px 12px;
        font-size: 0.8125rem;
        line-height: 1.45;
      }

      .utilities-form-actions {
        display: grid;
        gap: var(--app-spacing-2);
        margin-block-start: 2px;
      }

      .utilities-form-submit::part(base) {
        min-block-size: 50px;
        border-radius: 14px;
        background: var(--cv-color-primary);
        color: var(--welcome-lockscreen-on-primary);
        font-weight: 700;
        box-shadow: 0 8px 30px var(--welcome-lockscreen-primary-shadow);
      }

      .utilities-form-submit[variant='danger']::part(base) {
        background: var(--cv-color-danger);
        color: var(--cv-color-text-strongest);
        box-shadow: 0 8px 30px var(--cv-color-danger-ring);
      }

      .utilities-progress-inline {
        margin-block-start: 2px;
      }

      .utilities-list {
        overflow: hidden;
        border: 1px solid var(--welcome-lockscreen-border-faint);
        border-radius: 14px;
      }

      .utilities-row {
        display: flex;
        align-items: center;
        gap: 14px;
        inline-size: 100%;
        min-block-size: 65px;
        padding: 14px;
        border: 0;
        border-bottom: 1px solid var(--welcome-lockscreen-border-faint);
        background: transparent;
        color: inherit;
        text-align: start;
        cursor: pointer;
      }

      .utilities-row:last-child {
        border-bottom: 0;
      }

      .utilities-row:hover {
        background: var(--welcome-lockscreen-border-faint);
      }

      .utilities-row:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: -2px;
      }

      .utilities-row-icon {
        display: grid;
        place-items: center;
        inline-size: 36px;
        block-size: 36px;
        flex: 0 0 auto;
        border: 1px solid var(--welcome-lockscreen-border-faint);
        border-radius: 10px;
        background: var(--welcome-lockscreen-border-faint);
        color: var(--welcome-lockscreen-foreground-muted);
      }

      .utilities-row-icon svg {
        inline-size: 19px;
        block-size: 19px;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }

      .utilities-row-copy {
        flex: 1 1 auto;
        min-inline-size: 0;
      }

      .utilities-row-title {
        display: block;
        color: var(--welcome-lockscreen-foreground);
        font-size: 0.9375rem;
        font-weight: 650;
      }

      .utilities-row-meta {
        display: block;
        margin-block-start: 3px;
        color: var(--welcome-lockscreen-foreground-subtle);
        font-family: var(--cv-font-family-code);
        font-size: 0.65625rem;
        font-weight: 600;
        line-height: 1.35;
      }

      .utilities-row-arrow {
        inline-size: 8px;
        block-size: 14px;
        flex: 0 0 auto;
        color: var(--welcome-lockscreen-foreground-subtle);
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }

      .utilities-danger-label {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 22px 2px 10px;
        color: var(--cv-color-danger);
        font-family: var(--cv-font-family-code);
        font-size: 0.59375rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        opacity: 0.75;
      }

      .utilities-danger-label::after {
        content: '';
        flex: 1 1 auto;
        block-size: 1px;
        background: var(--cv-color-danger-border);
      }

      .utilities-row.danger {
        border: 1px solid var(--cv-color-danger-border);
        border-radius: 14px;
        background: var(--cv-color-danger-surface);
      }

      .utilities-row.danger:hover {
        background: var(--cv-color-danger-surface-strong);
      }

      .utilities-row.danger .utilities-row-icon {
        border-color: var(--cv-color-danger-border);
        background: var(--cv-color-danger-surface);
        color: var(--cv-color-danger);
      }

      .utilities-row.danger .utilities-row-title {
        color: var(--cv-color-danger);
      }

      .utilities-row.danger .utilities-row-meta {
        color: var(--welcome-lockscreen-foreground-subtle);
      }

      .utilities-row.danger .utilities-row-arrow {
        color: var(--cv-color-danger);
        opacity: 0.6;
      }

      .mobile-operation {
        display: grid;
        gap: var(--app-spacing-3);
        border-radius: 16px;
        border: 1px solid var(--cv-color-border-accent);
        background: var(--cv-color-surface-2);
        padding: var(--app-spacing-5);
        box-shadow: var(--cv-shadow-1);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      :host([layout='mobile']) .tool-actions cv-button[variant='danger']::part(base) {
        background: var(--cv-color-danger-surface);
      }

      @media (max-height: 700px) {
        .mobile-utilities-button {
          gap: 10px;
          padding-block-start: 10px;
        }

        .mobile-utilities-icon {
          inline-size: 16px;
          block-size: 16px;
        }

        .mobile-utilities-label {
          font-size: 0.8125rem;
        }

        .mobile-utilities-meta {
          margin-block-start: 2px;
          font-size: 0.59375rem;
          line-height: 1.25;
        }
      }

      @media (max-height: 620px) {
        .mobile-utilities-button {
          min-block-size: 44px;
          padding-block-start: 8px;
        }

        .mobile-utilities-meta {
          display: none;
        }
      }
    `,
  ]

  declare model?: WelcomeToolsModel
  declare layout: WelcomeSectionLayout

  constructor() {
    super()
    this.layout = 'desktop'
  }

  static define() {
    CVBottomSheet.define()
    CVCheckbox.define()
    if (!customElements.get('welcome-tools-section')) {
      customElements.define('welcome-tools-section', this)
    }
  }

  private renderSheetBackButton() {
    if (!this.model) {
      return nothing
    }

    return html`
      <button
        class="utilities-sheet-back"
        type="button"
        @click=${this.model.backToDeviceUtilitiesList}
        aria-label=${i18n('button:back')}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6l-6 6 6 6"></path>
        </svg>
      </button>
    `
  }

  private renderSheetCloseButton() {
    if (!this.model) {
      return nothing
    }

    return html`
      <button
        class="utilities-sheet-close"
        type="button"
        @click=${this.model.closeDeviceUtilities}
        aria-label=${i18n('button:close')}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"></path>
        </svg>
      </button>
    `
  }

  private renderUtilitiesSheetHeader(title: string, back = false) {
    return html`
      <div class="utilities-sheet-header">
        ${back ? this.renderSheetBackButton() : nothing}
        <div class="utilities-sheet-title">${title}</div>
        ${this.renderSheetCloseButton()}
      </div>
    `
  }

  private renderUtilitiesError() {
    if (!this.model) {
      return nothing
    }

    const error = this.model.deviceUtilitiesForm().error
    return error ? html`<div class="utilities-form-error" role="alert">${error}</div>` : nothing
  }

  private renderUtilitiesMasterPasswordField() {
    if (!this.model) {
      return nothing
    }

    return html`
      <label class="utilities-field">
        <span class="utilities-field-label">${i18n('welcome:master-password')}</span>
        <cv-input
          class="utilities-password-input"
          type="password"
          password-toggle
          autocomplete="current-password"
          enterkeyhint="done"
          placeholder="••••••••••••"
          .value=${this.model.deviceUtilitiesForm().masterPassword}
          @cv-input=${this.model.handleDeviceUtilitiesMasterPasswordInput}
        ></cv-input>
      </label>
    `
  }

  private renderUtilitiesRow(options: {
    title: string
    meta: string
    icon: unknown
    onClick: () => void
    danger?: boolean
    disabled?: boolean
  }) {
    return html`
      <button
        class="utilities-row ${options.danger ? 'danger' : ''}"
        type="button"
        ?disabled=${options.disabled}
        @click=${options.onClick}
      >
        <span class="utilities-row-icon">${options.icon}</span>
        <span class="utilities-row-copy">
          <span class="utilities-row-title">${options.title}</span>
          <span class="utilities-row-meta">${options.meta}</span>
        </span>
        <svg class="utilities-row-arrow" viewBox="0 0 8 14" aria-hidden="true">
          <path d="M1 1l6 6-6 6"></path>
        </svg>
      </button>
    `
  }

  private renderUtilitiesListView() {
    if (!this.model) {
      return nothing
    }

    const busy = this.model.busy()
    const masterRekeyInProgress = this.model.masterRekeyInProgress()

    return html`
      <div class="utilities-sheet-view">
        ${this.renderUtilitiesSheetHeader(i18n('welcome:device-utilities'))}
        <p class="utilities-sheet-note">${i18n('welcome:device-utilities-note')}</p>

        <div class="utilities-list">
          ${this.renderUtilitiesRow({
            title: i18n('button:backup'),
            meta: i18n('welcome:backup-utility-meta'),
            icon: html`
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 16v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2M12 4v10M8 8l4-4 4 4"></path>
              </svg>
            `,
            onClick: this.model.onBackupFromDeviceUtilities,
            disabled: busy,
          })}
          ${this.renderUtilitiesRow({
            title: i18n('button:restore'),
            meta: i18n('welcome:restore-utility-meta'),
            icon: html`
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 16v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2M12 14V4M8 10l4 4 4-4"></path>
              </svg>
            `,
            onClick: this.model.onRestoreFromDeviceUtilities,
            disabled: busy,
          })}
          ${this.renderUtilitiesRow({
            title: i18n('button:changepwd'),
            meta: i18n('welcome:change-password-utility-meta'),
            icon: html`
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v5h-5"></path>
              </svg>
            `,
            onClick: this.model.onMasterPasswordChangeFromDeviceUtilities,
            disabled: busy || masterRekeyInProgress,
          })}
        </div>

        <div class="utilities-danger-label">${i18n('welcome:destructive-label')}</div>
        ${this.renderUtilitiesRow({
          title: i18n('button:erase'),
          meta: i18n('welcome:erase-utility-meta'),
          icon: html`
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"></path>
            </svg>
          `,
          onClick: this.model.onEraseFromDeviceUtilities,
          danger: true,
          disabled: busy,
        })}
      </div>
    `
  }

  private renderBackupUtilitiesView() {
    if (!this.model) {
      return nothing
    }

    const inProgress = this.model.backupInProgress()

    return html`
      <div class="utilities-sheet-view">
        ${this.renderUtilitiesSheetHeader(i18n('button:backup'), true)}
        <p class="utilities-subscreen-desc">${i18n('welcome:backup-inline-desc')}</p>

        ${inProgress
          ? html`<div class="utilities-progress-inline">${this.renderBackupProgress()}</div>`
          : html`
              <form class="utilities-form" @submit=${this.model.handleDeviceUtilitiesBackupSubmit}>
                ${this.renderUtilitiesMasterPasswordField()} ${this.renderUtilitiesError()}
                <div class="utilities-form-actions">
                  <cv-button
                    class="utilities-form-submit"
                    variant="primary"
                    type="submit"
                    ?disabled=${this.model.deviceUtilitiesSubmitDisabled()}
                    .loading=${this.model.backupInProgress()}
                  >
                    ${i18n('button:backup')}
                  </cv-button>
                </div>
              </form>
            `}
      </div>
    `
  }

  private renderRestoreUtilitiesView() {
    if (!this.model) {
      return nothing
    }

    const form = this.model.deviceUtilitiesForm()
    const inProgress = this.model.restoreInProgress()

    return html`
      <div class="utilities-sheet-view">
        ${this.renderUtilitiesSheetHeader(i18n('button:restore'), true)}
        <p class="utilities-subscreen-desc">${i18n('welcome:restore-inline-desc')}</p>

        ${inProgress
          ? html`<div class="utilities-progress-inline">${this.renderRestoreProgress()}</div>`
          : html`
              <form class="utilities-form" @submit=${this.model.handleDeviceUtilitiesRestoreSubmit}>
                <cv-checkbox
                  class="utilities-inline-check"
                  .checked=${form.restoreConfirmed}
                  @cv-change=${this.model.handleDeviceUtilitiesRestoreConfirmChange}
                >
                  ${i18n('welcome:restore-inline-confirm')}
                </cv-checkbox>
                ${this.renderUtilitiesMasterPasswordField()} ${this.renderUtilitiesError()}
                <div class="utilities-form-actions">
                  <cv-button
                    class="utilities-form-submit"
                    variant="primary"
                    type="submit"
                    ?disabled=${this.model.deviceUtilitiesSubmitDisabled()}
                    .loading=${this.model.restoreInProgress()}
                  >
                    ${i18n('button:restore')}
                  </cv-button>
                </div>
              </form>
            `}
      </div>
    `
  }

  private renderMasterPasswordUtilitiesView() {
    if (!this.model) {
      return nothing
    }

    const form = this.model.deviceUtilitiesForm()

    return html`
      <div class="utilities-sheet-view">
        ${this.renderUtilitiesSheetHeader(i18n('button:changepwd'), true)}
        <p class="utilities-subscreen-desc">${i18n('welcome:change-password-inline-desc')}</p>

        <form class="utilities-form" @submit=${this.model.handleDeviceUtilitiesMasterPasswordSubmit}>
          <label class="utilities-field">
            <span class="utilities-field-label">${i18n('changepwd:old:title')}</span>
            <cv-input
              class="utilities-password-input"
              type="password"
              password-toggle
              autocomplete="current-password"
              .value=${form.currentPassword}
              @cv-input=${this.model.handleDeviceUtilitiesCurrentPasswordInput}
            ></cv-input>
          </label>
          <label class="utilities-field">
            <span class="utilities-field-label">${i18n('changepwd:new:title')}</span>
            <cv-input
              class="utilities-password-input"
              type="password"
              password-toggle
              autocomplete="new-password"
              .value=${form.newMasterPassword}
              @cv-input=${this.model.handleDeviceUtilitiesNewMasterPasswordInput}
            ></cv-input>
          </label>
          <label class="utilities-field">
            <span class="utilities-field-label">${i18n('changepwd:confirm:title')}</span>
            <cv-input
              class="utilities-password-input"
              type="password"
              password-toggle
              autocomplete="new-password"
              enterkeyhint="done"
              .value=${form.confirmPassword}
              @cv-input=${this.model.handleDeviceUtilitiesConfirmPasswordInput}
            ></cv-input>
          </label>
          ${this.renderUtilitiesError()}
          <div class="utilities-form-actions">
            <cv-button
              class="utilities-form-submit"
              variant="primary"
              type="submit"
              ?disabled=${this.model.deviceUtilitiesSubmitDisabled()}
              .loading=${this.model.masterRekeyInProgress()}
            >
              ${i18n('button:changepwd')}
            </cv-button>
          </div>
        </form>
      </div>
    `
  }

  private renderSystemUtilitiesView() {
    if (!this.model) {
      return nothing
    }

    const supportsStorageRootSelection = this.model.supportsStorageRootSelection()
    const busy = this.model.busy()
    const isPrivacyMode = this.model.isPrivacyMode()
    const storePath = this.model.storePath()

    return html`
      <div class="utilities-sheet-view">
        ${this.renderUtilitiesSheetHeader(i18n('welcome:system-title'))}

        <div class="utilities-system-panel">
          <div class="utilities-system-header">
            <div class="utilities-system-title">${i18n('welcome:storage-folder')}</div>
            <button
              class="privacy-toggle"
              type="button"
              @click=${this.model.togglePrivacy}
              title=${i18n('welcome:toggle-privacy')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
                ${isPrivacyMode ? html`<line x1="1" y1="1" x2="23" y2="23"></line>` : nothing}
              </svg>
            </button>
          </div>
          <div class="meta-info ${isPrivacyMode ? 'privacy-blur' : ''}">
            ${storePath || i18n('welcome:no-path-set')}
          </div>
          ${supportsStorageRootSelection
            ? html`
                <div class="location-actions">
                  <cv-button
                    class="location-change-button"
                    size="small"
                    variant="default"
                    ?disabled=${busy}
                    @click=${this.model.onChangeStorePath}
                  >
                    ${i18n('welcome:change-location')}
                  </cv-button>
                  <cv-button
                    class="location-reset-button"
                    size="small"
                    variant="ghost"
                    ?disabled=${busy}
                    title=${i18n('welcome:use-default-location')}
                    @click=${this.model.onUseDefaultStorePath}
                  >
                    <span class="sr-only">${i18n('welcome:use-default-location')}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 10.5 12 3l9 7.5"></path>
                      <path d="M5 9.5V21h14V9.5"></path>
                      <path d="M9 21v-6h6v6"></path>
                    </svg>
                  </cv-button>
                </div>
              `
            : nothing}
        </div>

        <div class="utilities-danger-label">${i18n('welcome:destructive-label')}</div>
        ${this.renderUtilitiesRow({
          title: i18n('button:erase'),
          meta: i18n('welcome:erase-utility-meta'),
          icon: html`
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"></path>
            </svg>
          `,
          onClick: this.model.onEraseFromDeviceUtilities,
          danger: true,
          disabled: busy,
        })}
      </div>
    `
  }

  private renderEraseUtilitiesView() {
    if (!this.model) {
      return nothing
    }

    const form = this.model.deviceUtilitiesForm()

    return html`
      <div class="utilities-sheet-view">
        ${this.renderUtilitiesSheetHeader(i18n('button:erase'), true)}
        <p class="utilities-subscreen-desc">${i18n('welcome:erase-inline-desc')}</p>

        <form class="utilities-form" @submit=${this.model.handleDeviceUtilitiesEraseSubmit}>
          <cv-checkbox
            class="utilities-inline-check"
            .checked=${form.eraseConfirmed}
            @cv-change=${this.model.handleDeviceUtilitiesEraseConfirmChange}
          >
            ${i18n('welcome:erase-inline-confirm')}
          </cv-checkbox>
          ${this.renderUtilitiesMasterPasswordField()} ${this.renderUtilitiesError()}
          <div class="utilities-form-actions">
            <cv-button
              class="utilities-form-submit"
              variant="danger"
              type="submit"
              ?disabled=${this.model.deviceUtilitiesSubmitDisabled()}
            >
              ${i18n('button:erase')}
            </cv-button>
          </div>
        </form>
      </div>
    `
  }

  private renderUtilitiesSheetContent() {
    if (!this.model) {
      return nothing
    }

    switch (this.model.deviceUtilitiesScreen()) {
      case 'backup':
        return this.renderBackupUtilitiesView()
      case 'restore':
        return this.renderRestoreUtilitiesView()
      case 'master-password':
        return this.renderMasterPasswordUtilitiesView()
      case 'system':
        return this.renderSystemUtilitiesView()
      case 'erase':
        return this.renderEraseUtilitiesView()
      default:
        return this.renderUtilitiesListView()
    }
  }

  private renderUtilitiesSheet() {
    if (!this.model) {
      return nothing
    }

    return html`
      <cv-bottom-sheet
        class="utilities-sheet"
        .open=${this.model.deviceUtilitiesSheetOpen()}
        no-header
        show-handle
        drag-to-close
        @cv-change=${this.model.handleDeviceUtilitiesSheetChange}
      >
        ${this.renderUtilitiesSheetContent()}
      </cv-bottom-sheet>
    `
  }

  private renderBackupProgress() {
    if (!this.model) {
      return nothing
    }

    const progress = this.model.backupProgress()
    const percent = this.model.backupProgressPercent()
    const isIndeterminate = !progress || progress.estimated_size === 0
    const cancelling = this.model.backupCancelling()

    return html`
      <div class="backup-progress">
        <cv-callout variant="info">
          ${cancelling
            ? i18n('remote-storage:backup-stopping-text')
            : i18n('remote-storage:backup-running-text')}
        </cv-callout>

        <div class="backup-progress-header">
          <span class="backup-progress-phase">
            ${progress
              ? this.model.getBackupPhaseLabel(progress.phase)
              : i18n('remote-storage:phase-starting')}
          </span>
          <span class="backup-progress-percent">${isIndeterminate ? '0%' : `${percent}%`}</span>
        </div>

        <cv-progress
          class="backup-progress-bar"
          .value=${percent}
          .max=${100}
          .indeterminate=${isIndeterminate}
          .valueText=${`${percent}%`}
          .ariaLabel=${i18n('remote-storage:backup-running')}
        ></cv-progress>

        <div class="backup-progress-stats">
          <span>
            ${progress
              ? i18n('remote-storage:progress-block', {
                  current: progress.chunk_index,
                  total: progress.chunk_count,
                })
              : i18n('remote-storage:progress-initializing')}
          </span>
          <span>
            ${progress ? this.model.formatBackupBytes(progress.bytes_written) : '0 B'} /
            ${progress ? this.model.formatBackupBytes(progress.estimated_size) : '—'}
          </span>
        </div>

        <cv-button variant="default" ?disabled=${cancelling} @click=${this.model.cancelBackup}>
          ${cancelling ? i18n('remote-storage:canceling-export') : i18n('remote-storage:cancel-export')}
        </cv-button>
      </div>
    `
  }

  private renderRestoreProgress() {
    if (!this.model) {
      return nothing
    }

    const progress = this.model.restoreProgress()
    const percent = this.model.restoreProgressPercent()
    const isIndeterminate = !progress || (progress.estimated_size === 0 && progress.chunk_count === 0)
    const cancelling = this.model.restoreCancelling()

    return html`
      <div class="backup-progress">
        <cv-callout variant="info">
          ${cancelling ? i18n('welcome:restore-stopping') : i18n('welcome:restore-running')}
        </cv-callout>

        <div class="backup-progress-header">
          <span class="backup-progress-phase">
            ${progress
              ? this.model.getRestorePhaseLabel(progress.phase)
              : i18n('welcome:restore-phase-starting')}
          </span>
          <span class="backup-progress-percent">${isIndeterminate ? '0%' : `${percent}%`}</span>
        </div>

        <cv-progress
          class="backup-progress-bar"
          .value=${percent}
          .max=${100}
          .indeterminate=${isIndeterminate}
          .valueText=${`${percent}%`}
          .ariaLabel=${i18n('welcome:restore-running')}
        ></cv-progress>

        <div class="backup-progress-stats">
          <span>
            ${progress
              ? i18n('remote-storage:progress-block', {
                  current: progress.chunk_index,
                  total: progress.chunk_count,
                })
              : i18n('remote-storage:progress-initializing')}
          </span>
          <span>
            ${progress ? this.model.formatBackupBytes(progress.bytes_written) : '0 B'} /
            ${progress && progress.estimated_size > 0
              ? this.model.formatBackupBytes(progress.estimated_size)
              : '—'}
          </span>
        </div>

        <cv-button variant="default" ?disabled=${cancelling} @click=${this.model.cancelRestore}>
          ${cancelling ? i18n('welcome:restore-canceling') : i18n('welcome:cancel-restore')}
        </cv-button>
      </div>
    `
  }

  private renderDesktopTools() {
    if (!this.model) {
      return nothing
    }

    const busy = this.model.busy()
    const backupInProgress = this.model.backupInProgress()
    const restoreInProgress = this.model.restoreInProgress()

    return html`
      <div class="desktop-utilities">
        <div class="desktop-utility-actions">
          <button
            class="desktop-utility-button"
            type="button"
            ?disabled=${busy}
            @click=${this.model.openDeviceUtilities}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path>
              <circle cx="15" cy="7" r="2.3"></circle>
              <circle cx="9" cy="17" r="2.3"></circle>
            </svg>
            ${i18n('welcome:device-utilities')}
          </button>
          <button
            class="desktop-utility-button danger"
            type="button"
            ?disabled=${busy}
            @click=${this.model.openSystemUtilities}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"></path>
            </svg>
            ${i18n('welcome:system-title')}
          </button>
        </div>
      </div>
      ${backupInProgress
        ? html`<div class="desktop-utility-progress">${this.renderBackupProgress()}</div>`
        : nothing}
      ${restoreInProgress
        ? html`<div class="desktop-utility-progress">${this.renderRestoreProgress()}</div>`
        : nothing}
      ${renderGuidanceInline('welcome.backup-tools', 'welcome')} ${this.renderUtilitiesSheet()}
    `
  }

  private renderMobileTools() {
    if (!this.model) {
      return nothing
    }

    const busy = this.model.busy()
    const backupInProgress = this.model.backupInProgress()
    const restoreInProgress = this.model.restoreInProgress()

    return html`
      <div class="mobile-support">
        ${backupInProgress
          ? html`<div class="mobile-operation">${this.renderBackupProgress()}</div>`
          : nothing}
        <button
          class="mobile-utilities-button"
          type="button"
          ?disabled=${busy && !backupInProgress && !restoreInProgress}
          @click=${this.model.openDeviceUtilities}
        >
          <span class="mobile-utilities-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path>
              <circle cx="15" cy="7" r="2.3"></circle>
              <circle cx="9" cy="17" r="2.3"></circle>
            </svg>
          </span>
          <span class="mobile-utilities-copy">
            <span class="mobile-utilities-label">${i18n('welcome:device-utilities')}</span>
            <span class="mobile-utilities-meta">${i18n('welcome:device-utilities-meta')}</span>
          </span>
          <svg class="mobile-utilities-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 15l6-6 6 6"></path>
          </svg>
        </button>
        ${renderGuidanceInline('welcome.backup-tools', 'welcome')}
        ${restoreInProgress
          ? html`<div class="mobile-operation">${this.renderRestoreProgress()}</div>`
          : nothing}
        ${this.renderUtilitiesSheet()}
      </div>
    `
  }

  protected render() {
    if (!this.model) {
      return nothing
    }

    return this.layout === 'mobile' ? this.renderMobileTools() : this.renderDesktopTools()
  }
}
