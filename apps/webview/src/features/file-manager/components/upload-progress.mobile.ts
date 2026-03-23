import {css, html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {SwipeGesture} from 'root/utils/swipe-gestures'

import {formatFileSize} from './upload-progress.model'
import {UploadProgressBase} from './upload-progress.base'

import './upload-task-item'

export class UploadProgressMobile extends UploadProgressBase {
  static define() {
    customElements.define('upload-progress-mobile', this)
  }

  private swipeGesture: SwipeGesture | null = null

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      /* Minimized bar */
      .minimized-bar {
        position: fixed;
        inset-block-end: calc(56px + 8px);
        inset-inline-start: calc(var(--safe-area-left, 0px) + 8px);
        inset-inline-end: auto;
        inline-size: clamp(180px, 62vw, 420px);
        max-inline-size: calc(100vw - var(--safe-area-left, 0px) - var(--safe-area-right, 0px) - 16px - 88px);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        min-block-size: 48px;
        padding-block: 10px;
        padding-inline: 12px;
        background: var(--cv-color-surface);
        border-radius: var(--cv-radius-2);
        box-shadow: var(--cv-shadow-2);
        border: 1px solid var(--cv-color-border);
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .bar-icon {
        color: var(--cv-color-primary);
        flex-shrink: 0;
      }

      .bar-title {
        flex: 1;
        font-weight: 600;
        font-size: 0.9em;
        color: var(--cv-color-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bar-progress {
        font-size: 0.85em;
        font-weight: 600;
        color: var(--cv-color-primary);
        flex-shrink: 0;
      }

      .bar-chevron {
        color: var(--cv-color-text-muted);
        flex-shrink: 0;
      }

      .header-spinner {
        font-size: 16px;
        flex-shrink: 0;
      }

      /* Backdrop overlay */
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 1001;
        background: var(--cv-alpha-black-35);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--cv-duration-normal) var(--cv-easing-standard);
      }

      .backdrop.visible {
        opacity: 1;
        pointer-events: auto;
      }

      /* Bottom sheet */
      .bottom-sheet {
        position: fixed;
        inset-inline: 0;
        inset-block-end: 0;
        z-index: 1002;
        max-block-size: 70vh;
        background: var(--cv-color-surface);
        border-radius: var(--cv-radius-2) var(--cv-radius-2) 0 0;
        box-shadow: var(--cv-shadow-2);
        transform: translateY(100%);
        transition: transform var(--cv-duration-normal) var(--cv-easing-standard);
        display: flex;
        flex-direction: column;
      }

      .bottom-sheet.open {
        transform: translateY(0);
      }

      /* Drag handle */
      .drag-handle {
        display: flex;
        justify-content: center;
        padding-block: 8px;
        cursor: grab;
      }

      .grabber {
        inline-size: 36px;
        block-size: 4px;
        border-radius: 2px;
        background: var(--cv-color-border);
      }

      /* Sheet header */
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-block: 4px;
        padding-inline: 16px;
        border-block-end: 1px solid var(--cv-color-border);
      }

      .sheet-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: var(--cv-color-primary);
      }

      .sheet-controls {
        display: flex;
        gap: 8px;
      }

      .sheet-btn {
        padding: 8px;
        border: none;
        border-radius: var(--cv-radius-1);
        background: transparent;
        color: var(--cv-color-text-muted);
        cursor: pointer;
        min-block-size: 48px;
        min-inline-size: 48px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: var(--cv-color-surface-2);
        }
      }

      /* Task list */
      .tasks-container {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      /* Sheet footer */
      .sheet-footer {
        padding-block: 10px;
        padding-inline: 16px;
        background: var(--cv-color-surface-2);
        border-block-start: 1px solid var(--cv-color-border);
      }

      .footer-stats {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.85em;
        color: var(--cv-color-text);
      }

      .footer-size {
        font-size: 0.8em;
        color: var(--cv-color-text-muted);
        margin-block-start: 2px;
      }
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    this.setupSwipeGesture()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.destroySwipeGesture()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    this.model?.reconcileAutoHideClear()
  }

  private async setupSwipeGesture() {
    await this.updateComplete
    const sheet = this.shadowRoot?.querySelector('.bottom-sheet') as HTMLElement | null
    if (!sheet) return
    this.swipeGesture = new SwipeGesture(sheet, {
      threshold: 40,
      restraint: 150,
      allowedTime: 500,
    })
    this.swipeGesture.on('down', () => this.model.collapse())
    this.swipeGesture.on('up', () => this.model.expand())
  }

  private destroySwipeGesture() {
    if (this.swipeGesture) {
      this.swipeGesture.destroy()
      this.swipeGesture = null
    }
  }

  private onBarClick = () => {
    this.model.expand()
  }

  private onBackdropClick = () => {
    this.model.collapse()
  }

  private onClearClick = (e: Event) => {
    e.stopPropagation()
    this.model.clearCompleted()
  }

  private onCollapseClick = () => {
    this.model.collapse()
  }

  render() {
    const m = this.model
    if (!m) return nothing

    const tasks = m.tasks()
    const stats = m.stats()
    const expanded = m.expanded()

    return html`
      ${!expanded
        ? html`
            <div class="minimized-bar" @click=${this.onBarClick}>
              <cv-icon class="bar-icon" name=${m.headerIcon()}></cv-icon>
              <span class="bar-title"
                >${i18n('file-manager:transfers' as any, {total: String(stats.total)})}</span
              >
              ${m.hasActiveTransfers()
                ? html`<cv-spinner
                    class="header-spinner"
                    label=${i18n('file-manager:transfers-progress' as any)}
                  ></cv-spinner>`
                : nothing}
              <span class="bar-progress">${Math.round(stats.overallProgress)}%</span>
              <cv-icon class="bar-chevron" name="chevron-up"></cv-icon>
            </div>
          `
        : nothing}

      <div class="backdrop ${expanded ? 'visible' : ''}" @click=${this.onBackdropClick}></div>

      <div class="bottom-sheet ${expanded ? 'open' : ''}">
        <div class="drag-handle">
          <div class="grabber"></div>
        </div>

        <div class="sheet-header">
          <div class="sheet-title">
            <cv-icon name=${m.headerIcon()}></cv-icon>
            <span>${i18n('file-manager:transfers' as any, {total: String(stats.total)})}</span>
            ${m.hasActiveTransfers()
              ? html`<cv-spinner
                  class="header-spinner"
                  label=${i18n('file-manager:transfers-progress' as any)}
                ></cv-spinner>`
              : nothing}
          </div>
          <div class="sheet-controls">
            <button
              class="sheet-btn"
              @click=${this.onClearClick}
              title=${i18n('button:clear-completed' as any)}
            >
              <cv-icon name="trash"></cv-icon>
            </button>
            <button class="sheet-btn" @click=${this.onCollapseClick} title=${i18n('button:collapse' as any)}>
              <cv-icon name="chevron-down"></cv-icon>
            </button>
          </div>
        </div>

        <div class="tasks-container">
          ${tasks.map((task) => html`<upload-task-item .task=${task} compact></upload-task-item>`)}
        </div>

        <div class="sheet-footer">
          <div class="footer-stats">
            <span
              >${i18n('file-manager:overall-progress' as any, {
                progress: String(Math.round(stats.overallProgress)),
              })}</span
            >
            <span
              >${i18n('file-manager:completed-of-total' as any, {
                completed: String(stats.completed),
                total: String(stats.total),
              })}</span
            >
          </div>
          <div class="footer-size">
            ${formatFileSize(stats.loadedBytes)} / ${formatFileSize(stats.totalBytes)}
          </div>
        </div>
      </div>
    `
  }
}

UploadProgressMobile.define()
