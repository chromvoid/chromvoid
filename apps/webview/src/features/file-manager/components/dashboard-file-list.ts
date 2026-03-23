import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

import type {FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'

export class DashboardFileList extends XLitElement {
  static define() {
    // подкомпоненты регистрируются снаружи: virtual-file-list, file-item
    customElements.define('dashboard-file-list', this)
  }

  static get properties() {
    return {
      items: {type: Array},
      filters: {type: Object},
      selectedItems: {type: Array, attribute: 'selected-items'},
      selectionMode: {type: Boolean, attribute: 'selection-mode'},
      containerHeight: {type: Number, attribute: 'container-height'},
      currentPath: {type: String, attribute: 'current-path'},
      mobile: {type: Boolean},
    }
  }

  declare items: FileListItem[]
  declare filters: SearchFilters
  declare selectedItems: number[]
  declare selectionMode: boolean
  declare containerHeight: number
  declare currentPath: string
  declare mobile: boolean

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
    this.containerHeight = 400
    this.currentPath = '/'
    this.mobile = false
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

  render() {
    return html`
      <div class="file-list-container">
        <virtual-file-list
          .items=${this.items}
          .filters=${this.filters}
          .selectedItems=${this.selectedItems}
          .selectionMode=${this.selectionMode}
          .containerHeight=${this.containerHeight}
          .currentPath=${this.currentPath}
          .mobile=${this.mobile}
          @selection-change=${this.onSelectionChange}
          @selection-mode-requested=${this.onSelectionModeRequested}
          @item-action=${this.onItemAction}
          @filters-change=${this.onFiltersChange}
          @navigate=${this.onNavigate}
        ></virtual-file-list>
      </div>
    `
  }
}
