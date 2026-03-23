import {html} from 'lit'

import {i18n} from 'root/i18n'
import type {SearchFilters} from 'root/shared/contracts/file-manager'

import {VirtualFileListBase} from './virtual-file-list.base'

export class VirtualFileList extends VirtualFileListBase {
  static define() {
    if (!customElements.get('virtual-file-list')) {
      customElements.define('virtual-file-list', this)
    }
  }

  protected override renderStatusBarRight() {
    return html`
      <div class="status-right">
        <cv-button
          size="small"
          variant="ghost"
          title=${i18n('file-manager:view:list' as any)}
          @click=${this.onViewList}
        >
          <cv-icon name="list"></cv-icon>
        </cv-button>
        <cv-button
          size="small"
          variant="ghost"
          title=${i18n('file-manager:view:table' as any)}
          @click=${this.onViewTable}
        >
          <cv-icon name="table"></cv-icon>
        </cv-button>
        <cv-button
          size="small"
          variant="ghost"
          title=${i18n('file-manager:view:grid' as any)}
          @click=${this.onViewGrid}
        >
          <cv-icon name="grid"></cv-icon>
        </cv-button>
      </div>
    `
  }

  private onViewList = () => {
    const next = {...this.filters, viewMode: 'list'} as SearchFilters
    this.dispatchFiltersChange(next)
  }

  private onViewGrid = () => {
    const next = {...this.filters, viewMode: 'grid'} as SearchFilters
    this.dispatchFiltersChange(next)
  }

  private onViewTable = () => {
    const next = {...this.filters, viewMode: 'table'} as SearchFilters
    this.dispatchFiltersChange(next)
  }
}
