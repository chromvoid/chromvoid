import {TouchDragDropController, isTouchDevice} from 'root/utils/touch-drag-drop'

import type {FileItemData, ViewMode} from 'root/shared/contracts/file-manager'

import {getDragData} from './utils'
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

export const onDragStart = (item: FileItemData, event: DragEvent) => {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('application/json', getDragData(item))
  event.dataTransfer.effectAllowed = 'move'
}

export const onDragOver = (item: FileItemData, setDragOver: (value: boolean) => void, event: DragEvent) => {
  if (!item.isDir) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  setDragOver(true)
}

export const onDragLeave = (setDragOver: (value: boolean) => void) => {
  setDragOver(false)
}

export const onDrop = (item: FileItemData, emit: EmitFileItemEvent, event: DragEvent) => {
  event.preventDefault()

  if (!item.isDir) return

  const data = event.dataTransfer?.getData('application/json')
  if (!data) return

  const source = JSON.parse(data) as FileItemData
  emit('item-drop', {target: item, source})
}

export const setupTouchDragDrop = (params: {
  item: FileItemData
  itemElement: HTMLElement | null
  dragHandle: HTMLElement | null
  model: FileItemModel
  emitDrop: (source: FileItemData) => void
  onTouchDragStateChange?: (value: boolean) => void
}) => {
  if (!isTouchDevice()) return undefined
  if (!params.itemElement || !params.dragHandle) return undefined

  const controller = new TouchDragDropController(params.dragHandle, {
    longPressDelay: 600,
    dragThreshold: 15,
    hapticFeedback: true,
    touchOnly: true,
  })

  controller.setDragData(params.item)
  controller.on('start', () => {
    params.model.setTouchDragging(true)
    params.onTouchDragStateChange?.(true)
  })
  controller.on('end', () => {
    params.model.setTouchDragging(false)
    params.onTouchDragStateChange?.(false)
  })
  controller.on('cancel', () => {
    params.model.setTouchDragging(false)
    params.onTouchDragStateChange?.(false)
  })

  if (params.item.isDir) {
    controller.addDropZone(params.itemElement)
    const onTouchDrop = (event: Event) => {
      const customEvent = event as CustomEvent
      const {data, source} = customEvent.detail as {data: FileItemData; source: HTMLElement}
      if (data && source !== params.itemElement) {
        params.emitDrop(data)
      }
    }

    params.itemElement.addEventListener('touch-drop', onTouchDrop)

    return {
      destroy() {
        controller.destroy()
        params.itemElement?.removeEventListener('touch-drop', onTouchDrop)
      },
    }
  }

  return {
    destroy() {
      controller.destroy()
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
  fileItem.style.transform = `translateX(${offset}px)`
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
    fileItem.style.transform = `translateX(-${FileItemModel.SWIPE_ACTION_WIDTH}px)`
    swipeContainer?.classList.add('swipe-left')
    swipeContainer?.classList.remove('swipe-right')
    swipeContainer?.classList.add('swipe-active')
  } else if (finish.state === 'open-right') {
    fileItem.style.transform = `translateX(${FileItemModel.SWIPE_ACTION_WIDTH}px)`
    swipeContainer?.classList.add('swipe-right')
    swipeContainer?.classList.remove('swipe-left')
    swipeContainer?.classList.add('swipe-active')
  } else {
    fileItem.style.transform = 'translateX(0)'
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
  fileItem.style.transform = 'translateX(0)'
  swipeContainer?.classList.remove('swipe-active', 'swipe-left', 'swipe-right')

  fileItem.addEventListener(
    'transitionend',
    () => {
      fileItem.classList.remove('snap-back')
    },
    {once: true},
  )
}
