import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import type {CatalogOperations} from '../mapper.js'
import {i18n} from '../i18n.js'
import {getImportDialogFileAccept} from './file-accept.js'
import {
  notifyMobileFilePickerLifecycleEnd,
  notifyMobileFilePickerLifecycleStart,
} from './mobile-file-picker-lifecycle.js'
import {getExistingEntriesMap, setImportCatalogOps} from './import-dialog-state.js'
import {ImportDialogModel, type DialogStep, VISIBLE_STEPS, stepIndex} from './import-dialog.model.js'

export class ImportDialog extends ReatomLitElement {
  private readonly model = new ImportDialogModel()
  private filePickerSessionActive = false

  static define() {
    if (!customElements.get('pm-import-dialog')) {
      customElements.define('pm-import-dialog', this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    css`
      /* ===== HOST ===== */
      :host {
        display: flex;
        flex-direction: column;
        contain: content;
        padding: var(--cv-space-6, 24px);
        width: 100%;
        max-width: 560px;
        box-sizing: border-box;
        margin: 0 auto;
        font-family: var(--cv-font-family-sans);
        color: var(--cv-color-text);
        min-height: 480px;
      }

      /* ===== WIZARD PROGRESS ===== */
      .wizard-progress {
        display: flex;
        align-items: center;
        gap: var(--cv-space-2, 6px);
        margin-block-end: var(--cv-space-6, 24px);
      }

      .wizard-step-indicator {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--cv-font-size-xs, 0.75rem);
        font-weight: 600;
        background: var(--cv-color-surface-3, var(--cv-color-surface-2));
        color: var(--cv-color-text-muted);
        border: 2px solid var(--cv-color-border-muted, var(--cv-color-border));
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        flex-shrink: 0;
      }

      .wizard-step-indicator.active {
        background: var(--cv-color-primary);
        color: var(--cv-color-on-primary, #00171a);
        border-color: var(--cv-color-primary);
        box-shadow: 0 0 0 4px var(--cv-color-primary-ring);
      }

      .wizard-step-indicator.completed {
        background: var(--cv-color-success);
        color: white;
        border-color: var(--cv-color-success);
      }

      .wizard-step-line {
        flex: 1;
        height: 2px;
        background: var(--cv-color-border-muted, var(--cv-color-border));
        border-radius: 1px;
        transition: background 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .wizard-step-line.completed {
        background: var(--cv-color-success);
      }

      .check-svg {
        width: 14px;
        height: 14px;
      }

      /* ===== STEP CONTENT ANIMATION ===== */
      .step-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        animation: stepFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      @keyframes stepFadeIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ===== TITLE ===== */
      .title {
        font-size: var(--cv-font-size-xl, 1.25rem);
        font-weight: 600;
        margin: 0 0 var(--cv-space-2, 6px);
        letter-spacing: -0.01em;
        color: var(--cv-color-text);
      }

      .subtitle {
        font-size: var(--cv-font-size-sm, 0.875rem);
        color: var(--cv-color-text-muted);
        margin: 0 0 var(--cv-space-4, 16px);
        line-height: 1.5;
      }

      /* ===== DROP ZONE ===== */
      .drop-zone {
        position: relative;
        border: 2px dashed var(--cv-color-border);
        border-radius: var(--cv-radius-lg, 12px);
        padding: var(--cv-space-8, 40px) var(--cv-space-6, 24px);
        text-align: center;
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        background: var(--cv-color-surface-3, var(--cv-color-surface-2));
        overflow: hidden;
      }

      .drop-zone::before {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 60% 50% at 50% 0%,
          var(--cv-color-primary-subtle),
          transparent 70%
        );
        opacity: 0;
        transition: opacity 0.25s ease;
        pointer-events: none;
      }

      .drop-zone:hover,
      .drop-zone.dragover {
        border-color: var(--cv-color-primary);
        background: var(--cv-color-primary-surface);
        transform: translateY(-1px);
        box-shadow: 0 4px 20px var(--cv-color-primary-subtle);
      }

      .drop-zone:hover::before,
      .drop-zone.dragover::before {
        opacity: 1;
      }

      .drop-zone input[type='file'] {
        display: none;
      }

      .drop-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto var(--cv-space-4, 16px);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .drop-zone:hover .drop-icon,
      .drop-zone.dragover .drop-icon {
        transform: scale(1.08);
      }

      .drop-icon svg {
        width: 24px;
        height: 24px;
      }

      .drop-zone-text {
        font-size: var(--cv-font-size-base, 0.9375rem);
        font-weight: 500;
        color: var(--cv-color-text);
        margin-block-end: var(--cv-space-1, 4px);
      }

      .formats {
        font-size: var(--cv-font-size-xs, 0.75rem);
        color: var(--cv-color-text-muted);
      }

      .format-badges {
        display: flex;
        justify-content: center;
        gap: var(--cv-space-1, 4px);
        margin-block-start: var(--cv-space-3, 12px);
      }

      .format-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        font-size: var(--cv-font-size-xs, 0.6875rem);
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border-radius: 999px;
        background: var(--cv-color-primary-subtle);
        color: var(--cv-color-primary);
        border: 1px solid var(--cv-color-primary-border);
      }

      /* ===== SECTION ===== */
      .section {
        margin-bottom: var(--cv-space-4, 16px);
      }

      /* ===== SUMMARY GRID ===== */
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: var(--cv-space-3, 12px);
        margin: var(--cv-space-4, 16px) 0;
      }

      .summary-card {
        position: relative;
        padding: var(--cv-space-4, 16px);
        border-radius: var(--cv-radius-md, 8px);
        background: var(--cv-color-surface-3, var(--cv-color-surface-2));
        border: 1px solid var(--cv-color-border-muted);
        text-align: center;
        overflow: hidden;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .summary-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--card-accent, var(--cv-color-primary, #00e5ff));
        opacity: 0.6;
      }

      .summary-card .count {
        font-size: 1.75rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--card-accent, var(--cv-color-primary));
        line-height: 1;
        letter-spacing: -0.02em;
      }

      .summary-card .label {
        font-size: var(--cv-font-size-xs, 0.75rem);
        color: var(--cv-color-text-muted);
        margin-top: var(--cv-space-1, 4px);
      }

      .summary-card.success {
        --card-accent: var(--cv-color-success);
      }
      .summary-card.danger {
        --card-accent: var(--cv-color-danger);
      }
      .summary-card.warning {
        --card-accent: var(--cv-color-warning);
      }

      /* ===== PROGRESS ===== */
      .progress-section {
        display: grid;
        gap: var(--cv-space-3, 12px);
      }

      .progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--cv-font-size-sm, 0.875rem);
      }

      .progress-phase {
        font-weight: 500;
        color: var(--cv-color-text);
      }

      .progress-percent {
        color: var(--cv-color-primary);
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }

      cv-progress {
        --cv-progress-height: 8px;
        --cv-progress-indicator-color: var(--cv-color-primary);
        --cv-progress-track-color: var(--cv-color-surface-3, var(--cv-color-surface-2));
      }

      .progress-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--cv-space-2, 6px);
      }

      .stat-item {
        display: flex;
        align-items: center;
        gap: var(--cv-space-1, 4px);
        font-size: var(--cv-font-size-xs, 0.75rem);
        color: var(--cv-color-text-muted);
      }

      .stat-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .stat-dot.imported {
        background: var(--cv-color-success);
      }
      .stat-dot.updated {
        background: var(--cv-color-primary);
      }
      .stat-dot.errors {
        background: var(--cv-color-danger);
      }

      .stat-value {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--cv-color-text);
      }

      .progress-current {
        font-size: var(--cv-font-size-xs, 0.75rem);
        color: var(--cv-color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: var(--cv-space-1, 4px) var(--cv-space-2, 6px);
        background: var(--cv-color-surface-3, var(--cv-color-surface-2));
        border-radius: var(--cv-radius-sm, 4px);
      }

      /* ===== ERROR LIST ===== */
      .error-list {
        max-height: 180px;
        overflow-y: auto;
        border-radius: var(--cv-radius-md, 8px);
        border: 1px solid var(--cv-color-danger-border);
        background: var(--cv-color-danger-surface);
        scrollbar-width: thin;
        scrollbar-color: var(--cv-color-danger-border) transparent;
      }

      .error-item {
        font-size: var(--cv-font-size-xs, 0.75rem);
        color: var(--cv-color-danger);
        padding: var(--cv-space-2, 6px) var(--cv-space-3, 12px);
        border-bottom: 1px solid var(--cv-color-danger-ring);
        display: flex;
        align-items: flex-start;
        gap: var(--cv-space-1, 4px);
      }

      .error-item:last-child {
        border-bottom: none;
      }

      .error-item::before {
        content: '';
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--cv-color-danger);
        flex-shrink: 0;
        margin-top: 6px;
      }

      /* ===== ACTIONS ===== */
      .actions {
        display: flex;
        gap: var(--cv-space-3, 12px);
        margin-top: auto;
        justify-content: flex-end;
        padding-block-start: var(--cv-space-4, 16px);
        border-block-start: 1px solid var(--cv-color-border-muted);
      }

      /* cv-button styling inherited from pmSharedStyles in host app */

      /* ===== cv-input focus override ===== */
      cv-input:focus-within::part(base) {
        border-color: var(--cv-color-primary-border-strong);
        box-shadow: inset 0 0 0 2px var(--cv-color-primary-ring);
      }

      /* ===== CALLOUT OVERRIDES ===== */
      cv-callout {
        display: block;
        --cv-callout-border-radius: var(--cv-radius-md, 8px);
        --cv-callout-background: var(--cv-color-surface-3, var(--cv-color-surface-2));
        --cv-callout-border-color: var(--cv-color-border-muted);
        --cv-callout-color: var(--cv-color-text);
      }

      cv-callout[variant='warning'] {
        --cv-callout-background: var(--cv-color-warning-surface);
        --cv-callout-border-color: var(--cv-color-warning-border);
      }

      cv-callout[variant='danger'] {
        --cv-callout-background: var(--cv-color-danger-surface);
        --cv-callout-border-color: var(--cv-color-danger-border);
      }

      .error-callout {
        margin-top: var(--cv-space-3, 12px);
      }

      .callout-list {
        display: flex;
        flex-direction: column;
        gap: var(--cv-space-1, 4px);
      }

      .callout-line {
        display: block;
      }

      /* ===== RESULT STATE ===== */
      .result-icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        margin: 0 auto var(--cv-space-4, 16px);
        animation: resultPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }

      .result-icon-wrap.success {
        background: var(--cv-color-success-surface);
        color: var(--cv-color-success);
        box-shadow: 0 0 0 6px var(--cv-color-success-ring);
      }

      .result-icon-wrap.error {
        background: var(--cv-color-danger-surface);
        color: var(--cv-color-danger);
        box-shadow: 0 0 0 6px var(--cv-color-danger-ring);
      }

      .result-icon-wrap svg {
        width: 28px;
        height: 28px;
      }

      .complete-state {
        text-align: center;
      }

      .complete-title {
        text-align: center;
      }

      @keyframes resultPop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        60% {
          transform: scale(1.12);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* ===== ACCESSIBILITY ===== */
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    `,
  ]

  setCatalogOperations(ops: CatalogOperations) {
    setImportCatalogOps(ops)
  }

  connectedCallback() {
    super.connectedCallback()
    this.model.reset()
  }

  disconnectedCallback() {
    this.endFilePickerSession()
    super.disconnectedCallback()
  }

  protected render() {
    const currentStep = this.model.step()
    return html`
      ${this.renderWizardProgress(currentStep)}
      <div class="step-content">${this.renderStep(currentStep)}</div>
    `
  }

  private renderStep(s: DialogStep) {
    switch (s) {
      case 'file-select':
        return this.renderFileSelect()
      case 'password':
        return this.renderPassword()
      case 'preview':
        return this.renderPreview()
      case 'progress':
        return this.renderProgress()
      case 'complete':
        return this.renderComplete()
    }
  }

  private renderWizardProgress(current: DialogStep) {
    const idx = stepIndex(current)
    const labels = [i18n('import:step:file'), i18n('import:step:preview'), i18n('import:step:import')]

    return html`
      <div class="wizard-progress">
        ${VISIBLE_STEPS.map((_, i) => {
          const isCompleted = i < idx
          const isActive = i === idx
          return html`
            ${i > 0 ? html`<div class="wizard-step-line ${isCompleted ? 'completed' : ''}"></div>` : nothing}
            <div
              class="wizard-step-indicator ${isActive ? 'active' : isCompleted ? 'completed' : ''}"
              title=${labels[i]}
            >
              ${isCompleted
                ? html`<svg
                    class="check-svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>`
                : i + 1}
            </div>
          `
        })}
      </div>
    `
  }

  private renderFileSelect() {
    const fileAccept = getImportDialogFileAccept()

    return html`
      <h2 class="title">${i18n('import:dialog:title')}</h2>
      <p class="subtitle">${i18n('import:dialog:drop_zone')}</p>
      <div
        class="drop-zone"
        @click=${this.handleDropZoneClick}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        <div class="drop-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div class="drop-zone-text">${i18n('import:dialog:drop_zone')}</div>
        <div class="formats">${i18n('import:dialog:supported_formats')}</div>
        <div class="format-badges">
          <span class="format-badge">.kdbx</span>
          <span class="format-badge">.csv</span>
          <span class="format-badge">.json</span>
        </div>
        <input
          type="file"
          accept=${fileAccept ?? nothing}
          @change=${this.handleFileSelected}
          @cancel=${this.handleFileSelectionCancelled}
        />
      </div>
      ${this.model.parseError()
        ? html`<cv-callout class="error-callout" variant="danger">${this.model.parseError()}</cv-callout>`
        : nothing}
      <div class="actions">
        <cv-button variant="default" @click=${this.handleClose}>${i18n('button:cancel')}</cv-button>
      </div>
    `
  }

  private renderPassword() {
    return html`
      <h2 class="title">${i18n('import:password:title')}</h2>
      <p class="subtitle">${i18n('import:password:description')}</p>
      <div class="section">
        <cv-input
          type="password"
          placeholder=${i18n('import:password:placeholder')}
          password-toggle
          autofocus
          @keydown=${this.handlePasswordKeydown}
        ></cv-input>
        ${this.model.parseError()
          ? html`<cv-callout class="error-callout" variant="danger">${this.model.parseError()}</cv-callout>`
          : nothing}
      </div>
      <div class="actions">
        <cv-button variant="default" @click=${this.handleBack}>${i18n('import:button:back')}</cv-button>
        <cv-button variant="primary" @click=${this.handleDecrypt}>${i18n('import:button:decrypt')}</cv-button>
      </div>
    `
  }

  private renderPreview() {
    const result = this.model.parseResult()
    if (!result) return nothing

    const existingEntriesMap = getExistingEntriesMap()
    const updateCount = existingEntriesMap
      ? result.entries.filter((e) => existingEntriesMap.has(e.id)).length
      : 0
    const newCount = result.entries.length - updateCount

    return html`
      <h2 class="title">${i18n('import:preview:title')}</h2>
      <p class="subtitle">${result.entries.length} ${i18n('import:preview:total_entries')}</p>
      <div class="summary-grid">
        <div class="summary-card success">
          <div class="count">${newCount}</div>
          <div class="label">${i18n('import:preview:new_entries')}</div>
        </div>
        <div class="summary-card">
          <div class="count">${updateCount}</div>
          <div class="label">${i18n('import:preview:update_entries')}</div>
        </div>
      </div>
      ${result.warnings.length > 0
        ? html`
            <cv-callout variant="warning">
              <span class="callout-list">
                ${result.warnings.map((warning) => html`<span class="callout-line">${warning}</span>`)}
              </span>
            </cv-callout>
          `
        : nothing}
      <div class="actions">
        <cv-button variant="default" @click=${this.handleBack}>${i18n('button:cancel')}</cv-button>
        <cv-button variant="primary" @click=${this.handleStartImport} ?disabled=${this.model.isImporting()}>
          ${i18n('import:preview:import_button')} ${result.entries.length}
        </cv-button>
      </div>
    `
  }

  private renderProgress() {
    const p = this.model.progressState()
    const done = p.imported + p.updated + p.errors + p.skipped
    const pct = p.total > 0 ? Math.round((done / p.total) * 100) : 0

    return html`
      <h2 class="title">${i18n('import:progress:title')}</h2>
      <div class="progress-section">
        <div class="progress-header">
          <span class="progress-phase">${done} / ${p.total}</span>
          <span class="progress-percent">${pct}%</span>
        </div>
        <cv-progress value=${pct}></cv-progress>
        <div class="progress-stats">
          <div class="stat-item">
            <span class="stat-dot imported"></span>
            <span class="stat-value">${p.imported}</span> ${i18n('import:progress:imported')}
          </div>
          <div class="stat-item">
            <span class="stat-dot updated"></span>
            <span class="stat-value">${p.updated}</span> ${i18n('import:progress:updated')}
          </div>
          <div class="stat-item">
            <span class="stat-dot errors"></span>
            <span class="stat-value">${p.errors}</span> ${i18n('import:progress:errors')}
          </div>
        </div>
        ${p.currentItem ? html`<div class="progress-current">${p.currentItem}</div>` : nothing}
      </div>
      <div class="actions">
        <cv-button variant="danger" @click=${this.handleCancelImport}>
          ${i18n('import:progress:cancel')}
        </cv-button>
      </div>
    `
  }

  private renderComplete() {
    const p = this.model.progressState()
    const errors = this.model.importErrors()
    const hasErrors = errors.length > 0

    return html`
      <div class="complete-state">
        <div class="result-icon-wrap ${hasErrors ? 'error' : 'success'}">
          ${hasErrors
            ? html`<svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>`
            : html`<svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>`}
        </div>
        <h2 class="title complete-title">
          ${hasErrors ? i18n('import:complete:title_errors') : i18n('import:complete:title')}
        </h2>
      </div>
      <div class="summary-grid">
        <div class="summary-card success">
          <div class="count">${p.imported}</div>
          <div class="label">${i18n('import:complete:imported')}</div>
        </div>
        <div class="summary-card">
          <div class="count">${p.updated}</div>
          <div class="label">${i18n('import:complete:updated')}</div>
        </div>
        <div class="summary-card danger">
          <div class="count">${p.errors}</div>
          <div class="label">${i18n('import:complete:errors')}</div>
        </div>
      </div>
      ${hasErrors
        ? html`<div class="error-list">${errors.map((e) => html`<div class="error-item">${e}</div>`)}</div>`
        : nothing}
      <div class="actions">
        <cv-button variant="primary" @click=${this.handleClose}>${i18n('import:button:close')}</cv-button>
      </div>
    `
  }

  private handleDropZoneClick = () => {
    const input = this.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement | null
    if (!input) return

    this.beginFilePickerSession()
    try {
      input.click()
    } catch {
      this.endFilePickerSession()
    }
  }

  private handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).classList.add('dragover')
  }

  private handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).classList.remove('dragover')
  }

  private handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).classList.remove('dragover')
    const file = e.dataTransfer?.files[0]
    if (file) void this.model.selectFile(file)
  }

  private handleFileSelected = (e: Event) => {
    this.endFilePickerSession()
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) void this.model.selectFile(file)
  }

  private handleFileSelectionCancelled = () => {
    this.endFilePickerSession()
  }

  private handlePasswordKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void this.handleDecrypt()
  }

  private async handleDecrypt() {
    const input = this.shadowRoot?.querySelector('cv-input') as (HTMLElement & {value?: string}) | null
    const password = input?.value
    await this.model.decrypt(password ?? '', () => import('../parsers/keepass.js'))
  }

  private async handleStartImport() {
    const detail = await this.model.startImport()
    if (!detail) return

    this.dispatchEvent(
      new CustomEvent('import-complete', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleCancelImport() {
    this.model.cancelImport()
  }

  private handleClose() {
    this.endFilePickerSession()
    this.model.reset()
    this.dispatchEvent(new CustomEvent('import-close', {bubbles: true, composed: true}))
  }

  private handleBack() {
    this.model.reset()
  }

  private beginFilePickerSession() {
    if (this.filePickerSessionActive) return
    this.filePickerSessionActive = true
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.handleWindowFocus, {once: true})
    }
    notifyMobileFilePickerLifecycleStart()
  }

  private endFilePickerSession() {
    if (!this.filePickerSessionActive) return
    this.filePickerSessionActive = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.handleWindowFocus)
    }
    notifyMobileFilePickerLifecycleEnd()
  }

  private handleWindowFocus = () => {
    this.endFilePickerSession()
  }
}
