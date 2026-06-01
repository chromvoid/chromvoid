import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from 'root/i18n'
import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

import {formatFileSize} from './upload-progress.model'
import {UploadProgressBase} from './upload-progress.base'

import './upload-task-item'

export class UploadProgressDesktop extends UploadProgressBase {
  static define() {
    if (!customElements.get('upload-progress-desktop')) {
      customElements.define('upload-progress-desktop', this)
    }
  }

  static styles = [
    sharedStyles,
    hostContentContainStyles,
    css`
      :host {
        min-inline-size: 300px;
        max-inline-size: min(500px, calc(100vw - 40px));
      }

      .upload-panel {
        background: var(--cv-color-surface);
        border-radius: var(--cv-radius-2);
        box-shadow: var(--cv-shadow-2);
        border: 1px solid var(--cv-color-border);
        overflow: hidden;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-block: 10px;
        padding-inline: 16px;
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
        cursor: pointer;
        user-select: none;

        &:hover {
          background: var(--cv-color-primary-surface-strong);
        }
      }

      .header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }

      .header-spinner {
        font-size: 16px;
        flex-shrink: 0;
      }

      .header-controls {
        display: flex;
        gap: 8px;
      }

      .header-btn {
        padding: 4px;
        border: none;
        border-radius: var(--cv-radius-1);
        background: transparent;
        color: var(--cv-color-primary);
        cursor: pointer;
        transition: background var(--cv-duration-fast) var(--cv-easing-standard);

        &:hover {
          background: var(--cv-color-primary-surface);
        }
      }

      .collapsible-wrapper {
        display: grid;
        grid-template-rows: 1fr;
        transition: grid-template-rows var(--cv-duration-normal) var(--cv-easing-standard);
      }

      .collapsible-wrapper.collapsed {
        grid-template-rows: 0fr;
      }

      .collapsible-content {
        overflow: hidden;
      }

      .tasks-container {
        max-block-size: 300px;
        overflow-y: auto;
        padding: 0;

        &::-webkit-scrollbar {
          inline-size: 8px;
        }

        &::-webkit-scrollbar-track {
          background: var(--cv-color-surface-2);
        }

        &::-webkit-scrollbar-thumb {
          background: var(--cv-color-text-subtle);
          border-radius: 4px;
        }
      }

      .overall-progress {
        padding-block: 8px;
        padding-inline: 16px;
        background: var(--cv-color-surface-2);
        border-block-start: 1px solid var(--cv-color-border);
      }

      .overall-stats {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.85em;
        color: var(--cv-color-text);
      }

      .overall-progress-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .overall-progress-bar {
        --cv-progress-height: 6px;
        --cv-progress-track-color: var(--cv-color-border);
        --cv-progress-indicator-background: var(--gradient-primary);
        margin-block: 2px 4px;
      }

      .overall-size-info {
        text-align: center;
        font-size: 0.8em;
        color: var(--cv-color-text-muted);
      }
    `,
  ]

  private onClearClick = (e: Event) => {
    e.stopPropagation()
    this.model.clearCompleted()
  }

  render() {
    const m = this.model
    if (!m) return nothing

    const tasks = m.tasks()
    const stats = m.stats()
    const primaryStats = m.primaryStats()
    const displayedProgress = m.primaryDisplay.progress()
    const displayedLoadedBytes = m.primaryDisplay.loadedBytes()
    const minimized = m.minimized()

    return html`
      <div class="upload-panel">
        <div class="panel-header" @click=${m.toggleMinimize}>
          <div class="header-title">
            <cv-icon name=${m.headerIcon()}></cv-icon>
            <span>${i18n('file-manager:transfers', {total: String(stats.total)})}</span>
            ${m.hasActiveTransfers()
              ? html`<cv-spinner
                  class="header-spinner"
                  label=${i18n('file-manager:transfers-progress')}
                ></cv-spinner>`
              : ''}
          </div>
          <div class="header-controls">
            <cv-button unstyled
              class="header-btn"
              @click=${this.onClearClick}
              title=${i18n('button:clear-completed')}
            >
              <cv-icon name="trash"></cv-icon>
            </cv-button>
            <cv-button unstyled
              class="header-btn"
              title=${i18n(minimized ? ('button:expand') : ('button:collapse'))}
            >
              <cv-icon name=${minimized ? 'chevron-up' : 'chevron-down'}></cv-icon>
            </cv-button>
          </div>
        </div>

        <div class="collapsible-wrapper ${minimized ? 'collapsed' : ''}">
          <div class="collapsible-content">
            <div class="tasks-container">
              ${tasks.map((task) => html`<upload-task-item .task=${task}></upload-task-item>`)}
            </div>

            <div class="overall-progress">
              <div class="overall-stats">
                <div class="overall-progress-info">
                  <span
                    >${i18n('file-manager:overall-progress', {
                      progress: String(Math.round(displayedProgress)),
                    })}</span
                  >
                  <span
                    >${i18n('file-manager:completed-of-total', {
                      completed: String(primaryStats.completed),
                      total: String(primaryStats.total),
                    })}</span
                  >
                </div>
                <cv-progress
                  class="overall-progress-bar"
                  value=${displayedProgress}
                  ?indeterminate=${primaryStats.uploading > 0 && primaryStats.totalBytes <= 0}
                  aria-label=${i18n('file-manager:transfers-progress')}
                ></cv-progress>
                <div class="overall-size-info">
                  ${formatFileSize(displayedLoadedBytes)} / ${formatFileSize(primaryStats.totalBytes)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }
}

UploadProgressDesktop.define()
