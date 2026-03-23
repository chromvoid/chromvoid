import type {FileListItem} from 'root/shared/contracts/file-manager'
import type {VirtualFileListHandlerContext, VirtualFileListPointerState, VirtualFileListSelectionState} from './types'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value != null
}

const hasNumericId = (value: unknown): value is {id: number} => {
  return isPlainObject(value) && typeof value['id'] === 'number'
}

const hasFileListItemShape = (value: unknown): value is FileListItem => {
  return (
    isPlainObject(value) &&
    typeof value['id'] === 'number' &&
    typeof value['path'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['isDir'] === 'boolean'
  )
}

export const getItemFromDetail = (detail: unknown): FileListItem | undefined => {
  if (hasFileListItemShape(detail)) return detail
  if (!isPlainObject(detail)) return undefined
  const item = detail['item']
  return hasFileListItemShape(item) ? item : undefined
}

export const getEventFromDetail = (detail: unknown): Event | undefined => {
  if (!isPlainObject(detail)) return undefined
  const event = detail['event']
  return event instanceof Event ? event : undefined
}

export const isTouchActivationForItem = (
  state: Pick<
    VirtualFileListPointerState,
    'lastPointerType' | 'lastPointerDownItemId' | 'lastPointerDownAtMs'
  >,
  itemId: number,
): boolean => {
  if (state.lastPointerType !== 'touch') return false
  if (state.lastPointerDownItemId !== itemId) return false
  return Date.now() - state.lastPointerDownAtMs < 1200
}

export const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform || ''
  const userAgent = navigator.userAgent || ''
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac|iPhone|iPad|iPod/i.test(userAgent)
}

export const isMacCtrlClick = (mouse: MouseEvent): boolean => {
  return isMacPlatform() && mouse.ctrlKey && !mouse.metaKey
}

export const getFocusedItemId = (event?: Event): number | null => {
  const path = event?.composedPath?.() ?? []
  for (const el of path) {
    if (!(el instanceof HTMLElement)) continue
    if (el.matches?.('file-item[data-id], .file-item-wrapper[data-id]')) {
      const raw = el.getAttribute('data-id')
      const id = raw ? Number(raw) : NaN
      if (!Number.isNaN(id)) return id
    }
  }

  let active: Element | null = typeof document !== 'undefined' ? document.activeElement : null
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }

  if (active instanceof HTMLElement) {
    const host = active.closest?.('file-item[data-id], .file-item-wrapper[data-id]') as HTMLElement | null
    const raw = host?.getAttribute('data-id')
    const id = raw ? Number(raw) : NaN
    if (!Number.isNaN(id)) return id
  }

  return null
}

export const handleItemSelect = (
  context: Pick<VirtualFileListHandlerContext, 'getItems' | 'getSelectedItems' | 'emitSelectionChange'>,
  selectionState: VirtualFileListSelectionState,
  item: FileListItem,
  event: Event,
) => {
  const mouse = event as MouseEvent
  const ctrlKey = mouse.ctrlKey || mouse.metaKey
  const shiftKey = mouse.shiftKey

  let newSelection = [...context.getSelectedItems()]
  const filtered = context.getItems()
  const currentIndex = filtered.findIndex((i) => i.id === item.id)
  if (currentIndex === -1) return

  if (shiftKey) {
    const anchor =
      selectionState.lastSelectionAnchorIndex != null && selectionState.lastSelectionAnchorIndex >= 0
        ? selectionState.lastSelectionAnchorIndex
        : currentIndex
    const start = Math.min(anchor, currentIndex)
    const end = Math.max(anchor, currentIndex)
    newSelection = []
    for (let i = start; i <= end; i++) {
      const candidate = filtered[i]
      if (candidate) newSelection.push(candidate.id)
    }
    if (selectionState.lastSelectionAnchorIndex == null) {
      selectionState.lastSelectionAnchorIndex = anchor
    }
  } else if (ctrlKey) {
    const index = newSelection.indexOf(item.id)
    if (index > -1) {
      newSelection.splice(index, 1)
    } else {
      newSelection.push(item.id)
    }
    selectionState.lastSelectionAnchorIndex = currentIndex
  } else {
    return
  }

  context.emitSelectionChange(newSelection)
}
