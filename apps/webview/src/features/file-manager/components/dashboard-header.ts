import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {animationStyles, sharedStyles} from 'root/shared/ui/shared-styles'

import {BreadcrumbsNav} from './breadcrumbs-nav'
import {DashboardHeaderDesktopLayout} from './dashboard-header-desktop-layout'
import {DashboardHeaderMobileLayout} from './dashboard-header-mobile-layout'
import {createDefaultDashboardHeaderFilters, DashboardHeaderModel} from './dashboard-header.model'
import {FileSearchMobile} from './file-search-mobile'
import type {SearchFilters} from 'root/shared/contracts/file-manager'

export class DashboardHeader extends XLitElement {
  static define() {
    BreadcrumbsNav.define()
    DashboardHeaderDesktopLayout.define()
    DashboardHeaderMobileLayout.define()
    FileSearchMobile.define()

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
    }
  }

  declare currentPath: string
  declare filters: SearchFilters
  declare totalFiles: number
  declare filteredFiles: number
  declare selectedCount: number

  private readonly model = new DashboardHeaderModel()

  constructor() {
    super()
    this.currentPath = '/'
    this.filters = createDefaultDashboardHeaderFilters()
    this.totalFiles = 0
    this.filteredFiles = 0
    this.selectedCount = 0
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

      .actions-group {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-1);
        flex-wrap: nowrap;
      }

      .action-btn {
        min-inline-size: auto;
      }

      .action-btn cv-icon {
        display: flex;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        color: inherit;
      }

      .action-btn-mobile {
        min-inline-size: 36px;
        min-block-size: 36px;
      }

      .action-btn-mobile::part(base) {
        min-inline-size: 0;
        padding-inline: 8px;
        justify-content: center;
        gap: 0;
        border: none;
        background: transparent;
        box-shadow: none;
      }

      .action-btn-mobile:hover::part(base) {
        background: color-mix(in oklch, currentColor 8%, transparent);
      }

      .action-btn-mobile:active::part(base) {
        background: color-mix(in oklch, currentColor 14%, transparent);
      }

      .action-btn-mobile::part(prefix) {
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .action-btn-mobile cv-icon {
        width: 20px;
        height: 20px;
        margin: 0;
      }

      .action-btn-mobile[variant='primary'] cv-icon {
        color: var(--cv-color-brand, #00e5ff);
      }

      .action-btn-mobile[variant='danger'] cv-icon {
        color: var(--cv-color-danger, #ef4444);
      }

      .action-btn-mobile[variant='default'] cv-icon {
        color: var(--cv-color-text-muted, #e5e7eb);
      }

      /* ===== Mobile selection toolbar ===== */
      .selection-toolbar {
        flex: 1;
        justify-content: space-between;
      }

      .selection-done-btn {
        background: none;
        border: none;
        color: var(--cv-color-brand, #00e5ff);
        font-size: var(--cv-font-size-sm, 14px);
        font-weight: 600;
        cursor: pointer;
        padding: 8px 4px;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
      }

      .selection-done-btn:active {
        opacity: 0.7;
      }

      .selection-count {
        color: var(--cv-color-text-secondary, #9ca3af);
        font-size: 13px;
        white-space: nowrap;
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

  private getFileInput(): HTMLInputElement | null {
    return this.renderRoot.querySelector('#file-input') as HTMLInputElement | null
  }

  private onNavigate = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('navigate', {detail: e.detail, bubbles: true}))
  }

  private onFiltersChange = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: e.detail, bubbles: true}))
  }

  private onCreateDirClick = () => {
    this.dispatchEvent(new CustomEvent('create-dir', {bubbles: true}))
  }

  private onUploadClick = () => {
    void this.handleUploadClick()
  }

  private async handleUploadClick() {
    const input = this.getFileInput()

    if (this.model.canUseNativePathUpload()) {
      try {
        const paths = await this.model.pickNativeUploadPaths()
        if (paths.length > 0) {
          this.dispatchEvent(new CustomEvent('upload-paths-requested', {detail: {paths}, bubbles: true}))
        }
        return
      } catch (e) {
        console.warn('[dashboard][tauri] open file dialog failed, falling back to <input type=file>', e)
      }
    }

    input?.click()
  }

  private onFileInputChange = (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    if (files && files.length > 0) {
      this.dispatchEvent(new CustomEvent('upload-requested', {detail: {files}, bubbles: true}))
    }
  }

  private onDeleteClick = () => {
    this.dispatchEvent(new CustomEvent('delete-selected', {bubbles: true}))
  }

  private onClearSelection = () => {
    this.dispatchEvent(new CustomEvent('clear-selection', {bubbles: true}))
  }

  private onSelectionModeExit = () => {
    this.dispatchEvent(
      new CustomEvent('selection-mode-requested', {
        detail: {enabled: false},
        bubbles: true,
      }),
    )
  }

  private renderBreadcrumbs() {
    return html`
      <breadcrumbs-nav
        slot="breadcrumbs"
        .currentPath=${this.model.currentPath()}
        @navigate=${this.onNavigate}
      ></breadcrumbs-nav>
    `
  }

  private renderMobileSelectionToolbar() {
    const selectedCount = this.model.selectedCount()
    const hasSelection = this.model.hasSelection()

    return html`
      <div slot="actions" class="actions-group actions-group-mobile selection-toolbar">
        <button class="selection-done-btn" @click=${this.onSelectionModeExit}>
          ${i18n('button:done' as any)}
        </button>
        <span class="selection-count">
          ${hasSelection
            ? i18n('file-manager:selected-count' as any, {count: String(selectedCount)})
            : i18n('file-manager:select-items' as any)}
        </span>
        ${hasSelection
          ? html`
              <cv-button
                class="action-btn action-btn-mobile"
                variant="danger"
                size="small"
                @click=${this.onDeleteClick}
                aria-label=${i18n('file-manager:delete-selected' as any, {count: String(selectedCount)})}
              >
                <cv-icon name="trash-2" slot="prefix"></cv-icon>
              </cv-button>
            `
          : nothing}
      </div>
    `
  }

  private renderActions(mobile: boolean, inSelection = false) {
    const selectedCount = this.model.selectedCount()
    const selectionModeEnabled = this.model.selectionModeEnabled()

    if (mobile && inSelection) {
      return this.renderMobileSelectionToolbar()
    }

    const content = html`
      <cv-button
        class="action-btn"
        data-action="create-dir"
        variant="primary"
        size="small"
        @click=${this.onCreateDirClick}
        aria-label=${i18n('file-manager:create-folder' as any)}
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
        aria-label=${i18n('file-manager:upload-files' as any)}
      >
        <cv-icon name="upload" slot="prefix"></cv-icon>
        <span>${i18n('file-manager:upload' as any)}</span>
      </cv-button>

      ${selectionModeEnabled
        ? html`
            <cv-button
              class="action-btn"
              variant="default"
              size="small"
              @click=${this.onSelectionModeExit}
              aria-label=${i18n('file-manager:exit-selection-mode' as any)}
            >
              <cv-icon name="check-square" slot="prefix"></cv-icon>
              <span>${i18n('button:done' as any)}</span>
            </cv-button>
          `
        : nothing}
      ${this.model.hasSelection()
        ? html`
            <cv-button
              class="action-btn"
              variant="danger"
              size="small"
              @click=${this.onDeleteClick}
              aria-label=${i18n('file-manager:delete-selected' as any, {count: String(selectedCount)})}
            >
              <cv-icon name="trash-2" slot="prefix"></cv-icon>
              <span>${i18n('file-manager:delete-selected' as any, {count: String(selectedCount)})}</span>
            </cv-button>
          `
        : nothing}
    `

    return html` <div slot="actions" class="actions-group actions-group-desktop">${content}</div> `
  }

  private renderFilters(compact = false) {
    if (compact) {
      return html`
        <file-search-mobile
          slot="filters"
          .filters=${this.model.filters()}
          .totalFiles=${this.model.totalFiles()}
          .filteredFiles=${this.model.filteredFiles()}
          @filters-change=${this.onFiltersChange}
        ></file-search-mobile>
      `
    }
    return html`
      <file-search
        slot="filters"
        .filters=${this.model.filters()}
        .totalFiles=${this.model.totalFiles()}
        .filteredFiles=${this.model.filteredFiles()}
        @filters-change=${this.onFiltersChange}
      ></file-search>
    `
  }

  private renderMobileLayout() {
    const inSelection = this.model.selectionModeEnabled() || this.model.hasSelection()
    return html`
      <dashboard-header-mobile-layout ?selection-mode=${inSelection}>
        ${this.renderBreadcrumbs()} ${inSelection ? this.renderActions(true, inSelection) : nothing}
      </dashboard-header-mobile-layout>
    `
  }

  private renderDesktopLayout() {
    return html`
      <dashboard-header-desktop-layout>
        ${this.renderBreadcrumbs()} ${this.renderActions(false)} ${this.renderFilters()}
      </dashboard-header-desktop-layout>
    `
  }

  protected render() {
    return html`
      ${this.model.isMobile() ? this.renderMobileLayout() : this.renderDesktopLayout()}
      <input id="file-input" type="file" multiple @change=${this.onFileInputChange} />
    `
  }
}
