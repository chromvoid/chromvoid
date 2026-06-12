import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {animationStyles, sharedStyles} from 'root/shared/ui/shared-styles'
import {
  beginMobileFilePickerSession,
  type MobileFilePickerSession,
} from 'root/shared/services/mobile-file-picker-session'
import {DesktopShellToolbar} from 'root/features/shell/components/desktop-shell-toolbar'

import {BreadcrumbsNav} from './breadcrumbs-nav'
import {createDefaultDashboardHeaderFilters, DashboardHeaderModel} from './dashboard-header.model'
import {getSortLabel, getViewLabel} from './file-manager-labels'
import type {SearchFilters, ViewMode} from 'root/shared/contracts/file-manager'
import {
  createFileSearchFilterActions,
  type FileSearchFilterActions,
} from '../models/file-search-filters.model'

const VIEW_MODE_OPTIONS: Array<{mode: ViewMode; icon: string}> = [
  {mode: 'list', icon: 'list'},
  {mode: 'table', icon: 'table'},
  {mode: 'grid', icon: 'grid'},
]

export class DashboardHeader extends ReatomLitElement {
  static define() {
    BreadcrumbsNav.define()
    DesktopShellToolbar.define()

    if (!customElements.get('dashboard-header')) {
      customElements.define('dashboard-header', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      currentPath: {type: String, attribute: 'current-path'},
      filters: {type: Object},
      totalFiles: {type: Number, attribute: 'total-files'},
      filteredFiles: {type: Number, attribute: 'filtered-files'},
      selectedCount: {type: Number, attribute: 'selected-count'},
      filterActions: {attribute: false},
    }
  }

  declare currentPath: string
  declare filters: SearchFilters
  declare totalFiles: number
  declare filteredFiles: number
  declare selectedCount: number
  declare filterActions: FileSearchFilterActions | null

  private readonly model = new DashboardHeaderModel()
  private readonly legacyFilterActions = createFileSearchFilterActions({
    read: () => this.model.filters(),
    write: (next) => this.dispatchFiltersChange(next),
  })
  private filePickerSession: MobileFilePickerSession | null = null

  constructor() {
    super()
    this.currentPath = '/'
    this.filters = createDefaultDashboardHeaderFilters()
    this.totalFiles = 0
    this.filteredFiles = 0
    this.selectedCount = 0
    this.filterActions = null
    this.syncModelFromProps()
  }

  static styles = [
    sharedStyles,
    animationStyles,
    css`
      :host {
        display: block;
        contain: style;
      }

      #file-input {
        display: none;
      }

      file-search {
        --search-padding: 0;
        --search-background: transparent;
        --search-border: none;
        inline-size: 100%;
        min-inline-size: 0;
      }

      desktop-shell-toolbar {
        --search-padding: 0;
        --desktop-shell-toolbar-padding-block: var(--app-toolbar-padding-block);
        --desktop-shell-toolbar-padding-inline: var(--app-toolbar-padding-inline);
        --desktop-shell-toolbar-padding-inline-wide: var(--app-toolbar-padding-inline-wide);
        --desktop-shell-toolbar-two-row-row-gap: var(--app-toolbar-two-row-row-gap);
        --desktop-shell-toolbar-two-row-column-gap: var(--app-toolbar-two-row-column-gap);
        --desktop-shell-toolbar-border-color: var(--app-toolbar-border-color);
        --files-toolbar-control-height: var(--app-toolbar-control-height);
        --files-toolbar-control-radius: var(--app-toolbar-control-radius);
        --files-toolbar-control-font-size: var(--app-toolbar-control-font-size);
        --files-toolbar-control-font-weight: var(--app-toolbar-control-font-weight);
      }

      .breadcrumbs-section,
      .actions-section,
      .view-mode-section,
      .filters-section {
        display: flex;
        align-items: center;
        min-inline-size: 0;
      }

      .filters-section {
        justify-content: center;
        min-inline-size: 0;
      }

      .breadcrumbs-section breadcrumbs-nav {
        flex: 1;
        min-inline-size: 0;
      }

      .filters-section file-search {
        --file-search-control-height: var(--files-toolbar-control-height);
        --file-search-control-radius: var(--files-toolbar-control-radius);
        --file-search-control-font-size: var(--files-toolbar-control-font-size);
        --file-search-control-font-weight: var(--files-toolbar-control-font-weight);
        inline-size: 100%;
        max-inline-size: min(1080px, 100%);
        min-inline-size: 0;
      }

      .actions-group {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        flex-wrap: nowrap;
      }

      .actions-section {
        justify-content: flex-end;
      }

      .view-mode-section {
        justify-content: flex-start;
      }

      .create-upload-actions {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .action-btn {
        --cv-button-min-height: var(--files-toolbar-control-height);
        --cv-button-border-radius: var(--files-toolbar-control-radius);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: var(--app-toolbar-control-padding-inline);
        --cv-button-font-size: var(--files-toolbar-control-font-size);
        --cv-button-font-weight: var(--files-toolbar-control-font-weight);
        --cv-button-gap: var(--app-toolbar-control-gap);
        min-inline-size: auto;
      }

      .view-mode-group {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--files-toolbar-control-radius);
        background: var(--cv-color-surface-2);
      }

      .view-mode-button {
        --cv-button-min-height: calc(var(--files-toolbar-control-height) - 6px);
        --cv-button-border-radius: var(--files-toolbar-control-radius);
        --cv-button-padding-block: 0;
        --cv-button-font-size: var(--files-toolbar-control-font-size);
        --cv-button-font-weight: var(--files-toolbar-control-font-weight);
        min-inline-size: 32px;
      }

      .sort-toggle {
        white-space: nowrap;
      }

      .view-mode-button[pressed]::part(base) {
        background: var(--cv-color-primary-surface-strong);
        border-color: var(--cv-color-primary-border-strong);
      }

      .view-mode-button[pressed] cv-icon {
        color: var(--cv-color-primary);
      }

      .selection-mode-toggle[pressed]::part(base) {
        background: var(--cv-color-primary-surface-strong);
        border-color: var(--cv-color-primary-border-strong);
        box-shadow: 0 0 0 1px var(--cv-color-primary-ring);
      }

      .selection-mode-toggle[pressed]::part(label),
      .selection-mode-toggle[pressed] cv-icon {
        color: var(--cv-color-primary);
      }

      .action-btn cv-icon {
        display: flex;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        color: inherit;
      }

      @media (hover: none) and (pointer: coarse) {
        cv-button {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          min-block-size: var(--touch-target-comfortable);
          display: flex;
          align-items: center;
        }

        cv-button:active::part(base) {
          transform: scale(0.96);
        }
      }
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    this.model.startResponsiveSync()
    this.syncModelFromProps()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.endFilePickerSession()
    this.model.stopResponsiveSync()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (
      changedProperties.has('currentPath') ||
      changedProperties.has('filters') ||
      changedProperties.has('totalFiles') ||
      changedProperties.has('filteredFiles') ||
      changedProperties.has('selectedCount')
    ) {
      this.syncModelFromProps()
    }
  }

  private syncModelFromProps() {
    this.model.sync({
      currentPath: this.currentPath,
      filters: this.filters,
      totalFiles: this.totalFiles,
      filteredFiles: this.filteredFiles,
      selectedCount: this.selectedCount,
    })
  }

  private dispatchFiltersChange(next: SearchFilters) {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: next, bubbles: true}))
  }

  private getFilterActions(): FileSearchFilterActions {
    return this.filterActions ?? this.legacyFilterActions
  }

  private getFileInput(): HTMLInputElement | null {
    return this.renderRoot.querySelector('#file-input') as HTMLInputElement | null
  }

  focusCreateDirActionTarget(): boolean {
    const button = this.renderRoot.querySelector<HTMLElement>('[data-action="create-dir"]')
    if (!button) return false

    button.focus({preventScroll: true})
    return true
  }

  private onNavigate = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('navigate', {detail: e.detail, bubbles: true}))
  }

  private onFiltersChange = (e: CustomEvent) => {
    this.dispatchFiltersChange(e.detail)
  }

  private onCreateDirClick = () => {
    this.dispatchEvent(new CustomEvent('create-dir', {bubbles: true}))
  }

  private onUploadClick = () => {
    void this.handleUploadClick()
  }

  private async handleUploadClick() {
    const input = this.getFileInput()

    if (this.model.canUseNativeUpload()) {
      this.dispatchEvent(new CustomEvent('native-upload-requested', {bubbles: true}))
      return
    }

    if (this.model.canUseNativePathUpload()) {
      this.beginFilePickerSession()
      try {
        const files = await this.model.pickNativeUploadFiles()
        this.endFilePickerSession()
        if (files.length > 0) {
          this.dispatchEvent(new CustomEvent('upload-paths-requested', {detail: {files}, bubbles: true}))
        }
        return
      } catch (e) {
        this.endFilePickerSession()
        console.warn('[dashboard][tauri] open file dialog failed, falling back to <input type=file>', e)
      }
    }

    if (!input) return
    this.beginFilePickerSession()
    try {
      input.click()
    } catch {
      this.endFilePickerSession()
    }
  }

  private onFileInputChange = (e: Event) => {
    this.endFilePickerSession()
    const files = (e.target as HTMLInputElement).files
    if (files && files.length > 0) {
      this.dispatchEvent(new CustomEvent('upload-requested', {detail: {files}, bubbles: true}))
    }
  }

  private beginFilePickerSession() {
    this.endFilePickerSession()
    this.filePickerSession = beginMobileFilePickerSession()
  }

  private endFilePickerSession() {
    this.filePickerSession?.end()
    this.filePickerSession = null
  }

  private onDeleteClick = () => {
    this.dispatchEvent(new CustomEvent('delete-selected', {bubbles: true}))
  }

  private onSelectionModeToggle() {
    this.dispatchEvent(
      new CustomEvent('selection-mode-requested', {
        detail: {enabled: !this.model.selectionModeEnabled()},
        bubbles: true,
      }),
    )
  }

  private onViewListClick() {
    this.getFilterActions().setViewMode('list')
  }

  private onViewTableClick() {
    this.getFilterActions().setViewMode('table')
  }

  private onViewGridClick() {
    this.getFilterActions().setViewMode('grid')
  }

  private onSortDirectionToggle() {
    this.getFilterActions().toggleSortDirection()
  }

  private renderBreadcrumbs() {
    return html`
      <breadcrumbs-nav
        .currentPath=${this.model.currentPath()}
        @navigate=${this.onNavigate}
      ></breadcrumbs-nav>
    `
  }

  private renderViewModeControls() {
    const currentViewMode = this.model.filters().viewMode
    const handlers: Record<ViewMode, () => void> = {
      list: this.onViewListClick,
      table: this.onViewTableClick,
      grid: this.onViewGridClick,
    }

    return html`
      <div class="view-mode-group" role="group" aria-label=${i18n('file-manager:view' as any)}>
        ${VIEW_MODE_OPTIONS.map(({mode, icon}) => {
          const active = currentViewMode === mode
          const label = getViewLabel(mode)
          return html`
            <cv-button
              class="view-mode-button"
              data-view-mode=${mode}
              variant="ghost"
              size="small"
              toggle
              .pressed=${active}
              aria-pressed=${active ? 'true' : 'false'}
              aria-label=${label}
              title=${label}
              @click=${handlers[mode]}
            >
              <cv-icon name=${icon}></cv-icon>
            </cv-button>
          `
        })}
      </div>
    `
  }

  private renderPrimaryActions() {
    return html`
      <div class="actions-group actions-group-primary">
        <cv-guidance-anchor
          class="create-upload-actions"
          anchor-id="files.create-or-upload"
          surface="files"
          owner="file-manager"
        >
          <cv-button
            class="action-btn"
            data-action="create-dir"
            variant="primary"
            size="small"
            @click=${this.onCreateDirClick}
            aria-label=${i18n('file-manager:create-folder')}
          >
            <cv-icon name="folder-plus" slot="prefix"></cv-icon>
            <span>${i18n('node:dir')}</span>
          </cv-button>

          <cv-button
            class="action-btn"
            data-action="upload"
            variant="primary"
            size="small"
            @click=${this.onUploadClick}
            aria-label=${i18n('file-manager:upload-files')}
          >
            <cv-icon name="upload" slot="prefix"></cv-icon>
            <span>${i18n('file-manager:upload')}</span>
          </cv-button>
        </cv-guidance-anchor>
      </div>
    `
  }

  private renderSortControl() {
    const filters = this.model.filters()
    const sortArrow = filters.sortDirection === 'asc' ? '↑' : '↓'
    const sortLabel = `${i18n('file-manager:sort-current', {sort: getSortLabel(filters.sortBy)})} ${sortArrow}`

    return html`
      <cv-button
        class="action-btn sort-toggle"
        variant="default"
        size="small"
        @click=${this.onSortDirectionToggle}
        aria-label=${sortLabel}
        title=${i18n('file-manager:toggle-sort-direction')}
      >
        <cv-icon name="arrow-up-down" slot="prefix"></cv-icon>
        <span>${sortLabel}</span>
      </cv-button>
    `
  }

  private renderSelectionActions() {
    const selectedCount = this.model.selectedCount()
    const selectionModeEnabled = this.model.selectionModeEnabled()

    return html`
      <div class="actions-group actions-group-secondary">
        ${this.renderSortControl()}
        <cv-button
          class="action-btn selection-mode-toggle"
          variant="default"
          size="small"
          toggle
          .pressed=${selectionModeEnabled}
          aria-pressed=${selectionModeEnabled ? 'true' : 'false'}
          aria-label=${i18n(
            selectionModeEnabled ? 'statusbar:selection-mode:disable' : 'statusbar:selection-mode:enable',
          )}
          title=${`${i18n('statusbar:selection-mode')}: ${i18n(
            selectionModeEnabled ? 'statusbar:selection-mode:on' : 'statusbar:selection-mode:off',
          )}`}
          @click=${this.onSelectionModeToggle}
        >
          <cv-icon name="check-square" slot="prefix"></cv-icon>
          <span>${i18n('statusbar:selection-mode')}</span>
        </cv-button>
        ${this.model.hasSelection()
          ? html`
              <cv-button
                class="action-btn"
                variant="danger"
                size="small"
                @click=${this.onDeleteClick}
                aria-label=${i18n('file-manager:delete-selected', {count: String(selectedCount)})}
              >
                <cv-icon name="trash-2" slot="prefix"></cv-icon>
                <span>${i18n('file-manager:delete-selected', {count: String(selectedCount)})}</span>
              </cv-button>
            `
          : nothing}
      </div>
    `
  }

  private renderFilters() {
    return html`
      <file-search
        .filters=${this.model.filters()}
        .filterActions=${this.filterActions}
        .totalFiles=${this.model.totalFiles()}
        .filteredFiles=${this.model.filteredFiles()}
        @filters-change=${this.onFiltersChange}
      ></file-search>
    `
  }

  private renderMobileLayout() {
    return nothing
  }

  private renderDesktopLayout() {
    return html`
      <desktop-shell-toolbar two-row>
        <div slot="leading" class="breadcrumbs-section">${this.renderBreadcrumbs()}</div>
        <div slot="center" class="filters-section">${this.renderFilters()}</div>
        <div slot="actions" class="actions-section primary-actions-section">
          ${this.renderPrimaryActions()}
        </div>
        <div slot="start" class="view-mode-section">${this.renderViewModeControls()}</div>
        <div slot="end" class="actions-section secondary-actions-section">
          ${this.renderSelectionActions()}
        </div>
      </desktop-shell-toolbar>
    `
  }

  protected render() {
    return html`
      ${this.model.isMobile() ? this.renderMobileLayout() : this.renderDesktopLayout()}
      <input id="file-input" type="file" multiple @change=${this.onFileInputChange} />
    `
  }
}
