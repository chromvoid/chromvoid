import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {isLegalDocument} from 'root/shared/services/legal-documents.model'

import {remoteHostsFlowStyles} from 'root/routes/remote/remote-hosts-flow.styles'
import {
  renderRemoteHostsFlowPanel,
  renderRemotePairPanel,
  renderRemoteWaitPanel,
} from 'root/routes/remote/remote-hosts-flow.render'

import type {WelcomeSectionLayout} from '../welcome-section-layout'
import {RemoteDesktopPreauth} from '../remote-desktop-preauth.render'
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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="12" rx="2"></rect>
        <path d="M8 20h8"></path>
        <path d="M12 16v4"></path>
      </svg>
    `
  }

  return html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="2" width="10" height="20" rx="3"></rect>
      <path d="M11 18h2"></path>
      <path d="M4 8h2"></path>
      <path d="M18 8h2"></path>
    </svg>
  `
}

// Keep smoke-critical actions as native controls at this shadow-root level so WKWebView
// exposes an actionable element to iOS accessibility automation.
function renderPrimaryActionContent(label: string, loading: boolean) {
  return html`
    ${loading ? html`<span class="welcome-primary-spinner" aria-hidden="true"></span>` : nothing}
    <span class="welcome-primary-label">${label}</span>
  `
}

function renderProofIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M5 12h14"></path>
      <circle cx="12" cy="12" r="2.4"></circle>
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
      .welcome-actions {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .mobile-first-run-actions {
        display: grid;
        gap: 14px;
      }

      .mobile-create-storage-action::part(base) {
        min-block-size: 56px;
        border-radius: 14px;
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.012em;
      }

      .mobile-create-storage-note {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--cv-color-text-subtle);
        font-size: 0.75rem;
        line-height: 1.4;
        text-align: center;
      }

      .mobile-create-storage-note svg {
        inline-size: 14px;
        block-size: 14px;
        flex: 0 0 auto;
        stroke: var(--cv-color-primary);
        stroke-width: 2;
      }

      .welcome-primary-action {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-space-2, 8px);
        inline-size: 100%;
        min-inline-size: 0;
        min-block-size: 36px;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border: 1px solid color-mix(in oklab, var(--cv-color-primary) 52%, var(--cv-color-border));
        border-radius: var(--cv-radius-sm, 6px);
        appearance: none;
        background: color-mix(in oklab, var(--cv-color-primary) 22%, var(--cv-color-surface));
        color: var(--cv-color-text);
        cursor: pointer;
        font: inherit;
        touch-action: manipulation;
        transition:
          background var(--cv-duration-fast) var(--cv-easing-standard),
          border-color var(--cv-duration-fast) var(--cv-easing-standard),
          color var(--cv-duration-fast) var(--cv-easing-standard);
      }

      .welcome-primary-action:hover:not(:disabled) {
        border-color: color-mix(in oklab, var(--cv-color-primary) 72%, var(--cv-color-border));
        background: color-mix(in oklab, var(--cv-color-primary) 30%, var(--cv-color-surface));
      }

      .welcome-primary-action:active:not(:disabled) {
        border-color: color-mix(in oklab, var(--cv-color-primary) 84%, var(--cv-color-border));
        background: color-mix(in oklab, var(--cv-color-primary) 36%, var(--cv-color-surface));
      }

      .welcome-primary-action:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 2px;
      }

      .welcome-primary-action:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .welcome-primary-action[aria-busy='true'] {
        cursor: progress;
      }

      .welcome-primary-label {
        flex: 1 1 auto;
        min-inline-size: 0;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .welcome-primary-action[aria-busy='true'] .welcome-primary-label {
        opacity: 0.72;
      }

      .welcome-primary-spinner {
        inline-size: 14px;
        block-size: 14px;
        flex: 0 0 auto;
        border: 2px solid rgb(from var(--cv-color-primary) r g b / 0.32);
        border-block-start-color: var(--cv-color-primary);
        border-radius: 999px;
        animation: welcome-primary-action-spin 800ms linear infinite;
      }

      .lockscreen-proof {
        display: flex;
        gap: 11px;
        align-items: flex-start;
        padding-block-start: 16px;
        border-top: 1px solid var(--welcome-lockscreen-border-faint);
        color: var(--welcome-lockscreen-foreground-subtle);
        font-size: 0.78125rem;
        line-height: 1.5;
      }

      .lockscreen-proof svg {
        inline-size: 15px;
        block-size: 15px;
        flex: 0 0 auto;
        margin-block-start: 1px;
        stroke: var(--cv-color-primary);
        stroke-width: 2;
      }

      .lockscreen-proof svg path {
        stroke-linecap: round;
      }

      .lockscreen-proof svg circle:last-child {
        fill: var(--cv-color-primary);
      }

      .lockscreen-proof strong {
        color: var(--welcome-lockscreen-foreground);
        font-weight: 500;
      }

      .lockscreen-proof em {
        color: var(--cv-color-primary);
        font-style: normal;
      }

      .lockscreen-proof p {
        margin: 0;
      }

      .password-sheet {
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

      .password-sheet::part(content) {
        border-block-start: 1px solid var(--welcome-lockscreen-border-muted);
        background: var(--welcome-lockscreen-surface);
        box-shadow: 0 -24px 70px var(--cv-alpha-black-62);
      }

      .password-sheet::part(body) {
        overflow-y: auto;
      }

      .password-sheet-form {
        display: grid;
        gap: 0;
      }

      .master-password-form.password-sheet-form {
        gap: 16px;
      }

      .password-sheet-label {
        display: block;
        margin-block-end: 9px;
        color: var(--welcome-lockscreen-foreground-subtle);
        font-family: var(--cv-font-family-code);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.14em;
      }

      .password-sheet-input {
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

      .password-sheet .password-sheet-input {
        display: block;
        inline-size: 100%;
      }

      .password-sheet-input::part(input) {
        font-size: 1rem;
        font-weight: 550;
        letter-spacing: 0.06em;
      }

      .password-sheet-error {
        margin: 8px 0 0;
        color: var(--cv-color-danger);
        font-size: var(--cv-font-size-sm);
        line-height: 1.35;
      }

      .password-sheet-submit {
        margin-block-start: 18px;
      }

      .master-password-form .password-sheet-submit {
        margin-block-start: 2px;
      }

      .master-password-field {
        min-inline-size: 0;
      }

      .legal-consent {
        margin: 0;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        line-height: 1.5;
        text-align: center;
        text-wrap: pretty;
      }

      .legal-consent-link {
        border-radius: 2px;
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .legal-consent-link:hover {
        color: var(--cv-color-text);
      }

      .legal-consent-link:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 2px;
      }

      .password-sheet .legal-consent {
        color: var(--welcome-lockscreen-foreground-muted);
      }

      .password-sheet .legal-consent-link:hover {
        color: var(--welcome-lockscreen-foreground);
      }

      .create-storage-sheet .master-warning {
        margin: 0;
      }

      .create-storage-sheet-title {
        color: var(--cv-color-text);
        font-size: 1.0625rem;
        font-weight: 650;
      }

      .create-storage-sheet-description {
        color: var(--cv-color-text-muted);
        font-size: 0.8125rem;
        line-height: 1.45;
      }

      .create-storage-sheet > cv-callout {
        margin-block-end: 16px;
      }

      .unlock-inline-form {
        display: grid;
        gap: 10px;
      }

      .unlock-inline-label {
        color: var(--cv-color-text-muted);
        font-family: var(--cv-font-family-code);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.14em;
      }

      .unlock-inline-submit {
        margin-block-start: 4px;
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

      .password-form-grid .password-sheet-label {
        color: var(--cv-color-text-muted);
      }

      .password-form-grid .password-sheet-input {
        --cv-input-background: var(--cv-color-surface-2);
        --cv-input-border-color: var(--cv-color-border);
        --cv-input-color: var(--cv-color-text);
        --cv-input-placeholder-color: var(--cv-color-text-subtle);
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
        background: var(--cv-color-danger);
      }

      .score-1 .entropy-segment:nth-child(1),
      .score-1 .entropy-segment:nth-child(2) {
        background: var(--cv-color-warning-dark);
      }

      .score-2 .entropy-segment:nth-child(1),
      .score-2 .entropy-segment:nth-child(2),
      .score-2 .entropy-segment:nth-child(3) {
        background: var(--cv-color-warning);
      }

      .score-3 .entropy-segment:nth-child(-n + 3),
      .score-3 .entropy-segment:nth-child(4) {
        background: var(--cv-color-success-dark);
      }

      .score-4 .entropy-segment {
        background: var(--cv-color-success);
      }

      .score-0 .entropy-score {
        color: var(--cv-color-danger);
      }

      .score-1 .entropy-score {
        color: var(--cv-color-warning-dark);
      }

      .score-2 .entropy-score {
        color: var(--cv-color-warning);
      }

      .score-3 .entropy-score {
        color: var(--cv-color-success-dark);
      }

      .score-4 .entropy-score {
        color: var(--cv-color-success);
      }

      .mode-cards {
        display: grid;
        gap: var(--app-spacing-4);
      }

      .mode-card {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--app-spacing-4);
        inline-size: 100%;
        padding: var(--app-spacing-5);
        background: linear-gradient(
          180deg,
          var(--cv-color-surface-secondary-glass-strong) 0%,
          var(--cv-color-surface-3) 100%
        );
        border: 1px solid var(--cv-color-border);
        border-radius: 14px;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: start;
        align-items: center;
        transition:
          border-color var(--cv-duration-fast) var(--cv-easing-standard),
          background-color var(--cv-duration-fast) var(--cv-easing-standard),
          transform var(--cv-duration-fast) var(--cv-easing-standard),
          box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
      }

      .mode-card:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 3px;
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

      .mode-card.disabled .mode-icon {
        color: var(--cv-color-text-subtle);
        background: var(--cv-color-surface-3);
        border-color: var(--cv-color-border-faint);
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

      :host([layout='desktop']) .welcome-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        max-inline-size: 400px;
        margin-inline: auto;
      }

      :host([layout='desktop']) .welcome-actions cv-button::part(base),
      :host([layout='desktop']) .setup-card cv-button::part(base) {
        min-block-size: 46px;
        border-radius: 9px;
      }

      :host([layout='desktop']) .welcome-primary-action {
        min-block-size: 46px;
        border-radius: 9px;
      }

      :host([layout='desktop']) .mode-cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      :host([layout='desktop']) .mode-card {
        grid-template-columns: 1fr;
        align-content: start;
        min-block-size: 188px;
        padding: 20px;
        gap: 12px;
        border-radius: 12px;
        background: var(--cv-color-surface-2);
      }

      :host([layout='desktop']) .mode-card:hover {
        transform: translateY(-2px);
      }

      :host([layout='desktop']) .mode-icon {
        inline-size: 38px;
        block-size: 38px;
        border-radius: 9px;
      }

      :host([layout='desktop']) .mode-icon svg {
        inline-size: 19px;
        block-size: 19px;
      }

      :host([layout='desktop']) .mode-content {
        min-block-size: 100%;
      }

      :host([layout='desktop']) .mode-desc {
        font-size: 0.8125rem;
        line-height: 1.5;
      }

      :host([layout='desktop']) .mode-badge {
        margin-block-start: auto;
        padding: 0;
        border-radius: 0;
        background: transparent;
        color: var(--cv-color-primary);
        font-weight: 700;
      }

      :host([layout='desktop']) .mode-card-remote .mode-badge {
        color: var(--cv-color-accent);
      }

      :host([layout='desktop']) .mode-card.disabled .mode-badge {
        color: var(--cv-color-warning);
      }

      :host([layout='desktop']) .setup-card {
        gap: 10px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
      }

      :host([layout='desktop']) .setup-title {
        font-size: 1rem;
      }

      :host([layout='desktop']) .setup-desc {
        max-inline-size: 48ch;
        font-size: 0.875rem;
        line-height: 1.5;
      }

      :host([layout='desktop']) .password-form-grid {
        gap: 14px;
      }

      :host([layout='desktop']) .setup-footer {
        gap: 0;
      }

      :host([layout='desktop']) .master-warning {
        margin-block-start: 2px;
      }

      :host([layout='desktop']) .legal-consent {
        margin-block-end: var(--app-spacing-4);
      }

      :host([layout='mobile']) .welcome-actions,
      :host([layout='mobile']) .setup-footer,
      :host([layout='mobile']) .remote-actions {
        gap: var(--app-spacing-3);
      }

      :host([layout='mobile']) .welcome-primary-action {
        min-block-size: 52px;
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

      :host([layout='mobile']) .welcome-actions.lockscreen-actions {
        gap: var(--app-spacing-3);
        margin-block-start: var(--app-spacing-5);
      }

      :host([layout='mobile']) .unlock-inline-label {
        color: var(--welcome-lockscreen-foreground-subtle);
      }

      :host([layout='mobile']) .unlock-inline-submit,
      :host([layout='mobile']) .password-sheet-submit {
        min-block-size: 54px;
        border-radius: 14px;
        background: var(--cv-color-primary);
        color: var(--welcome-lockscreen-on-primary);
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.012em;
        box-shadow: 0 8px 30px var(--welcome-lockscreen-primary-shadow);
      }

      :host([layout='mobile']) .unlock-inline-submit .welcome-primary-spinner {
        inline-size: 18px;
        block-size: 18px;
        border-color: rgb(from var(--welcome-lockscreen-on-primary) r g b / 0.32);
        border-block-start-color: var(--welcome-lockscreen-on-primary);
      }

      :host([layout='mobile']) .unlock-inline-submit[aria-busy='true'] .welcome-primary-label {
        flex: 0 1 auto;
      }

      @keyframes welcome-primary-action-spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .welcome-primary-spinner {
          animation-duration: 3200ms;
        }
      }

      @media (min-width: 700px) {
        :host([layout='mobile'][tablet-viewport]) .mobile-first-run-actions,
        :host([layout='mobile'][tablet-viewport]) .welcome-actions.lockscreen-actions {
          gap: var(--app-spacing-3);
        }

        :host([layout='mobile'][tablet-viewport]) .welcome-actions.lockscreen-actions {
          margin-block-start: 0;
        }

        :host([layout='mobile'][tablet-viewport]) .lockscreen-proof {
          padding-block-start: var(--app-spacing-4);
        }

        :host([layout='mobile'][tablet-viewport]) .password-sheet::part(content) {
          inline-size: min(540px, calc(100vw - 64px));
          margin-inline: auto;
          border-inline: 1px solid var(--welcome-lockscreen-border-muted);
        }
      }

      :host([layout='mobile'][viewport-profile='compact']) .lockscreen-proof,
      :host([layout='mobile'][viewport-profile='condensed']) .lockscreen-proof {
        gap: 8px;
        padding-block-start: 10px;
        font-size: 0.71875rem;
        line-height: 1.35;
      }

      :host([layout='mobile'][viewport-profile='compact']) .welcome-actions.lockscreen-actions,
      :host([layout='mobile'][viewport-profile='condensed']) .welcome-actions.lockscreen-actions {
        margin-block-start: 12px;
      }

      :host([layout='mobile'][viewport-profile='compact']) .unlock-inline-submit,
      :host([layout='mobile'][viewport-profile='compact']) .password-sheet-submit,
      :host([layout='mobile'][viewport-profile='condensed']) .unlock-inline-submit,
      :host([layout='mobile'][viewport-profile='condensed']) .password-sheet-submit {
        min-block-size: 48px;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .lockscreen-proof {
        padding-block-start: 8px;
        font-size: 0.65625rem;
        line-height: 1.28;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .lockscreen-proof svg {
        inline-size: 13px;
        block-size: 13px;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .welcome-actions.lockscreen-actions {
        margin-block-start: 9px;
      }

      :host([layout='mobile'][viewport-profile='condensed']) .unlock-inline-submit,
      :host([layout='mobile'][viewport-profile='condensed']) .password-sheet-submit {
        min-block-size: 44px;
        font-size: 0.9375rem;
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
    CVBottomSheet.define()
    RemoteDesktopPreauth.define()
    if (!customElements.get('welcome-setup-section')) {
      customElements.define('welcome-setup-section', this)
    }
  }

  private async handleCreateMasterSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (!this.model) return

    await this.model.submitMasterSetup()
    const invalidInputId = this.model.masterPasswordError()
      ? '#welcome-create-master-password'
      : this.model.masterPasswordConfirmError()
        ? '#welcome-confirm-master-password'
        : null
    if (!invalidInputId) return

    await this.updateComplete
    this.focusInput(invalidInputId)
  }

  private handleLegalDocumentClick(event: Event): void {
    event.preventDefault()
    const legalDocument = (event.currentTarget as HTMLElement).dataset['legalDocument']
    if (this.model && isLegalDocument(legalDocument)) void this.model.legalDocuments.open(legalDocument)
  }

  private async handleUnlockSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (!this.model) return

    this.dismissMobileUnlockKeyboard()
    await this.model.submitUnlock()
  }

  private dismissMobileUnlockKeyboard(): void {
    if (this.layout !== 'mobile') return

    this.shadowRoot
      ?.querySelector<HTMLElement>('#welcome-unlock-password')
      ?.shadowRoot?.querySelector<HTMLInputElement>('input')
      ?.blur()
  }

  private focusInput(inputId: string): void {
    const input = this.shadowRoot?.querySelector<HTMLElement>(inputId)
    const focusTarget = input?.shadowRoot?.querySelector<HTMLInputElement>('input') ?? input
    focusTarget?.focus()
  }

  private renderUnlockForm() {
    if (!this.model) return nothing

    const mobile = this.layout === 'mobile'
    const inputId = mobile ? 'welcome-unlock-password' : 'welcome-unlock-password-desktop'
    const setupInProgress = this.model.setupInProgress()

    return html`
      <form class="unlock-inline-form" @submit=${this.handleUnlockSubmit}>
        <label class="unlock-inline-label" for=${inputId}>${i18n('welcome:vault-password')}</label>
        <cv-input
          id=${inputId}
          control-id="welcome.unlock-password"
          class="password-sheet-input"
          size=${mobile ? 'large' : 'medium'}
          type="password"
          password-toggle
          autocomplete="current-password"
          enterkeyhint="done"
          placeholder="••••••••••••"
          .value=${this.model.unlockPassword()}
          @cv-input=${this.model.handleUnlockPasswordInput}
        ></cv-input>
        <button
          id="welcome.unlock-submit"
          class="welcome-primary-action unlock-inline-submit"
          type="submit"
          ?disabled=${this.model.unlockSubmitDisabled()}
          aria-busy=${setupInProgress ? 'true' : nothing}
          @click=${this.handleUnlockSubmit}
        >
          ${renderPrimaryActionContent(i18n('welcome:unlock-vault'), setupInProgress)}
        </button>
      </form>
    `
  }

  private renderMasterPasswordForm(inSheet: boolean) {
    if (!this.model) return nothing

    const creationState = this.model.creationState()
    const passwordError = this.model.masterPasswordError()
    const confirmationError = this.model.masterPasswordConfirmError()
    const formClass = inSheet
      ? 'password-sheet-form master-password-form'
      : 'password-form-grid master-password-form'

    return html`
      <form class=${formClass} @submit=${this.handleCreateMasterSubmit}>
        <div class="master-password-field">
          <label class="password-sheet-label" for="welcome-create-master-password">
            ${i18n('welcome:master-password')}
          </label>
          <cv-input
            id="welcome-create-master-password"
            control-id="welcome.master-password"
            class="password-sheet-input"
            type="password"
            placeholder=${i18n('welcome:create-password')}
            password-toggle
            autocomplete="new-password"
            aria-required="true"
            aria-describedby=${passwordError ? 'welcome-create-master-password-error' : nothing}
            ?invalid=${Boolean(passwordError)}
            .value=${creationState.p1}
            @cv-input=${this.model.handleMasterPasswordInput}
          ></cv-input>
          ${passwordError
            ? html`
                <p id="welcome-create-master-password-error" class="password-sheet-error" role="alert">
                  ${passwordError}
                </p>
              `
            : creationState.p1
              ? renderEntropyMeter(this.model.passwordStrength())
              : nothing}
        </div>

        <div class="master-password-field">
          <label class="password-sheet-label" for="welcome-confirm-master-password">
            ${i18n('welcome:confirm-password')}
          </label>
          <cv-input
            id="welcome-confirm-master-password"
            control-id="welcome.master-password-confirm"
            class="password-sheet-input"
            type="password"
            password-toggle
            autocomplete="new-password"
            enterkeyhint="done"
            placeholder=${i18n('welcome:confirm-password')}
            aria-required="true"
            aria-describedby=${confirmationError ? 'welcome-confirm-master-password-error' : nothing}
            ?invalid=${Boolean(confirmationError)}
            .value=${creationState.p2}
            @cv-input=${this.model.handleMasterPasswordConfirmInput}
          ></cv-input>
          ${confirmationError
            ? html`
                <p id="welcome-confirm-master-password-error" class="password-sheet-error" role="alert">
                  ${confirmationError}
                </p>
              `
            : nothing}
        </div>

        ${inSheet
          ? html`<cv-callout class="master-warning" variant="warning"
              >${i18n('onboard:master:warning')}</cv-callout
            >`
          : nothing}

        <button
          id="welcome.create-storage"
          class=${inSheet ? 'welcome-primary-action password-sheet-submit' : 'welcome-primary-action'}
          type="submit"
          ?disabled=${this.model.busy()}
          aria-busy=${this.model.setupInProgress() ? 'true' : nothing}
          aria-describedby="welcome-legal-consent"
        >
          ${renderPrimaryActionContent(i18n('welcome:create-storage'), this.model.setupInProgress())}
        </button>
        ${this.renderLegalConsent()}
      </form>
    `
  }

  private renderLegalConsent() {
    if (!this.model) return nothing

    return html`
      <p id="welcome-legal-consent" class="legal-consent">
        ${this.model.legalDocuments.consentParts().map((part) =>
          part.kind === 'text'
            ? part.text
            : html`<a
                class="legal-consent-link"
                href=${part.href}
                target="_blank"
                rel="noopener noreferrer"
                data-legal-document=${part.document}
                @click=${this.handleLegalDocumentClick}
                >${part.label}</a
              >`,
        )}
      </p>
    `
  }

  private renderCreateStorageSheet(open: boolean) {
    if (!this.model) return nothing

    return html`
      <cv-bottom-sheet
        class="password-sheet create-storage-sheet"
        .open=${open}
        show-handle
        drag-to-close
        @cv-change=${this.model.handleCreateStorageSheetChange}
      >
        ${open
          ? html`
              <span class="create-storage-sheet-title" slot="title">
                ${i18n('welcome:create-local-storage-title')}
              </span>
              <span class="create-storage-sheet-description" slot="description">
                ${i18n('welcome:create-master-desc')}
              </span>

              ${this.model.shared.errorText()
                ? html`<cv-callout variant="danger" role="alert"
                    >${this.model.shared.errorText()}</cv-callout
                  >`
                : nothing}
              ${this.renderMasterPasswordForm(true)}
            `
          : nothing}
      </cv-bottom-sheet>
    `
  }

  private renderMobileFirstRun(createStorageSheetOpen: boolean) {
    if (!this.model) return nothing

    return html`
      <cv-guidance-anchor anchor-id="welcome.vault-mode" surface="welcome" owner="welcome">
        <div class="welcome-actions mobile-first-run-actions">
          <cv-button
            id="welcome.mode.local"
            control-id="welcome.mode.local"
            class="mobile-create-storage-action"
            data-create-storage
            variant="primary"
            ?disabled=${this.model.busy()}
            @click=${this.model.onSelectLocalMode}
          >
            ${i18n('welcome:create-storage')}
          </cv-button>
          <div class="mobile-create-storage-note">
            ${renderProofIcon()}
            <span>${i18n('welcome:mode-local-desc')} · ${i18n('welcome:mode-local-badge')}</span>
          </div>
        </div>
      </cv-guidance-anchor>
      ${this.renderCreateStorageSheet(createStorageSheetOpen)}
    `
  }

  protected render() {
    if (!this.model) {
      return nothing
    }

    const setupStep = this.model.effectiveStep()
    const busy = this.model.busy()
    const isNeedInit = this.model.isNeedInit()
    const isDesktopRemoteSupported = this.model.isDesktopRemoteSupported()

    if (
      this.layout === 'desktop' &&
      (setupStep === 'remote-connect' || setupStep === 'remote-pair' || setupStep === 'remote-wait')
    ) {
      return html`<remote-desktop-preauth .model=${this.model}></remote-desktop-preauth>`
    }

    if (setupStep === 'remote-connect') {
      return renderRemoteHostsFlowPanel({
        model: this.model.remote,
        actions: {
          onOpenPairIos: this.model.onOpenRemotePair,
          onOpenUsbMobile: this.model.onOpenRemoteUsb,
          onConnectPeer: this.model.onConnectRemotePeer,
          onRemovePeer: this.model.onRemoveRemotePeer,
          onBackToHosts: this.model.onBackFromRemoteUsb,
        },
        ui: {
          hostsBackLink: {
            label: isNeedInit ? i18n('welcome:back-mode-selection') : i18n('welcome:back-unlock-screen'),
            onBack: this.model.onBackFromRemoteConnect,
          },
          pairBackLink: {
            label: i18n('welcome:back-remote-hosts'),
            onBack: this.model.onBackFromRemoteUsb,
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
          waitReason: this.model.remoteWaitReason(),
          waitBackLink: {
            label: i18n('welcome:disconnect-remote-transport'),
            onBack: this.model.onBackFromRemoteWait,
          },
        },
      })
    }

    if (!isNeedInit) {
      if (this.layout === 'mobile') {
        return html`
          <div class="lockscreen-proof">
            ${renderProofIcon()}
            <p>
              ${i18n('welcome:unlock-proof-prefix')}
              <strong>${i18n('welcome:unlock-proof-device')}</strong>. ${i18n('welcome:unlock-proof-secrets')}
              <em>${i18n('welcome:unlock-proof-sealed')}</em>
              ${i18n('welcome:unlock-proof-suffix')}
            </p>
          </div>
          <div class="welcome-actions lockscreen-actions">
            ${this.renderUnlockForm()}
            ${isDesktopRemoteSupported
              ? html`
                  <cv-button
                    class="lockscreen-remote-action"
                    variant="ghost"
                    ?disabled=${busy}
                    @click=${this.model.onSelectRemoteMode}
                  >
                    ${i18n('welcome:connect-remote')}
                  </cv-button>
                `
              : nothing}
          </div>
        `
      }

      return html`
        <div class="welcome-actions">
          ${this.renderUnlockForm()}
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

    if (
      this.layout === 'mobile' &&
      (setupStep === 'mode-select' || setupStep === 'create-master' || setupStep === null)
    ) {
      return this.renderMobileFirstRun(setupStep === 'create-master')
    }

    if (setupStep === 'mode-select' || setupStep === null) {
      return html`
        <cv-guidance-anchor anchor-id="welcome.vault-mode" surface="welcome" owner="welcome">
          <div class="mode-cards">
            <button
              id="welcome.mode.local"
              class="mode-card mode-card-local"
              type="button"
              @click=${this.model.onSelectLocalMode}
            >
              <div class="mode-icon">${renderModeIcon('local')}</div>
              <div class="mode-content">
                <div class="mode-title">${i18n('welcome:mode-local-title')}</div>
                <div class="mode-desc">${i18n('welcome:mode-local-desc')}</div>
                <div class="mode-badge">${i18n('welcome:mode-local-badge')}</div>
              </div>
            </button>
            <button
              class="mode-card mode-card-remote ${isDesktopRemoteSupported ? '' : 'disabled'}"
              type="button"
              aria-disabled=${String(!isDesktopRemoteSupported)}
              @click=${this.model.onSelectRemoteMode}
            >
              <div class="mode-icon">${renderModeIcon('remote')}</div>
              <div class="mode-content">
                <div class="mode-title">${i18n('welcome:mode-remote-title')}</div>
                <div class="mode-desc">${i18n('welcome:mode-remote-desc')}</div>
                <div class="mode-badge">
                  ${isDesktopRemoteSupported
                    ? i18n('welcome:mode-remote-badge')
                    : i18n('welcome:mode-remote-disabled')}
                </div>
              </div>
            </button>
          </div>
        </cv-guidance-anchor>
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
          ${this.renderMasterPasswordForm(false)}
        </div>
      </cv-guidance-anchor>

      <div class="setup-footer">
        <cv-callout class="master-warning" variant="warning">${i18n('onboard:master:warning')}</cv-callout>
      </div>
    `
  }
}
