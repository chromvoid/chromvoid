import {html} from 'lit'
import {i18n} from 'root/i18n'

export function renderWelcomeToolsSection({
  isDesktopRuntime,
  busy,
  restoreInProgress,
  restoreCancelling,
  isPrivacyMode,
  storePath,
  onBackupClick,
  onRestoreClick,
  onCancelRestore,
  onEraseClick,
  onTogglePrivacy,
  onChangeStorePath,
  onUseDefaultStorePath,
  onPrintKit,
}: {
  isDesktopRuntime: boolean
  busy: boolean
  restoreInProgress: boolean
  restoreCancelling: boolean
  isPrivacyMode: boolean
  storePath: string
  onBackupClick: () => void
  onRestoreClick: () => void
  onCancelRestore: () => void
  onEraseClick: () => void
  onTogglePrivacy: () => void
  onChangeStorePath: () => void
  onUseDefaultStorePath: () => void
  onPrintKit: () => void
}) {
  return html`
    <div class="tool-card">
      <div class="tool-header">${i18n('onboard:tools:title')}</div>
      <div class="tool-actions">
        <cv-button variant="default" ?disabled=${busy} @click=${onBackupClick}>
          ${i18n('button:backup')}
        </cv-button>
        <cv-button variant="default" ?disabled=${busy} @click=${onRestoreClick}>
          ${i18n('button:restore')}
        </cv-button>
        <cv-button variant="danger" ?disabled=${busy} @click=${onEraseClick}>
          ${i18n('button:erase')}
        </cv-button>
      </div>
      ${restoreInProgress
        ? html`
            <cv-callout variant="info">
              ${restoreCancelling
                ? 'Stopping restore. Waiting for current operation to finish safely.'
                : 'Restore is in progress. You can cancel it if needed.'}
            </cv-callout>
            <cv-button variant="default" ?disabled=${restoreCancelling} @click=${onCancelRestore}>
              ${restoreCancelling ? 'Cancelling Restore...' : 'Cancel Restore'}
            </cv-button>
          `
        : ''}
    </div>

    <div class="tool-card">
      <div class="tool-header">
        System
        <div class="privacy-toggle" @click=${onTogglePrivacy} title="Toggle Privacy Blur">
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
            ${isPrivacyMode ? html`<line x1="1" y1="1" x2="23" y2="23"></line>` : ''}
          </svg>
        </div>
      </div>
      <div class="meta-info ${isPrivacyMode ? 'privacy-blur' : ''}">${storePath || 'No path set'}</div>
      ${isDesktopRuntime
        ? html`
            <div class="location-actions">
              <cv-button
                class="location-change-button"
                size="small"
                variant="default"
                ?disabled=${busy}
                @click=${onChangeStorePath}
              >
                Change Location
              </cv-button>
              <cv-button
                class="location-reset-button"
                size="small"
                variant="ghost"
                ?disabled=${busy}
                title="Use Default Location"
                @click=${onUseDefaultStorePath}
              >
                <span class="sr-only">Use Default Location</span>
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
        : ''}
      ${isDesktopRuntime
        ? html`<div class="tool-section-divider">
            <cv-button size="small" variant="default" ?disabled=${busy} @click=${onPrintKit}>
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
              Print Emergency Kit
            </cv-button>
          </div>`
        : ''}
    </div>
  `
}

export function renderWelcomePrintKit({storePath}: {storePath: string}) {
  return html`
    <div class="print-kit">
      <div class="kit-header">
        <div class="kit-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <div class="kit-title">ChromVoid Emergency Kit</div>
      </div>

      <div class="kit-intro">
        <strong>IMPORTANT:</strong> Store this document in a secure location (e.g. safe deposit box). It
        contains the keys required to access your encrypted data. Without the Master Password, your data
        cannot be recovered.
      </div>

      <div class="kit-section">
        <div class="kit-label">Storage Location (Path)</div>
        <div class="kit-box filled">${storePath || 'Default Location'}</div>
        <div class="kit-help">This is where your encrypted vault files are stored on this device.</div>
      </div>

      <div class="kit-section">
        <div class="kit-label">Master Password</div>
        <div class="kit-box">
          <div class="kit-lines"></div>
          <div class="kit-lines"></div>
        </div>
        <div class="kit-help">
          <strong>CRITICAL:</strong> Used for Backup, Restore, and Erase operations. If lost, data recovery is
          impossible.
        </div>
      </div>

      <div class="kit-section">
        <div class="kit-label">Vault Password</div>
        <div class="kit-box">
          <div class="kit-lines"></div>
        </div>
        <div class="kit-help">Used for daily access to your vault.</div>
      </div>

      <div class="kit-footer">
        Generated by ChromVoid on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
      </div>
    </div>
  `
}

export function renderWelcomeMobileToolsSection({
  isDesktopRuntime,
  busy,
  restoreInProgress,
  restoreCancelling,
  isPrivacyMode,
  storePath,
  onBackupClick,
  onRestoreClick,
  onCancelRestore,
  onEraseClick,
  onTogglePrivacy,
  onChangeStorePath,
  onUseDefaultStorePath,
}: {
  isDesktopRuntime: boolean
  busy: boolean
  restoreInProgress: boolean
  restoreCancelling: boolean
  isPrivacyMode: boolean
  storePath: string
  onBackupClick: () => void
  onRestoreClick: () => void
  onCancelRestore: () => void
  onEraseClick: () => void
  onTogglePrivacy: () => void
  onChangeStorePath: () => void
  onUseDefaultStorePath: () => void
}) {
  return html`
    <div class="mobile-support">
      <details class="mobile-panel">
        <summary class="mobile-panel-summary">
          <div class="mobile-panel-title">
            <span class="mobile-panel-label">Device utilities</span>
            <span class="mobile-panel-meta">Backup, restore, and destructive maintenance live here.</span>
          </div>
        </summary>

        <div class="mobile-panel-body">
          <div class="mobile-panel-note">
            Secondary actions stay collapsed by default so the primary unlock flow keeps focus.
          </div>

          <div class="tool-actions">
            <cv-button variant="default" ?disabled=${busy} @click=${onBackupClick}>
              ${i18n('button:backup')}
            </cv-button>
            <cv-button variant="default" ?disabled=${busy} @click=${onRestoreClick}>
              ${i18n('button:restore')}
            </cv-button>
            <cv-button variant="danger" ?disabled=${busy} @click=${onEraseClick}>
              ${i18n('button:erase')}
            </cv-button>
          </div>

          ${restoreInProgress
            ? html`
                <cv-callout variant="info">
                  ${restoreCancelling
                    ? 'Stopping restore. Waiting for the current operation to finish safely.'
                    : 'Restore is in progress. You can cancel it if needed.'}
                </cv-callout>
                <cv-button variant="default" ?disabled=${restoreCancelling} @click=${onCancelRestore}>
                  ${restoreCancelling ? 'Cancelling Restore...' : 'Cancel Restore'}
                </cv-button>
              `
            : ''}
        </div>
      </details>

      <details class="mobile-panel">
        <summary class="mobile-panel-summary">
          <div class="mobile-panel-title">
            <span class="mobile-panel-label">Storage location</span>
            <span class="mobile-panel-meta">Current vault path and local device controls.</span>
          </div>
        </summary>

        <div class="mobile-panel-body">
          <div class="mobile-meta-head">
            <div class="mobile-meta-label">Current store</div>
            <div class="privacy-toggle" @click=${onTogglePrivacy} title="Toggle Privacy Blur">
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
                ${isPrivacyMode ? html`<line x1="1" y1="1" x2="23" y2="23"></line>` : ''}
              </svg>
            </div>
          </div>

          <div class="meta-info ${isPrivacyMode ? 'privacy-blur' : ''}">${storePath || 'No path set'}</div>

          ${isDesktopRuntime
            ? html`
                <div class="mobile-meta-actions">
                  <cv-button variant="default" ?disabled=${busy} @click=${onChangeStorePath}>
                    Change Location
                  </cv-button>
                  <cv-button variant="ghost" ?disabled=${busy} @click=${onUseDefaultStorePath}>
                    Use Default Location
                  </cv-button>
                </div>
              `
            : ''}
        </div>
      </details>
    </div>
  `
}
