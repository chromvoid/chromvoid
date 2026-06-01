import {atom, wrap} from '@reatom/core'

export type MobilePointerDndDomain = 'passmanager' | 'files'

export type MobilePointerDndPayload = {
  domain: MobilePointerDndDomain
  kind: string
}

export type MobilePointerDndPoint = {
  x: number
  y: number
}

export type MobilePointerDndTarget = {
  id: string
  el: HTMLElement
}

export type MobilePointerDndAdapter<TPayload extends MobilePointerDndPayload> = {
  canDrop: (targetId: string, payload: TPayload) => boolean
  drop: (targetId: string, payload: TPayload) => Promise<boolean> | boolean
  getGhostLabel: (payload: TPayload) => string
  onAfterDrop?: (targetId: string, payload: TPayload, dropped: boolean) => void
  onCancel?: (payload: TPayload) => void
}

type MobilePointerDndOptions = {
  namespace?: string
  targetAttribute?: string
  thresholdPx?: number
}

type BodyUserSelectSnapshot = {
  userSelect: string
  webkitUserSelect: string
} | null

const DEFAULT_THRESHOLD_PX = 8
const DEFAULT_TARGET_ATTRIBUTE = 'data-mobile-dnd-target-id'

function pointDistanceSquared(left: MobilePointerDndPoint, right: MobilePointerDndPoint): number {
  const dx = right.x - left.x
  const dy = right.y - left.y
  return dx * dx + dy * dy
}

function getBodyStyle(): (CSSStyleDeclaration & {webkitUserSelect?: string}) | null {
  if (typeof document === 'undefined') return null
  return document.body?.style ?? null
}

export class MobilePointerDndModel<TPayload extends MobilePointerDndPayload> {
  readonly active
  readonly payload
  readonly point
  readonly dropTargetId
  readonly ghostLabel
  readonly liveMessage

  private readonly dropZoneRoots = new Set<Document | ShadowRoot>()
  private readonly targetAttribute: string
  private readonly thresholdPx: number
  private startPoint: MobilePointerDndPoint | null = null
  private bodyUserSelectSnapshot: BodyUserSelectSnapshot = null

  constructor(
    private readonly adapter: MobilePointerDndAdapter<TPayload>,
    options: MobilePointerDndOptions = {},
  ) {
    const namespace = options.namespace ?? 'mobilePointerDnd'
    this.targetAttribute = options.targetAttribute ?? DEFAULT_TARGET_ATTRIBUTE
    this.thresholdPx = options.thresholdPx ?? DEFAULT_THRESHOLD_PX

    this.active = atom(false, `${namespace}.active`)
    this.payload = atom<TPayload | null>(null, `${namespace}.payload`)
    this.point = atom<MobilePointerDndPoint | null>(null, `${namespace}.point`)
    this.dropTargetId = atom<string | null>(null, `${namespace}.dropTargetId`)
    this.ghostLabel = atom('', `${namespace}.ghostLabel`)
    this.liveMessage = atom('', `${namespace}.liveMessage`)
  }

  begin(payload: TPayload, point: MobilePointerDndPoint): void {
    this.cancel()
    this.startPoint = point
    this.payload.set(payload)
    this.point.set(point)
    this.ghostLabel.set(this.adapter.getGhostLabel(payload))
    this.liveMessage.set('')
  }

  move(point: MobilePointerDndPoint): boolean {
    const payload = this.payload()
    const startPoint = this.startPoint
    if (!payload || !startPoint) return false

    this.point.set(point)

    if (!this.active()) {
      const thresholdSquared = this.thresholdPx * this.thresholdPx
      if (pointDistanceSquared(startPoint, point) < thresholdSquared) {
        return false
      }

      this.active.set(true)
      this.disableBodyUserSelect()
    }

    const hit = this.hitTestTarget(point.x, point.y, payload)
    const targetId = hit?.id ?? null
    if (this.dropTargetId() !== targetId) {
      this.dropTargetId.set(targetId)
      this.liveMessage.set(targetId ? 'Drop target selected' : '')
    }

    return true
  }

  async commit(point: MobilePointerDndPoint | null = this.point()): Promise<boolean> {
    const payload = this.payload()
    if (!payload) {
      this.cleanup()
      return false
    }

    if (!this.active()) {
      this.cleanup()
      this.adapter.onCancel?.(payload)
      return false
    }

    const hit = point ? this.hitTestTarget(point.x, point.y, payload) : null
    if (!hit) {
      this.cleanup()
      this.adapter.onCancel?.(payload)
      return false
    }

    const targetId = hit.id
    this.cleanup()
    const dropped = await wrap(Promise.resolve(this.adapter.drop(targetId, payload))).catch(() => false)
    this.adapter.onAfterDrop?.(targetId, payload, dropped)
    return dropped
  }

  cancel(): void {
    const payload = this.payload()
    this.cleanup()
    if (payload) {
      this.adapter.onCancel?.(payload)
    }
  }

  registerDropZoneRoot(root: Document | ShadowRoot): void {
    this.dropZoneRoots.add(root)
  }

  unregisterDropZoneRoot(root: Document | ShadowRoot): void {
    this.dropZoneRoots.delete(root)
  }

  hitTestTarget(x: number, y: number, payload: TPayload | null = this.payload()): MobilePointerDndTarget | null {
    if (!payload) return null

    let best: (MobilePointerDndTarget & {area: number}) | null = null
    const selector = `[${this.targetAttribute}]`

    for (const root of this.dropZoneRoots) {
      const elements = root.querySelectorAll<HTMLElement>(selector)
      for (const el of elements) {
        const rect = el.getBoundingClientRect()
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          continue
        }

        const id = el.getAttribute(this.targetAttribute)
        if (!id || !this.adapter.canDrop(id, payload)) {
          continue
        }

        const area = rect.width * rect.height
        if (!best || area < best.area) {
          best = {id, el, area}
        }
      }
    }

    return best ? {id: best.id, el: best.el} : null
  }

  private cleanup(): void {
    this.active.set(false)
    this.payload.set(null)
    this.point.set(null)
    this.dropTargetId.set(null)
    this.ghostLabel.set('')
    this.liveMessage.set('')
    this.startPoint = null
    this.restoreBodyUserSelect()
  }

  private disableBodyUserSelect(): void {
    const style = getBodyStyle()
    if (!style || this.bodyUserSelectSnapshot) return

    this.bodyUserSelectSnapshot = {
      userSelect: style.userSelect,
      webkitUserSelect: style.webkitUserSelect ?? '',
    }
    style.userSelect = 'none'
    style.webkitUserSelect = 'none'
  }

  private restoreBodyUserSelect(): void {
    const style = getBodyStyle()
    const snapshot = this.bodyUserSelectSnapshot
    if (!style || !snapshot) return

    style.userSelect = snapshot.userSelect
    style.webkitUserSelect = snapshot.webkitUserSelect
    this.bodyUserSelectSnapshot = null
  }
}
