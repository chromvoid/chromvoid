import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import {i18n} from 'root/i18n'

import {remoteHostsFlowStyles} from 'root/routes/remote/remote-hosts-flow.styles'
import {
  renderRemoteHostsPanel,
  renderRemotePairPanel,
  renderRemoteWaitPanel,
} from 'root/routes/remote/remote-hosts-flow.render'

import type {WelcomeSectionLayout} from '../welcome-section-layout'
import {
  welcomeSectionCalloutStyles,
  welcomeSectionHostStyles,
  welcomeSectionMobileButtonStyles,
} from '../welcome-section.styles'
import type {PasswordFeedback, WelcomeSetupModel} from '../welcome-setup.model'

function renderEntropyMeter(passwordStrength: PasswordFeedback) {
  const {score, feedback} = passwordStrength
  if (!passwordStrength) return nothing

  const scoreText = [
    i18n('welcome:entropy-very-weak'),
    i18n('welcome:entropy-weak'),
    i18n('welcome:entropy-fair'),
    i18n('welcome:entropy-good'),
    i18n('welcome:entropy-strong'),
  ][score]

  return html`
    <div class="entropy-meter score-${score}">
      <div class="entropy-bar">
        <div class="entropy-segment"></div>
        <div class="entropy-segment"></div>
        <div class="entropy-segment"></div>
        <div class="entropy-segment"></div>
      </div>
      <div class="entropy-text">
        <span class="entropy-score">${scoreText}</span>
        ${feedback.warning ? html`<span class="entropy-warning"> - ${feedback.warning}</span>` : nothing}
      </div>
    </div>
  `
}

function renderModeIcon(kind: 'local' | 'remote') {
  if (kind === 'local') {
    return html`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2"></rect>
        <path d="M8 20h8"></path>
        <path d="M12 16v4"></path>
      </svg>
    `
  }

  return html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="3"></rect>
      <path d="M11 18h2"></path>
      <path d="M4 8h2"></path>
      <path d="M18 8h2"></path>
    </svg>
  `
}

export class WelcomeSetupSection extends ReatomLitElement {
  static properties = {
    model: {attribute: false},
    layout: {type: String, reflect: true},
  }

  static styles = [
    welcomeSectionHostStyles,
    welcomeSectionCalloutStyles,
    welcomeSectionMobileButtonStyles,
    remoteHostsFlowStyles,
    css`
      :host {
        --meter-score-0: var(--cv-color-danger);
        --meter-score-1: var(--cv-color-warning-dark);
        --meter-score-2: var(--cv-color-warning);
        --meter-score-3: var(--cv-color-success-dark);
        --meter-score-4: var(--cv-color-success);
      }

      .welcome-actions {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .setup-card {
        display: grid;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-4);
        background: var(--cv-color-surface-3);
        border-radius: 12px;
        border: 1px solid transparent;
      }

      .setup-title {
        font-weight: 600;
        font-size: 1rem;
        color: var(--cv-color-text);
      }

      .setup-desc {
        font-size: 0.875rem;
        color: var(--cv-color-text-muted);
      }

      .password-form-grid {
        display: grid;
        gap: var(--app-spacing-3);
        margin-top: var(--app-spacing-3);
      }

      .entropy-meter {
        display: flex;
        flex-direction: column;
        gap: var(--app-spacing-1);
        margin-top: var(--app-spacing-2);
      }

      .entropy-bar {
        display: flex;
        gap: var(--app-spacing-1);
        height: 4px;
      }

      .entropy-segment {
        flex: 1;
        background: var(--cv-color-surface-3);
        border-radius: 2px;
        transition: background-color 0.3s ease;
      }

      .entropy-text {
        font-size: 0.75rem;
        text-align: right;
        font-weight: 500;
      }

      .entropy-warning {
        opacity: 0.7;
        font-weight: 400;
      }

      .score-0 .entropy-segment:nth-child(1) {
        background: var(--meter-score-0);
      }

      .score-1 .entropy-segment:nth-child(1),
      .score-1 .entropy-segment:nth-child(2) {
        background: var(--meter-score-1);
      }

      .score-2 .entropy-segment:nth-child(1),
      .score-2 .entropy-segment:nth-child(2),
      .score-2 .entropy-segment:nth-child(3) {
        background: var(--meter-score-2);
      }

      .score-3 .entropy-segment:nth-child(-n + 3),
      .score-3 .entropy-segment:nth-child(4) {
        background: var(--meter-score-3);
      }

      .score-4 .entropy-segment {
        background: var(--meter-score-4);
      }

      .score-0 .entropy-score {
        color: var(--meter-score-0);
      }

      .score-1 .entropy-score {
        color: var(--meter-score-1);
      }

      .score-2 .entropy-score {
        color: var(--meter-score-2);
      }

      .score-3 .entropy-score {
        color: var(--meter-score-3);
      }

      .score-4 .entropy-score {
        color: var(--meter-score-4);
      }

      .mode-cards {
        display: grid;
        gap: var(--app-spacing-4);
      }

      .mode-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--app-spacing-4);
        padding: var(--app-spacing-5);
        background: linear-gradient(
          180deg,
          var(--cv-color-surface-secondary-glass-strong) 0%,
          var(--cv-color-surface-3) 100%
        );
        border: 1px solid var(--cv-color-border);
        border-radius: 14px;
        cursor: pointer;
        align-items: center;
        transition:
          border-color var(--cv-duration-fast) var(--cv-easing-standard),
          background-color var(--cv-duration-fast) var(--cv-easing-standard),
          transform var(--cv-duration-fast) var(--cv-easing-standard),
          box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
      }

      .mode-card:hover {
        border-color: var(--cv-color-border-accent);
        background: var(--cv-color-primary-surface);
        box-shadow:
          0 0 0 1px var(--cv-color-primary-ring),
          0 14px 28px var(--cv-alpha-black-20);
        transform: translateY(-1px);
      }

      .mode-card.disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .mode-card.disabled:hover {
        border-color: var(--cv-color-border);
        background: linear-gradient(
          180deg,
          var(--cv-color-surface-secondary-glass-strong) 0%,
          var(--cv-color-surface-3) 100%
        );
        box-shadow: none;
        transform: none;
      }

      .mode-icon {
        inline-size: 48px;
        block-size: 48px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        border: 1px solid var(--cv-color-primary-border);
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-brand);
        box-shadow: inset 0 1px 0 var(--cv-alpha-white-5);
      }

      .mode-card-remote .mode-icon {
        color: var(--cv-color-accent);
        background: var(--cv-color-accent-surface);
      }

      .mode-icon svg {
        inline-size: 24px;
        block-size: 24px;
      }

      .mode-content {
        display: grid;
        gap: 6px;
      }

      .mode-title {
        font-weight: 600;
        font-size: 1rem;
        color: var(--cv-color-text);
      }

      .mode-desc {
        font-size: 0.875rem;
        color: var(--cv-color-text-muted);
      }

      .setup-footer {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .master-warning {
        margin-top: var(--app-spacing-3);
        font-size: 0.8rem;
      }

      :host([layout='mobile']) .welcome-actions,
      :host([layout='mobile']) .setup-footer,
      :host([layout='mobile']) .remote-actions {
        gap: var(--app-spacing-3);
      }

      :host([layout='mobile']) .mode-cards {
        gap: var(--app-spacing-3);
      }

      :host([layout='mobile']) .mode-card {
        padding: var(--app-spacing-4);
      }

      :host([layout='mobile']) .back-link {
        padding-inline-start: 2px;
      }
    `,
  ]

  declare model?: WelcomeSetupModel
  declare layout: WelcomeSectionLayout

  constructor() {
    super()
    this.layout = 'desktop'
  }

  static define() {
    if (!customElements.get('welcome-setup-section')) {
      customElements.define('welcome-setup-section', this)
    }
  }

  protected render() {
    if (!this.model) {
      return nothing
    }

    const setupStep = this.model.effectiveStep()
    const busy = this.model.busy()
    const setupInProgress = this.model.setupInProgress()
    const creationState = this.model.creationState()
    const isNeedInit = this.model.isNeedInit()
    const isDesktopRemoteSupported = this.model.isDesktopRemoteSupported()

    if (setupStep === 'remote-connect') {
      return renderRemoteHostsPanel({
        model: this.model.remote,
        actions: {
          onOpenPairIos: this.model.onOpenRemotePair,
          onConnectPeer: this.model.onConnectRemotePeer,
          onRemovePeer: this.model.onRemoveRemotePeer,
        },
        ui: {
          hostsBackLink: {
            label: isNeedInit ? i18n('welcome:back-mode-selection') : i18n('welcome:back-unlock-screen'),
            onBack: this.model.onBackFromRemoteConnect,
          },
        },
      })
    }

    if (setupStep === 'remote-pair') {
      return renderRemotePairPanel({
        model: this.model.remote,
        actions: {
          onBackToHosts: this.model.onBackFromRemotePair,
          onSubmitPairing: this.model.onSubmitRemotePair,
        },
        ui: {
          pairBackLink: {
            label: i18n('welcome:back-remote-hosts'),
            onBack: this.model.onBackFromRemotePair,
          },
        },
      })
    }

    if (setupStep === 'remote-wait') {
      return renderRemoteWaitPanel({
        model: this.model.remote,
        actions: {
          onDisconnectTransport: this.model.onBackFromRemoteWait,
        },
        ui: {
          waitBackLink: {
            label: i18n('welcome:disconnect-remote-transport'),
            onBack: this.model.onBackFromRemoteWait,
          },
        },
      })
    }

    if (!isNeedInit) {
      return html`
        <div class="welcome-actions">
          <cv-button variant="primary" ?disabled=${busy} .loading=${setupInProgress} @click=${this.model.onUnlock}>
            ${i18n('welcome:unlock-vault')}
          </cv-button>
          ${isDesktopRemoteSupported
            ? html`
                <cv-button variant="ghost" ?disabled=${busy} @click=${this.model.onSelectRemoteMode}>
                  ${i18n('welcome:connect-remote')}
                </cv-button>
              `
            : nothing}
        </div>
      `
    }

    if (setupStep === 'mode-select' || setupStep === null) {
      return html`
        <cv-guidance-anchor anchor-id="welcome.vault-mode" surface="welcome" owner="welcome">
          <div class="mode-cards">
            <div class="mode-card mode-card-local" @click=${this.model.onSelectLocalMode}>
              <div class="mode-icon">${renderModeIcon('local')}</div>
              <div class="mode-content">
                <div class="mode-title">${i18n('welcome:mode-local-title')}</div>
                <div class="mode-desc">${i18n('welcome:mode-local-desc')}</div>
                <div class="mode-badge">${i18n('welcome:mode-local-badge')}</div>
              </div>
            </div>
            <div class="mode-card mode-card-remote ${isDesktopRemoteSupported ? '' : 'disabled'}" @click=${this.model.onSelectRemoteMode}>
              <div class="mode-icon">${renderModeIcon('remote')}</div>
              <div class="mode-content">
                <div class="mode-title">${i18n('welcome:mode-remote-title')}</div>
                <div class="mode-desc">${i18n('welcome:mode-remote-desc')}</div>
                <div class="mode-badge">
                  ${isDesktopRemoteSupported ? i18n('welcome:mode-remote-badge') : i18n('welcome:mode-remote-disabled')}
                </div>
              </div>
            </div>
          </div>
        </cv-guidance-anchor>
        <cv-callout variant="info">${i18n('welcome:mode-change-later')}</cv-callout>
      `
    }

    return html`
      <div class="back-link" @click=${this.model.onBackToModeSelect}>
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
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        ${i18n('welcome:back-mode-selection')}
      </div>

      <cv-guidance-anchor anchor-id="welcome.master-password" surface="welcome" owner="welcome">
        <div class="setup-card">
          <div class="setup-title">${i18n('onboard:step:master:title')}</div>
          <div class="setup-desc">${i18n('onboard:step:master:desc')}</div>

          <form class="password-form-grid" @submit=${this.model.handleCreateMasterSubmit}>
            <div>
              <cv-input
                type="password"
                placeholder=${i18n('welcome:create-password')}
                password-toggle
                .value=${creationState.p1}
                @cv-input=${this.model.handleMasterPasswordInput}
              ></cv-input>
              ${creationState.p1 ? renderEntropyMeter(this.model.passwordStrength()) : nothing}
            </div>

            <cv-input
              type="password"
              password-toggle
              placeholder=${i18n('welcome:confirm-password')}
              enterkeyhint="done"
              .value=${creationState.p2}
              @cv-input=${this.model.handleMasterPasswordConfirmInput}
            ></cv-input>

            <cv-button variant="primary" type="submit" ?disabled=${busy} .loading=${setupInProgress}>
              ${i18n('welcome:create-storage')}
            </cv-button>
          </form>
        </div>
      </cv-guidance-anchor>

      <div class="setup-footer">
        <cv-callout class="master-warning" variant="warning">${i18n('onboard:master:warning')}</cv-callout>
      </div>
    `
  }
}
