export const FILE_ITEM_HOST_SELECTOR = 'file-item-desktop, file-item-mobile'

export const FILE_ITEM_HOST_OR_ROW_SELECTOR =
  'file-item-desktop, file-item-mobile, .file-item-wrapper'

export const FILE_ITEM_HOST_WITH_DATA_ID_SELECTOR =
  'file-item-desktop[data-id], file-item-mobile[data-id], .file-item-wrapper[data-id]'

export const getFileItemHostByIdSelector = (id: number) =>
  `file-item-desktop[data-id="${id}"], file-item-mobile[data-id="${id}"], .file-item-wrapper[data-id="${id}"]`

export const isFileItemHostElement = (value: unknown): value is HTMLElement => {
  return (
    value instanceof HTMLElement &&
    (value.tagName === 'FILE-ITEM-DESKTOP' || value.tagName === 'FILE-ITEM-MOBILE')
  )
}
