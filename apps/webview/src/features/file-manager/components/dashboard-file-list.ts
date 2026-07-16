import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, type PropertyValues} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

import {
  isRealFileListItem,
  type FileListRenderItem,
  type FileListVisibleRange,
  type FileListViewportRestoreState,
  type SearchFilters,
} from 'root/shared/contracts/file-manager'
import type {FileDeletionMotionModel} from '../models/file-deletion-motion.model'
import type {FileSearchFilterActions} from '../models/file-search-filters.model'
import {logFileManagerDebug} from '../file-manager-debug'

export class DashboardFileList extends ReatomLitElement {
  static define() {
    // Subcomponents are registered externally: virtual-file-list, file-item-desktop, file-item-mobile
    if (!customElements.get('dashboard-file-list')) {
      customElements.define('dashboard-file-list', this)
    }
  }

  static get properties() {
    return {
      items: {type: Array},
      filters: {type: Object},
      selectedItems: {type: Array, attribute: 'selected-items'},
      selectionMode: {type: Boolean, attribute: 'selection-mode'},
      pendingExternalOpenIds: {type: Array, attribute: 'pending-external-open-ids'},
      containerHeight: {type: Number, attribute: 'container-height'},
      currentPath: {type: String, attribute: 'current-path'},
      mobile: {type: Boolean},
      restoreViewport: {type: Object, attribute: false},
      itemsPreFiltered: {type: Boolean, attribute: 'items-pre-filtered'},
      deletionMotion: {attribute: false},
      filterActions: {attribute: false},
    }
  }

  declare items: FileListRenderItem[]
  declare filters: SearchFilters
  declare selectedItems: number[]
  declare selectionMode: boolean
  declare pendingExternalOpenIds: number[]
  declare containerHeight: number
  declare currentPath: string
  declare mobile: boolean
  declare restoreViewport: FileListViewportRestoreState | null
  declare itemsPreFiltered: boolean
  declare deletionMotion: FileDeletionMotionModel | null
  declare filterActions: FileSearchFilterActions | null
  private lastDebugKey: string | null = null

  constructor() {
    super()
    this.items = []
    this.filters = {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
    this.selectedItems = []
    this.selectionMode = false
    this.pendingExternalOpenIds = []
    this.containerHeight = 400
    this.currentPath = '/'
    this.mobile = false
    this.restoreViewport = null
    this.itemsPreFiltered = false
    this.deletionMotion = null
    this.filterActions = null
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        flex: 1;
        min-block-size: 0;

        & .file-list-container {
          flex: 1;
          min-block-size: 0;
          block-size: 100%;
          display: flex;
          flex-direction: column;
        }
      }
    `,
  ]

  private onSelectionChange = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('selection-change', {detail: e.detail, bubbles: true}))
  }

  private onSelectionModeRequested = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('selection-mode-requested', {detail: e.detail, bubbles: true}))
  }

  private onItemAction = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('item-action', {detail: e.detail, bubbles: true}))
  }

  private onFiltersChange = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: e.detail, bubbles: true}))
  }

  private onNavigate = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('navigate', {detail: e.detail, bubbles: true}))
  }

  private onViewportStateChange(e: CustomEvent) {
    this.dispatchEvent(new CustomEvent('viewport-state-change', {detail: e.detail, bubbles: true}))
  }

  private onViewportStateRestored(e: CustomEvent) {
    this.dispatchEvent(new CustomEvent('viewport-state-restored', {detail: e.detail, bubbles: true}))
  }

  private onVisibleRangeChange(e: CustomEvent<FileListVisibleRange>) {
    this.dispatchEvent(new CustomEvent('visible-range-change', {detail: e.detail, bubbles: true}))
  }

  override updated(changed: PropertyValues<this>) {
    super.updated(changed)
    if (
      !changed.has('items') &&
      !changed.has('currentPath') &&
      !changed.has('filters') &&
      !changed.has('itemsPreFiltered') &&
      !changed.has('mobile')
    ) {
      return
    }

    const realItems = this.items.filter(isRealFileListItem)
    const key = `${this.currentPath}|${this.mobile}|${this.items.length}|${realItems.length}|${this.filters.viewMode}|${this.itemsPreFiltered}`
    if (key === this.lastDebugKey) return
    this.lastDebugKey = key

    logFileManagerDebug('dashboard-file-list', 'updated:file-list-inputs', {
      path: this.currentPath,
      mobile: this.mobile,
      viewMode: this.filters.viewMode,
      itemsPreFiltered: this.itemsPreFiltered,
      renderSlots: this.items.length,
      renderRealCount: realItems.length,
      firstItems: realItems.slice(0, 5).map((item) => ({
        id: item.id,
        name: item.name,
        isDir: item.isDir,
      })),
    })
  }

  render() {
    return html`
      <div class="file-list-container">
        <virtual-file-list
          .items=${this.items}
          .filters=${this.filters}
          .filterActions=${this.filterActions}
          .selectedItems=${this.selectedItems}
          .selectionMode=${this.selectionMode}
          .pendingExternalOpenIds=${this.pendingExternalOpenIds}
          .containerHeight=${this.containerHeight}
          .currentPath=${this.currentPath}
          .mobile=${this.mobile}
          .restoreViewport=${this.restoreViewport}
          .itemsPreFiltered=${this.itemsPreFiltered}
          .deletionMotion=${this.deletionMotion}
          @selection-change=${this.onSelectionChange}
          @selection-mode-requested=${this.onSelectionModeRequested}
          @item-action=${this.onItemAction}
          @filters-change=${this.onFiltersChange}
          @navigate=${this.onNavigate}
          @viewport-state-change=${this.onViewportStateChange}
          @viewport-state-restored=${this.onViewportStateRestored}
          @visible-range-change=${this.onVisibleRangeChange}
        ></virtual-file-list>
      </div>
    `
  }
}
