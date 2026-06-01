import {nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from 'root/i18n'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {formatDate, formatFileSize} from '../virtual-file-list/virtual-file-list.model-helpers'
import type {PMSummaryRailItem} from '../../../passmanager/components/summary-rail'
import {
  notesQuickViewModel,
  type NotesQuickViewMode,
  type NotesQuickViewRow,
  type NotesQuickViewTreeDirectory,
  type NotesQuickViewTreeItem,
} from './notes-quick-view.model'

type EmptyStateKind = 'unavailable' | 'empty' | 'filtered'
type RenderRowOptions = {
  tree?: boolean
  level?: number
}

export abstract class NotesQuickViewBase extends ReatomLitElement {
  protected readonly model = notesQuickViewModel

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected handleQueryInput(event: InputEvent) {
    const target = event.target as HTMLInputElement | null
    this.model.actions.setQuery(target?.value ?? '')
  }

  protected handleClearFilters() {
    this.model.actions.clearFilters()
  }

  protected handleViewModeClick(event: Event) {
    const target = event.currentTarget as HTMLButtonElement | null
    const viewMode = target?.value === 'hierarchy' ? 'hierarchy' : 'flat'
    this.model.actions.setViewMode(viewMode)
  }

  protected handleToggleDirectory(event: Event) {
    const target = event.currentTarget as HTMLButtonElement | null
    this.model.actions.toggleDirectory(target?.value ?? '')
  }

  protected handleOpenNote(event: Event) {
    const target = event.currentTarget as HTMLElement | null
    this.model.actions.openNoteById(target?.dataset['rowId'] ?? '')
  }

  protected handleOpenNoteKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    this.handleOpenNote(event)
  }

  protected renderHeader() {
    return html`
      <header class="quick-view__header" aria-label=${i18n('notes:quick_view:title' as never)}>
        ${this.renderHeaderSummary()}
        ${this.renderControls()}
      </header>
    `
  }

  protected renderHeaderSummary(): TemplateResult | typeof nothing {
    return this.renderSummary()
  }

  protected renderSummary(): TemplateResult {
    const summary = this.model.state.summary()

    return html`
      <pm-summary-rail
        class="quick-view__summary-rail"
        .items=${this.getSummaryItems(summary)}
        .label=${i18n('notes:quick_view:summary:label' as never)}
      ></pm-summary-rail>
    `
  }

  private getSummaryItems(summary: {total: number; visible: number}): PMSummaryRailItem[] {
    return [
      {id: 'total', label: i18n('notes:quick_view:summary:total' as never), value: summary.total},
      {id: 'visible', label: i18n('notes:quick_view:summary:visible' as never), value: summary.visible},
    ]
  }

  protected renderControls() {
    return html`
      <div class="controls">
        <div class="view-switch" role="group" aria-label=${i18n('notes:quick_view:view_mode' as never)}>
          ${this.renderViewModeButton('flat', 'list', i18n('notes:quick_view:view_mode:flat' as never))}
          ${this.renderViewModeButton(
            'hierarchy',
            'folder',
            i18n('notes:quick_view:view_mode:hierarchy' as never),
          )}
        </div>
        <input
          class="search"
          type="search"
          .value=${this.model.state.query()}
          placeholder=${i18n('notes:quick_view:search' as never)}
          aria-label=${i18n('notes:quick_view:search' as never)}
          @input=${this.handleQueryInput}
        />
        ${this.model.state.hasActiveFilters()
          ? html`
              <button
                class="clear-filters clear-filters--compact"
                type="button"
                aria-label=${i18n('notes:quick_view:clear_filters' as never)}
                title=${i18n('notes:quick_view:clear_filters' as never)}
                @click=${this.handleClearFilters}
              >
                <cv-icon name="x" aria-hidden="true"></cv-icon>
              </button>
            `
          : nothing}
      </div>
    `
  }

  protected renderViewModeButton(mode: NotesQuickViewMode, icon: string, label: string): TemplateResult {
    const active = this.model.state.viewMode() === mode

    return html`
      <button
        class="view-switch__button"
        type="button"
        value=${mode}
        data-view-mode=${mode}
        aria-label=${label}
        aria-pressed=${String(active)}
        title=${label}
        @click=${this.handleViewModeClick}
      >
        <cv-icon name=${icon} aria-hidden="true"></cv-icon>
        <span class="sr-only">${label}</span>
      </button>
    `
  }

  protected renderContent() {
    if (!this.model.state.hasCatalog()) {
      return this.renderEmptyState('unavailable')
    }

    const rows = this.model.state.rows()
    if (rows.length === 0) {
      return this.renderEmptyState('empty')
    }

    const visibleRows = this.model.state.visibleRows()
    if (visibleRows.length === 0) {
      return this.renderEmptyState('filtered')
    }

    if (this.model.state.viewMode() === 'hierarchy') {
      return html`
        <div class="tree" role="tree" aria-label=${i18n('notes:quick_view:view_mode:hierarchy' as never)}>
          ${this.model.state.visibleTree().map((item) => this.renderTreeItem(item))}
        </div>
      `
    }

    return html`<div class="rows" role="list">${visibleRows.map((row) => this.renderRow(row))}</div>`
  }

  protected renderTreeItem(item: NotesQuickViewTreeItem): TemplateResult {
    if (item.type === 'note') {
      return this.renderRow(item.row, {tree: true, level: item.level})
    }

    return this.renderDirectory(item)
  }

  protected renderDirectory(node: NotesQuickViewTreeDirectory): TemplateResult {
    const labelKey = node.expanded
      ? 'notes:quick_view:collapse_folder'
      : 'notes:quick_view:expand_folder'
    const toggleLabel = i18n(labelKey as never, {name: node.name})

    return html`
      <section class="tree-folder" data-folder-path=${node.path}>
        <div
          class="folder-row"
          role="treeitem"
          aria-expanded=${String(node.expanded)}
          aria-level=${String(node.level)}
        >
          <button
            class="folder-toggle"
            type="button"
            value=${node.path}
            aria-label=${toggleLabel}
            title=${toggleLabel}
            @click=${this.handleToggleDirectory}
          >
            <cv-icon name=${node.expanded ? 'chevron-down' : 'chevron-right'} aria-hidden="true"></cv-icon>
          </button>
          <div class="folder-icon" aria-hidden="true">
            <cv-icon name=${node.expanded ? 'folder-open' : 'folder'}></cv-icon>
          </div>
          <span class="folder-name" title=${node.path}>${node.name}</span>
          <span class="folder-count">${i18n('notes:quick_view:folder_count', {count: String(node.noteCount)})}</span>
        </div>
        ${node.expanded
          ? html`<div class="tree-children" role="group">
              ${node.children.map((item) => this.renderTreeItem(item))}
            </div>`
          : nothing}
      </section>
    `
  }

  protected renderRow(row: NotesQuickViewRow, options: RenderRowOptions = {}): TemplateResult {
    const openLabel = `${i18n('notes:quick_view:open' as never)}: ${row.fileName}`
    const parent = row.parentPath || '/'
    const role = options.tree ? 'treeitem' : 'listitem'

    return html`
      <article
        class=${options.tree ? 'row row--tree' : 'row'}
        role=${role}
        aria-level=${options.tree ? String(options.level ?? 1) : nothing}
        aria-label=${openLabel}
        title=${openLabel}
        data-row-id=${row.id}
        tabindex="0"
        @click=${this.handleOpenNote}
        @keydown=${this.handleOpenNoteKeydown}
      >
        <div class="row__icon" aria-hidden="true">
          <cv-icon name="file-text"></cv-icon>
        </div>
        <div class="row__meta">
          <div class="row__heading">
            <h3 class="row__title" title=${row.fileName}>${row.fileName}</h3>
          </div>
          <div class="row__details">
            <span class="row__detail row__path" title=${row.path}>${parent}</span>
            <span class="row__detail">${formatFileSize(row.size)}</span>
            <span class="row__detail">${formatDate(row.lastModified)}</span>
          </div>
        </div>
      </article>
    `
  }

  private renderEmptyState(kind: EmptyStateKind) {
    const titleKey =
      kind === 'filtered'
        ? 'notes:quick_view:empty_filtered:title'
        : kind === 'unavailable'
          ? 'notes:quick_view:unavailable:title'
          : 'notes:quick_view:empty:title'
    const descriptionKey =
      kind === 'filtered'
        ? 'notes:quick_view:empty_filtered:description'
        : kind === 'unavailable'
          ? 'notes:quick_view:unavailable:description'
          : 'notes:quick_view:empty:description'

    const content = html`
      <section class="empty-state" role="status">
        <cv-icon name="file-text" size="lg" aria-hidden="true"></cv-icon>
        <p class="empty-state__title">${i18n(titleKey as never)}</p>
        <p class="empty-state__description">${i18n(descriptionKey as never)}</p>
        ${kind === 'empty' ? renderGuidanceInline('notes.create-note', 'notes') : nothing}
        ${kind === 'filtered'
          ? html`
              <button class="clear-filters" type="button" @click=${this.handleClearFilters}>
                <cv-icon name="x" aria-hidden="true"></cv-icon>
                ${i18n('notes:quick_view:clear_filters' as never)}
              </button>
            `
          : nothing}
      </section>
    `

    if (kind !== 'empty') {
      return content
    }

    return html`
      <cv-guidance-anchor anchor-id="notes.create-note" surface="notes" owner="notes">
        ${content}
      </cv-guidance-anchor>
    `
  }
}
