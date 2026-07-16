import { css, nothing } from "lit";
import { html } from "@chromvoid/uikit/reatom-lit";
import { CVOperationQueue } from "@chromvoid/uikit/components/cv-operation-queue";

import { isolateLtrText } from "@project/i18n/pure";
import { i18n } from "root/i18n";
import { hostContentContainStyles, sharedStyles } from "root/shared/ui/shared-styles";

import { formatFileSize } from "./upload-progress.model";
import { UploadProgressBase } from "./upload-progress.base";

import "./upload-task-item";

export class UploadProgressDesktop extends UploadProgressBase {
  static define() {
    CVOperationQueue.define();
    if (!customElements.get("upload-progress-desktop")) {
      customElements.define("upload-progress-desktop", this);
    }
  }

  static styles = [
    sharedStyles,
    hostContentContainStyles,
    css`
      :host {
        inline-size: min(296px, calc(100vw - 32px));
        min-inline-size: 0;
        max-inline-size: 100%;
      }

      .upload-panel {
        display: block;
        background: var(--app-editorial-surface-overlay, var(--cv-color-surface));
        border-radius: var(--cv-radius-3);
        box-shadow: var(--cv-shadow-3);
        border: 1px solid var(--app-editorial-border-strong, var(--cv-color-border));
        overflow: hidden;
        color: var(--app-editorial-text-primary, var(--cv-color-text));
        --cv-operation-queue-padding: 0;
        --cv-operation-queue-border: 0;
        --cv-operation-queue-radius: 0;
        --cv-operation-queue-background: transparent;
        --cv-operation-queue-shadow: 0 0 0 transparent;
        --cv-operation-queue-busy-line-opacity: 0;
        --cv-operation-queue-summary-color: var(
          --app-editorial-text-primary,
          var(--cv-color-text)
        );
      }

      cv-operation-queue.upload-panel::part(base) {
        gap: 0;
      }

      cv-operation-queue.upload-panel::part(header) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-block-size: 40px;
        padding-block: var(--app-spacing-2);
        padding-inline: var(--app-spacing-3);
        background: var(--app-editorial-surface-overlay, var(--cv-color-surface));
        border-block-end: 1px solid
          var(--app-editorial-border-subtle, var(--cv-color-border-muted));
        color: var(--app-editorial-text-primary, var(--cv-color-text));
        cursor: pointer;
        user-select: none;

        &:hover {
          background: var(--app-editorial-interaction-hover-overlay, var(--cv-color-hover));
        }
      }

      cv-operation-queue.upload-panel::part(body) {
        min-block-size: 0;
      }

      cv-operation-queue.upload-panel::part(footer) {
        display: none;
      }

      .header-title {
        display: flex;
        align-items: center;
        min-inline-size: 0;
        gap: var(--app-spacing-2);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
        cursor: pointer;

        cv-icon {
          color: var(--cv-color-primary);
        }
      }

      .header-spinner {
        font-size: 14px;
        flex-shrink: 0;
      }

      .header-controls {
        display: flex;
        gap: var(--app-spacing-1);
      }

      .header-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 28px;
        block-size: 28px;
        padding: 0;
        border: none;
        border-radius: var(--cv-radius-1);
        background: transparent;
        color: var(--cv-color-text-muted);
        cursor: pointer;
        transition:
          background-color var(--cv-duration-fast) var(--cv-easing-standard),
          color var(--cv-duration-fast) var(--cv-easing-standard);

        &:hover {
          background: var(--cv-color-hover);
          color: var(--cv-color-text);
        }

        &:focus-visible {
          outline: 2px solid var(--cv-color-accent);
          outline-offset: 1px;
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
        max-block-size: 240px;
        overflow-y: auto;
        padding: 0;

        &::-webkit-scrollbar {
          inline-size: 6px;
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
        padding-block: var(--app-spacing-2);
        padding-inline: var(--app-spacing-3);
        background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
        border-block-start: 1px solid
          var(--app-editorial-border-subtle, var(--cv-color-border-muted));
      }

      .overall-stats {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: var(--cv-font-size-xs);
        color: var(--cv-color-text);
      }

      .overall-progress-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .overall-progress-bar {
        margin-block: 2px 4px;
      }

      .overall-size-info {
        text-align: center;
        font-size: var(--cv-font-size-xs);
        color: var(--cv-color-text-muted);
      }

      @media (prefers-reduced-motion: reduce) {
        .header-btn,
        .collapsible-wrapper {
          transition-duration: var(--cv-duration-instant, 0ms);
        }
      }
    `,
  ];

  private onClearClick(e: Event) {
    e.stopPropagation();
    this.model.clearCompleted();
  }

  render() {
    const m = this.model;
    if (!m) return nothing;

    const tasks = m.tasks();
    const stats = m.stats();
    const primaryStats = m.primaryStats();
    const summary = m.hudSummary();
    const displayedProgress = m.primaryDisplay.progress();
    const displayedLoadedBytes = m.primaryDisplay.loadedBytes();
    const minimized = m.minimized();
    const queueTone = summary.tone === "active" ? "info" : summary.tone;
    const transferLabel = i18n("file-manager:transfers", {
      total: isolateLtrText(String(stats.total)),
    });
    const overallProgressLabel = i18n("file-manager:overall-progress", {
      progress: isolateLtrText(String(Math.round(displayedProgress))),
    });
    const completedLabel = i18n("file-manager:completed-of-total", {
      completed: isolateLtrText(String(primaryStats.completed)),
      total: isolateLtrText(String(primaryStats.total)),
    });

    return html`
      <cv-operation-queue
        class="upload-panel"
        density="compact"
        .label=${transferLabel}
        .busy=${m.hasActiveTransfers()}
        .tone=${queueTone}
      >
          <div slot="summary" class="header-title" @click=${m.toggleMinimize}>
            <cv-icon name=${m.headerIcon()}></cv-icon>
            <span>${transferLabel}</span>
            ${
              m.hasActiveTransfers()
                ? html`<cv-spinner
                  class="header-spinner"
                  label=${i18n("file-manager:transfers-progress")}
                ></cv-spinner>`
                : ""
            }
          </div>
          <div slot="actions" class="header-controls">
            <cv-button unstyled
              class="header-btn"
              @click=${this.onClearClick}
              title=${i18n("button:clear-completed")}
            >
              <cv-icon name="trash"></cv-icon>
            </cv-button>
            <cv-button unstyled
              class="header-btn"
              @click=${m.toggleMinimize}
              title=${i18n(minimized ? "button:expand" : "button:collapse")}
            >
              <cv-icon name=${minimized ? "chevron-up" : "chevron-down"}></cv-icon>
            </cv-button>
          </div>

        <div class="collapsible-wrapper ${minimized ? "collapsed" : ""}">
          <div class="collapsible-content">
            <div class="tasks-container">
              ${tasks.map((task) => html`<upload-task-item .task=${task} compact></upload-task-item>`)}
            </div>

            <div class="overall-progress">
              <div class="overall-stats">
                <div class="overall-progress-info">
                  <span>${overallProgressLabel}</span>
                  <span>${completedLabel}</span>
                </div>
                <cv-progress
                  class="overall-progress-bar"
                  tone="upload"
                  value=${displayedProgress}
                  ?indeterminate=${primaryStats.uploading > 0 && primaryStats.totalBytes <= 0}
                  aria-label=${i18n("file-manager:transfers-progress")}
                ></cv-progress>
                <div class="overall-size-info">
                  <bdi dir="ltr"
                    >${formatFileSize(displayedLoadedBytes)} / ${formatFileSize(primaryStats.totalBytes)}</bdi
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </cv-operation-queue>
    `;
  }
}

UploadProgressDesktop.define();
