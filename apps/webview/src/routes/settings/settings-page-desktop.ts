import {html} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import type {SessionSettings} from 'root/core/session/session-settings'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {
  hostLayoutPaintContainStyles,
  routeHostStyles,
  routePageStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {routeCalloutStyles} from 'root/shared/ui/route-callout.styles'
import {isLegalDocument} from 'root/shared/services/legal-documents.model'
import {SettingsPageLayoutBase} from './settings-page-layout-base'
import {renderMacosCredentialProviderCapabilities} from './settings-credential-provider-capabilities'
import {SettingsVaultRekeyForm} from './settings-vault-rekey-form'

export class SettingsPageDesktopLayout extends SettingsPageLayoutBase {
  static elementName = 'settings-page-desktop-layout'

  static define(): void {
    SettingsVaultRekeyForm.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  static styles = [
    sharedStyles,
    hostLayoutPaintContainStyles,
    routeHostStyles,
    routePageStyles,
    routeCalloutStyles,
    css`
      .page {
        box-sizing: border-box;
        max-inline-size: 1040px;
        gap: var(--app-spacing-5);
        --app-route-callout-base-line-height: 1.45;
        --app-route-callout-message-overflow-wrap: anywhere;
      }

      @media (max-width: 767px) {
        .page {
          padding-block-start: var(--app-spacing-4);
          padding-block-end: calc(
            var(--app-spacing-8) + var(--app-spacing-8) + var(--app-runtime-safe-area-block-end-active, 0px)
          );
          padding-inline-start: max(
            var(--app-spacing-4),
            var(--app-runtime-safe-area-inline-start, 0px)
          );
          padding-inline-end: max(
            var(--app-spacing-4),
            var(--app-runtime-safe-area-inline-end, 0px)
          );
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
        inset-block-start: var(--app-spacing-4);
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

      @media (max-width: 767px) {
        .settings-index {
          inset-block-start: var(--app-spacing-2);
        }
      }

      @media (min-width: 900px) {
        .settings-index {
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

      @media (min-width: 900px) {
        .settings-index-link {
          min-inline-size: 0;
          white-space: normal;
        }

        .settings-index-link > span {
          min-inline-size: 0;
          overflow-wrap: anywhere;
        }
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
        scroll-margin-block-start: calc(
          var(--app-mobile-shell-topbar-block-size, 56px) + 56px + var(--app-spacing-3)
        );
      }

      @media (min-width: 768px) {
        .settings-section,
        .card {
          padding: var(--app-spacing-5);
          scroll-margin-block-start: var(--app-spacing-6);
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
        color: var(--cv-color-primary);
        background: var(--cv-color-primary-surface);
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
        min-block-size: var(--app-touch-target-min);
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
        min-block-size: var(--app-touch-target-min);
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
        --cv-guidance-panel-border-color: var(--cv-color-info-border-strong);
        --cv-guidance-panel-background: var(--cv-color-info-surface);
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

      .provider-capabilities {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--app-spacing-3);
      }

      .provider-capability {
        display: grid;
        align-content: start;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
        padding: var(--app-spacing-3);
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
      }

      .provider-capability-title,
      .provider-note {
        margin: 0;
      }

      .provider-capability-title {
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
      }

      .provider-note {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        line-height: 1.45;
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

      @media (max-width: 719px) {
        .provider-capabilities {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .vault-rekey-card {
        gap: var(--app-spacing-4);
      }

      .settings-link-list {
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .settings-link-list > li + li {
        border-block-start: 1px solid var(--cv-color-border-muted);
      }

      .settings-link-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: var(--app-spacing-3);
        align-items: center;
        min-block-size: var(--app-touch-target-min);
        margin-inline: calc(var(--app-spacing-3) * -1);
        padding: var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-text);
        text-decoration: none;
      }

      .settings-link-row:hover {
        background: var(--cv-color-hover);
      }

      .settings-link-row:focus-visible {
        outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-info));
        outline-offset: 2px;
      }

      .settings-link-icon {
        font-size: 18px;
        color: var(--cv-color-primary);
      }

      .settings-link-external {
        font-size: 16px;
        color: var(--cv-color-text-muted);
      }

      .settings-link-row:hover .settings-link-external {
        color: var(--cv-color-text);
      }

      @media (max-width: 719px) {
        .settings-row-control,
        .settings-actions,
        .provider-actions {
          align-items: stretch;
        }

        .settings-row-control > *,
        .settings-actions > cv-button,
        .provider-actions > cv-button,
        .settings-select,
        .settings-text-input {
          inline-size: 100%;
        }
      }
    `,
  ]

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

  private handleLegalDocumentClick(event: Event) {
    event.preventDefault()
    const legalDocument = (event.currentTarget as HTMLElement).dataset['legalDocument']
    if (isLegalDocument(legalDocument)) void this.model.legalDocuments.open(legalDocument)
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

  private handlePasswordImport() {
    void this.model.openPasswordImport()
  }

  private handlePasswordExport() {
    void this.model.exportPasswords()
  }

  private handlePasswordClean() {
    void this.model.cleanPasswords()
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
        id: 'settings-credential-provider',
        icon: 'key-round',
        label: i18n('settings:provider-nav-title'),
        visible: this.model.showsCredentialProviderSection(),
      },
      {
        id: 'settings-about',
        icon: 'info',
        label: i18n('settings:about-title'),
        visible: true,
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
    return html`
      <div class="settings-subsection vault-rekey-card" id="settings-vault-password-rekey">
        <settings-vault-rekey-form></settings-vault-rekey-form>
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

  private renderSessionSecuritySection(settings: SessionSettings) {

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
              ${this.model.showsMobileAutofillLockConflict()
                ? html`
                    <cv-callout class="route-callout settings-callout" variant="warning" density="dense">
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

    const selected = this.model.credentialProviderSelected()
    const accessNotice = this.model.credentialProviderAccessNotice()
    const steps = this.model.credentialProviderSteps()

    return html`
      <section
        class="settings-section provider-card"
        id="settings-credential-provider"
        aria-labelledby="settings-credential-provider-title"
      >
        ${this.renderSectionHeader(
          'settings-credential-provider',
          'key-round',
          i18n('settings:provider-title'),
          this.model.credentialProviderDescription(),
        )}

        <div class="provider-status-row">
          <span
            class="provider-status-pill"
            data-state=${this.model.credentialProviderStatusState()}
            role="status"
            aria-atomic="true"
          >
            <span class="provider-status-dot" aria-hidden="true"></span>
            ${this.model.credentialProviderSummary()}
          </span>
        </div>

        ${renderMacosCredentialProviderCapabilities(this.model, 'provider-status-pill')}

        <div class="provider-actions">
          <cv-button
            variant="primary"
            ?disabled=${this.model.credentialProviderSettingsActionDisabled()}
            @click=${this.handleOpenCredentialProviderSettings}
          >
            ${this.model.credentialProviderActionLabel()}
          </cv-button>
        </div>
        ${accessNotice
          ? html`
              <cv-callout class="route-callout settings-callout" variant="warning" density="dense">
                ${accessNotice}
              </cv-callout>
            `
          : nothing}

        ${selected === true
          ? nothing
          : html`
              <ol class="provider-steps">
                <li>${steps[0]}</li>
                <li>${steps[1]}</li>
              </ol>
            `}
      </section>
    `
  }

  private renderAboutSection() {
    return html`
      <section class="settings-section" id="settings-about" aria-labelledby="settings-about-title">
        ${this.renderSectionHeader('settings-about', 'info', i18n('settings:about-title'))}
        <ul class="settings-link-list">
          ${this.model.legalDocuments.links().map(
            (link) => html`
              <li>
                <a
                  class="settings-link-row"
                  href=${link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-legal-document=${link.document}
                  @click=${this.handleLegalDocumentClick}
                >
                  <cv-icon class="settings-link-icon" name=${link.icon} aria-hidden="true"></cv-icon>
                  <span class="settings-row-copy">
                    <span class="settings-label">${link.label}</span>
                    <span class="settings-description">${i18n('legal:opens-in-browser')}</span>
                  </span>
                  <cv-icon class="settings-link-external" name="external-link" aria-hidden="true"></cv-icon>
                </a>
              </li>
            `,
          )}
        </ul>
      </section>
    `
  }

  protected render() {
    const settings = this.model.settings()

    return html`
      <div class="page">
        <div class="settings-shell">
          ${this.renderSectionIndex()}
          <div class="settings-content">
            ${this.renderApplicationSection(settings)} ${this.renderPasswordsSection()}
            ${this.renderPasswordImportDialog()} ${this.renderSessionSecuritySection(settings)}
            ${this.renderSshAgentSection()} ${this.renderAutofillSection()} ${this.renderAboutSection()}
          </div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page-desktop-layout': SettingsPageDesktopLayout
  }
}
