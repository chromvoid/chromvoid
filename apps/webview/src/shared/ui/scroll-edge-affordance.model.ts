import {atom} from '@reatom/core'

const BLOCK_EDGE_OVERFLOW_THRESHOLD = 1

export class ScrollEdgeAffordanceModel implements EventListenerObject {
  readonly hasBlockStartOverflow = atom(false)
  readonly hasBlockEndOverflow = atom(false)

  private scroller: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private frameId: number | null = null

  bindScroller(scroller: HTMLElement | null): void {
    if (this.scroller === scroller) {
      this.scheduleMeasure()
      return
    }

    this.unbindScroller()
    this.scroller = scroller

    if (!scroller) {
      return
    }

    scroller.addEventListener('scroll', this, {passive: true})

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure())
      this.resizeObserver.observe(scroller)
    }

    this.scheduleMeasure()
  }

  scheduleMeasure(): void {
    if (!this.scroller) {
      this.resetOverflowState()
      return
    }

    if (this.frameId !== null) return

    this.frameId = requestAnimationFrame(() => {
      this.frameId = null
      this.measureNow()
    })
  }

  measureNow(): void {
    const scroller = this.scroller
    if (!scroller) {
      this.resetOverflowState()
      return
    }

    const scrollTop = Math.max(0, scroller.scrollTop)
    const remaining = scroller.scrollHeight - scroller.clientHeight - scrollTop
    this.setBlockStartOverflow(scrollTop > BLOCK_EDGE_OVERFLOW_THRESHOLD)
    this.setBlockEndOverflow(remaining > BLOCK_EDGE_OVERFLOW_THRESHOLD)
  }

  dispose(): void {
    this.unbindScroller()
  }

  handleEvent(event: Event): void {
    if (event.type === 'scroll') {
      this.scheduleMeasure()
    }
  }

  private unbindScroller(): void {
    if (this.scroller) {
      this.scroller.removeEventListener('scroll', this)
    }

    this.resizeObserver?.disconnect()
    this.resizeObserver = null

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }

    this.scroller = null
    this.resetOverflowState()
  }

  private resetOverflowState(): void {
    this.setBlockStartOverflow(false)
    this.setBlockEndOverflow(false)
  }

  private setBlockStartOverflow(value: boolean): void {
    if (this.hasBlockStartOverflow() === value) return
    this.hasBlockStartOverflow.set(value)
  }

  private setBlockEndOverflow(value: boolean): void {
    if (this.hasBlockEndOverflow() === value) return
    this.hasBlockEndOverflow.set(value)
  }
}
