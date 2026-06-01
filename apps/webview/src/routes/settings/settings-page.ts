import {html, ReatomLitElement, watch} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import type {SessionSettings} from 'root/core/session/session-settings'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  routeHostStyles,
  routePageStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {settingsPageModel} from './settings.model'

export class SettingsPage extends ReatomLitElement {
  static define() {
    if (!customElements.get('settings-page')) {
      customElements.define('settings-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
  }

  declare hideBackLink: boolean

  private readonly model = settingsPageModel

  constructor() {
    super()
    this.hideBackLink = false
  }

  static styles = [
    sharedStyles,
    pageTransitionStyles,
    pageFadeInStyles,
    hostLayoutPaintContainStyles,
    routeHostStyles,
    routePageStyles,
    css`
      .page {
        box-sizing: border-box;
        max-inline-size: 1040px;
        gap: var(--app-spacing-5);
        --settings-index-sticky-offset: var(--app-spacing-4);
        --settings-section-scroll-margin-start: var(--app-spacing-6);
      }

      @media (max-width: 767px) {
        .page {
          --settings-index-mobile-block-size: 56px;
          --settings-index-sticky-offset: var(--app-spacing-2);
          --settings-section-scroll-margin-start: calc(
            var(--mobile-topbar-block-size, 56px) + var(--settings-index-mobile-block-size) +
              var(--app-spacing-3)
          );
          padding-block-start: var(--app-spacing-4);
          padding-block-end: calc(
            var(--app-spacing-8) + var(--app-spacing-8) + var(--safe-area-bottom-active, 0px)
          );
          padding-inline-start: max(var(--app-spacing-4), env(safe-area-inset-left));
          padding-inline-end: max(var(--app-spacing-4), env(safe-area-inset-right));
        }
      }

      .settings-shell {
        display: grid;
        gap: var(--app-spacing-4);
        align-items: start;
      }

      @media (min-width: 900px) {
        .settings-shell {
          grid-template-columns: minmax(196px, 224px) minmax(0, 1fr);
          gap: var(--app-spacing-6);
        }
      }

      .settings-index {
        position: sticky;
        inset-block-start: var(--settings-index-sticky-offset);
        z-index: 2;
        display: flex;
        gap: var(--app-spacing-2);
        align-self: start;
        min-inline-size: 0;
        padding: var(--app-spacing-2);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface);
        overflow-x: auto;
        overscroll-behavior-inline: contain;
        scrollbar-width: thin;
        touch-action: pan-x;
        -webkit-overflow-scrolling: touch;
      }

      @media (min-width: 900px) {
        .settings-index {
          inset-block-start: var(--settings-index-sticky-offset);
          display: grid;
          gap: var(--app-spacing-1);
          overflow: visible;
        }
      }

      .settings-index-link {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: max-content;
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        line-height: 1.2;
        text-decoration: none;
        white-space: nowrap;
      }

      .settings-index-link:hover {
        color: var(--cv-color-text);
        background: var(--cv-color-hover);
      }

      .settings-index-link:focus-visible {
        outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-info));
        outline-offset: 2px;
      }

      .settings-index-link cv-icon {
        flex: 0 0 auto;
        font-size: 16px;
        color: var(--cv-color-brand);
      }

      .settings-content {
        display: grid;
        gap: var(--app-spacing-4);
        min-inline-size: 0;
      }

      .settings-section,
      .card {
        display: grid;
        gap: var(--app-spacing-4);
        min-inline-size: 0;
        padding: var(--app-spacing-4);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface);
        scroll-margin-block-start: var(--settings-section-scroll-margin-start);
      }

      @media (min-width: 768px) {
        .settings-section,
        .card {
          padding: var(--app-spacing-5);
        }
      }

      .settings-section-header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: var(--app-spacing-3);
        align-items: start;
        padding-block-end: var(--app-spacing-3);
        border-block-end: 1px solid var(--cv-color-border-muted);
      }

      .settings-section-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 36px;
        block-size: 36px;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-brand);
        background: color-mix(in oklab, var(--cv-color-brand) 10%, var(--cv-color-surface-2));
      }

      .settings-section-icon cv-icon {
        font-size: 18px;
      }

      .settings-section-copy {
        display: grid;
        gap: var(--app-spacing-1);
        min-inline-size: 0;
      }

      .card-title,
      .settings-section-title {
        margin: 0;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-base);
        font-weight: var(--cv-font-weight-semibold);
        line-height: 1.25;
      }

      .settings-list {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .settings-row,
      .settings-field {
        display: grid;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .settings-row {
        padding-block: var(--app-spacing-3);
        border-block-start: 1px solid var(--cv-color-border-muted);
      }

      .settings-row:first-child {
        border-block-start: 0;
        padding-block-start: 0;
      }

      .settings-row:last-child {
        padding-block-end: 0;
      }

      @media (min-width: 720px) {
        .settings-row {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--app-spacing-4);
        }
      }

      .settings-row-copy {
        display: grid;
        gap: var(--app-spacing-1);
        min-inline-size: 0;
      }

      .settings-row-control {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      @media (min-width: 720px) {
        .settings-row-control {
          justify-content: flex-end;
        }
      }

      .settings-label {
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        line-height: 1.35;
      }

      .settings-select-control {
        position: relative;
        inline-size: min(100%, 220px);
      }

      .settings-select {
        box-sizing: border-box;
        inline-size: min(100%, 220px);
        min-block-size: var(--touch-target-min);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        cursor: pointer;
      }

      .settings-select-control .settings-select {
        appearance: none;
        -webkit-appearance: none;
        inline-size: 100%;
        padding-inline-end: calc(var(--app-spacing-6) + var(--app-spacing-3));
      }

      .settings-select-control cv-icon {
        position: absolute;
        inset-block-start: 50%;
        inset-inline-end: var(--app-spacing-4);
        inline-size: 18px;
        block-size: 18px;
        color: var(--cv-color-text-muted);
        pointer-events: none;
        transform: translateY(-50%);
      }

      .settings-text-input {
        box-sizing: border-box;
        inline-size: min(100%, 280px);
        min-block-size: var(--touch-target-min);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
      }

      .settings-select:focus,
      .settings-text-input:focus {
        outline: none;
        border-color: var(--cv-color-brand);
      }

      .settings-checkbox-row {
        display: inline-flex;
        align-items: flex-start;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
        color: var(--cv-color-text);
        cursor: pointer;
      }

      .settings-checkbox-row input[type='checkbox'] {
        flex: 0 0 auto;
        inline-size: 18px;
        block-size: 18px;
        margin-block-start: 1px;
        accent-color: var(--cv-color-brand);
        cursor: pointer;
      }

      .settings-checkbox-row span {
        min-inline-size: 0;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      .settings-description {
        margin: 0;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      cv-callout.settings-callout {
        --cv-callout-font-size: var(--cv-font-size-xs);
        --cv-callout-padding-block: var(--app-spacing-2);
        --cv-callout-padding-inline: var(--app-spacing-3);
        --cv-callout-border-radius: var(--cv-radius-2);
      }

      cv-callout.settings-callout::part(base) {
        line-height: 1.45;
      }

      cv-callout.settings-callout::part(message) {
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }

      .settings-subsection {
        display: grid;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-3);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
      }

      .provider-card cv-guidance-panel,
      .settings-section cv-guidance-panel {
        --cv-guidance-panel-border-color: color-mix(
          in oklab,
          var(--cv-color-info-border, var(--cv-color-info)) 70%,
          var(--cv-color-border-muted)
        );
        --cv-guidance-panel-background: color-mix(
          in oklab,
          var(--cv-color-surface-2) 90%,
          var(--cv-color-info)
        );
        --cv-guidance-panel-border-radius: var(--cv-radius-2);
        --cv-guidance-panel-gap: var(--app-spacing-2);
        --cv-guidance-panel-padding-block: var(--app-spacing-3);
        --cv-guidance-panel-padding-inline: var(--app-spacing-3);
        --cv-guidance-panel-title-font-size: var(--cv-font-size-sm);
        --cv-guidance-panel-title-line-height: 1.25;
        --cv-guidance-panel-body-color: var(--cv-color-text-muted);
        --cv-guidance-panel-body-line-height: 1.45;
        --cv-guidance-panel-shadow: none;
      }

      .provider-status-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .provider-status-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        max-inline-size: 100%;
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: 999px;
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-medium, 500);
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      .provider-status-pill[data-state='selected'] {
        border-color: var(--cv-color-success-border);
        background: var(--cv-color-success-surface);
      }

      .provider-status-pill[data-state='missing'] {
        border-color: var(--cv-color-warning-border);
        background: var(--cv-color-warning-surface);
      }

      .provider-status-pill[data-state='unknown'] {
        border-color: var(--cv-color-info-border);
        background: var(--cv-color-info-surface);
      }

      .provider-status-pill[data-state='running'] {
        border-color: var(--cv-color-success-border);
        background: var(--cv-color-success-surface);
      }

      .provider-status-pill[data-state='stopped'] {
        border-color: var(--cv-color-warning-border);
        background: var(--cv-color-warning-surface);
      }

      .provider-status-dot {
        inline-size: 8px;
        block-size: 8px;
        border-radius: 50%;
        background: currentColor;
      }

      .provider-actions,
      .settings-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .ssh-agent-card {
        display: grid;
        gap: var(--app-spacing-4);
      }

      .ssh-agent-grid {
        display: grid;
        gap: var(--app-spacing-3);
      }

      @media (min-width: 720px) {
        .ssh-agent-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      .ssh-agent-row {
        display: grid;
        gap: var(--app-spacing-1);
        min-inline-size: 0;
      }

      .ssh-agent-label {
        font-size: var(--cv-font-size-xs);
        color: var(--cv-color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .ssh-agent-value {
        font-size: var(--cv-font-size-sm);
        color: var(--cv-color-text);
        word-break: break-word;
      }

      .ssh-agent-config {
        margin: 0;
        padding: var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        overflow-x: auto;
      }

      .provider-steps {
        display: grid;
        gap: var(--app-spacing-2);
        margin: 0;
        padding-inline-start: 1.25rem;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        line-height: 1.45;
      }

      .license-row {
        display: grid;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .license-control-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .license-seat-summary {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .license-seat-metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: var(--app-spacing-2);
      }

      .license-seat-metric {
        display: grid;
        gap: var(--app-spacing-1);
        min-inline-size: 0;
        padding: var(--app-spacing-3);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
      }

      .license-seat-label {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
      }

      .license-seat-value {
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
      }

      .license-code-row {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .license-code-box {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-3);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
      }

      .license-code-value {
        min-inline-size: 0;
        flex: 1;
        color: var(--cv-color-text);
        font-family: var(--cv-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: var(--cv-font-size-xs);
        overflow-wrap: anywhere;
      }

      .license-input {
        box-sizing: border-box;
        min-inline-size: min(100%, 280px);
        max-inline-size: 100%;
        flex: 1;
        min-block-size: var(--touch-target-min);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-border);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
      }

      .vault-rekey-card {
        gap: var(--app-spacing-4);
      }

      .vault-rekey-form {
        display: grid;
        gap: var(--app-spacing-3);
        min-inline-size: 0;
      }

      .vault-rekey-fields {
        display: grid;
        gap: var(--app-spacing-3);
        min-inline-size: 0;
      }

      @media (min-width: 860px) {
        .vault-rekey-fields {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      .vault-password-input {
        box-sizing: border-box;
        inline-size: 100%;
        min-block-size: var(--touch-target-min);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-border);
        background: var(--cv-color-surface);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
      }

      .vault-password-input:focus {
        outline: none;
        border-color: var(--cv-color-brand);
        box-shadow: 0 0 0 2px color-mix(in oklab, var(--cv-color-brand) 22%, transparent);
      }

      .vault-rekey-progress {
        display: grid;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .vault-rekey-progress-label {
        display: flex;
        justify-content: space-between;
        gap: var(--app-spacing-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        line-height: 1.35;
      }

      .vault-rekey-progress progress {
        inline-size: 100%;
        block-size: 8px;
        overflow: hidden;
        border: 0;
        border-radius: 999px;
        background: var(--cv-color-surface);
      }

      .vault-rekey-progress progress::-webkit-progress-bar {
        border-radius: 999px;
        background: var(--cv-color-surface);
      }

      .vault-rekey-progress progress::-webkit-progress-value {
        border-radius: 999px;
        background: var(--cv-color-brand);
      }

      .vault-rekey-progress progress::-moz-progress-bar {
        border-radius: 999px;
        background: var(--cv-color-brand);
      }

      .vault-rekey-status {
        display: grid;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-success-border);
        background: var(--cv-color-success-surface);
      }

      @media (max-width: 719px) {
        .settings-row-control,
        .settings-actions,
        .provider-actions,
        .license-control-row {
          align-items: stretch;
        }

        .settings-row-control > *,
        .settings-actions > cv-button,
        .provider-actions > cv-button,
        .license-control-row > cv-button,
        .license-input,
        .settings-select,
        .settings-text-input {
          inline-size: 100%;
        }
      }
    `,
  ]

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('visibilitychange', this)
    window.addEventListener('focus', this)
    void this.model.load()
  }

  disconnectedCallback(): void {
    document.removeEventListener('visibilitychange', this)
    window.removeEventListener('focus', this)
    super.disconnectedCallback()
  }

  handleEvent(event: Event): void {
    if (event.type === 'focus') {
      void this.model.refreshAndroidAutofillProviderStatus()
      void this.model.refreshAndroidQuickLockTileStatus()
      void this.model.refreshSshAgentStatus()
      return
    }

    if (event.type === 'visibilitychange' && document.visibilityState === 'visible') {
      void this.model.refreshAndroidAutofillProviderStatus()
      void this.model.refreshAndroidQuickLockTileStatus()
      void this.model.refreshSshAgentStatus()
    }
  }

  private handleAutoLockChange(event: Event) {
    const select = event.target as HTMLSelectElement
    void this.model.setAutoLockTimeout(select.value)
  }

  private handleLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement
    this.model.setLanguage(select.value)
  }

  private handleLockOnSleepChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setLockOnSleep(checkbox.checked)
  }

  private handleAutoMountAfterUnlockChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setAutoMountAfterUnlock(checkbox.checked)
  }

  private handleAutoStartSshAgentAfterUnlockChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setAutoStartSshAgentAfterUnlock(checkbox.checked)
  }

  private handleRequireBiometricAppGateChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setRequireBiometricAppGate(checkbox.checked)
  }

  private handleKeepScreenAwakeChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setKeepScreenAwakeWhenUnlocked(checkbox.checked)
  }

  private handleAndroidVaultStatusNotificationChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setAndroidVaultStatusNotificationEnabled(checkbox.checked)
  }

  private handleAndroidQuickLockTileChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setAndroidQuickLockTileEnabled(checkbox.checked)
  }

  private handleConfirmFileDeletionChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setConfirmFileDeletion(checkbox.checked)
  }

  private handleShowHiddenFilesChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setShowHiddenFiles(checkbox.checked)
  }

  private handleMarkdownAttachmentFolderChange(event: Event) {
    const input = event.target as HTMLInputElement
    void this.model.setMarkdownAttachmentFolderPath(input.value)
  }

  private handleBack() {
    this.model.goBack()
  }

  private handleSectionIndexClick(event: Event) {
    const link = event.currentTarget as HTMLAnchorElement | null
    const sectionId = link?.dataset['sectionId']
    if (!sectionId) return

    const target = this.renderRoot.querySelector<HTMLElement>(`#${sectionId}`)
    if (!target) return

    event.preventDefault()
    target.scrollIntoView({block: 'start', inline: 'nearest'})
  }

  private handleOpenCredentialProviderSettings() {
    void this.model.openCredentialProviderSettings()
  }

  private handleRequestAndroidQuickLockTile() {
    void this.model.requestAndroidQuickLockTile()
  }

  private handleStartSshAgent() {
    void this.model.startSshAgent()
  }

  private handleStopSshAgent() {
    void this.model.stopSshAgent()
  }

  private handleCopySshAgentSocketPath() {
    void this.model.copySshAgentSocketPath()
  }

  private handleActivationCodeInput(event: Event) {
    this.model.setActivationCodeDraft((event.target as HTMLInputElement).value)
  }

  private handleActivateLicense() {
    void this.model.activateLicense()
  }

  private handleReleaseCurrentSeat() {
    void this.model.releaseCurrentSeat()
  }

  private handleOpenLicenseCabinet() {
    void this.model.openLicenseCabinet()
  }

  private handlePasswordImport() {
    void this.model.openPasswordImport()
  }

  private handlePasswordExport() {
    void this.model.exportPasswords()
  }

  private handlePasswordClean() {
    void this.model.cleanPasswords()
  }

  private handleVaultCurrentPasswordInput(event: Event) {
    this.model.vaultRekey.setCurrentPassword((event.target as HTMLInputElement).value)
  }

  private handleVaultNewPasswordInput(event: Event) {
    this.model.vaultRekey.setNewPassword((event.target as HTMLInputElement).value)
  }

  private handleVaultConfirmPasswordInput(event: Event) {
    this.model.vaultRekey.setConfirmPassword((event.target as HTMLInputElement).value)
  }

  private handleVaultRekeySubmit(event: Event) {
    event.preventDefault()
    void this.model.vaultRekey.submit()
  }

  private handleVaultRekeyCancel() {
    void this.model.vaultRekey.cancel()
  }

  private handleVaultRekeyOpenBackup() {
    this.model.vaultRekey.openBackupSurface()
  }

  private handlePasswordImportComplete(event: Event) {
    event.stopPropagation()
    void this.model.handlePasswordImportComplete(event)
  }

  private handlePasswordImportClose(event?: Event) {
    event?.stopPropagation()
    this.model.closePasswordImportDialog()
  }

  private renderPasswordImportDialog() {
    if (!this.model.passwordImportDialogOpen()) {
      return nothing
    }

    if (this.model.passwordImportCompletedSuccessfully()) {
      return html`
        <section
          class="settings-section password-import-success"
          id="settings-passwords-import"
          aria-labelledby="settings-passwords-import-title"
          role="status"
        >
          ${this.renderSectionHeader(
            'settings-passwords-import',
            'cloud-upload',
            i18n('settings:passwords-maintenance-import-success-title'),
            i18n('settings:passwords-maintenance-import-success-description'),
          )}
          <div class="settings-actions">
            <cv-button variant="secondary" @click=${this.handlePasswordImportClose}>
              <cv-icon slot="prefix" name="check-lg"></cv-icon>
              ${i18n('button:close')}
            </cv-button>
          </div>
        </section>
      `
    }

    return html`
      <pm-import-dialog
        class="settings-section password-import-dialog"
        @import-complete=${this.handlePasswordImportComplete}
        @import-close=${this.handlePasswordImportClose}
      ></pm-import-dialog>
    `
  }

  private renderSectionHeader(sectionId: string, icon: string, title: unknown, description?: unknown) {
    return html`
      <div class="settings-section-header">
        <span class="settings-section-icon" aria-hidden="true">
          <cv-icon name=${icon}></cv-icon>
        </span>
        <div class="settings-section-copy">
          <h2 class="settings-section-title" id=${`${sectionId}-title`}>${title}</h2>
          ${description ? html`<div class="settings-description">${description}</div>` : nothing}
        </div>
      </div>
    `
  }

  private renderSectionIndex() {
    const sections = [
      {
        id: 'settings-application',
        icon: 'settings-2',
        label: i18n('settings:application'),
        visible: true,
      },
      {
        id: 'settings-passwords',
        icon: 'key-round',
        label: i18n('settings:passwords-maintenance-title'),
        visible: true,
      },
      {
        id: 'settings-license',
        icon: 'badge-check',
        label: i18n('settings:license-title'),
        visible: true,
      },
      {
        id: 'settings-session-security',
        icon: 'shield-check',
        label: i18n('settings:session-security'),
        visible: true,
      },
      {
        id: 'settings-ssh-agent',
        icon: 'square-terminal',
        label: i18n('settings:ssh-agent-title'),
        visible: !this.model.isMobileRuntime(),
      },
      {
        id: 'settings-mobile-autofill',
        icon: 'smartphone',
        label: i18n('settings:provider-title'),
        visible: this.model.showsCredentialProviderSection(),
      },
    ]

    return html`
      <nav class="settings-index" aria-label=${i18n('settings:title')}>
        ${sections
          .filter((section) => section.visible)
          .map(
            (section) => html`
              <a
                class="settings-index-link"
                href=${`#${section.id}`}
                data-section-id=${section.id}
                @click=${this.handleSectionIndexClick}
              >
                <cv-icon name=${section.icon} aria-hidden="true"></cv-icon>
                <span>${section.label}</span>
              </a>
            `,
          )}
      </nav>
    `
  }

  private renderApplicationSection(settings: SessionSettings) {
    return html`
      <section
        class="settings-section"
        id="settings-application"
        aria-labelledby="settings-application-title"
      >
        ${this.renderSectionHeader('settings-application', 'settings-2', i18n('settings:application'))}
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-row-copy">
              <label class="settings-label" for="settings-language">${i18n('language:title')}</label>
              <p class="settings-description">${i18n('settings:language-hint')}</p>
            </div>
            <div class="settings-row-control">
              <div class="settings-select-control">
                <select
                  id="settings-language"
                  name="language"
                  class="settings-select"
                  @change=${this.handleLanguageChange}
                >
                  ${this.model
                    .languageOptions()
                    .map(
                      (option) => html`
                        <option
                          value=${option.value}
                          ?selected=${this.model.currentLanguage() === option.value}
                        >
                          ${option.label}
                        </option>
                      `,
                    )}
                </select>
                <cv-icon name="chevron-down" aria-hidden="true"></cv-icon>
              </div>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-copy">
              <label class="settings-label" for="settings-markdown-attachment-folder">
                ${i18n('settings:markdown-attachment-folder')}
              </label>
              <p class="settings-description">${i18n('settings:markdown-attachment-folder-hint')}</p>
            </div>
            <div class="settings-row-control">
              <input
                id="settings-markdown-attachment-folder"
                class="settings-text-input"
                type="text"
                spellcheck="false"
                .value=${settings.markdown_attachment_folder_path}
                @change=${this.handleMarkdownAttachmentFolderChange}
              />
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-copy">
              <label class="settings-checkbox-row">
                <input
                  type="checkbox"
                  .checked=${settings.show_hidden_files}
                  @change=${this.handleShowHiddenFilesChange}
                />
                <span>${i18n('settings:show-hidden-files')}</span>
              </label>
              <p class="settings-description">${i18n('settings:show-hidden-files-hint')}</p>
            </div>
          </div>
        </div>
      </section>
    `
  }

  private renderVaultPasswordRekeyCard() {
    const rekey = this.model.vaultRekey
    const validationMessage = rekey.inlineValidationMessage()
    const errorMessage = rekey.error()
    const feedbackMessage = errorMessage || validationMessage

    return html`
      <div class="settings-subsection vault-rekey-card" id="settings-vault-password-rekey">
        <div class="settings-field">
          <h3 class="settings-section-title">${i18n('settings:vault-password-title')}</h3>
          <p class="settings-description">${i18n('settings:vault-password-description')}</p>
        </div>

        <form class="vault-rekey-form" @submit=${this.handleVaultRekeySubmit}>
          <div class="vault-rekey-fields">
            <label class="settings-field" for="settings-vault-password-current">
              <span class="settings-label">${i18n('settings:vault-password-current')}</span>
              <input
                id="settings-vault-password-current"
                class="vault-password-input"
                type="password"
                autocomplete="current-password"
                .value=${watch(rekey.currentPassword)}
                ?disabled=${watch(rekey.busy)}
                @input=${this.handleVaultCurrentPasswordInput}
              />
            </label>
            <label class="settings-field" for="settings-vault-password-new">
              <span class="settings-label">${i18n('settings:vault-password-new')}</span>
              <input
                id="settings-vault-password-new"
                class="vault-password-input"
                type="password"
                autocomplete="new-password"
                .value=${watch(rekey.newPassword)}
                ?disabled=${watch(rekey.busy)}
                @input=${this.handleVaultNewPasswordInput}
              />
            </label>
            <label class="settings-field" for="settings-vault-password-confirm">
              <span class="settings-label">${i18n('settings:vault-password-confirm')}</span>
              <input
                id="settings-vault-password-confirm"
                class="vault-password-input"
                type="password"
                autocomplete="new-password"
                .value=${watch(rekey.confirmPassword)}
                ?disabled=${watch(rekey.busy)}
                @input=${this.handleVaultConfirmPasswordInput}
              />
            </label>
          </div>

          ${feedbackMessage
            ? html`<cv-callout class="settings-callout" variant="danger" role="alert"
                >${feedbackMessage}</cv-callout
              >`
            : nothing}
          ${rekey.busy()
            ? html`
                <div class="vault-rekey-progress" role="status" aria-live="polite">
                  <div class="vault-rekey-progress-label">
                    <span>${rekey.progressPhaseLabel()}</span>
                    <span>${rekey.progressSummary()}</span>
                  </div>
                  <progress max="100" .value=${rekey.progressPercent()}></progress>
                </div>
              `
            : nothing}
          ${rekey.successVisible()
            ? html`
                <div class="vault-rekey-status" role="status">
                  <div class="settings-field">
                    <h3 class="settings-section-title">${i18n('settings:vault-password-success-title')}</h3>
                    <p class="settings-description">${i18n('settings:vault-password-success-description')}</p>
                  </div>
                  ${rekey.backupRecommendationVisible()
                    ? html`
                        <div class="settings-actions">
                          <cv-button
                            variant="primary"
                            type="button"
                            @click=${this.handleVaultRekeyOpenBackup}
                          >
                            <cv-icon slot="prefix" name="archive"></cv-icon>
                            ${i18n('settings:vault-password-backup-action')}
                          </cv-button>
                        </div>
                        <p class="settings-description">
                          ${i18n('settings:vault-password-backup-recommendation')}
                        </p>
                      `
                    : nothing}
                </div>
              `
            : nothing}

          <div class="settings-actions">
            <cv-button
              variant="primary"
              type="submit"
              .loading=${watch(rekey.busy)}
              ?disabled=${!rekey.canSubmit()}
            >
              <cv-icon slot="prefix" name="key-round"></cv-icon>
              ${i18n('settings:vault-password-submit')}
            </cv-button>
            ${rekey.busy()
              ? html`
                  <cv-button
                    variant="secondary"
                    type="button"
                    .loading=${watch(rekey.isCancelling)}
                    ?disabled=${!rekey.canCancel()}
                    @click=${this.handleVaultRekeyCancel}
                  >
                    ${i18n('button:cancel')}
                  </cv-button>
                `
              : nothing}
          </div>
        </form>
      </div>
    `
  }

  private renderPasswordsSection() {
    const passwordMaintenanceBusyAction = this.model.passwordMaintenanceBusyAction()
    const passwordMaintenanceBusy = Boolean(passwordMaintenanceBusyAction)

    return html`
      <section class="settings-section" id="settings-passwords" aria-labelledby="settings-passwords-title">
        ${this.renderSectionHeader(
          'settings-passwords',
          'key-round',
          i18n('settings:passwords-maintenance-title'),
          i18n('settings:passwords-maintenance-description'),
        )}
        <div class="settings-actions">
          <cv-button
            variant="secondary"
            .loading=${passwordMaintenanceBusyAction === 'import'}
            ?disabled=${passwordMaintenanceBusy}
            @click=${this.handlePasswordImport}
          >
            <cv-icon slot="prefix" name="cloud-upload"></cv-icon>
            ${i18n('settings:passwords-maintenance-import')}
          </cv-button>
          <cv-button
            variant="secondary"
            .loading=${passwordMaintenanceBusyAction === 'export'}
            ?disabled=${passwordMaintenanceBusy}
            @click=${this.handlePasswordExport}
          >
            <cv-icon slot="prefix" name="cloud-download"></cv-icon>
            ${i18n('settings:passwords-maintenance-export')}
          </cv-button>
          <cv-button
            variant="danger"
            .loading=${passwordMaintenanceBusyAction === 'clean'}
            ?disabled=${passwordMaintenanceBusy}
            @click=${this.handlePasswordClean}
          >
            <cv-icon slot="prefix" name="trash"></cv-icon>
            ${i18n('settings:passwords-maintenance-clear')}
          </cv-button>
        </div>
        ${this.renderVaultPasswordRekeyCard()}
      </section>
    `
  }

  private renderLicenseSection() {
    const licenseActive = this.model.licenseActive()
    const purchaseId = this.model.licensePurchaseIdLabel()

    return html`
      <section class="settings-section" id="settings-license" aria-labelledby="settings-license-title">
        ${this.renderSectionHeader('settings-license', 'badge-check', i18n('settings:license-title'))}
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-row-copy">
              <span class="provider-status-pill" data-state=${this.model.licenseStatusState()}>
                <span class="provider-status-dot"></span>
                ${this.model.licenseStatusLabel()}
              </span>
              <p class="settings-description">${this.model.licenseDetailLabel()}</p>
            </div>
          </div>
          ${licenseActive
            ? html`
                <div class="settings-subsection license-seat-summary">
                  <p class="settings-description">${this.model.licenseSeatUsageLabel()}</p>
                  <div class="license-seat-metrics" aria-label=${i18n('settings:license-seats-title')}>
                    <div class="license-seat-metric">
                      <span class="license-seat-label">${i18n('settings:license-seats-used')}</span>
                      <span class="license-seat-value">${this.model.licenseSeatsUsedLabel()}</span>
                    </div>
                    <div class="license-seat-metric">
                      <span class="license-seat-label">${i18n('settings:license-seats-available')}</span>
                      <span class="license-seat-value">${this.model.licenseSeatsAvailableLabel()}</span>
                    </div>
                  </div>
                  ${purchaseId
                    ? html`
                        <div class="license-code-row">
                          <span class="license-seat-label">${i18n('settings:purchase-id-label')}</span>
                          <div class="license-code-box">
                            <code class="license-code-value">${purchaseId}</code>
                          </div>
                          <p class="settings-description">${i18n('settings:purchase-id-help')}</p>
                        </div>
                      `
                    : nothing}
                  <div class="provider-actions">
                    <cv-button
                      variant="secondary"
                      .loading=${watch(this.model.licenseActivationBusy)}
                      ?disabled=${watch(this.model.licenseCabinetOpenDisabled)}
                      @click=${this.handleOpenLicenseCabinet}
                    >
                      <cv-icon slot="prefix" name="external-link"></cv-icon>
                      ${i18n('settings:license-cabinet-open')}
                    </cv-button>
                    <cv-button
                      variant="danger"
                      .loading=${watch(this.model.licenseSeatBusy)}
                      ?disabled=${watch(this.model.releaseCurrentSeatDisabled)}
                      @click=${this.handleReleaseCurrentSeat}
                    >
                      ${i18n('settings:license-release-seat')}
                    </cv-button>
                  </div>
                </div>
              `
            : html`
                <div class="license-row">
                  <div class="settings-row-copy">
                    <span class="settings-label">${i18n('settings:activation-code-label')}</span>
                    <p class="settings-description">${i18n('settings:activation-code-help')}</p>
                  </div>
                  <div class="license-control-row">
                    <input
                      class="license-input"
                      type="password"
                      autocomplete="off"
                      .value=${watch(this.model.activationCodeDraft)}
                      @input=${this.handleActivationCodeInput}
                      placeholder=${i18n('settings:activation-code-placeholder')}
                    />
                    <cv-button
                      variant="primary"
                      .loading=${watch(this.model.licenseActivationBusy)}
                      ?disabled=${watch(this.model.licenseActivationDisabled)}
                      @click=${this.handleActivateLicense}
                    >
                      ${i18n('settings:license-activate')}
                    </cv-button>
                  </div>
                </div>
              `}
          <cv-callout
            class="settings-callout"
            variant="danger"
            role="alert"
            ?hidden=${watch(this.model.licenseActivationErrorHidden)}
          >
            ${this.model.licenseActivationErrorLabel()}
          </cv-callout>
        </div>
      </section>
    `
  }

  private renderSessionSecuritySection(settings: SessionSettings) {
    const androidQuickLockTileStatus = this.model.androidQuickLockTileStatus()

    return html`
      <section
        class="settings-section"
        id="settings-session-security"
        aria-labelledby="settings-session-security-title"
      >
        ${this.renderSectionHeader(
          'settings-session-security',
          'shield-check',
          i18n('settings:session-security'),
        )}
        <div class="settings-list">
          <div class="settings-row">
            <div class="settings-row-copy">
              <label class="settings-label" for="settings-auto-lock"
                >${i18n('settings:auto-lock-after')}</label
              >
              <p class="settings-description">${i18n('settings:auto-lock-hint')}</p>
            </div>
            <div class="settings-row-control">
              <select id="settings-auto-lock" class="settings-select" @change=${this.handleAutoLockChange}>
                <option value="0" ?selected=${settings.auto_lock_timeout_secs === 0}>
                  ${i18n('settings:never')}
                </option>
                <option value="60" ?selected=${settings.auto_lock_timeout_secs === 60}>
                  ${i18n('settings:1-minute')}
                </option>
                <option value="300" ?selected=${settings.auto_lock_timeout_secs === 300}>
                  ${i18n('settings:5-minutes')}
                </option>
                <option value="900" ?selected=${settings.auto_lock_timeout_secs === 900}>
                  ${i18n('settings:15-minutes')}
                </option>
                <option value="1800" ?selected=${settings.auto_lock_timeout_secs === 1800}>
                  ${i18n('settings:30-minutes')}
                </option>
                <option value="3600" ?selected=${settings.auto_lock_timeout_secs === 3600}>
                  ${i18n('settings:1-hour')}
                </option>
              </select>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <label class="settings-checkbox-row">
                <input
                  type="checkbox"
                  .checked=${this.model.isLockOnSleepEnabled()}
                  @change=${this.handleLockOnSleepChange}
                />
                <span>${i18n('settings:lock-on-sleep')}</span>
              </label>
              ${this.model.isMobileRuntime()
                ? html`<p class="settings-description">${i18n('settings:lock-on-background-hint')}</p>`
                : nothing}
              ${this.model.isMobileRuntime() && this.model.supportsCredentialProviderAutofill()
                ? html`
                    <cv-callout class="settings-callout" variant="warning">
                      ${i18n('settings:autofill-incompatible')}
                    </cv-callout>
                  `
                : nothing}
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <label class="settings-checkbox-row">
                <input
                  type="checkbox"
                  .checked=${settings.auto_mount_after_unlock}
                  @change=${this.handleAutoMountAfterUnlockChange}
                />
                <span>${i18n('settings:auto-mount')}</span>
              </label>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-copy">
              <label class="settings-checkbox-row">
                <input
                  type="checkbox"
                  .checked=${settings.confirm_file_deletion}
                  @change=${this.handleConfirmFileDeletionChange}
                />
                <span>${i18n('settings:confirm-file-deletion')}</span>
              </label>
              <p class="settings-description">${i18n('settings:confirm-file-deletion-hint')}</p>
            </div>
          </div>

          ${this.model.isMobileRuntime()
            ? nothing
            : html`
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <label class="settings-checkbox-row">
                      <input
                        type="checkbox"
                        .checked=${settings.auto_start_ssh_agent_after_unlock}
                        @change=${this.handleAutoStartSshAgentAfterUnlockChange}
                      />
                      <span>${i18n('settings:auto-start-ssh-agent')}</span>
                    </label>
                    <p class="settings-description">${i18n('settings:auto-start-ssh-agent-hint')}</p>
                  </div>
                </div>
              `}
          ${this.model.isMobileBiometricSupported()
            ? html`
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <label class="settings-checkbox-row">
                      <input
                        type="checkbox"
                        .checked=${settings.require_biometric_app_gate}
                        @change=${this.handleRequireBiometricAppGateChange}
                      />
                      <span>${i18n('settings:require-biometrics')}</span>
                    </label>
                    <p class="settings-description">${i18n('settings:require-biometrics-hint')}</p>
                  </div>
                </div>
              `
            : nothing}
          ${this.model.isIosRuntime()
            ? html`
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <label class="settings-checkbox-row">
                      <input
                        type="checkbox"
                        .checked=${settings.keep_screen_awake_when_unlocked}
                        @change=${this.handleKeepScreenAwakeChange}
                      />
                      <span>${i18n('settings:keep-screen-awake')}</span>
                    </label>
                    <p class="settings-description">${i18n('settings:keep-screen-awake-hint')}</p>
                  </div>
                </div>
              `
            : nothing}
          ${this.model.isAndroidRuntime()
            ? html`
                <div class="settings-subsection">
                  <div class="settings-field">
                    <h3 class="settings-section-title">${i18n('settings:android-quick-lock-title')}</h3>
                    <p class="settings-description">${i18n('settings:android-quick-lock-description')}</p>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-copy">
                      <label class="settings-checkbox-row">
                        <input
                          type="checkbox"
                          .checked=${settings.android_vault_status_notification_enabled}
                          @change=${this.handleAndroidVaultStatusNotificationChange}
                        />
                        <span>${i18n('settings:android-vault-status-notification')}</span>
                      </label>
                      <p class="settings-description">
                        ${i18n('settings:android-vault-status-notification-hint')}
                      </p>
                    </div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-copy">
                      <label class="settings-checkbox-row">
                        <input
                          type="checkbox"
                          .checked=${settings.android_quick_lock_tile_enabled}
                          @change=${this.handleAndroidQuickLockTileChange}
                        />
                        <span>${i18n('settings:android-quick-lock-tile')}</span>
                      </label>
                      <p class="settings-description">${i18n('settings:android-quick-lock-tile-hint')}</p>
                      ${settings.android_quick_lock_tile_enabled &&
                      androidQuickLockTileStatus?.requestSupported
                        ? html`
                            <div class="provider-actions">
                              <cv-button @click=${this.handleRequestAndroidQuickLockTile}>
                                ${i18n('settings:android-quick-lock-tile-add')}
                              </cv-button>
                            </div>
                          `
                        : html`
                            <p class="settings-description">
                              ${i18n('settings:android-quick-lock-tile-manual-hint')}
                            </p>
                          `}
                    </div>
                  </div>
                </div>
              `
            : nothing}
        </div>
      </section>
    `
  }

  private renderSshAgentSection() {
    if (this.model.isMobileRuntime()) {
      return nothing
    }

    const sshAgentStatus = this.model.sshAgentStatus()
    const sshAgentState =
      sshAgentStatus?.running === true ? 'running' : sshAgentStatus?.running === false ? 'stopped' : 'unknown'
    const sshAgentStateLabel =
      sshAgentStatus?.running === true
        ? i18n('settings:ssh-agent-running')
        : sshAgentStatus?.running === false
          ? i18n('settings:ssh-agent-stopped')
          : i18n('settings:ssh-agent-unknown')
    const sshAgentConfigSnippet = sshAgentStatus?.socket_path
      ? `Host *\n  IdentityAgent ${sshAgentStatus.socket_path}`
      : null

    return html`
      <cv-guidance-anchor anchor-id="settings.ssh-agent" surface="settings" owner="settings">
        <section
          class="settings-section ssh-agent-card"
          id="settings-ssh-agent"
          aria-labelledby="settings-ssh-agent-title"
        >
          ${this.renderSectionHeader(
            'settings-ssh-agent',
            'square-terminal',
            i18n('settings:ssh-agent-title'),
            html`${i18n('settings:ssh-agent-description')}
            ${renderGuidanceInline('settings.ssh-agent', 'settings')}`,
          )}

          <div class="ssh-agent-grid">
            <div class="ssh-agent-row">
              <span class="ssh-agent-label">${i18n('settings:ssh-agent-status-label')}</span>
              <span class="provider-status-pill" data-state=${sshAgentState}>
                <span class="provider-status-dot" aria-hidden="true"></span>
                ${sshAgentStateLabel}
              </span>
            </div>

            <div class="ssh-agent-row">
              <span class="ssh-agent-label">${i18n('settings:ssh-agent-identities-label')}</span>
              <span class="ssh-agent-value">${sshAgentStatus?.identities_count ?? 0}</span>
            </div>

            <div class="ssh-agent-row">
              <span class="ssh-agent-label">${i18n('settings:ssh-agent-socket-label')}</span>
              <span class="ssh-agent-value">
                ${sshAgentStatus?.socket_path ?? i18n('settings:ssh-agent-socket-unavailable')}
              </span>
            </div>
          </div>

          <div class="provider-actions">
            <cv-button
              variant="primary"
              ?disabled=${sshAgentStatus?.running === true}
              @click=${this.handleStartSshAgent}
            >
              ${i18n('button:start')}
            </cv-button>
            <cv-button
              variant="default"
              ?disabled=${sshAgentStatus?.running !== true}
              @click=${this.handleStopSshAgent}
            >
              ${i18n('button:stop')}
            </cv-button>
            <cv-button
              variant="default"
              ?disabled=${!sshAgentStatus?.socket_path}
              @click=${this.handleCopySshAgentSocketPath}
            >
              ${i18n('button:copy')}
            </cv-button>
          </div>

          <div class="ssh-agent-row">
            <span class="ssh-agent-label">${i18n('settings:ssh-agent-config-label')}</span>
            ${sshAgentConfigSnippet
              ? html`<pre class="ssh-agent-config">${sshAgentConfigSnippet}</pre>`
              : html`<p class="settings-description">${i18n('settings:ssh-agent-config-unavailable')}</p>`}
            <p class="settings-description">${i18n('settings:ssh-agent-config-hint')}</p>
            <p class="settings-description">${i18n('settings:auto-start-ssh-agent-hint')}</p>
          </div>
        </section>
      </cv-guidance-anchor>
    `
  }

  private renderAutofillSection() {
    if (!this.model.showsCredentialProviderSection()) {
      return nothing
    }

    const isIos = this.model.isIosRuntime()
    const androidAutofillProviderSelected = this.model.androidAutofillProviderSelected()
    const credentialProviderAccess = this.model.credentialProviderAccess()
    const autofillProviderStatus =
      androidAutofillProviderSelected === true
        ? 'selected'
        : androidAutofillProviderSelected === false
          ? 'missing'
          : 'unknown'
    const autofillProviderStatusLabel =
      androidAutofillProviderSelected === true
        ? i18n('settings:provider-selected')
        : androidAutofillProviderSelected === false
          ? i18n('settings:provider-missing')
          : isIos
            ? i18n('settings:provider-unknown-ios')
            : i18n('settings:provider-unknown')

    return html`
      <cv-guidance-anchor anchor-id="settings.mobile-autofill" surface="settings" owner="settings">
        <section
          class="settings-section provider-card"
          id="settings-mobile-autofill"
          aria-labelledby="settings-mobile-autofill-title"
        >
          ${this.renderSectionHeader(
            'settings-mobile-autofill',
            'smartphone',
            i18n('settings:provider-title'),
            html`${i18n(isIos ? 'settings:provider-description-ios' : 'settings:provider-description')}
            ${renderGuidanceInline('settings.mobile-autofill', 'settings')}`,
          )}

          <div class="provider-status-row">
            <span class="provider-status-pill" data-state=${autofillProviderStatus}>
              <span class="provider-status-dot" aria-hidden="true"></span>
              ${autofillProviderStatusLabel}
            </span>
          </div>

          <div class="provider-actions">
            <cv-button
              variant="primary"
              ?disabled=${credentialProviderAccess.status !== 'enabled'}
              @click=${this.handleOpenCredentialProviderSettings}
            >
              ${i18n(isIos ? 'settings:provider-open-ios' : 'settings:provider-open')}
            </cv-button>
          </div>
          ${credentialProviderAccess.status !== 'enabled'
            ? html`
                <cv-callout class="settings-callout" variant="warning">
                  ${credentialProviderAccess.status === 'unsupported'
                    ? i18n('settings:credential-provider-unsupported')
                    : i18n('settings:credential-provider-license-required')}
                </cv-callout>
              `
            : nothing}

          <ol class="provider-steps">
            <li>${i18n(isIos ? 'settings:provider-step-1-ios' : 'settings:provider-step-1')}</li>
            <li>${i18n(isIos ? 'settings:provider-step-2-ios' : 'settings:provider-step-2')}</li>
          </ol>
        </section>
      </cv-guidance-anchor>
    `
  }

  protected render() {
    const settings = this.model.settings()

    return html`
      <div class="page">
        <div class="header">
          ${this.hideBackLink
            ? nothing
            : html`<cv-button unstyled class="back-link" @click=${this.handleBack}>
                <cv-icon slot="prefix" name="arrow-left"></cv-icon>
                ${i18n('nav:back')}
              </cv-button>`}
          <h1 class="title">${i18n('settings:title')}</h1>
          <p class="subtitle">${i18n('settings:subtitle')}</p>
        </div>

        <div class="settings-shell">
          ${this.renderSectionIndex()}
          <div class="settings-content">
            ${this.renderApplicationSection(settings)} ${this.renderPasswordsSection()}
            ${this.renderPasswordImportDialog()} ${this.renderLicenseSection()}
            ${this.renderSessionSecuritySection(settings)} ${this.renderSshAgentSection()}
            ${this.renderAutofillSection()}
          </div>
        </div>
      </div>
    `
  }
}
