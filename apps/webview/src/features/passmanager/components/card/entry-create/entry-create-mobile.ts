import {css, nothing, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import type {CVSwitchChangeEvent} from '@chromvoid/uikit/components/cv-switch'
import {i18n} from '@project/passmanager/i18n'
import {
  getPassmanagerRoot,
  isPassmanagerReadOnlyOrMissing,
} from 'root/features/passmanager/models/pm-root.adapter'
import {markMobileKeyboardProgrammaticScroll} from 'root/shared/services/mobile-keyboard-scroll-intent'
import {PMIconPicker} from '../../pm-icon-picker'
import {renderPaymentCardFace} from '../entry/payment-card-face'
import {paymentCardFaceMobileStyles, paymentCardFaceStyles} from '../entry/payment-card-face.styles'
import {pmEntryTagsStyles} from '../entry-tags/entry-tags.styles'
import {PMEntryOTPCreateSheet} from '../entry-otp-create/entry-otp-create-sheet'
import {PMEntrySshCreateSheet} from '../entry-ssh/entry-ssh-create-sheet'
import {PMEntryCreateBase} from './entry-create-base'
import {pmEntryCardStyles, pmEntryGenerateStyles} from './styles'

const pmEntryCreateMobileStyles = css`
  :host {
    display: block;
    block-size: 100%;
    container-type: inline-size;
    overflow: hidden;
    contain: layout style paint;
    overscroll-behavior-y: contain;
    scrollbar-width: none;
    color: var(--cv-color-text);
    background: var(--cv-color-bg);
    --entry-create-surface: var(--cv-color-surface-secondary-glass-strong);
    --entry-create-field: var(--cv-color-surface-tertiary-glass);
    --entry-create-border: var(--cv-color-border-faint);
    --entry-create-keyboard-clearance: max(
      var(--mobile-keyboard-scroll-clearance, 0px),
      var(--visual-viewport-bottom-inset, 0px)
    );
  }

  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      cv-input::part(input),
      cv-textarea::part(textarea),
      cv-select::part(trigger) {
        font-size: 16px;
      }
    }
  }

  @keyframes pmTypeSwitchPulse {
    0% { transform: scale(0.97); }
    60% { transform: scale(1.015); }
    100% { transform: scale(1); }
  }

  @keyframes pmAvatarPulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 var(--cv-color-primary-ring); }
    50% { transform: scale(1.04); box-shadow: 0 0 0 10px transparent; }
    100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
  }

  @keyframes pmGenerateSpin {
    from { transform: rotate(0); }
    to { transform: rotate(360deg); }
  }

  cv-select {
    --cv-select-inline-size: 100%;
  }

  cv-guidance-anchor {
    display: block;
    block-size: 100%;
    min-block-size: 0;
  }

  form {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    inline-size: 100%;
    max-width: 860px;
    box-sizing: border-box;

  }

  .create-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1.5rem;
    min-block-size: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 1rem 1rem 1.25rem;
    box-sizing: border-box;
    scroll-padding-block-end: calc(var(--entry-create-keyboard-clearance) + var(--cv-space-4));
    -webkit-overflow-scrolling: touch;
  }

  h3 {
    font-size: 0.8125rem;
    font-weight: 500;
    margin: 0;
    color: var(--cv-color-text);
  }


  back-button {
    --back-button-size: 44px;
    --back-button-icon-size: 22px;
    --back-button-radius: 50%;
    --back-button-bg: var(--cv-color-surface-secondary-glass);
    --back-button-border-color: var(--cv-color-border-faint);
    --back-button-color: var(--cv-color-text);
    --back-button-hover-bg: var(--cv-color-primary-surface);
    --back-button-hover-border-color: var(--cv-color-primary-border-strong);
  }

  .create-heading {
    min-inline-size: 0;
    display: grid;
    gap: 0.25rem;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--cv-color-surface-secondary-glass);
    border: 1px solid var(--entry-create-border);
    border-radius: 1.125rem;
    box-shadow: 0 8px 24px var(--cv-alpha-black-15);
    transition:
      border-color 220ms var(--cv-easing-standard),
      box-shadow 280ms var(--cv-easing-spring);

    &:focus-within {
      border-color: var(--cv-color-primary-border-strong);
      box-shadow:
        0 8px 24px var(--cv-alpha-black-15),
        0 0 0 1px var(--cv-color-primary-ring),
        0 0 28px var(--cv-color-primary-ring);
    }
  }

  .type-section {
    gap: 0.625rem;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .type-section:focus-within {
    box-shadow: none;
  }

  .section-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .section-label {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    font-family: var(--cv-font-family-primary);
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--cv-color-text-muted);
    padding-inline-start: 0.125rem;
  }

  .section-label cv-icon {
    inline-size: 0.875rem;
    block-size: 0.875rem;
  }

  .entry-type-switch {
    display: block;
    --cv-radio-group-gap: 0.25rem;
  }

  .entry-type-switch::part(base) {
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
    gap: 0.25rem;
    padding: 0.3125rem;
    border-color: var(--cv-color-border-faint);
    border-radius: 1.25rem;
    background: var(--cv-color-surface-secondary-glass);
  }

  .entry-type-option {
    min-width: 0;
    color: var(--cv-color-text-subtle);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .entry-type-option::part(base) {
    gap: 0.5rem;
    min-width: 0;
    min-height: 2.75rem;
    justify-content: center;
    padding: 0 0.75rem;
    border: 1px solid transparent;
    border-radius: 0.95rem;
    background: transparent;
    transition:
      border-color 220ms var(--cv-easing-standard),
      background 220ms var(--cv-easing-standard),
      color 220ms var(--cv-easing-standard),
      box-shadow 280ms var(--cv-easing-spring),
      transform 220ms var(--cv-easing-spring);

    cv-icon {
      inline-size: 1.05rem;
      block-size: 1.05rem;
      box-sizing: content-box;
      padding: 0.3125rem;
      border-radius: 50%;
      flex-shrink: 0;
      transition:
        background 220ms var(--cv-easing-standard),
        color 220ms var(--cv-easing-standard),
        box-shadow 220ms var(--cv-easing-spring),
        padding 220ms var(--cv-easing-standard);
    }

    span {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .entry-type-option[checked]::part(base) {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border-strong);
    color: var(--cv-color-primary);
    box-shadow:
      inset 0 0 0 1px var(--cv-color-primary-muted),
      0 0 14px var(--cv-color-primary-ring);
    animation: pmTypeSwitchPulse 240ms var(--cv-easing-spring);
  }

  .entry-type-option[checked] cv-icon {
    background: var(--cv-color-primary-surface-strong);
    color: var(--cv-color-primary);
    box-shadow:
      inset 0 0 0 1px var(--cv-color-primary),
      0 0 8px var(--cv-color-primary-ring);
  }

  .credentials-grid,
  .details-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  .title-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'label label'
      'avatar input';
    gap: 0.5rem 1rem;
    align-items: end;
  }

  .title-field-label {
    grid-area: label;
    color: var(--cv-color-text);
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .field-cell {
    min-width: 0;
  }

  .avatar-picker {
    grid-area: avatar;
    position: relative;
    inline-size: 60px;
    block-size: 60px;
    align-self: end;
    border-radius: 14px;
    transition: transform 220ms var(--cv-easing-spring), box-shadow 220ms var(--cv-easing-spring);
  }

  .title-row .field-cell {
    grid-area: input;
  }

  .title-input::part(form-control-label) {
    display: none;
  }

  .avatar-picker[data-pulse='true'] {
    animation: pmAvatarPulse 480ms var(--cv-easing-spring);
  }

  pm-icon-picker {
    --pm-icon-picker-trigger-size: 60px;
    --pm-icon-picker-trigger-radius: 14px;
    --pm-icon-picker-trigger-bg: var(--cv-color-primary-surface);
    --pm-icon-picker-trigger-border: var(--cv-color-primary-border-strong);
    --pm-icon-picker-trigger-hover-border: var(--cv-color-primary);
    --pm-icon-picker-trigger-shadow: 0 8px 20px var(--cv-alpha-black-15);
    --pm-icon-picker-preview-size: 32px;
  }

  .avatar-edit-badge {
    position: absolute;
    inset-inline-end: -2px;
    inset-block-end: -2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 1.25rem;
    block-size: 1.25rem;
    border-radius: 50%;
    background: var(--cv-color-primary);
    color: var(--cv-color-bg);
    box-shadow: 0 0 8px var(--cv-color-primary-ring);
    pointer-events: none;
    transition: transform 220ms var(--cv-easing-spring);

    cv-icon {
      inline-size: 0.75rem;
      block-size: 0.75rem;
    }
  }

  .avatar-picker:hover .avatar-edit-badge,
  .avatar-picker[data-pulse='true'] .avatar-edit-badge {
    transform: scale(1.1);
  }

  cv-input,
  cv-textarea {
    width: 100%;
  }

  cv-input::part(form-control-label),
  cv-textarea::part(form-control-label) {
    margin-block-end: 0.5rem;
    color: var(--cv-color-text);
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.2;
  }

  cv-input::part(base) {
    min-block-size: 2.875rem;
    border-radius: 0.875rem;
    border-color: var(--entry-create-border);
    background: var(--entry-create-field);
    color: var(--cv-color-text);
    padding-inline: 0.875rem;
    gap: 0.75rem;
  }

  cv-input[focused]::part(base),
  cv-textarea[focused]::part(base) {
    border-color: var(--cv-color-primary);
    box-shadow: 0 0 0 3px var(--cv-color-primary-ring);
  }

  cv-input[invalid]::part(base) {
    border-color: var(--cv-color-danger);
    box-shadow: 0 0 0 2px var(--cv-color-danger-ring);
  }

  cv-input::part(input),
  cv-textarea::part(textarea) {
    font-size: 1rem;
  }

  cv-input::part(prefix),
  cv-input::part(password-toggle),
  cv-input::part(suffix) {
    color: var(--cv-color-text-muted);
  }

  cv-input::part(prefix) {
    transition:
      transform 200ms var(--cv-easing-spring),
      color 200ms var(--cv-easing-standard);
  }

  cv-input[focused]::part(prefix) {
    transform: scale(1.08);
    color: var(--cv-color-primary);
  }

  .field-icon {
    inline-size: 1.35rem;
    block-size: 1.35rem;
  }

  .field-error {
    display: block;
    margin-block-start: 0.375rem;
    color: var(--cv-color-danger);
    font-size: 0.8125rem;
    line-height: 1.3;
  }

  .card-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  .payment-card-create-section {
    padding: 0;
    background: transparent;
    border: 0;
    box-shadow: none;

    &:focus-within {
      border-color: transparent;
      box-shadow: none;
    }
  }

  .payment-card-create-section .payment-card-face {
    inline-size: 100%;
    box-sizing: border-box;
  }

  .mobile-tags-section {
    gap: 0.625rem;
    padding: 0.75rem;
    border-radius: 0.875rem;
    box-shadow: 0 6px 16px var(--cv-alpha-black-15);
  }

  .mobile-tags-section .entry-tags-editor {
    gap: 0.5rem;
  }

  .mobile-tags-section .entry-tags-combobox::part(input-wrapper) {
    min-block-size: 2.25rem;
    padding-inline: 0.625rem;
    gap: 0.375rem;
    border-radius: 0.75rem;
  }

  .mobile-tags-section .entry-tags-combobox::part(input) {
    min-inline-size: 2.625rem;
    min-block-size: 2.125rem;
    font-size: 0.875rem;
  }

  .mobile-tags-section .entry-tags-combobox::part(trigger) {
    min-block-size: 2.125rem;
    font-size: 0.875rem;
  }

  .mobile-tags-section .entry-tags-combobox::part(tags) {
    gap: 0.25rem;
  }

  .mobile-tags-section .entry-tags-combobox::part(tag) {
    max-inline-size: min(9rem, 52vw);
    padding: 1px 0.375rem;
    border-radius: 999px;
    font-size: 0.75rem;
  }

  .mobile-tags-section .entry-tags-combobox::part(tag-overflow) {
    font-size: 0.75rem;
  }

  .mobile-tags-section .entry-tags-picker {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
  }

  .mobile-tags-section .entry-tags-manage {
    min-inline-size: 2.25rem;
    align-self: stretch;
    border-radius: 0.75rem;
  }

  @container (width < 380px) {
    .entry-type-switch {
      --cv-radio-group-gap: 0.25rem;
    }

    .entry-type-switch::part(base) {
      grid-template-columns: minmax(0, 0.76fr) minmax(0, 1.24fr);
    }

    .entry-type-option::part(base) {
      gap: 0.375rem;
      padding-inline: 0.45rem;
    }

    .entry-type-option {
      font-size: 0.875rem;
    }

    .entry-type-option cv-icon {
      inline-size: 1rem;
      block-size: 1rem;
      padding: 0.25rem;
    }

    .mobile-tags-section .entry-tags-picker {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }

  .optional-group {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .optional-card {
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    background: var(--cv-color-surface-secondary-glass);
    border: 1px solid var(--entry-create-border);
    border-radius: 1.125rem;
    box-shadow: 0 8px 24px var(--cv-alpha-black-15);
    transition:
      border-color 220ms var(--cv-easing-standard),
      box-shadow 280ms var(--cv-easing-spring);
  }

  .optional-card[data-open='true'] {
    border-color: var(--cv-color-primary-border-strong);
    box-shadow:
      0 8px 24px var(--cv-alpha-black-15),
      0 0 0 1px var(--cv-color-primary-ring),
      0 0 28px var(--cv-color-primary-ring);
  }

  .optional-card-header {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    cursor: pointer;
    user-select: none;
  }

  .optional-card-header cv-switch {
    align-self: center;
  }

  .optional-card-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 1.5rem;
    block-size: 1.5rem;
    color: var(--cv-color-primary);
  }

  .optional-card-icon cv-icon {
    inline-size: 1.25rem;
    block-size: 1.25rem;
  }

  .optional-card-title-stack {
    display: grid;
    gap: 0.125rem;
    min-inline-size: 0;
  }

  .optional-card-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--cv-color-text);
  }

  .optional-card-description {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.3;
    color: var(--cv-color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .optional-card-chevron {
    inline-size: 1.125rem;
    block-size: 1.125rem;
    color: var(--cv-color-text-muted);
    transition: transform 220ms var(--cv-easing-spring);
  }

  .optional-card[data-open='true'] .optional-card-chevron {
    transform: rotate(90deg);
    color: var(--cv-color-primary);
  }

  .optional-card-body {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0 1rem 1rem;
    border-block-start: 1px solid var(--cv-color-border-faint);
    padding-block-start: 0.875rem;
    opacity: 1;
    transition:
      opacity var(--cv-duration-fast, 120ms) var(--cv-easing-standard),
      display var(--cv-duration-fast, 120ms) allow-discrete;
    transition-behavior: allow-discrete;
  }

  .optional-card-body[hidden] {
    display: none;
    opacity: 0;
  }

  @starting-style {
    .optional-card-body:not([hidden]) {
      opacity: 0;
    }
  }

  .otp-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem;
    border: 1px solid var(--cv-color-success-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-success-surface);
  }

  .otp-summary-text {
    display: grid;
    gap: 0.1875rem;
    min-inline-size: 0;
  }

  .otp-summary-title {
    margin: 0;
    color: var(--cv-color-text);
    font-size: 0.875rem;
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.2;
  }

  .otp-summary-meta {
    margin: 0;
    overflow: hidden;
    color: var(--cv-color-text-muted);
    font-size: 0.8125rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .otp-summary-edit {
    min-inline-size: 2.25rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .optional-card-chevron {
      transition: none !important;
    }
  }

  .generate-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    color: var(--cv-color-primary);
    cursor: pointer;
    box-shadow: 0 0 0 0 transparent;
    transition:
      background-color 200ms var(--cv-easing-standard),
      color 200ms var(--cv-easing-standard),
      border-color 200ms var(--cv-easing-standard),
      box-shadow 220ms var(--cv-easing-spring),
      transform 120ms var(--cv-easing-standard);
    padding: 0;

    cv-icon {
      width: 18px;
      height: 18px;
    }

    &:hover {
      background: var(--cv-color-primary);
      color: var(--cv-color-on-primary);
      border-color: var(--cv-color-primary);
      box-shadow: 0 0 18px var(--cv-color-primary-ring);
    }

    &:active {
      transform: scale(0.92);
    }
  }

  .generate-btn[data-spinning='true'] cv-icon {
    animation: pmGenerateSpin 460ms var(--cv-easing-spring);
  }

  .generate-divider {
    align-self: center;
    inline-size: 1px;
    block-size: 1.25rem;
    background: var(--cv-color-border-faint);
    margin-inline: 0.125rem;
  }

  .strength-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.125rem 0;
    block-size: auto;
  }

  .strength-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-inline-size: 0;
    color: var(--cv-color-text-muted);
    font-size: 0.8125rem;

    cv-icon {
      inline-size: 1.125rem;
      block-size: 1.125rem;
      color: var(--cv-color-primary);
    }
  }

  .strength-value {
    color: var(--cv-color-primary);
    font-weight: 650;
  }

  .strength-segments {
    display: grid;
    grid-template-columns: repeat(5, 1.5rem);
    gap: 0.25rem;
    justify-content: end;
  }

  .strength-segment {
    block-size: 0.375rem;
    border-radius: 999px;
    background: var(--cv-color-border-glass);
    transform-origin: center;
    transition:
      background 200ms var(--cv-easing-standard),
      box-shadow 240ms var(--cv-easing-spring),
      transform 200ms var(--cv-easing-spring);
  }

  .strength-segment:nth-child(1) { transition-delay: 0ms; }
  .strength-segment:nth-child(2) { transition-delay: 60ms; }
  .strength-segment:nth-child(3) { transition-delay: 120ms; }
  .strength-segment:nth-child(4) { transition-delay: 180ms; }
  .strength-segment:nth-child(5) { transition-delay: 240ms; }

  .strength-segment[data-active='true'] {
    background: var(--cv-color-primary);
    box-shadow: 0 0 10px var(--cv-color-primary-ring);
    transform: scaleY(1.15);
  }

  .strength-bar.strength-0 .strength-value,
  .strength-bar.strength-0 .strength-status cv-icon {
    color: var(--cv-color-danger);
  }

  .strength-bar.strength-0 .strength-segment[data-active='true'] {
    background: var(--cv-color-danger);
    box-shadow: 0 0 10px var(--cv-color-danger-ring);
  }

  .strength-bar.strength-1 .strength-value,
  .strength-bar.strength-1 .strength-status cv-icon,
  .strength-bar.strength-2 .strength-value,
  .strength-bar.strength-2 .strength-status cv-icon {
    color: var(--cv-color-warning);
  }

  .strength-bar.strength-1 .strength-segment[data-active='true'],
  .strength-bar.strength-2 .strength-segment[data-active='true'] {
    background: var(--cv-color-warning);
    box-shadow: 0 0 10px var(--cv-color-warning-ring);
  }

  .strength-bar.strength-4 .strength-value,
  .strength-bar.strength-4 .strength-status cv-icon {
    color: var(--cv-color-success);
  }

  .strength-bar.strength-4 .strength-segment[data-active='true'] {
    background: var(--cv-color-success);
    box-shadow: 0 0 10px var(--cv-color-success-ring);
  }

  .create-footer {
    flex: 0 0 auto;
    --cv-mobile-bottom-action-padding: var(--cv-space-2) 1rem;
    margin-block-end: calc(var(--entry-create-keyboard-clearance) + var(--cv-space-1));
  }

  .create-footer cv-button {
    inline-size: 100%;
    display: block;
    overflow: hidden;
    isolation: isolate;
    contain: paint;
    border: 1px solid var(--cv-button-border-color);
    border-radius: 1rem;
    background: var(--cv-button-background);
    color: var(--cv-button-text-color);
    box-shadow:
      var(--cv-shadow-sm),
      0 0 24px var(--cv-color-primary-ring);
    transform: translateZ(0);
  }

  .create-footer cv-button::part(base) {
    min-block-size: 3.375rem;
    border: 0;
    border-radius: inherit;
    background: var(--cv-button-background);
    color: inherit;
    box-shadow:
      var(--cv-shadow-sm),
      0 0 24px var(--cv-color-primary-ring);
    font-size: 1.0625rem;
    font-weight: 700;
    justify-content: space-between;
    padding-inline: 1.125rem;
    transition: transform 120ms var(--cv-easing-standard);
  }

  .create-footer cv-button:not([disabled]):active::part(base) {
    transform: translateY(1px) scale(0.995);
  }

  .create-footer cv-button[disabled] {
    filter: saturate(0.5);
    box-shadow: none;
  }

  .create-footer cv-button[disabled]::part(base) {
    opacity: 1;
    box-shadow: none;
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .section,
    .entry-type-option,
    .entry-type-option cv-icon,
    .avatar-picker,
    .avatar-edit-badge,
    .strength-segment,
    .generate-btn,
    .generate-btn cv-icon,
    cv-input::part(prefix),
    .create-footer cv-button::part(base) {
      animation: none !important;
      transition: none !important;
    }
  }

  @container (width >= 520px) {
    .credentials-grid,
    .details-grid,
    .card-grid {
      grid-template-columns: 1fr 1fr;
    }

    .note-cell {
      grid-row: span 1;
    }
  }

  @container (width < 360px) {
    .create-scroll {
      padding-inline: 0.75rem;
      gap: 1.25rem;
    }

    .section {
      border-radius: 1rem;
    }

    .create-header-title {
      font-size: 1.375rem;
    }

    .section-label {
      font-size: 0.625rem;
    }

    .title-row {
      column-gap: 0.75rem;
    }

    .avatar-picker {
      inline-size: 54px;
      block-size: 54px;
    }

    pm-icon-picker {
      --pm-icon-picker-trigger-size: 54px;
    }

    .entry-type-option::part(base) {
      gap: 0.35rem;
      padding: 0 0.4rem;
    }

    .entry-type-option {
      font-size: 0.8125rem;
    }

    .entry-type-option cv-icon {
      inline-size: 0.95rem;
      block-size: 0.95rem;
    }

    .create-footer {
      --cv-mobile-bottom-action-padding: var(--cv-space-2) 0.75rem;
    }
  }
`

export class PMEntryCreateMobile extends PMEntryCreateBase {
  static define() {
    if (!customElements.get('pm-entry-create-mobile')) {
      customElements.define('pm-entry-create-mobile', this)
    }
    PMIconPicker.define()
    PMEntryOTPCreateSheet.define()
    PMEntrySshCreateSheet.define()
  }

  static styles = [
    pmEntryCardStyles,
    pmEntryGenerateStyles,
    pmEntryTagsStyles,
    paymentCardFaceStyles,
    paymentCardFaceMobileStyles,
    pmEntryCreateMobileStyles,
  ]

  protected override getTagsEditorMaxTagsVisible(): number {
    return 1
  }

  protected override getTagsEditorComboboxType(): 'select-only' {
    return 'select-only'
  }

  protected override getTagsEditorPlaceholder(): string {
    return i18n('tags:select_placeholder' as never)
  }

  protected override prepareInitialViewport(): void {
    markMobileKeyboardProgrammaticScroll('entry-create-prepare-initial-viewport')
    const scroll = this.shadowRoot?.querySelector<HTMLElement>('.create-scroll')
    if (scroll) {
      scroll.scrollTop = 0
      scroll.scrollLeft = 0

      try {
        scroll.scrollTo({top: 0, left: 0})
      } catch {
        scroll.scrollTop = 0
        scroll.scrollLeft = 0
      }
    }

    this.scrollTop = 0
    this.scrollLeft = 0

    try {
      this.scrollTo({top: 0, left: 0})
    } catch {
      this.scrollTop = 0
      this.scrollLeft = 0
    }
  }

  protected override generate(): void {
    super.generate()
    this.triggerSpinAttribute('.generate-btn', 'data-spinning', 460)
  }

  protected override onIconChange(event: CustomEvent<{iconRef: string | undefined}>): void {
    super.onIconChange(event)
    this.triggerSpinAttribute('.avatar-picker', 'data-pulse', 480)
  }

  private triggerSpinAttribute(selector: string, attribute: string, durationMs: number): void {
    const element = this.shadowRoot?.querySelector<HTMLElement>(selector)
    if (!element) return
    element.removeAttribute(attribute)
    void element.offsetWidth
    element.setAttribute(attribute, 'true')
    window.setTimeout(() => element.removeAttribute(attribute), durationMs)
  }

  private renderOtpSummary(): TemplateResult | typeof nothing {
    if (!this.model.useOtp()) {
      return nothing
    }

    const form = this.model.otp.getFormData()
    const preview = this.model.otp.preview()
    const meta = preview?.code || `${form.type} · ${form.digits} ${i18n('otp:digits')}`

    return html`
      <div class="otp-summary">
        <div class="otp-summary-text">
          <p class="otp-summary-title">${i18n('otp:configured')}</p>
          <p class="otp-summary-meta">${form.label || i18n('otp:default:name')} · ${meta}</p>
        </div>
        <cv-button
          class="otp-summary-edit"
          type="button"
          variant="default"
          size="small"
          aria-label=${i18n('button:edit')}
          @click=${this.onOtpEditClick}
        >
          <cv-icon name="edit-2" aria-hidden="true"></cv-icon>
        </cv-button>
      </div>
    `
  }

  private toggleOtp(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('cv-switch')) return
    this.model.openOtpSheet()
  }

  private onOtpEditClick(e: MouseEvent) {
    e.stopPropagation()
    this.model.openOtpSheet()
  }

  private onOtpSwitchChange(e: CVSwitchChangeEvent) {
    if (e.detail.checked) {
      this.model.openOtpSheet()
      return
    }

    this.model.disableOtp()
  }

  private onOtpSheetClose() {
    this.model.closeOtpSheet()
  }

  private onOtpSheetPrimary() {
    this.model.confirmOtpSheet()
  }

  private renderSshSummary(): TemplateResult | typeof nothing {
    if (!this.model.useSsh()) {
      return nothing
    }

    const ssh = this.model.ssh.getFormData()
    const keyTypeLabel =
      ssh.keyType === 'rsa'
        ? i18n('ssh:key_type:rsa')
        : ssh.keyType === 'ecdsa'
          ? i18n('ssh:key_type:ecdsa')
          : i18n('ssh:key_type:ed25519')
    const result = this.model.sshGenResult()
    const meta = result?.fingerprint
      ? `${keyTypeLabel} · ${result.fingerprint}`
      : i18n('ssh:configured:on_create', {type: keyTypeLabel})

    return html`
      <div class="otp-summary ssh-summary">
        <div class="otp-summary-text">
          <p class="otp-summary-title">${ssh.name}</p>
          <p class="otp-summary-meta">${meta}</p>
        </div>
        <cv-button
          class="otp-summary-edit"
          type="button"
          variant="default"
          size="small"
          aria-label=${i18n('button:edit')}
          @click=${this.onSshEditClick}
        >
          <cv-icon name="edit-2" aria-hidden="true"></cv-icon>
        </cv-button>
      </div>
    `
  }

  private toggleSsh(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('cv-switch')) return
    this.model.openSshSheet()
  }

  private onSshEditClick(e: MouseEvent) {
    e.stopPropagation()
    this.model.openSshSheet()
  }

  protected override onSshSwitchChange(e: CVSwitchChangeEvent) {
    if (e.detail.checked) {
      this.model.openSshSheet()
      return
    }

    this.model.disableSsh()
  }

  private onSshSheetClose() {
    this.model.closeSshSheet()
  }

  private onSshSheetPrimary() {
    this.model.confirmSshSheet()
  }

  private toggleNote = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('cv-switch')) return
    this.model.setUseNote(!this.model.useNote())
  }

  private renderStrengthBar(): TemplateResult | typeof nothing {
    if (this.model.passwordStrengthScore() === null) {
      return nothing
    }

    const score = this.model.passwordStrengthScore()!
    return html`<div class="strength-bar strength-${score}">
      <div class="strength-status">
        <cv-icon name="shield-check"></cv-icon>
        <span>
          ${i18n('password:strength', {label: this.model.passwordStrengthLabel()})}
        </span>
      </div>
      <div class="strength-segments" aria-hidden="true">
        ${[0, 1, 2, 3, 4].map((index) => html`<span class="strength-segment" data-active=${String(index <= score)}></span>`)}
      </div>
    </div>`
  }



  private renderTypeSection(): TemplateResult {
    const entryType = this.model.entryType()

    return html`
      <div class="section-group">
        <div class="section-label">${i18n('entry:type')}</div>
        <div class="section type-section">
        <cv-radio-group
          class="entry-type-switch"
          variant="segmented"
          .value=${entryType}
          aria-label=${i18n('entry:type')}
          @cv-change=${this.onEntryTypeChange}
        >
          <cv-radio
            class="entry-type-option"
            value="login"
          >
            <cv-icon name="person-circle"></cv-icon>
            <span>${i18n('entry:type:login')}</span>
          </cv-radio>
          <cv-radio
            class="entry-type-option"
            value="payment_card"
          >
            <cv-icon name="credit-card"></cv-icon>
            <span>${i18n('entry:type:payment_card')}</span>
          </cv-radio>
        </cv-radio-group>
        </div>
      </div>
    `
  }

  private renderTitleSection(): TemplateResult {
    const entryType = this.model.entryType()
    const titleError = this.model.titleError()
    const websiteError = this.model.websiteError()

    return html`
      <div class="section-group">
        <div class="section-label">${i18n('entry:details')}</div>
        <div class="section title-section">
        <div class="title-row">
          <label class="title-field-label" for="entry-create-title">${i18n('title')}</label>
          <div class="avatar-picker">
            <pm-icon-picker
              .iconRef=${this.model.avatarId()}
              .icon=${entryType === 'payment_card' ? 'credit-card' : 'person-circle'}
              @pm-icon-change=${this.onIconChange}
            ></pm-icon-picker>
            <span class="avatar-edit-badge"><cv-icon name="pencil"></cv-icon></span>
          </div>
          <div class="field-cell">
            <cv-input
              id="entry-create-title"
              class="title-input"
              type="text"
              size="large"
              name="title"
              required
              autocomplete="card-title"
              placeholder=${i18n('title:placeholder')}
              .value=${this.model.title()}
              @cv-input=${this.onTitleInput}
              ?invalid=${Boolean(titleError)}
            >
              ${titleError ? html`<span slot="help-text" class="field-error">${titleError}</span>` : nothing}
            </cv-input>
          </div>
        </div>
        ${entryType === 'login'
          ? html`
              <div class="field-cell">
                <cv-input
                  id="urls"
                  type="text"
                  size="large"
                  name="urls"
                  autocomplete="url"
                  placeholder=${i18n('website:placeholder')}
                  .value=${this.model.website()}
                  @cv-input=${this.onUrlsInput}
                  ?invalid=${Boolean(websiteError)}
                >
                  <span slot="label">${i18n('website:title')}</span>
                  <cv-icon slot="prefix" class="field-icon" name="globe"></cv-icon>
                  ${websiteError ? html`<span slot="help-text" class="field-error">${websiteError}</span>` : nothing}
                </cv-input>
              </div>
            `
          : nothing}
        </div>
      </div>
    `
  }

  private renderPaymentCardSection(): TemplateResult {
    const cardNumber = this.model.cardNumber()
    const cardCvv = this.model.cardCvv()
    const cardholderNameError = this.model.cardholderNameError()
    const cardNumberError = this.model.cardNumberError()
    const cardExpMonthError = this.model.cardExpMonthError()
    const cardExpYearError = this.model.cardExpYearError()
    const paymentCardError = cardholderNameError || cardNumberError || cardExpMonthError || cardExpYearError

    return html`
      <div class="section-group">
        <div class="section-label">
          <cv-icon name="credit-card"></cv-icon>
          ${i18n('entry:type:payment_card')}
        </div>
        <div class="section payment-card-create-section" aria-label=${i18n('entry:type:payment_card')}>
          ${renderPaymentCardFace({
            title: this.model.title(),
            caption: i18n('entry:type:payment_card'),
            brandLabel: 'Card',
            cardholderName: this.model.cardholderName(),
            expiryLabel: '',
            cardNumberResource: {
              status: cardNumber.trim() ? 'ready' : 'missing',
              value: cardNumber,
            },
            cardCvvResource: {
              status: cardCvv.trim() ? 'ready' : 'missing',
              value: cardCvv,
            },
            isCvvRevealed: true,
            edit: {
              cardholderName: this.model.cardholderName(),
              cardNumber,
              expMonth: this.model.cardExpMonth(),
              expYear: this.model.cardExpYear(),
              cardCvv,
              onInput: this.onPaymentCardFaceInput,
              errors: {
                cardholderName: cardholderNameError,
                cardNumber: cardNumberError,
                expMonth: cardExpMonthError,
                expYear: cardExpYearError,
              },
            },
          })}
          ${paymentCardError ? html`<div class="field-error payment-card-create-error">${paymentCardError}</div>` : nothing}
        </div>
      </div>
    `
  }

  private renderCredentialsSection(): TemplateResult {
    const usernameError = this.model.usernameError()
    const passwordError = this.model.passwordError()

    return html`
      <div class="section-group">
        <div class="section-label">${i18n('entry:credentials')}</div>
        <div class="section">
        <div class="credentials-grid">
          <div class="field-cell">
            <cv-input
              type="text"
              size="large"
              name="username"
              autocomplete="username"
              placeholder=${i18n('username:placeholder')}
              .value=${this.model.username()}
              @cv-input=${this.onUsernameInput}
              ?invalid=${Boolean(usernameError)}
            >
              <span slot="label">${i18n('username')}</span>
              <cv-icon slot="prefix" class="field-icon" name="person-circle"></cv-icon>
              ${usernameError ? html`<span slot="help-text" class="field-error">${usernameError}</span>` : nothing}
            </cv-input>
          </div>
          <div class="field-cell password-cell">
            <cv-input
              id="password"
              type="password"
              size="large"
              name="password"
              autocomplete="password"
              placeholder=${i18n('password:placeholder')}
              password-toggle
              .value=${this.model.password()}
              @cv-input=${this.onPasswordInput}
              ?editing=${this.model.isEditingPassword()}
              ?invalid=${Boolean(passwordError)}
            >
              <span slot="label">${i18n('password')}</span>
              <cv-icon slot="prefix" class="field-icon" name="lock"></cv-icon>
              <span class="generate-divider" slot="suffix" aria-hidden="true"></span>
              <cv-button unstyled
                class="generate-btn"
                slot="suffix"
                @click=${this.generate}
                type="button"
                title=${i18n('button:generate')}
              >
                <cv-icon name="arrow-repeat"></cv-icon>
              </cv-button>
              ${passwordError ? html`<span slot="help-text" class="field-error">${passwordError}</span>` : nothing}
            </cv-input>
            ${this.renderStrengthBar()}
          </div>
        </div>
        </div>
      </div>
    `
  }

  private renderTagsSection(): TemplateResult {
    return html`
      <div class="section-group">
        <div class="section-label">
          <cv-icon name="tag"></cv-icon>
          ${i18n('tags:title')}
        </div>
        <div class="section mobile-tags-section">${this.renderTagsEditor()}</div>
      </div>
    `
  }

  private renderOptionalCard({
    open,
    icon,
    title,
    description,
    onToggleSwitch,
    onHeaderClick,
    body,
    bodyClass,
  }: {
    open: boolean
    icon: string
    title: string
    description: string
    onToggleSwitch: (e: CVSwitchChangeEvent) => void
    onHeaderClick: (e: MouseEvent) => void
    body: TemplateResult | typeof nothing
    bodyClass?: string
  }): TemplateResult {
    return html`
      <div class="optional-card" data-open=${String(open)}>
        <div class="optional-card-header" @click=${onHeaderClick}>
          <cv-switch size="small" ?checked=${open} @cv-change=${onToggleSwitch}></cv-switch>
          <span class="optional-card-icon"><cv-icon name=${icon}></cv-icon></span>
          <div class="optional-card-title-stack">
            <p class="optional-card-title">${title}</p>
            <p class="optional-card-description">${description}</p>
          </div>
          <cv-icon class="optional-card-chevron" name="chevron-right"></cv-icon>
        </div>
        <div class=${`optional-card-body ${bodyClass ?? ''}`} ?hidden=${!open}>${body}</div>
      </div>
    `
  }

  private renderOptionalSection(): TemplateResult {
    const useOtp = this.model.useOtp()
    const useSsh = this.model.useSsh()
    const useNote = this.model.useNote()

    const noteBody = html`
      <cv-textarea
        size="small"
        name="note"
        placeholder=${i18n('note:placeholder')}
        rows="3"
        .value=${this.model.note()}
        @cv-input=${this.onNoteInput}
      ></cv-textarea>
    `

    return html`
      <div class="section-group optional-group">
        <div class="section-label">${i18n('optional:title')}</div>
        ${this.renderOptionalCard({
          open: useOtp,
          icon: 'shield-check',
          title: i18n('otp:use'),
          description: i18n('otp:description'),
          onToggleSwitch: this.onOtpSwitchChange,
          onHeaderClick: this.toggleOtp,
          body: this.renderOtpSummary(),
        })}
        ${this.renderOptionalCard({
          open: useSsh,
          icon: 'key',
          title: i18n('ssh:title'),
          description: i18n('ssh:description'),
          onToggleSwitch: this.onSshSwitchChange,
          onHeaderClick: this.toggleSsh,
          body: this.renderSshSummary(),
        })}
        ${this.renderOptionalCard({
          open: useNote,
          icon: 'sticky-note',
          title: i18n('note:use'),
          description: i18n('note:description'),
          onToggleSwitch: this.onUseNoteChange,
          onHeaderClick: this.toggleNote,
          body: noteBody,
        })}
      </div>
    `
  }

  private renderSubmitSection(): TemplateResult | typeof nothing {
    return nothing
  }

  private renderOtpSheet(): TemplateResult {
    const title = this.model.title().trim() || i18n('otp:default:name')

    return html`
      <pm-entry-otp-create-sheet
        .model=${this.model.otp}
        .open=${this.model.otpSheetOpen()}
        .saving=${false}
        .title=${i18n('otp:add')}
        .description=${i18n('otp:sheet:description', {title})}
        .primaryLabel=${i18n('button:done')}
        @pm-entry-otp-create-sheet-close=${this.onOtpSheetClose}
        @pm-entry-otp-create-sheet-primary=${this.onOtpSheetPrimary}
      ></pm-entry-otp-create-sheet>
    `
  }

  private renderSshSheet(): TemplateResult {
    const title = this.model.title().trim() || i18n('ssh:name:default')

    return html`
      <pm-entry-ssh-create-sheet
        .model=${this.model.ssh}
        .open=${this.model.sshSheetOpen()}
        .saving=${false}
        .title=${i18n('ssh:add')}
        .description=${i18n('ssh:sheet:description:create', {title})}
        .primaryLabel=${i18n('button:done')}
        .doneLabel=${i18n('button:done')}
        @pm-entry-ssh-create-sheet-close=${this.onSshSheetClose}
        @pm-entry-ssh-create-sheet-primary=${this.onSshSheetPrimary}
        @pm-entry-ssh-create-sheet-done=${this.onSshSheetClose}
      ></pm-entry-ssh-create-sheet>
    `
  }

  private renderFormFooter(): TemplateResult {
    const disabled = isPassmanagerReadOnlyOrMissing() || this.model.isSubmitting()

    return html`
      <mobile-bottom-action-footer class="create-footer" flow>
        <cv-button
          .disabled=${disabled}
          .loading=${this.model.isSubmitting()}
          size="large"
          variant="primary"
          preset="action-primary"
          type="submit"
        >
          <cv-icon slot="prefix" name="shield-check"></cv-icon>
          <span>${this.model.isSubmitting() ? i18n('entry:creating') : i18n('button:create_entry')}</span>
          <cv-icon slot="suffix" name="chevron-right"></cv-icon>
        </cv-button>
      </mobile-bottom-action-footer>
    `
  }

  private renderFormBody(): TemplateResult {
    const entryType = this.model.entryType()

    return html`
      ${this.renderTypeSection()} ${this.renderTitleSection()}
      ${entryType === 'payment_card'
        ? html`${this.renderPaymentCardSection()} ${this.renderTagsSection()} ${this.renderSubmitSection()}`
        : html`
            ${this.renderCredentialsSection()}
            ${this.renderTagsSection()}
            ${this.renderOptionalSection()}
            ${this.renderSubmitSection()}
            ${this.renderOtpSheet()}
            ${this.renderSshSheet()}
          `}
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (!getPassmanagerRoot()) {
      return nothing
    }

    return html`
      <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
        <form @submit=${this.onSubmit}>
          <div class="create-scroll">${this.renderFormBody()}</div>
          ${this.renderFormFooter()}
        </form>
      </cv-guidance-anchor>
    `
  }
}
