import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'
import type {FullChromVoidState} from '@chromvoid/scheme'

import {i18n} from 'root/i18n'
import {
  cardShellStyles,
  motionPrimitiveStyles,
  pulseIndicatorStyles,
  sharedStyles,
  surfacePrimitiveStyles,
} from 'root/shared/ui/shared-styles'
import {formatBytesMB} from 'root/utils/formatters'

export class StorageWidget extends XLitElement {
  static define() {
    if (!customElements.get('storage-widget')) {
      customElements.define('storage-widget', this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    ...sharedStyles,
    cardShellStyles,
    motionPrimitiveStyles,
    pulseIndicatorStyles,
    surfacePrimitiveStyles,
    css`
      /* ========== СОВРЕМЕННЫЙ ВИДЖЕТ ХРАНИЛИЩА ========== */

      :host {
        --file-manager-section-accent: var(--gradient-success);
        --file-manager-section-title-bg: linear-gradient(
          135deg,
          var(--cv-color-surface) 0%,
          var(--cv-color-surface-2) 100%
        );
      }

      .section-title {
        padding-block: var(--app-spacing-2);
        padding-inline: var(--app-spacing-3);
      }

      .storage {
        display: grid;
        gap: var(--app-spacing-3);
        padding-inline: var(--app-spacing-3);
        padding-block-end: var(--app-spacing-3);
      }

      .usage-summary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--cv-font-size-xs);
        color: var(--cv-color-text-muted);
        margin-block-end: var(--app-spacing-1);
      }

      .usage-percent {
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
      }

      .bar {
        position: relative;
        block-size: 16px;
        border-radius: var(--cv-radius-3);
        background: var(--cv-color-surface-2);
        overflow: hidden;
        border: 1px solid var(--cv-color-border-muted);
        box-shadow: inset 0 2px 4px var(--cv-alpha-black-5);

        &::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, var(--cv-alpha-white-10) 0%, transparent 100%);
          pointer-events: none;
          border-radius: var(--cv-radius-3);
        }

        .used {
          position: absolute;
          inset-inline-start: 0;
          inset-block-start: 0;
          inset-block-end: 0;
          inline-size: var(--used);
          background: var(--gradient-primary);
          transition: inline-size var(--cv-duration-normal) var(--cv-easing-standard);
          will-change: inline-size;
          border-radius: var(--cv-radius-3);
          box-shadow: var(--cv-shadow-sm);

          &::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, var(--cv-alpha-white-30) 0%, transparent 50%);
            border-radius: var(--cv-radius-3);
          }

          &.high {
            background: var(--gradient-warning, var(--cv-color-warning));
          }

          &.critical {
            background: var(--gradient-danger, var(--cv-color-danger));
          }
        }
      }

      .meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--app-spacing-2);
        font-size: var(--cv-font-size-xs);
        color: var(--cv-color-text-muted);
        background: var(--cv-color-surface-2);
        padding: var(--app-spacing-2);
        border-radius: var(--cv-radius-1);
        border: 1px solid var(--cv-color-border-muted);
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-1);
        font-weight: var(--cv-font-weight-medium);
      }

      .storage-icon {
        inline-size: 12px;
        block-size: 12px;
        color: var(--cv-color-success);
      }

      .used-icon {
        inline-size: 12px;
        block-size: 12px;
        color: var(--cv-color-primary);
      }
    `,
  ]

  protected render() {
    const state = (window as any).state?.data?.() as Partial<FullChromVoidState> | undefined
    const free = state?.PhysicalFreeSpaceMB ?? 0
    const total = state?.PhysicalTotalSpaceMB ?? 0
    const used = Math.max(0, total - free)
    const usedPercent = total > 0 ? (used / total) * 100 : 0

    // Определяем уровень заполненности
    const usageLevel = usedPercent > 90 ? 'critical' : usedPercent > 75 ? 'high' : ''

    return html`
      <div class="section-title">
        <cv-icon name="database"></cv-icon>
        ${i18n('sidebar:storage')}
      </div>
      <div class="storage">
        <div class="usage-summary">
          <span>${i18n('storage:used' as any)}</span>
          <span class="usage-percent">${usedPercent.toFixed(1)}%</span>
        </div>

        <div class="bar" style="--used: ${usedPercent.toFixed(1)}%">
          <div class="used ${usageLevel}"></div>
        </div>

        <div class="meta">
          <div class="meta-item">
            <cv-icon class="used-icon" name="disc-fill"></cv-icon>
            <span>${i18n('storage:used-short' as any, {value: formatBytesMB(used)})}</span>
          </div>
          <div class="meta-item">
            <cv-icon class="storage-icon" name="hdd"></cv-icon>
            <span>${i18n('storage:total-short' as any, {value: formatBytesMB(total)})}</span>
          </div>
        </div>
      </div>
    `
  }
}
