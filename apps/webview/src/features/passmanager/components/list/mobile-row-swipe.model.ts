import {atom} from '@reatom/core'

export type PMMobileRowSwipeState = 'idle' | 'tracking' | 'open-left' | 'open-right'
type PMMobileRowSwipeDirection = 'horizontal' | 'vertical' | null
type PMMobileRowSwipeGestureDirection = 'left' | 'right'

export interface PMMobileRowSwipeMoveResult {
  offset: number
  preventDefault: boolean
}

export interface PMMobileRowSwipeFinishResult {
  state: PMMobileRowSwipeState
  offset: number
  emitSwipeOpen: boolean
}

type PMMobileRowSwipeOptions = {
  atomPrefix: string
  directions?: readonly PMMobileRowSwipeGestureDirection[]
}

export class PMMobileRowSwipeModel {
  static readonly ACTION_WIDTH = 64
  private static readonly SNAP_THRESHOLD = 28
  private static readonly DRAG_FACTOR = 0.84
  private static readonly MOVE_GUARD = 10

  readonly offsetX
  readonly state
  readonly settling

  private readonly directions: ReadonlySet<PMMobileRowSwipeGestureDirection>
  private startX = 0
  private startY = 0
  private baseOffset = 0
  private direction: PMMobileRowSwipeDirection = null

  constructor(options: PMMobileRowSwipeOptions) {
    this.offsetX = atom(0, `${options.atomPrefix}.offsetX`)
    this.state = atom<PMMobileRowSwipeState>('idle', `${options.atomPrefix}.state`)
    this.settling = atom(false, `${options.atomPrefix}.settling`)
    this.directions = new Set(options.directions ?? ['left', 'right'])
  }

  get isOpen(): boolean {
    return this.state() === 'open-left' || this.state() === 'open-right'
  }

  get isTracking(): boolean {
    return this.state() === 'tracking'
  }

  startTouch(event: TouchEvent): void {
    const touch = event.touches[0]
    if (!touch) return

    this.startX = touch.clientX
    this.startY = touch.clientY
    this.direction = null
    this.baseOffset = this.offsetX()
  }

  moveTouch(event: TouchEvent): PMMobileRowSwipeMoveResult | null {
    const touch = event.touches[0]
    if (!touch) return null

    const dx = touch.clientX - this.startX
    const dy = touch.clientY - this.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (
      this.direction === null &&
      (absDx > PMMobileRowSwipeModel.MOVE_GUARD || absDy > PMMobileRowSwipeModel.MOVE_GUARD)
    ) {
      this.direction = absDx > absDy ? 'horizontal' : 'vertical'
      if (this.direction === 'horizontal') {
        this.baseOffset = this.offsetX()
      }
    }

    if (this.direction !== 'horizontal') return null

    const width = PMMobileRowSwipeModel.ACTION_WIDTH
    const minOffset = this.directions.has('left') ? -width : 0
    const maxOffset = this.directions.has('right') ? width : 0
    const offset = Math.max(
      minOffset,
      Math.min(maxOffset, this.baseOffset + dx * PMMobileRowSwipeModel.DRAG_FACTOR),
    )
    if (this.state() === 'idle' && offset === this.baseOffset) return null

    this.state.set('tracking')
    this.settling.set(false)
    this.offsetX.set(offset)

    return {offset, preventDefault: true}
  }

  shouldCancelLongPress(event: TouchEvent): boolean {
    const touch = event.touches[0]
    if (!touch) return false

    const dx = Math.abs(touch.clientX - this.startX)
    const dy = Math.abs(touch.clientY - this.startY)
    return dx > PMMobileRowSwipeModel.MOVE_GUARD || dy > PMMobileRowSwipeModel.MOVE_GUARD
  }

  finishTouch(): PMMobileRowSwipeFinishResult | null {
    if (!this.isTracking) {
      this.direction = null
      return null
    }

    const width = PMMobileRowSwipeModel.ACTION_WIDTH
    const offset = this.offsetX()

    if (this.directions.has('left') && offset < -PMMobileRowSwipeModel.SNAP_THRESHOLD) {
      return this.open('open-left', -width)
    }

    if (this.directions.has('right') && offset > PMMobileRowSwipeModel.SNAP_THRESHOLD) {
      return this.open('open-right', width)
    }

    return this.settleClosed()
  }

  close(): boolean {
    if (this.state() === 'idle') return false
    this.settleClosed()
    return true
  }

  finishTransition(): void {
    this.settling.set(false)
  }

  dispose(): void {
    this.offsetX.set(0)
    this.state.set('idle')
    this.settling.set(false)
    this.startX = 0
    this.startY = 0
    this.baseOffset = 0
    this.direction = null
  }

  private open(
    state: Extract<PMMobileRowSwipeState, 'open-left' | 'open-right'>,
    offset: number,
  ): PMMobileRowSwipeFinishResult {
    this.offsetX.set(offset)
    this.state.set(state)
    this.settling.set(true)
    this.direction = null
    return {state, offset, emitSwipeOpen: true}
  }

  private settleClosed(): PMMobileRowSwipeFinishResult {
    this.offsetX.set(0)
    this.baseOffset = 0
    this.state.set('idle')
    this.settling.set(true)
    this.direction = null
    return {state: 'idle', offset: 0, emitSwipeOpen: false}
  }
}
