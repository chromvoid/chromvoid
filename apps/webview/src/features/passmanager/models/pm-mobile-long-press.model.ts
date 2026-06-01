import {atom} from '@reatom/core'

import {pmMobileDebug} from './pm-mobile-debug'
import type {PMSelectionKind} from './pm-mobile-selection.model'

export type PMLongPressTarget = {
  kind: PMSelectionKind
  id: string
}

type ArmedLongPress = {
  token: number
  target: PMLongPressTarget
  startX: number
  startY: number
  timer: ReturnType<typeof setTimeout>
  committed: boolean
} | null

type LongPressPoint = {
  x: number
  y: number
}

class PMMobileLongPressModel {
  private static readonly LONG_PRESS_DELAY_MS = 500
  private static readonly MOVE_GUARD = 10

  readonly armed = atom<ArmedLongPress>(null, 'passmanager.mobileLongPress.armed')

  private nextToken = 1

  arm(target: PMLongPressTarget, point: LongPressPoint, onCommit: (token: number) => void): number {
    this.cancel()

    const token = this.nextToken
    this.nextToken += 1

    const timer = setTimeout(() => {
      const current = this.armed()
      if (!current || current.token !== token || current.committed) return

      this.armed.set({
        ...current,
        committed: true,
      })
      pmMobileDebug('longPress', 'timer.commit', {
        token,
        target: current.target,
        startX: current.startX,
        startY: current.startY,
      })
      onCommit(token)
    }, PMMobileLongPressModel.LONG_PRESS_DELAY_MS)

    this.armed.set({
      token,
      target,
      startX: point.x,
      startY: point.y,
      timer,
      committed: false,
    })
    pmMobileDebug('longPress', 'arm', {token, target, point})

    return token
  }

  move(point: LongPressPoint): void {
    const current = this.armed()
    if (!current || current.committed) return

    const deltaX = Math.abs(point.x - current.startX)
    const deltaY = Math.abs(point.y - current.startY)
    if (
      deltaX <= PMMobileLongPressModel.MOVE_GUARD &&
      deltaY <= PMMobileLongPressModel.MOVE_GUARD
    ) {
      return
    }

    pmMobileDebug('longPress', 'move.cancel', {
      token: current.token,
      target: current.target,
      deltaX,
      deltaY,
      point,
    })
    this.cancel()
  }

  release(): number | null {
    const current = this.armed()
    if (!current) return null

    clearTimeout(current.timer)
    this.armed.set(null)
    pmMobileDebug('longPress', 'release', {
      token: current.token,
      target: current.target,
      committed: current.committed,
    })
    return current.token
  }

  cancel(): void {
    const current = this.armed()
    if (!current) return

    clearTimeout(current.timer)
    this.armed.set(null)
    pmMobileDebug('longPress', 'cancel', {
      token: current.token,
      target: current.target,
      committed: current.committed,
    })
  }

  forceCommitFromContextMenu(target: PMLongPressTarget, onCommit: (token: number) => void): number {
    this.cancel()
    const token = this.nextToken
    this.nextToken += 1
    pmMobileDebug('longPress', 'contextMenu.commit', {token, target})
    onCommit(token)
    return token
  }
}

export const pmMobileLongPressModel = new PMMobileLongPressModel()
