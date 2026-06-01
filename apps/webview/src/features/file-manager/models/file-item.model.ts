import {atom, wrap} from '@reatom/core'

import {tryGetAppContext} from 'root/shared/services/app-context'
import type {ViewMode} from 'root/shared/contracts/file-manager'
import type {FileItemData} from 'root/shared/contracts/file-manager'
import {isAudioFile, resolveFileFormat} from 'root/utils/file-format-registry'
import {isDerivativeUnavailableError} from 'root/features/media/components/file-loader'
import {
  acquireFileThumbnail,
  getFileThumbnailKey,
  invalidateFileThumbnail,
  peekFileThumbnail,
  releaseFileThumbnail,
  type FileThumbnailHandle,
  type FileThumbnailAcquireOptions,
} from './file-thumbnail-cache.model'

export type SwipeState = 'idle' | 'tracking' | 'open-left' | 'open-right'
type SwipeDirection = 'horizontal' | 'vertical' | null

export interface SwipeMoveResult {
  offset: number
  preventDefault: boolean
}

export interface SwipeFinishResult {
  state: SwipeState
  offset: number
  emitSwipeOpen: boolean
}

export class FileItemModel {
  readonly isTouchDragging = atom(false)
  readonly swipeOffsetX = atom(0)
  readonly swipeState = atom<SwipeState>('idle')
  readonly thumbnailUrl = atom<string | null>(null)

  private longPressTimer?: ReturnType<typeof setTimeout>
  private swipeStartX = 0
  private swipeStartY = 0
  private swipeBaseOffset = 0
  private swipeDirection: SwipeDirection = null
  private thumbnailAbortController: AbortController | null = null
  private thumbnailHandle: FileThumbnailHandle | null = null
  private thumbnailTargetItem: FileItemData | null = null
  private thumbnailRenderRecoveryAttempted = false
  private thumbnailToken = 0
  private thumbnailTargetKey = ''

  static readonly SWIPE_ACTION_WIDTH = 64
  static readonly SWIPE_SNAP_THRESHOLD = 28
  static readonly SWIPE_DRAG_FACTOR = 0.84
  private static readonly SWIPE_MOVE_GUARD = 10
  private static readonly LONG_PRESS_DELAY_MS = 500

  get isSwipeOpen() {
    return this.swipeState() === 'open-left' || this.swipeState() === 'open-right'
  }

  get isTracking() {
    return this.swipeState() === 'tracking'
  }

  setTouchDragging(value: boolean) {
    this.isTouchDragging.set(value)
  }

  setThumbnailTarget(item: FileItemData | undefined, viewMode: ViewMode) {
    const nextKey = item && this.shouldLoadThumbnail(item, viewMode) ? getFileThumbnailKey(item) : ''
    if (this.thumbnailTargetKey === nextKey) {
      return
    }

    this.clearThumbnail()
    this.thumbnailTargetKey = nextKey
    this.thumbnailTargetItem = item ?? null
    this.thumbnailRenderRecoveryAttempted = false

    if (!item || !nextKey) {
      return
    }

    if (!tryGetAppContext()) {
      return
    }

    const cached = peekFileThumbnail(item)
    if (cached?.status === 'loaded') {
      this.thumbnailUrl.set(cached.url)
    }
    if (cached?.status === 'failed') {
      return
    }

    const controller = new AbortController()
    this.thumbnailAbortController = controller
    const token = ++this.thumbnailToken

    void this.loadThumbnail(item, controller, token, nextKey)
  }

  handleThumbnailRenderError(sourceUrl: string | null) {
    const item = this.thumbnailTargetItem
    const targetKey = this.thumbnailTargetKey
    if (!sourceUrl || this.thumbnailUrl() !== sourceUrl || !item || !targetKey) {
      return
    }

    invalidateFileThumbnail(item, sourceUrl)
    this.clearThumbnail()
    this.thumbnailTargetKey = targetKey
    this.thumbnailTargetItem = item

    if (this.thumbnailRenderRecoveryAttempted || !tryGetAppContext()) {
      return
    }

    this.thumbnailRenderRecoveryAttempted = true
    const controller = new AbortController()
    this.thumbnailAbortController = controller
    const token = ++this.thumbnailToken
    void this.loadThumbnail(item, controller, token, targetKey, 'skip')
  }

  clearLongPressTimer() {
    if (!this.longPressTimer) return
    clearTimeout(this.longPressTimer)
    this.longPressTimer = undefined
  }

  startTouch(event: TouchEvent, onLongPress?: (event: TouchEvent) => void) {
    const touch = event.touches[0]
    if (!touch) return

    this.swipeStartX = touch.clientX
    this.swipeStartY = touch.clientY
    this.swipeDirection = null
    this.swipeBaseOffset = this.swipeOffsetX()

    if (this.isSwipeOpen) return

    this.clearLongPressTimer()
    if (!onLongPress) {
      return
    }

    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = undefined
      onLongPress(event)
    }, FileItemModel.LONG_PRESS_DELAY_MS)
  }

  onTouchMove(event: TouchEvent, viewMode: ViewMode): SwipeMoveResult | null {
    const touch = event.touches[0]
    if (!touch) return null

    const dx = touch.clientX - this.swipeStartX
    const dy = touch.clientY - this.swipeStartY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (
      this.swipeDirection === null &&
      (absDx > FileItemModel.SWIPE_MOVE_GUARD || absDy > FileItemModel.SWIPE_MOVE_GUARD)
    ) {
      this.swipeDirection = absDx > absDy ? 'horizontal' : 'vertical'

      if (this.swipeDirection === 'horizontal') {
        this.clearLongPressTimer()
        this.swipeBaseOffset = this.swipeOffsetX()
      }
    }

    if (this.longPressTimer && (absDx > FileItemModel.SWIPE_MOVE_GUARD || absDy > FileItemModel.SWIPE_MOVE_GUARD)) {
      this.clearLongPressTimer()
    }

    if (this.swipeDirection !== 'horizontal') return null
    if (viewMode !== 'list') return null

    this.swipeState.set('tracking')

    const W = FileItemModel.SWIPE_ACTION_WIDTH
    let offset = this.swipeBaseOffset + dx * FileItemModel.SWIPE_DRAG_FACTOR
    offset = Math.max(-W, Math.min(W, offset))
    this.swipeOffsetX.set(offset)

    return {offset, preventDefault: true}
  }

  onTouchEnd(): SwipeFinishResult | null {
    if (!this.isTracking) return null

    this.clearLongPressTimer()

    const W = FileItemModel.SWIPE_ACTION_WIDTH
    const T = FileItemModel.SWIPE_SNAP_THRESHOLD
    const offset = this.swipeOffsetX()

    if (offset < -T) {
      this.swipeOffsetX.set(-W)
      this.swipeState.set('open-left')
      return {state: 'open-left', offset: -W, emitSwipeOpen: true}
    }

    if (offset > T) {
      this.swipeOffsetX.set(W)
      this.swipeState.set('open-right')
      return {state: 'open-right', offset: W, emitSwipeOpen: true}
    }

    this.swipeOffsetX.set(0)
    this.swipeState.set('idle')
    this.swipeDirection = null
    return {state: 'idle', offset: 0, emitSwipeOpen: false}
  }

  closeSwipe(): boolean {
    if (this.swipeState() === 'idle') return false

    this.swipeOffsetX.set(0)
    this.swipeBaseOffset = 0
    this.swipeState.set('idle')
    this.swipeDirection = null
    return true
  }

  dispose() {
    this.clearLongPressTimer()
    this.clearThumbnail()
    this.thumbnailTargetKey = ''
    this.thumbnailTargetItem = null
    this.thumbnailRenderRecoveryAttempted = false
    this.closeSwipe()
    this.isTouchDragging.set(false)
    this.swipeStartX = 0
    this.swipeStartY = 0
    this.swipeDirection = null
  }

  private async loadThumbnail(
    item: FileItemData,
    controller: AbortController,
    token: number,
    targetKey: string,
    preparedSourcePolicy: FileThumbnailAcquireOptions['preparedSourcePolicy'] = 'auto',
  ) {
    try {
      const handle = await wrap(
        acquireFileThumbnail(item, {
          signal: controller.signal,
          displayJobIntentId:
            preparedSourcePolicy === 'skip'
              ? `file-item-thumbnail:${targetKey}:blob-retry`
              : `file-item-thumbnail:${targetKey}`,
          preparedSourcePolicy,
        }),
      )

      if (
        controller.signal.aborted ||
        token !== this.thumbnailToken ||
        this.thumbnailTargetKey !== targetKey
      ) {
        releaseFileThumbnail(handle)
        return
      }

      this.releaseThumbnailHandle()
      this.thumbnailHandle = handle
      this.thumbnailUrl.set(handle.url)
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === 'AbortError') &&
        !isDerivativeUnavailableError(error)
      ) {
        console.warn('Failed to load file item thumbnail', error)
      }
    } finally {
      if (this.thumbnailAbortController === controller) {
        this.thumbnailAbortController = null
      }
    }
  }

  private clearThumbnail() {
    this.thumbnailAbortController?.abort()
    this.thumbnailAbortController = null
    this.thumbnailToken++

    this.releaseThumbnailHandle()
    this.thumbnailUrl.set(null)
  }

  private releaseThumbnailHandle() {
    const handle = this.thumbnailHandle
    if (!handle) {
      return
    }

    this.thumbnailHandle = null
    releaseFileThumbnail(handle)
  }

  private shouldLoadThumbnail(item: FileItemData, viewMode: ViewMode): boolean {
    if (item.isDir) return false
    if (viewMode !== 'list' && viewMode !== 'grid') return false
    return (
      resolveFileFormat(item).openBehavior.kind === 'gallery' ||
      isAudioFile(item.name, item.mimeType)
    )
  }
}
