import {nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {isolateBidiText, isolateLtrText} from '@project/i18n/pure'

import {i18n} from 'root/i18n'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {
  WorkspaceDashboardHeader,
  type WorkspaceDashboardHeaderControlsModel,
  type WorkspaceDashboardHeaderViewModeOption,
} from '../workspace-dashboard-header'
import {
  notesQuickViewModel,
  type NotesQuickViewDisplayMode,
  type NotesQuickViewRow,
  type NotesQuickViewRowView,
  type NotesQuickViewTreeDirectory,
  type NotesQuickViewTreeItem,
} from './notes-quick-view.model'
import {getNotesQuickViewSortLabel} from './notes-quick-view.presentation'

type EmptyStateKind = 'unavailable' | 'error' | 'empty' | 'filtered'
type RenderRowOptions = {
  tree?: boolean
  level?: number
}

const createTechnicalMetadataLabel = (parts: string[]): string => parts.map(isolateLtrText).join(' · ')

const renderTechnicalMetadataParts = (parts: string[]): TemplateResult[] =>
  parts.map(
    (part) => html`
      <span class="note-card__detail" title=${isolateLtrText(part)}><bdi dir="ltr">${part}</bdi></span>
    `,
  )

export function getNotesQuickViewDisplayModeOptions(): WorkspaceDashboardHeaderViewModeOption[] {
  return [
    {value: 'list', icon: 'list', label: i18n('notes:quick_view:view_mode:list' as never)},
    {value: 'grid', icon: 'layout-grid', label: i18n('notes:quick_view:view_mode:grid' as never)},
    {value: 'tree', icon: 'folder-tree', label: i18n('notes:quick_view:view_mode:tree' as never)},
  ]
}

function isNotesQuickViewDisplayMode(value: string): value is NotesQuickViewDisplayMode {
  return value === 'list' || value === 'grid' || value === 'tree'
}

export const notesQuickViewHeaderControlsModel: WorkspaceDashboardHeaderControlsModel = {
  search: {
    value: notesQuickViewModel.state.query,
    placeholder: () => i18n('notes:quick_view:search' as never),
    ariaLabel: () => i18n('notes:quick_view:search' as never),
    setValue: notesQuickViewModel.actions.setQuery,
    clear: () => notesQuickViewModel.actions.setQuery(''),
  },
  filters: {
    chips: notesQuickViewModel.state.filterChips,
    value: notesQuickViewModel.state.activeFilterKey,
    ariaLabel: () => i18n('notes:quick_view:filters' as never),
    setValue: notesQuickViewModel.actions.setFilterKey,
  },
  summary: {
    label: () => notesQuickViewModel.state.summary().label,
  },
  sort: {
    label: () => getNotesQuickViewSortLabel(notesQuickViewModel.state.sortMode()),
    ariaLabel: () => i18n('notes:quick_view:sort:label' as never),
    title: () => i18n('notes:quick_view:sort:label' as never),
    mode: notesQuickViewModel.state.sortMode,
    activate: notesQuickViewModel.actions.cycleSortMode,
  },
  viewMode: {
    value: notesQuickViewModel.state.displayMode,
    ariaLabel: () => i18n('notes:quick_view:view_mode' as never),
    options: getNotesQuickViewDisplayModeOptions,
    setValue(value: string): void {
      if (isNotesQuickViewDisplayMode(value)) {
        notesQuickViewModel.actions.setDisplayMode(value)
      }
    },
  },
}

export function defineNotesQuickViewUikitControls(): void {
  CVButton.define()
  WorkspaceDashboardHeader.define()
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

  protected handleClearFilters() {
    this.model.actions.clearFilters()
  }

  protected handleRetryLoad() {
    this.model.actions.retryLoad()
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

  protected renderHeader(
    slot?: string,
    controlsModel: WorkspaceDashboardHeaderControlsModel = notesQuickViewHeaderControlsModel,
  ) {
    return html`
      <workspace-dashboard-header
        slot=${slot ?? nothing}
        surface="notes"
        embedded
        .controlsModel=${controlsModel}
      ></workspace-dashboard-header>
    `
  }

  protected renderContent() {
    if (!this.model.state.hasCatalog()) {
      return this.renderEmptyState('unavailable')
    }

    const rows = this.model.state.rows()
    if (rows.length === 0 && this.model.state.loadErrorKey()) {
      return this.renderEmptyState('error')
    }

    if (rows.length === 0) {
      return this.renderEmptyState('empty')
    }

    const visibleRows = this.model.state.visibleRows()
    if (visibleRows.length === 0) {
      return this.renderEmptyState('filtered')
    }

    if (this.model.state.viewMode() === 'hierarchy') {
      return html`
        <div class="tree" role="tree" aria-label=${i18n('notes:quick_view:view_mode:tree' as never)}>
          ${this.model.state.visibleTree().map((item) => this.renderTreeItem(item))}
        </div>
      `
    }

    if (this.model.state.displayMode() === 'grid') {
      return html`
        <div class="notes-grid" role="list">
          ${this.model.state.visibleRowViews().map((view) => this.renderGridCard(view))}
        </div>
      `
    }

    return html`
      <div class="rows" role="list">
        ${this.model.state.visibleRowViews().map((view) => this.renderListCard(view))}
      </div>
    `
  }

  protected renderTreeItem(item: NotesQuickViewTreeItem): TemplateResult {
    if (item.type === 'note') {
      return this.renderRow(item.row, {tree: true, level: item.level})
    }

    return this.renderDirectory(item)
  }

  protected renderDirectory(node: NotesQuickViewTreeDirectory): TemplateResult {
    const labelKey = node.expanded ? 'notes:quick_view:collapse_folder' : 'notes:quick_view:expand_folder'
    const toggleLabel = i18n(labelKey as never, {name: isolateBidiText(node.name)})

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
          <span class="folder-name" title=${isolateLtrText(node.path)}
            ><bdi dir="auto">${node.name}</bdi></span
          >
          <span class="folder-count"
            >${i18n('notes:quick_view:folder_count', {count: isolateLtrText(String(node.noteCount))})}</span
          >
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
    const view = this.model.state.rowViewsById().get(row.id) ?? {
      id: row.id,
      row,
      title: row.fileName,
      fileLabel: row.fileName,
      excerpt: row.parentPath || '/',
      excerptDirection: 'ltr' as const,
      parentLabel: row.parentPath || '/',
      previewTitle: row.fileName,
      metadataParts: [],
      compactMetadataParts: [],
      previewTruncated: false,
    }

    return this.renderListCard(view, options)
  }

  protected renderListCard(view: NotesQuickViewRowView, options: RenderRowOptions = {}): TemplateResult {
    const row = view.row
    const openLabel = `${i18n('notes:quick_view:open' as never)}: ${isolateBidiText(row.fileName)}`
    const role = options.tree ? 'treeitem' : 'listitem'

    return html`
      <article
        class=${options.tree ? 'row row--tree note-card note-card--tree' : 'row note-card note-card--list'}
        role=${role}
        aria-level=${options.tree ? String(options.level ?? 1) : nothing}
        aria-label=${openLabel}
        title=${openLabel}
        data-row-id=${row.id}
        tabindex="0"
        @click=${this.handleOpenNote}
        @keydown=${this.handleOpenNoteKeydown}
      >
        <div class="note-card__icon" aria-hidden="true">
          <cv-icon name="notebook-text"></cv-icon>
        </div>
        <div class="note-card__body">
          <div class="note-card__heading">
            <h3 class="note-card__title" title=${isolateBidiText(row.fileName)}>
              <bdi dir="auto">${view.title}</bdi>
            </h3>
            <span class="note-card__badge"><bdi dir="ltr">MD</bdi></span>
          </div>
          <p class="note-card__excerpt"><bdi dir=${view.excerptDirection}>${view.excerpt}</bdi></p>
          <div class="note-card__details" aria-label=${createTechnicalMetadataLabel(view.metadataParts)}>
            ${renderTechnicalMetadataParts(view.metadataParts)}
          </div>
        </div>
      </article>
    `
  }

  protected renderGridCard(view: NotesQuickViewRowView): TemplateResult {
    const row = view.row
    const openLabel = `${i18n('notes:quick_view:open' as never)}: ${isolateBidiText(row.fileName)}`

    return html`
      <article
        class="row note-card note-card--grid"
        role="listitem"
        aria-label=${openLabel}
        title=${openLabel}
        data-row-id=${row.id}
        tabindex="0"
        @click=${this.handleOpenNote}
        @keydown=${this.handleOpenNoteKeydown}
      >
        <div class="note-card__preview">
          <p class="note-card__preview-title"><bdi dir="auto">${view.previewTitle}</bdi></p>
          <p class="note-card__preview-copy"><bdi dir=${view.excerptDirection}>${view.excerpt}</bdi></p>
        </div>
        <div class="note-card__grid-footer">
          <h3 class="note-card__title note-card__title--grid" title=${isolateBidiText(row.fileName)}>
            <bdi dir="auto">${view.title}</bdi>
          </h3>
          <div
            class="note-card__details note-card__details--grid"
            aria-label=${createTechnicalMetadataLabel(view.compactMetadataParts)}
          >
            ${renderTechnicalMetadataParts(view.compactMetadataParts)}
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
          : kind === 'error'
            ? 'notes:quick_view:error:title'
            : 'notes:quick_view:empty:title'
    const descriptionKey =
      kind === 'filtered'
        ? 'notes:quick_view:empty_filtered:description'
        : kind === 'unavailable'
          ? 'notes:quick_view:unavailable:description'
          : kind === 'error'
            ? 'notes:quick_view:error:description'
            : 'notes:quick_view:empty:description'

    const content = html`
      <cv-empty-state
        icon="file-text"
        headline=${i18n(titleKey as never)}
        description=${i18n(descriptionKey as never)}
      >
        ${kind === 'empty' ? renderGuidanceInline('notes.create-note', 'notes') : nothing}
        ${kind === 'filtered'
          ? html`
              <cv-button
                class="clear-filters"
                slot="actions"
                variant="ghost"
                size="medium"
                type="button"
                @click=${this.handleClearFilters}
              >
                <cv-icon slot="prefix" name="x" aria-hidden="true"></cv-icon>
                ${i18n('notes:quick_view:clear_filters' as never)}
              </cv-button>
            `
          : nothing}
        ${kind === 'error'
          ? html`
              <cv-button
                class="retry-load"
                slot="actions"
                preset="action-primary-subtle"
                size="medium"
                type="button"
                @click=${this.handleRetryLoad}
              >
                <cv-icon slot="prefix" name="refresh-cw" aria-hidden="true"></cv-icon>
                ${i18n('button:retry' as never)}
              </cv-button>
            `
          : nothing}
      </cv-empty-state>
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
