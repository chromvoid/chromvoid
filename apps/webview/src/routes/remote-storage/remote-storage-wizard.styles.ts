import {css} from 'lit'
import {functionalMotionStyles} from 'root/shared/ui/shared-styles'

export const remoteStorageWizardStyles = [
  functionalMotionStyles,
  css`
    .wizard {
      display: grid;
      gap: var(--app-spacing-4);
    }

    .wizard-progress {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-2);
      padding-block-end: var(--app-spacing-3);
      border-block-end: 1px solid var(--cv-color-border-muted);
    }

    .wizard-step-indicator {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
      border: 2px solid var(--cv-color-border-muted);
    }

    .wizard-step-indicator.active {
      background: var(--cv-color-brand);
      color: white;
      border-color: var(--cv-color-brand);
    }

    .wizard-step-indicator.completed {
      background: var(--cv-color-success);
      color: white;
      border-color: var(--cv-color-success);
    }

    .wizard-step-check-icon {
      font-size: 14px;
    }

    .wizard-step-line {
      flex: 1;
      height: 2px;
      background: var(--cv-color-border-muted);
      transition: background-color 0.2s ease;
    }

    .wizard-step-line.completed {
      background: var(--cv-color-success);
    }

    .wizard-content {
      display: grid;
      gap: var(--app-spacing-4);
    }

    .wizard-header {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .wizard-title {
      font-size: var(--cv-font-size-lg);
      font-weight: var(--cv-font-weight-semibold);
      margin: 0;
      letter-spacing: -0.01em;
    }

    .wizard-description {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      margin: 0;
      line-height: 1.5;
    }

    .wizard-body {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .wizard-actions {
      display: flex;
      gap: var(--app-spacing-2);
      justify-content: flex-end;
      padding-block-start: var(--app-spacing-3);
      border-block-start: 1px solid var(--cv-color-border-muted);
    }

    /* ========== PROGRESS ========== */
    .progress-container {
      display: grid;
      gap: var(--app-spacing-3);
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: var(--cv-font-size-sm);
    }

    .progress-phase {
      color: var(--cv-color-text);
      font-weight: var(--cv-font-weight-medium);
    }

    .progress-percent {
      color: var(--cv-color-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .progress-bar {
      height: 10px;
      background: var(--cv-color-surface-2);
      border-radius: 5px;
      overflow: hidden;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cv-color-brand), var(--cv-color-info));
      border-radius: 5px;
      inline-size: var(--remote-storage-progress, 0%);
      transition: inline-size 0.3s ease;
      position: relative;
    }

    .progress-stats {
      display: flex;
      justify-content: space-between;
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
    }

    /* ========== RESULT STATES ========== */
    .result {
      text-align: center;
      padding: var(--app-spacing-4) 0;
    }

    .result-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      margin: 0 auto var(--app-spacing-4);
      font-size: 32px;
    }

    .result-icon.success {
      background: var(--cv-color-success-surface);
      color: var(--cv-color-success);
      box-shadow: 0 0 0 8px var(--cv-color-success-ring);
    }

    .result-icon.error {
      background: var(--cv-color-danger-surface);
      color: var(--cv-color-danger);
      box-shadow: 0 0 0 8px var(--cv-color-danger-ring);
    }

    .result-message {
      font-size: var(--cv-font-size-lg);
      font-weight: var(--cv-font-weight-semibold);
      margin: 0 0 var(--app-spacing-2);
    }

    .result-hint {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      margin: 0 0 var(--app-spacing-4);
    }

    /* ========== PASSWORD FIELD ========== */
    .password-field {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .password-field label {
      font-weight: var(--cv-font-weight-medium);
      font-size: var(--cv-font-size-sm);
    }
  `,
]
