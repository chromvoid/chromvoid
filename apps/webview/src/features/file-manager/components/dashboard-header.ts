import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {animationStyles, sharedStyles} from 'root/shared/ui/shared-styles'
import {
  beginMobileFilePickerSession,
  type MobileFilePickerSession,
} from 'root/shared/services/mobile-file-picker-session'

import {BreadcrumbsNav} from './breadcrumbs-nav'
import {DashboardHeaderDesktopLayout} from './dashboard-header-desktop-layout'
import {createDefaultDashboardHeaderFilters, DashboardHeaderModel} from './dashboard-header.model'
import type {SearchFilters} from 'root/shared/contracts/file-manager'
import type {FileSearchFilterActions} from '../models/file-search-filters.model'

export class DashboardHeader extends ReatomLitElement {
  static define() {
    BreadcrumbsNav.define()
    DashboardHeaderDesktopLayout.define()

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

    if (this.model.canUseNativeUpload()) {
      this.dispatchEvent(new CustomEvent('native-upload-requested', {bubbles: true}))
      return
    }

    if (this.model.canUseNativePathUpload()) {
      this.beginFilePickerSession()
      try {
        const paths = await this.model.pickNativeUploadPaths()
        this.endFilePickerSession()
        if (paths.length > 0) {
          this.dispatchEvent(new CustomEvent('upload-paths-requested', {detail: {paths}, bubbles: true}))
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

  private renderActions() {
    const selectedCount = this.model.selectedCount()
    const selectionModeEnabled = this.model.selectionModeEnabled()

    const content = html`
      <cv-guidance-anchor anchor-id="files.create-or-upload" surface="files" owner="file-manager">
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

      ${selectionModeEnabled
        ? html`
            <cv-button
              class="action-btn"
              variant="default"
              size="small"
              @click=${this.onSelectionModeExit}
              aria-label=${i18n('file-manager:exit-selection-mode')}
            >
              <cv-icon name="check-square" slot="prefix"></cv-icon>
              <span>${i18n('button:done')}</span>
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
              aria-label=${i18n('file-manager:delete-selected', {count: String(selectedCount)})}
            >
              <cv-icon name="trash-2" slot="prefix"></cv-icon>
              <span>${i18n('file-manager:delete-selected', {count: String(selectedCount)})}</span>
            </cv-button>
          `
        : nothing}
    `

    return html` <div slot="actions" class="actions-group actions-group-desktop">${content}</div> `
  }

  private renderFilters() {
    return html`
      <file-search
        slot="filters"
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
      <dashboard-header-desktop-layout>
        ${this.renderBreadcrumbs()} ${this.renderActions()} ${this.renderFilters()}
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
