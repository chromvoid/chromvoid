import {css} from 'lit'

import {
  hostLayoutPaintContainStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {walletPageMobileFormStyles} from './wallet-page-mobile-form.styles'
import {walletReceiveStyles} from './wallet-receive.styles'

export const walletPageMobileStyles = [
  sharedStyles,
  hostLayoutPaintContainStyles,
  walletPageMobileFormStyles,
  walletReceiveStyles,
  css`
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      background: var(--cv-color-bg);
    }

    .mobile-page {
      box-sizing: border-box;
      block-size: 100%;
      min-block-size: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-block-end: calc(var(--app-spacing-6) + var(--app-mobile-shell-tab-bar-content-clearance, 64px));
      -webkit-overflow-scrolling: touch;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    h1,
    h2,
    h3,
    p,
    dl,
    dd {
      margin: 0;
    }

    button,
    input,
    textarea,
    select {
      font: inherit;
    }

    button {
      color: inherit;
    }

    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    button:disabled {
      cursor: default;
      opacity: 0.5;
    }

    .feedback {
      position: sticky;
      z-index: 3;
      inset-block-start: 0;
      display: grid;
      margin: var(--app-spacing-3) var(--app-spacing-4) 0;
      padding: var(--app-spacing-3);
      border: 1px solid;
      border-radius: var(--cv-radius-md);
      font-size: var(--cv-font-size-sm);
    }

    .feedback-info {
      border-color: var(--cv-color-info-border);
      color: var(--cv-color-info);
      background: var(--cv-color-info-surface);
    }

    .feedback-error {
      border-color: var(--cv-color-danger-border, var(--cv-color-border-danger));
      color: var(--cv-color-danger, var(--cv-color-text-danger));
      background: var(--cv-color-danger-surface, var(--cv-color-surface));
    }

    .center-state {
      display: grid;
      min-block-size: min(72dvh, 620px);
      place-content: center;
      justify-items: center;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-6);
      text-align: center;
    }

    .center-state p,
    .onboarding-heading p,
    .content-heading p {
      max-inline-size: 38ch;
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-sm);
      line-height: 1.55;
    }

    .state-icon,
    .brand-mark,
    .method-icon,
    .wallet-avatar,
    .network-mark,
    .transaction-icon {
      display: inline-grid;
      flex: 0 0 auto;
      place-items: center;
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      color: var(--cv-color-accent);
      background: var(--cv-color-accent-surface, var(--cv-color-surface-2));
    }

    .state-icon,
    .brand-mark {
      inline-size: 56px;
      block-size: 56px;
      border-radius: var(--cv-radius-lg);
      font-size: 24px;
    }

    .onboarding-view,
    .setup-view {
      display: grid;
      min-block-size: 100%;
      align-content: start;
      gap: var(--app-spacing-6);
      padding-block-start: max(var(--app-spacing-7), env(safe-area-inset-top));
      padding-inline: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
    }

    .onboarding-heading {
      display: grid;
      justify-items: start;
      gap: var(--app-spacing-2);
      padding-block-start: var(--app-spacing-6);
    }

    .onboarding-heading h2,
    .setup-header h2,
    .content-heading h2 {
      font-size: var(--cv-font-size-2xl);
      line-height: 1.15;
    }

    .eyebrow {
      color: var(--cv-color-accent);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .method-list,
    .sheet-list,
    .content-stack,
    .overview-stack,
    .mobile-form,
    .activity-list {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .method-button,
    .sheet-option {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-block-size: 76px;
      align-items: center;
      gap: var(--app-spacing-3);
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-lg);
      padding: var(--app-spacing-3);
      text-align: start;
      background: var(--app-editorial-surface-elevated, var(--cv-color-surface-2));
      cursor: pointer;
    }

    .method-icon,
    .wallet-avatar,
    .network-mark,
    .transaction-icon {
      inline-size: 40px;
      block-size: 40px;
      border-radius: var(--cv-radius-md);
    }

    .method-copy,
    .sheet-option > span:nth-child(2),
    .wallet-switcher-copy,
    .transaction-copy {
      display: grid;
      min-inline-size: 0;
      gap: var(--app-spacing-1);
    }

    .method-copy > span,
    .sheet-option > span:nth-child(2) > span,
    .wallet-switcher-copy > span,
    .transaction-copy > span,
    .transaction-copy code {
      overflow: hidden;
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
      line-height: 1.4;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .import-existing-button {
      min-block-size: 44px;
      border: 0;
      color: var(--cv-color-accent);
      font-weight: var(--cv-font-weight-semibold);
      background: transparent;
      cursor: pointer;
    }

    .import-existing-button:focus-visible {
      outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-accent));
      outline-offset: 2px;
    }

    .setup-header {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: var(--app-spacing-3);
    }

    .setup-header > div,
    .content-heading {
      display: grid;
      gap: var(--app-spacing-1);
    }

    .icon-button {
      display: inline-grid;
      inline-size: 44px;
      block-size: 44px;
      flex: 0 0 auto;
      place-items: center;
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-md);
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
      cursor: pointer;
    }

    .wallet-view {
      display: grid;
      gap: var(--app-spacing-4);
      padding-block-start: max(var(--app-spacing-3), env(safe-area-inset-top));
    }

    .mobile-header {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-2);
      padding-inline: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
    }

    .wallet-switcher {
      display: grid;
      min-inline-size: 0;
      min-block-size: 52px;
      flex: 1 1 auto;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--app-spacing-2);
      border: 0;
      padding: 0;
      text-align: start;
      background: transparent;
      cursor: pointer;
    }

    .wallet-switcher-copy strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .account-section {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .section-heading-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-inline: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
    }

    .section-heading-row h2 {
      font-size: var(--cv-font-size-sm);
    }

    .section-heading-row > span {
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
    }

    .account-rail {
      display: flex;
      gap: var(--app-spacing-3);
      overflow-x: auto;
      scroll-padding-inline: var(--app-spacing-4);
      scroll-snap-type: inline proximity;
      padding-inline: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
      padding-block-end: var(--app-spacing-1);
      scrollbar-width: none;
    }

    .account-rail::-webkit-scrollbar {
      display: none;
    }

    .account-card,
    .account-add-card {
      box-sizing: border-box;
      display: grid;
      min-inline-size: min(68vw, 244px);
      min-block-size: 154px;
      flex: 0 0 min(68vw, 244px);
      scroll-snap-align: start;
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-lg);
      padding: var(--app-spacing-3);
      text-align: start;
      background: var(--app-editorial-surface-elevated, var(--cv-color-surface-2));
      cursor: pointer;
    }

    .account-card.selected {
      border-color: var(--cv-color-accent);
      background: var(--cv-color-accent-surface, var(--cv-color-surface-2));
    }

    .account-card-top {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-2);
    }

    .account-card .network-mark {
      inline-size: 28px;
      block-size: 28px;
      border-radius: 50%;
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
    }

    .network-name,
    .account-label,
    .account-address {
      overflow: hidden;
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .account-card > strong {
      align-self: end;
      overflow-wrap: anywhere;
      font-size: var(--cv-font-size-xl);
    }

    .account-add-card {
      place-content: center;
      justify-items: center;
      gap: var(--app-spacing-2);
      border-style: dashed;
      color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
      text-align: center;
      background: transparent;
    }

    .network-callout,
    .recovery-warning {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: var(--app-spacing-2);
      margin-inline: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-warning-border, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-md);
      color: var(--cv-color-warning, var(--app-editorial-text-secondary));
      background: var(--cv-color-warning-surface, var(--cv-color-surface-2));
    }

    .network-callout > span {
      display: grid;
      gap: var(--app-spacing-1);
    }

    .network-callout span span {
      font-size: var(--cv-font-size-xs);
      line-height: 1.45;
    }

    .main-tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--app-spacing-1);
      margin-inline: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
      padding: var(--app-spacing-1);
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-md);
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
    }

    .main-tabs button {
      min-block-size: 40px;
      overflow: hidden;
      border: 0;
      border-radius: calc(var(--cv-radius-md) - 2px);
      padding-inline: var(--app-spacing-1);
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
      background: transparent;
      cursor: pointer;
    }

    .main-tabs button[aria-selected='true'] {
      color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
      background: var(--app-editorial-surface-elevated, var(--cv-color-surface-3));
    }

    .tab-panel {
      min-inline-size: 0;
      padding-inline: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
    }

    .tab-panel > section,
    .content-stack,
    .overview-stack {
      min-inline-size: 0;
    }

    .balance-hero {
      display: grid;
      justify-items: center;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-6) var(--app-spacing-4);
      text-align: center;
    }

    .balance-hero > span {
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
    }

    .balance-hero > strong {
      max-inline-size: 100%;
      overflow-wrap: anywhere;
      font-size: clamp(2rem, 10vw, 3rem);
      line-height: 1;
    }

    .quick-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--app-spacing-3);
      inline-size: min(100%, 280px);
      margin-block-start: var(--app-spacing-3);
    }

    .quick-actions button {
      display: grid;
      min-block-size: 68px;
      place-items: center;
      gap: var(--app-spacing-1);
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-lg);
      background: var(--app-editorial-surface-elevated, var(--cv-color-surface-2));
      cursor: pointer;
    }

    .quick-actions cv-icon {
      color: var(--cv-color-accent);
      font-size: 20px;
    }

    .detail-section,
    .confirmation-panel {
      display: grid;
      gap: var(--app-spacing-4);
      border-block-start: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      padding-block: var(--app-spacing-4);
    }

    .detail-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-3);
    }

    .detail-heading > div,
    .confirmation-panel > header {
      display: grid;
      gap: var(--app-spacing-1);
    }

    .detail-list,
    .preview-list {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .detail-list > div,
    .preview-list > div {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      padding-block: var(--app-spacing-2);
      border-block-end: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    }

    dt {
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
    }

    dd {
      overflow-wrap: anywhere;
      text-align: end;
    }

    .address-block {
      display: grid;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-3);
      border-radius: var(--cv-radius-md);
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
    }

    .address-block > span,
    .field-hint,
    .timestamp,
    .preview-meta {
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
      line-height: 1.45;
    }

    .address-block code,
    .secret-copy {
      overflow-wrap: anywhere;
      font-family: var(--cv-font-family-code, ui-monospace, monospace);
      font-size: var(--cv-font-size-xs);
    }

    .content-heading {
      padding-block-start: var(--app-spacing-3);
    }

    .recipient-fieldset {
      display: grid;
      min-inline-size: 0;
      gap: var(--app-spacing-3);
      margin: 0;
      border: 0;
      border-block-end: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      padding: 0 0 var(--app-spacing-4);
    }

    .recipient-fieldset legend {
      margin-block-end: var(--app-spacing-3);
      padding: 0;
      font-weight: var(--cv-font-weight-semibold);
    }

    .text-action {
      justify-self: start;
      min-block-size: 44px;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: pointer;
    }

    .danger-action {
      color: var(--cv-color-danger, var(--cv-color-text-danger));
    }

    .confirmation-panel {
      border: 1px solid var(--cv-color-accent-border, var(--cv-color-accent));
      border-radius: var(--cv-radius-lg);
      padding: var(--app-spacing-4);
      background: var(--cv-color-accent-surface, var(--cv-color-surface-2));
    }

    .warning-check {
      padding: var(--app-spacing-3);
      border: 1px solid var(--cv-color-warning-border, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-md);
      background: var(--cv-color-warning-surface, var(--cv-color-surface-2));
    }

    .empty-copy,
    .empty-state {
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      text-align: center;
    }

    .empty-state {
      display: grid;
      min-block-size: 240px;
      place-content: center;
      justify-items: center;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-5);
    }

    .empty-state cv-icon {
      color: var(--cv-color-accent);
      font-size: 28px;
    }

    .transaction-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--app-spacing-3);
      padding-block: var(--app-spacing-3);
      border-block-end: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    }

    .transaction-actions {
      display: flex;
      gap: var(--app-spacing-1);
    }

    .transaction-actions button {
      display: inline-grid;
      inline-size: 40px;
      block-size: 40px;
      place-items: center;
      border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      border-radius: var(--cv-radius-md);
      background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
    }

    .rebroadcast-panel {
      display: grid;
      grid-column: 1 / -1;
      gap: var(--app-spacing-3);
      padding-block-start: var(--app-spacing-3);
    }

    .rebroadcast-panel p {
      color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
      font-size: var(--cv-font-size-xs);
    }

    .recovery-warning {
      margin: 0;
    }

    .wallet-sheet {
      --cv-bottom-sheet-max-height: min(82dvh, 640px);
      --cv-bottom-sheet-body-padding: 0 var(--app-spacing-4)
        max(var(--app-spacing-5), env(safe-area-inset-bottom));
    }

    .sheet-list {
      padding-block-start: var(--app-spacing-2);
    }

    .sheet-option {
      min-block-size: 68px;
      border-radius: var(--cv-radius-md);
    }

    .sheet-option.selected {
      border-color: var(--cv-color-accent);
      background: var(--cv-color-accent-surface, var(--cv-color-surface-2));
    }

    .sheet-option:disabled {
      cursor: default;
    }

    .add-option {
      border-style: dashed;
      background: transparent;
    }

    @media (max-width: 359px) {
      .main-tabs button {
        font-size: 0.65rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .page-transition {
        animation: none;
        transition-duration: 0ms;
      }
    }
  `,
]
