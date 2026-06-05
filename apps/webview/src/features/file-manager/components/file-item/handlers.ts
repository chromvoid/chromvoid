import type {FileItemData, ViewMode} from 'root/shared/contracts/file-manager'
import {getAppContext} from 'root/shared/services/app-context'

import {getFileManagerModel} from '../../file-manager.model'
import {FileItemModel, type SwipeFinishResult} from '../../models/file-item.model'

export type FileItemEventType =
  | 'item-click'
  | 'item-double-click'
  | 'item-context-menu'
  | 'item-info'
  | 'item-rename'
  | 'item-download'
  | 'item-delete'
  | 'item-drop'

type EmitFileItemEvent = <T>(type: FileItemEventType, detail: T, options?: boolean) => void

export interface TouchDragDropBinding {
  destroy: () => void
}

const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches

export const emitItemClick = (
  model: FileItemModel,
  item: FileItemData,
  emit: EmitFileItemEvent,
  event: Event,
) => {
  if (model.isSwipeOpen) {
    model.closeSwipe()
    return
  }

  emit('item-click', {item, event})
}

export const emitItemDoubleClick = (
  item: FileItemData,
  emit: EmitFileItemEvent,
  event: Event,
) => emit('item-double-click', {item, event})

export const emitItemContextMenu = (
  item: FileItemData,
  emit: EmitFileItemEvent,
  event: Event,
) => {
  event.preventDefault()
  emit('item-context-menu', {item, event})
}

export const emitItemMore = (
  item: FileItemData,
  emit: EmitFileItemEvent,
  event: Event,
) => {
  event.stopPropagation()
  emit('item-context-menu', {item, event})
}

export const emitItemInfo = (item: FileItemData, emit: EmitFileItemEvent, event: Event) => {
  event.stopPropagation()
  emit('item-info', item)
}

export const emitItemRename = (item: FileItemData, emit: EmitFileItemEvent, event: Event) => {
  event.stopPropagation()
  emit('item-rename', item)
}

export const emitItemDownload = (item: FileItemData, emit: EmitFileItemEvent, event: Event) => {
  event.stopPropagation()
  emit('item-download', item)
}

export const emitItemDelete = (item: FileItemData, emit: EmitFileItemEvent, event: Event) => {
  event.stopPropagation()
  emit('item-delete', item)
}

export const onTouchStart = (
  model: FileItemModel,
  item: FileItemData,
  emit: EmitFileItemEvent,
  event: TouchEvent,
) => {
  model.startTouch(event, (e: TouchEvent) => {
    emitItemContextMenu(item, emit, e)
  })
}

export const onTouchMove = (
  model: FileItemModel,
  event: TouchEvent,
  viewMode: ViewMode,
) => model.onTouchMove(event, viewMode)

export const onTouchEnd = (model: FileItemModel): SwipeFinishResult | null => model.onTouchEnd()

export const emitSwipeAction = (
  item: FileItemData,
  action: 'rename' | 'delete',
  emit: EmitFileItemEvent,
  event: Event,
) => {
  event.stopPropagation()
  emit(action === 'rename' ? 'item-rename' : 'item-delete', item)
}

function fileMoveModel() {
  try {
    return getFileManagerModel(getAppContext()).fileMove
  } catch {
    return null
  }
}

export const onDragStart = (item: FileItemData, event: DragEvent) => {
  fileMoveModel()?.setDragData(event, item.id)
}

export const onDragOver = (item: FileItemData, setDragOver: (value: boolean) => void, event: DragEvent) => {
  if (!item.isDir) return
  const model = fileMoveModel()
  const payload = model?.readDragPayload(event.dataTransfer) ?? null
  if (!model?.canDropToTarget(item.path || '/', payload)) return

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  model.setDropTarget(item.path || '/')
  setDragOver(true)
}

export const onDragLeave = (setDragOver: (value: boolean) => void) => {
  fileMoveModel()?.setDropTarget(null)
  setDragOver(false)
}

export const onDrop = (item: FileItemData, emit: EmitFileItemEvent, event: DragEvent) => {
  event.preventDefault()

  if (!item.isDir) return

  const model = fileMoveModel()
  const payload = model?.readDragPayload(event.dataTransfer) ?? null
  model?.setDropTarget(null)
  if (!model || !payload || !model.canDropToTarget(item.path || '/', payload)) return

  const sourceId = payload.kind === 'selection' ? payload.anchorId : payload.id
  const source = getFileManagerModel(getAppContext()).getFileItemById(sourceId)
  if (!source) return

  emit('item-drop', {target: item, source, payload})
}

export const setupTouchDragDrop = (params: {
  item: FileItemData
  dragHandle: HTMLElement | null
  model: FileItemModel
  onTouchDragStateChange?: (value: boolean) => void
}) => {
  if (!isTouchDevice()) return undefined
  if (!params.dragHandle) return undefined

  let pointerId: number | null = null

  const clearTouchDragging = () => {
    params.model.setTouchDragging(false)
    params.onTouchDragStateChange?.(false)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' || pointerId !== null) return
    const model = fileMoveModel()
    if (!model?.beginMobileDrag(params.item.id, {x: event.clientX, y: event.clientY})) return

    pointerId = event.pointerId
    params.dragHandle?.setPointerCapture?.(event.pointerId)
    params.model.setTouchDragging(true)
    params.onTouchDragStateChange?.(true)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return
    if (fileMoveModel()?.moveMobileDrag({x: event.clientX, y: event.clientY})) {
      event.preventDefault()
    }
  }

  const finishPointerDrag = (event: PointerEvent, commit: boolean) => {
    if (pointerId !== event.pointerId) return
    pointerId = null
    params.dragHandle?.releasePointerCapture?.(event.pointerId)
    clearTouchDragging()
    if (commit) {
      void fileMoveModel()?.commitMobileDrag({x: event.clientX, y: event.clientY})
    } else {
      fileMoveModel()?.cancelMobileDrag()
    }
  }

  const onPointerUp = (event: PointerEvent) => finishPointerDrag(event, true)
  const onPointerCancel = (event: PointerEvent) => finishPointerDrag(event, false)

  params.dragHandle.addEventListener('pointerdown', onPointerDown)
  params.dragHandle.addEventListener('pointermove', onPointerMove)
  params.dragHandle.addEventListener('pointerup', onPointerUp)
  params.dragHandle.addEventListener('pointercancel', onPointerCancel)

  return {
    destroy() {
      params.dragHandle?.removeEventListener('pointerdown', onPointerDown)
      params.dragHandle?.removeEventListener('pointermove', onPointerMove)
      params.dragHandle?.removeEventListener('pointerup', onPointerUp)
      params.dragHandle?.removeEventListener('pointercancel', onPointerCancel)
      fileMoveModel()?.cancelMobileDrag()
    },
  }
}

export const applySwipeMoveVisual = (shadowRoot: ShadowRoot | null, offset: number) => {
  const swipeContainer = shadowRoot?.querySelector('.swipe-container') as HTMLElement | null
  const fileItem = shadowRoot?.querySelector('.file-item') as HTMLElement | null
  if (!swipeContainer || !fileItem) return

  swipeContainer.classList.add('swipe-active')
  swipeContainer.classList.toggle('swipe-right', offset > 0)
  swipeContainer.classList.toggle('swipe-left', offset < 0)
  fileItem.classList.add('swiping')
  fileItem.classList.remove('snap-back')
  fileItem.style.setProperty('--file-item-swipe-offset', `${offset}px`)
  const progress = Math.min(1, Math.abs(offset) / FileItemModel.SWIPE_ACTION_WIDTH)
  fileItem.style.opacity = String(1 - progress * 0.12)
}

export const applySwipeFinishVisual = (
  shadowRoot: ShadowRoot | null,
  finish: SwipeFinishResult,
) => {
  const swipeContainer = shadowRoot?.querySelector('.swipe-container') as HTMLElement | null
  const fileItem = shadowRoot?.querySelector('.file-item') as HTMLElement | null
  if (!fileItem) return

  fileItem.classList.remove('swiping')
  fileItem.classList.add('snap-back')
  fileItem.style.opacity = '1'

  if (finish.state === 'open-left') {
    fileItem.style.setProperty('--file-item-swipe-offset', `-${FileItemModel.SWIPE_ACTION_WIDTH}px`)
    swipeContainer?.classList.add('swipe-left')
    swipeContainer?.classList.remove('swipe-right')
    swipeContainer?.classList.add('swipe-active')
  } else if (finish.state === 'open-right') {
    fileItem.style.setProperty('--file-item-swipe-offset', `${FileItemModel.SWIPE_ACTION_WIDTH}px`)
    swipeContainer?.classList.add('swipe-right')
    swipeContainer?.classList.remove('swipe-left')
    swipeContainer?.classList.add('swipe-active')
  } else {
    fileItem.style.setProperty('--file-item-swipe-offset', '0px')
    swipeContainer?.classList.remove('swipe-active', 'swipe-left', 'swipe-right')
  }

  fileItem.addEventListener(
    'transitionend',
    () => {
      fileItem.classList.remove('snap-back')
    },
    {once: true},
  )
}

export const applySwipeCloseVisual = (shadowRoot: ShadowRoot | null) => {
  const swipeContainer = shadowRoot?.querySelector('.swipe-container') as HTMLElement | null
  const fileItem = shadowRoot?.querySelector('.file-item') as HTMLElement | null
  if (!fileItem) return

  fileItem.classList.remove('swiping')
  fileItem.classList.add('snap-back')
  fileItem.style.opacity = '1'
  fileItem.style.setProperty('--file-item-swipe-offset', '0px')
  swipeContainer?.classList.remove('swipe-active', 'swipe-left', 'swipe-right')

  fileItem.addEventListener(
    'transitionend',
    () => {
      fileItem.classList.remove('snap-back')
    },
    {once: true},
  )
}
