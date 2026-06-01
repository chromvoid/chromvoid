import {html} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {
  isFileListPlaceholderItem,
  type FileListVisibleItem,
} from 'root/shared/contracts/file-manager'

export interface RenderGridViewParams {
  items: FileListVisibleItem[]
  totalHeight: number
  offsetY: number
  renderItem: (item: FileListVisibleItem) => unknown
}

export const renderGridView = ({items, totalHeight, offsetY, renderItem}: RenderGridViewParams) => html`
  <div class="grid-virtual-spacer" data-total-height=${String(totalHeight)}>
    <div class="grid-view grid-virtual-window" data-offset-y=${String(offsetY)}>
      ${repeat(
        items,
        (item) => (isFileListPlaceholderItem(item) ? item.placeholderKey : item.id),
        renderItem,
      )}
    </div>
  </div>
`
