import {computed} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {CVIcon} from '@chromvoid/uikit'
import {hostContentContainStyles} from 'root/shared/ui/shared-styles'
import {getAppContext} from 'root/shared/services/app-context'

import {Entry, i18n} from '@project/passmanager'
import type {Group} from '@project/passmanager'
import {type GroupedEntries, groupEntries} from '@project/passmanager'
import {listGroupStyles, listItemStyles} from './list-item-styles'
import {groupBy, sortDirection, sortField} from './sort-controls'
import {pmModel} from '../../password-manager.model'

// Создаем реактивное значение для триггера перерисовки
const sortState = computed(() => ({
  groupBy: groupBy(),
  sortField: sortField(),
  sortDirection: sortDirection(),
}))

// TODO: viewMode should be implemented as a reactive state
const viewMode = (): 'default' | 'compact' | 'dense' => 'default'

export class PMList extends XLitElement {
  static define() {
    customElements.define('pm-entries-list', this)
    CVIcon.define()
  }

  static styles = [
    hostContentContainStyles,
    listItemStyles,
    listGroupStyles,
    css`
      :host {
        overflow: hidden auto;
        padding-inline: 4px;
        scrollbar-width: thin;
        scrollbar-color: var(--cv-color-border) transparent;
        scrollbar-gutter: stable;

        &::-webkit-scrollbar {
          inline-size: 6px;
        }

        &::-webkit-scrollbar-track {
          background: transparent;
        }

        &::-webkit-scrollbar-thumb {
          background-color: var(--cv-color-border);
          border-radius: 3px;
          transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);

          &:hover {
            background-color: var(--cv-color-border-strong);
          }
        }
      }

      .folder-item {
        display: grid;
        align-items: center;
        grid-template-columns: min-content 1fr min-content;
        gap: var(--cv-space-2);
        padding-block: var(--cv-space-2);
        padding-inline: var(--cv-space-3);
        margin-block: 2px;
        border-radius: var(--cv-radius-2);
        border: 1px solid transparent;
        background: var(--cv-color-surface-2);
        transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);
        cursor: pointer;

        &:hover {
          background: var(--cv-color-primary-subtle);
          border-color: var(--cv-color-border-muted);
          transform: translateY(-1px);
          box-shadow: var(--cv-shadow-sm);
        }

        &.empty {
          opacity: 0.6;
        }

        &.selected {
          position: relative;
          background: var(--cv-color-primary-muted);
          border-color: var(--cv-color-border-accent);
          box-shadow: var(--cv-shadow-1), var(--cv-shadow-2);

          &::before {
            content: '';
            position: absolute;
            inset-inline-start: 0;
            inset-block: 4px;
            inline-size: 2px;
            border-radius: 0 2px 2px 0;
            background: linear-gradient(
              180deg,
              var(--cv-color-primary) 0%,
              color-mix(in oklch, var(--cv-color-primary) 75%, white) 100%
            );
            box-shadow: 0 0 6px color-mix(in oklch, var(--cv-color-primary) 50%, transparent);
          }

          &:hover {
            background: var(--cv-color-border-accent);
            border-color: var(--cv-color-primary);
            box-shadow:
              var(--cv-shadow-2),
              0 0 12px color-mix(in oklch, var(--cv-color-primary) 40%, transparent);
          }

          .folder-name {
            color: var(--cv-color-on-primary);
          }

          .folder-count {
            color: var(--cv-color-on-primary);
            background: color-mix(in oklch, var(--cv-color-primary-muted) 80%, var(--cv-color-primary) 20%);
            border-color: var(--cv-color-border-accent);
          }
        }

        .folder-name {
          font-size: var(--cv-font-size-sm);
          font-weight: var(--cv-font-weight-medium);
          color: var(--cv-color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .folder-count {
          font-size: 0.65rem;
          color: var(--cv-color-text-muted);
          background: var(--cv-color-surface-2);
          padding-block: 1px;
          padding-inline: 4px;
          border-radius: var(--cv-radius-1);
          border: 1px solid var(--cv-color-border);
        }

        @container (max-width: 280px) {
          padding: calc(var(--cv-space-2) * 0.75);
          gap: calc(var(--cv-space-2) * 0.75);

          .folder-count {
            display: none;
          }
        }
      }

      .folder-custom-icon {
        width: 18px;
        height: 18px;
        --pm-avatar-radius: 5px;
        --pm-avatar-image-fit: contain;
        --pm-avatar-image-padding: 2px;
        --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 2%);
        --pm-avatar-shadow-opacity: 30%;
        --pm-avatar-icon-size: 16px;
      }

      .folder-item.selected .folder-custom-icon {
        --pm-avatar-contrast: calc(var(--pm-avatar-contrast-base) + 8%);
        --pm-avatar-border-source: var(--cv-color-border-accent);
        --pm-avatar-shadow-opacity: 36%;
      }

      .entries-list {
        display: grid;
        gap: 2px;
        content-visibility: auto;
        contain-intrinsic-size: 1px 600px;
        padding-block: 4px;
      }

      .empty-state {
        display: grid;
        gap: var(--cv-space-2, 8px);
        justify-items: center;
        text-align: center;
        padding: var(--cv-space-6, 24px);
        border: 1px dashed var(--cv-color-border);
        border-radius: var(--cv-radius-md, var(--cv-radius-2));
        background: var(--cv-color-surface-elevated, var(--cv-color-surface));
        color: var(--cv-color-text-muted);
      }

      .empty-state cv-icon {
        color: var(--cv-color-text-muted);
      }

      .empty-state-title {
        margin: 0;
        font-weight: var(--cv-font-weight-semibold);
        color: var(--cv-color-text);
      }

      .empty-state-description {
        margin: 0;
        font-size: var(--cv-font-size-sm);
      }
    `,
  ]

  private onGroupClick(group: Group) {
    pmModel.openItem(group)
  }

  private renderEntry(entry: Entry) {
    const currentMode = viewMode()
    const isMobile = getAppContext().store.layoutMode() === 'mobile'
    if (isMobile) {
      return html`
        <pm-entry-list-item-mobile
          .entry=${entry}
          .viewMode=${currentMode}
          view-mode=${currentMode}
        ></pm-entry-list-item-mobile>
      `
    }

    return html`
      <pm-entry-list-item
        .entry=${entry}
        .viewMode=${currentMode}
        view-mode=${currentMode}
      ></pm-entry-list-item>
    `
  }

  private renderGroup(group: Group) {
    const entries = group.searched()
    const isEmpty = entries.length === 0
    const current = window.passmanager?.showElement()
    const isSelected = current === group

    return html`
      <div
        class="folder-item ${isEmpty ? 'empty' : ''} ${isSelected ? 'selected' : ''}"
        @click=${() => this.onGroupClick(group)}
        role="button"
        tabindex="0"
      >
        <pm-avatar-icon class="folder-custom-icon" .item=${group} icon="folder"></pm-avatar-icon>
        <span class="folder-name">${group.name}</span>
        <span class="folder-count">${entries.length}</span>
      </div>
    `
  }

  private renderGroupedEntries(groupedEntries: GroupedEntries) {
    if (groupedEntries.entries.length === 0) {
      return nothing
    }

    const showGroupHeader = groupedEntries.groupName !== ''

    return html`
      <div class="list-group">
        ${showGroupHeader
          ? html`
              <div class="group-header">
                ${groupedEntries.icon ? html` <cv-icon name=${groupedEntries.icon}></cv-icon> ` : nothing}
                ${groupedEntries.groupName}
                <span class="group-count">${groupedEntries.count}</span>
              </div>
            `
          : nothing}
        ${groupedEntries.entries.map((entry) => this.renderEntry(entry))}
      </div>
    `
  }

  private renderEmptyState() {
    return html`
      <div class="empty-state">
        <cv-icon name="folder-x" size="l" aria-hidden="true"></cv-icon>
        <div class="empty-state-title">${i18n('entry:empty_search:title')}</div>
        <div class="empty-state-description">${i18n('entry:empty_search:description')}</div>
      </div>
    `
  }

  private renderSkeletonLoader() {
    return html`
      ${Array.from({length: 5}).map(
        () => html`
          <div class="skeleton-item">
            <div class="skeleton-icon"></div>
            <div class="skeleton-content">
              <div class="skeleton-title"></div>
              <div class="skeleton-subtitle"></div>
            </div>
          </div>
        `,
      )}
    `
  }

  render() {
    if (!window.passmanager) {
      return this.renderSkeletonLoader()
    }

    // Триггер реактивности - читаем sortState
    const _state = sortState()

    const groups = window.passmanager.groups
    const subGroups = groups.slice(1)

    // Собираем все записи из всех групп
    const entries: Entry[] = []
    groups.forEach((group) => {
      const searched = group.searched()
      searched.forEach((item) => {
        if (item instanceof Entry) {
          entries.push(item)
        }
      })
    })

    if (entries.length === 0 && subGroups.length === 0) {
      return this.renderEmptyState()
    }

    // Получаем текущие настройки сортировки и группировки
    const currentSortField = _state.sortField
    const currentSortDirection = _state.sortDirection
    const currentGroupBy = _state.groupBy

    const groupedEntries = groupEntries(entries, currentGroupBy, currentSortField, currentSortDirection)

    return html`
      <div class="entries-list">
        <!-- Grouped entries only -->
        ${groupedEntries.map((group) => this.renderGroupedEntries(group))}
      </div>
    `
  }
}
