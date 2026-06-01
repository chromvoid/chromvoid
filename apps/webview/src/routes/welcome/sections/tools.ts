import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
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
        cursor: pointer;
        color: var(--cv-color-text-muted);
        transition: color 0.2s;
      }

      .privacy-toggle:hover {
        color: var(--cv-color-text);
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

      .tool-section-divider {
        margin-top: var(--app-spacing-3);
        padding-top: var(--app-spacing-3);
        border-top: 1px solid var(--cv-color-border-muted);
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

      .mobile-operation {
        display: grid;
        gap: var(--app-spacing-3);
        border-radius: 16px;
        border: 1px solid var(--cv-color-border-accent);
        background: var(--cv-color-surface-2);
        padding: var(--app-spacing-5);
        box-shadow: var(--cv-shadow-1);
      }

      .mobile-panel {
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--cv-color-border);
        background: var(--cv-color-surface-2);
        box-shadow: var(--cv-shadow-1);
      }

      .mobile-panel[open] {
        border-color: var(--cv-color-border-accent);
      }

      .mobile-panel-summary {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--app-spacing-2);
        align-items: center;
        padding: var(--app-spacing-4) var(--app-spacing-5);
        cursor: pointer;
        list-style: none;
      }

      .mobile-panel-summary::-webkit-details-marker {
        display: none;
      }

      .mobile-panel-title {
        display: grid;
        gap: 2px;
      }

      .mobile-panel-label {
        color: var(--cv-color-text);
        font-size: 0.95rem;
        font-weight: 600;
      }

      .mobile-panel-meta {
        color: var(--cv-color-text-subtle);
        font-size: 0.8rem;
        line-height: 1.4;
      }

      .mobile-panel-summary::after {
        content: '+';
        color: var(--cv-color-brand);
        font-size: 1.15rem;
        font-weight: 500;
      }

      .mobile-panel[open] .mobile-panel-summary::after {
        content: '-';
      }

      .mobile-panel-body {
        display: grid;
        gap: var(--app-spacing-3);
        padding: 0 var(--app-spacing-5) var(--app-spacing-5);
      }

      .mobile-panel-note {
        color: var(--cv-color-text-subtle);
        font-size: 0.85rem;
        line-height: 1.5;
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
    `,
  ]

  declare model?: WelcomeToolsModel
  declare layout: WelcomeSectionLayout

  constructor() {
    super()
    this.layout = 'desktop'
  }

  static define() {
    if (!customElements.get('welcome-tools-section')) {
      customElements.define('welcome-tools-section', this)
    }
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
          ${cancelling ? i18n('remote-storage:backup-stopping-text') : i18n('remote-storage:backup-running-text')}
        </cv-callout>

        <div class="backup-progress-header">
          <span class="backup-progress-phase">
            ${progress ? this.model.getBackupPhaseLabel(progress.phase) : i18n('remote-storage:phase-starting')}
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
            ${progress ? this.model.getRestorePhaseLabel(progress.phase) : i18n('welcome:restore-phase-starting')}
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
            ${progress && progress.estimated_size > 0 ? this.model.formatBackupBytes(progress.estimated_size) : '—'}
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

    const isDesktopRuntime = this.model.isDesktopRuntime()
    const supportsStorageRootSelection = this.model.supportsStorageRootSelection()
    const busy = this.model.busy()
    const backupInProgress = this.model.backupInProgress()
    const restoreInProgress = this.model.restoreInProgress()
    const masterRekeyInProgress = this.model.masterRekeyInProgress()
    const isPrivacyMode = this.model.isPrivacyMode()
    const storePath = this.model.storePath()

    return html`
      <div class="tool-card">
        <div class="tool-header">${i18n('onboard:tools:title')}</div>
        <div class="tool-actions">
          <cv-guidance-anchor anchor-id="welcome.backup-tools" surface="welcome" owner="welcome">
            <cv-button variant="default" ?disabled=${busy} @click=${this.model.onBackupClick}>
              ${i18n('button:backup')}
            </cv-button>
            <cv-button variant="default" ?disabled=${busy} @click=${this.model.onRestoreClick}>
              ${i18n('button:restore')}
            </cv-button>
            <cv-button
              variant="default"
              ?disabled=${busy}
              .loading=${masterRekeyInProgress}
              @click=${this.model.onMasterPasswordChangeClick}
            >
              ${i18n('button:changepwd')}
            </cv-button>
          </cv-guidance-anchor>
          <cv-guidance-anchor anchor-id="welcome.erase-device" surface="welcome" owner="welcome">
            <cv-button variant="danger" ?disabled=${busy} @click=${this.model.onEraseClick}>
              ${i18n('button:erase')}
            </cv-button>
          </cv-guidance-anchor>
        </div>
        ${renderGuidanceInline('welcome.backup-tools', 'welcome')}
        ${backupInProgress ? this.renderBackupProgress() : nothing}
        ${restoreInProgress ? this.renderRestoreProgress() : nothing}
      </div>

      <div class="tool-card">
        <div class="tool-header">
          ${i18n('welcome:system-title')}
          <div class="privacy-toggle" @click=${this.model.togglePrivacy} title=${i18n('welcome:toggle-privacy')}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
              ${isPrivacyMode ? html`<line x1="1" y1="1" x2="23" y2="23"></line>` : nothing}
            </svg>
          </div>
        </div>
        <div class="meta-info ${isPrivacyMode ? 'privacy-blur' : ''}">${storePath || i18n('welcome:no-path-set')}</div>
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
        ${isDesktopRuntime
          ? html`
              <div class="tool-section-divider">
                <cv-button size="small" variant="default" ?disabled=${busy} @click=${this.model.onPrintKit}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M6 9V2h12v7"></path>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <path d="M6 14h12v8H6z"></path>
                  </svg>
                  ${i18n('welcome:print-emergency-kit')}
                </cv-button>
              </div>
            `
          : nothing}
      </div>
    `
  }

  private renderMobileTools() {
    if (!this.model) {
      return nothing
    }

    const busy = this.model.busy()
    const backupInProgress = this.model.backupInProgress()
    const restoreInProgress = this.model.restoreInProgress()
    const masterRekeyInProgress = this.model.masterRekeyInProgress()

    return html`
      <div class="mobile-support">
        ${backupInProgress ? html`<div class="mobile-operation">${this.renderBackupProgress()}</div>` : nothing}
        <details class="mobile-panel">
          <summary class="mobile-panel-summary">
            <div class="mobile-panel-title">
              <span class="mobile-panel-label">${i18n('welcome:device-utilities')}</span>
              <span class="mobile-panel-meta">${i18n('welcome:device-utilities-meta')}</span>
            </div>
          </summary>

          <div class="mobile-panel-body">
            <div class="mobile-panel-note">${i18n('welcome:device-utilities-note')}</div>

            <div class="tool-actions">
              <cv-guidance-anchor anchor-id="welcome.backup-tools" surface="welcome" owner="welcome">
                <cv-button variant="default" ?disabled=${busy} @click=${this.model.onBackupClick}>
                  ${i18n('button:backup')}
                </cv-button>
                <cv-button variant="default" ?disabled=${busy} @click=${this.model.onRestoreClick}>
                  ${i18n('button:restore')}
                </cv-button>
                <cv-button
                  variant="default"
                  ?disabled=${busy}
                  .loading=${masterRekeyInProgress}
                  @click=${this.model.onMasterPasswordChangeClick}
                >
                  ${i18n('button:changepwd')}
                </cv-button>
              </cv-guidance-anchor>
              <cv-guidance-anchor anchor-id="welcome.erase-device" surface="welcome" owner="welcome">
                <cv-button variant="danger" ?disabled=${busy} @click=${this.model.onEraseClick}>
                  ${i18n('button:erase')}
                </cv-button>
              </cv-guidance-anchor>
            </div>
            ${renderGuidanceInline('welcome.backup-tools', 'welcome')}

            ${restoreInProgress ? this.renderRestoreProgress() : nothing}
          </div>
        </details>
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

export class WelcomePrintKitSection extends ReatomLitElement {
  static properties = {
    model: {attribute: false},
    layout: {type: String, reflect: true},
  }

  static styles = [
    css`
      :host {
        display: none;
      }

      @media print {
        :host {
          display: block !important;
          position: fixed;
          inset: 0;
          background: white;
          color: black;
          z-index: 9999;
          padding: 40px;
          box-sizing: border-box;
          font-family:
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            'Segoe UI',
            Roboto,
            'Helvetica Neue',
            Arial,
            sans-serif;
        }

        .kit-header {
          display: flex;
          align-items: center;
          gap: 15px;
          border-bottom: 3px solid black;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .kit-logo {
          width: 40px;
          height: 40px;
          border: 2px solid black;
          border-radius: 8px;
          display: grid;
          place-items: center;
        }

        .kit-title {
          font-size: 28px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .kit-intro {
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 40px;
          color: var(--cv-color-text-subtle);
          border: 1px solid var(--cv-color-border);
          padding: 15px;
          background: var(--cv-color-surface);
          border-radius: 6px;
        }

        .kit-section {
          margin-bottom: 35px;
          page-break-inside: avoid;
        }

        .kit-label {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
          color: var(--cv-color-text-subtle);
        }

        .kit-box {
          border: 2px solid var(--cv-color-border);
          border-radius: 8px;
          padding: 15px;
          background: white;
        }

        .kit-box.filled {
          background: var(--cv-color-surface);
          font-family: ui-monospace, monospace;
          font-size: 14px;
          word-break: break-all;
        }

        .kit-lines {
          height: 24px;
          border-bottom: 1px solid black;
          margin-bottom: 12px;
        }

        .kit-lines:last-child {
          margin-bottom: 0;
        }

        .kit-help {
          margin-top: 8px;
          font-size: 12px;
          line-height: 1.5;
          color: var(--cv-color-text-subtle);
        }

        .kit-footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid var(--cv-color-border);
          font-size: 12px;
          color: var(--cv-color-text-muted);
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
    if (!customElements.get('welcome-print-kit-section')) {
      customElements.define('welcome-print-kit-section', this)
    }
  }

  protected render() {
    if (!this.model) {
      return nothing
    }

    const storePath = this.model.storePath()

    return html`
      <div class="print-kit">
        <div class="kit-header">
          <div class="kit-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div class="kit-title">${i18n('welcome:emergency-kit-title')}</div>
        </div>

        <div class="kit-intro">${i18n('welcome:emergency-kit-intro')}</div>

        <div class="kit-section">
          <div class="kit-label">${i18n('welcome:kit-storage-location')}</div>
          <div class="kit-box filled">${storePath || i18n('welcome:kit-default-location')}</div>
          <div class="kit-help">${i18n('welcome:kit-storage-help')}</div>
        </div>

        <div class="kit-section">
          <div class="kit-label">${i18n('welcome:kit-master-password')}</div>
          <div class="kit-box">
            <div class="kit-lines"></div>
            <div class="kit-lines"></div>
          </div>
          <div class="kit-help">${i18n('welcome:kit-master-help')}</div>
        </div>

        <div class="kit-section">
          <div class="kit-label">${i18n('welcome:kit-vault-password')}</div>
          <div class="kit-box">
            <div class="kit-lines"></div>
          </div>
          <div class="kit-help">${i18n('welcome:kit-vault-help')}</div>
        </div>

        <div class="kit-footer">
          ${i18n('welcome:kit-generated', {
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
          })}
        </div>
      </div>
    `
  }
}
