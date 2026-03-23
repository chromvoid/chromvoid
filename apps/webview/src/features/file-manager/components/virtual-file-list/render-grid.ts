import {html} from 'lit'

import type {FileListItem} from 'root/shared/contracts/file-manager'

export const renderGridView = (items: FileListItem[], renderItem: (item: FileListItem) => unknown) =>
  html` <div class="grid-view">${items.map(renderItem)}</div> `
