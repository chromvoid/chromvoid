import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  routeHostStyles,
  routePageStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {settingsPageModel} from './settings.model'

export class SettingsPage extends XLitElement {
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
        max-inline-size: 640px;
      }

      .card {
        background: var(--surface-elevated, #1f1f1f);
        border: 1px solid var(--border-subtle, var(--cv-alpha-white-8));
        border-radius: var(--cv-radius-lg, 12px);
        padding: var(--app-spacing-4);
      }

      .card-title {
        font-size: var(--cv-font-size-base);
        font-weight: var(--cv-font-weight-semibold);
        margin: 0 0 var(--app-spacing-3) 0;
        color: var(--text-primary, #fff);
      }

      .settings-list {
        display: grid;
        gap: var(--app-spacing-4);
      }

      .settings-field {
        display: grid;
        gap: var(--app-spacing-1);
      }

      .settings-label {
        font-size: var(--cv-font-size-sm);
        color: var(--text-secondary, var(--cv-alpha-white-70));
      }

      .settings-select {
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: var(--cv-radius-md, 8px);
        border: 1px solid var(--border-subtle, var(--cv-alpha-white-8));
        background: var(--surface-muted, #1a1a1a);
        color: var(--text-primary, #fff);
        font-size: var(--cv-font-size-sm);
        cursor: pointer;
        max-width: 200px;

        &:focus {
          outline: none;
          border-color: var(--accent, #ff7a00);
        }
      }

      .settings-checkbox-row {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        cursor: pointer;

        input[type='checkbox'] {
          inline-size: 18px;
          block-size: 18px;
          accent-color: var(--accent, #ff7a00);
          cursor: pointer;
        }

        span {
          font-size: var(--cv-font-size-sm);
          color: var(--text-primary, #fff);
        }
      }

      .settings-description {
        font-size: var(--cv-font-size-xs);
        color: var(--text-tertiary, var(--cv-alpha-white-50));
        margin-top: var(--app-spacing-1);
      }

      .settings-warning {
        margin-top: var(--app-spacing-2);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: var(--cv-radius-md, 8px);
        border: 1px solid color-mix(in oklch, var(--cv-color-warning, #f59e0b) 32%, transparent);
        background: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 10%, transparent);
        color: var(--text-primary, #fff);
        font-size: var(--cv-font-size-xs);
      }

      .provider-card {
        display: grid;
        gap: var(--app-spacing-4);
      }

      .provider-card .settings-description {
        margin: 0;
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
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: 999px;
        border: 1px solid var(--border-subtle, var(--cv-alpha-white-8));
        background: var(--surface-muted, #1a1a1a);
        color: var(--text-primary, #fff);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-medium, 500);
      }

      .provider-status-pill[data-state='selected'] {
        border-color: color-mix(in oklch, var(--cv-color-success, #10b981) 36%, transparent);
        background: color-mix(in oklch, var(--cv-color-success, #10b981) 14%, transparent);
      }

      .provider-status-pill[data-state='missing'] {
        border-color: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 32%, transparent);
        background: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 10%, transparent);
      }

      .provider-status-pill[data-state='unknown'] {
        border-color: color-mix(in oklch, var(--cv-color-info, #38bdf8) 28%, transparent);
        background: color-mix(in oklch, var(--cv-color-info, #38bdf8) 10%, transparent);
      }

      .provider-status-dot {
        inline-size: 8px;
        block-size: 8px;
        border-radius: 50%;
        background: currentColor;
      }

      .provider-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--app-spacing-2);
      }

      .provider-steps {
        display: grid;
        gap: var(--app-spacing-2);
        margin: 0;
        padding-inline-start: 1.25rem;
        color: var(--text-secondary, var(--cv-alpha-white-70));
        font-size: var(--cv-font-size-sm);
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
      return
    }

    if (event.type === 'visibilitychange' && document.visibilityState === 'visible') {
      void this.model.refreshAndroidAutofillProviderStatus()
    }
  }

  private handleAutoLockChange(event: Event) {
    const select = event.target as HTMLSelectElement
    void this.model.setAutoLockTimeout(select.value)
  }

  private handleLockOnSleepChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setLockOnSleep(checkbox.checked)
  }

  private handleLockOnMobileBackgroundChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setLockOnMobileBackground(checkbox.checked)
  }

  private handleAutoMountAfterUnlockChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setAutoMountAfterUnlock(checkbox.checked)
  }

  private handleRequireBiometricAppGateChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setRequireBiometricAppGate(checkbox.checked)
  }

  private handleKeepScreenAwakeChange(event: Event) {
    const checkbox = event.target as HTMLInputElement
    void this.model.setKeepScreenAwakeWhenUnlocked(checkbox.checked)
  }

  private handleBack() {
    this.model.goBack()
  }

  private handleOpenAndroidAutofillProviderSettings() {
    void this.model.openAndroidAutofillProviderSettings()
  }

  protected render() {
    const settings = this.model.settings()
    const androidAutofillProviderSelected = this.model.androidAutofillProviderSelected()
    const autofillProviderStatus =
      androidAutofillProviderSelected === true
        ? 'selected'
        : androidAutofillProviderSelected === false
          ? 'missing'
          : 'unknown'
    const autofillProviderStatusLabel =
      androidAutofillProviderSelected === true
        ? 'ChromVoid is selected as the Android Autofill provider'
        : androidAutofillProviderSelected === false
          ? 'ChromVoid is not selected as the Android Autofill provider yet'
          : 'Current Android Autofill provider could not be verified'

    return html`
      <div class="page">
        <div class="header">
          ${this.hideBackLink
            ? nothing
            : html`<button class="back-link" @click=${this.handleBack}>
                <cv-icon name="arrow-left"></cv-icon>
                Back
              </button>`}
          <h1 class="title">Settings</h1>
          <p class="subtitle">Configure session security and behavior</p>
        </div>

        <div class="card">
          <h2 class="card-title">Session Security</h2>
          <div class="settings-list">
            <div class="settings-field">
              <label class="settings-label">Auto-lock after</label>
              <select class="settings-select" @change=${this.handleAutoLockChange}>
                <option value="0" ?selected=${settings.auto_lock_timeout_secs === 0}>Never</option>
                <option value="60" ?selected=${settings.auto_lock_timeout_secs === 60}>1 minute</option>
                <option value="300" ?selected=${settings.auto_lock_timeout_secs === 300}>5 minutes</option>
                <option value="900" ?selected=${settings.auto_lock_timeout_secs === 900}>15 minutes</option>
                <option value="1800" ?selected=${settings.auto_lock_timeout_secs === 1800}>30 minutes</option>
                <option value="3600" ?selected=${settings.auto_lock_timeout_secs === 3600}>1 hour</option>
              </select>
              <p class="settings-description">Automatically lock the vault after a period of inactivity</p>
            </div>

            <label class="settings-checkbox-row">
              <input
                type="checkbox"
                .checked=${settings.lock_on_sleep}
                @change=${this.handleLockOnSleepChange}
              />
              <span>Lock when computer sleeps</span>
            </label>

            ${this.model.isMobileRuntime()
              ? html`
                  <div class="settings-field">
                    <label class="settings-checkbox-row">
                      <input
                        type="checkbox"
                        .checked=${settings.lock_on_mobile_background}
                        @change=${this.handleLockOnMobileBackgroundChange}
                      />
                      <span>Lock vault when app goes to background</span>
                    </label>
                    <p class="settings-description">
                      When enabled, ChromVoid locks the vault whenever the mobile app is hidden or
                      backgrounded.
                    </p>
                    ${this.model.supportsCredentialProviderAutofill()
                      ? html`
                          <p class="settings-warning">
                            Credential Provider / Autofill is incompatible with this option because those
                            requests require the vault to remain unlocked while the app is in the background.
                          </p>
                        `
                      : nothing}
                  </div>
                `
              : nothing}

            <label class="settings-checkbox-row">
              <input
                type="checkbox"
                .checked=${settings.auto_mount_after_unlock}
                @change=${this.handleAutoMountAfterUnlockChange}
              />
              <span>Auto-mount volume after unlock</span>
            </label>

            ${this.model.isMobileBiometricSupported()
              ? html`
                  <div class="settings-field">
                    <label class="settings-checkbox-row">
                      <input
                        type="checkbox"
                        .checked=${settings.require_biometric_app_gate}
                        @change=${this.handleRequireBiometricAppGateChange}
                      />
                      <span>Require biometrics before showing the app</span>
                    </label>
                    <p class="settings-description">
                      On supported mobile devices, require a biometric app gate before showing the app after
                      launch or resume. This does not unlock the vault by itself.
                    </p>
                  </div>
                `
              : nothing}
            ${this.model.isIosRuntime()
              ? html`
                  <div class="settings-field">
                    <label class="settings-checkbox-row">
                      <input
                        type="checkbox"
                        .checked=${settings.keep_screen_awake_when_unlocked}
                        @change=${this.handleKeepScreenAwakeChange}
                      />
                      <span>Keep screen awake while vault is open (iPhone only)</span>
                    </label>
                    <p class="settings-description">
                      Prevent the display from auto-sleeping while this app stays visible and the vault
                      remains unlocked.
                    </p>
                  </div>
                `
              : nothing}
          </div>
        </div>

        ${this.model.showsAndroidAutofillProviderSection()
          ? html`
              <div class="card provider-card">
                <div class="settings-field">
                  <h2 class="card-title">Credential Provider / Autofill</h2>
                  <p class="settings-description">
                    To let Android apps request credentials from ChromVoid, choose it as the system Autofill
                    provider.
                  </p>
                </div>

                <div class="provider-status-row">
                  <span class="provider-status-pill" data-state=${autofillProviderStatus}>
                    <span class="provider-status-dot" aria-hidden="true"></span>
                    ${autofillProviderStatusLabel}
                  </span>
                </div>

                <div class="provider-actions">
                  <cv-button variant="primary" @click=${this.handleOpenAndroidAutofillProviderSettings}>
                    Open Autofill Provider Settings
                  </cv-button>
                </div>

                <ol class="provider-steps">
                  <li>Tap the button above and choose ChromVoid in the Android Autofill provider picker.</li>
                  <li>
                    In Chrome, open Settings, then Password Manager, and enable “Autofill using another
                    service” so Chrome can use external providers too.
                  </li>
                </ol>
              </div>
            `
          : nothing}
      </div>
    `
  }
}
