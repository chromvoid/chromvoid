import {css, type PropertyValues} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {mobileQuickViewShellStyles} from 'root/shared/ui/mobile-quick-view.styles'
import {MobileSurfaceLayout} from 'root/shared/ui/mobile-surface-layout'
import {mobileSurfaceLayoutBlockFillStyles} from 'root/shared/ui/mobile-surface-layout.styles'
import {defineNotesQuickViewUikitControls, NotesQuickViewBase} from './notes-quick-view-base'
import {notesQuickViewStyles} from './notes-quick-view.styles'

export class NotesQuickViewMobile extends NotesQuickViewBase {
  private readonly scrollListener: EventListener
  private scrollElement: HTMLElement | null = null
  private scrollRestoreFrame = 0

  constructor() {
    super()
    this.scrollListener = this.handleMobileScroll.bind(this)
  }

  static styles = [
    notesQuickViewStyles,
    mobileSurfaceLayoutBlockFillStyles,
    mobileQuickViewShellStyles,
    css`
      .row {
        gap: var(--cv-space-2);
      }
    `,
  ]

  static define() {
    defineNotesQuickViewUikitControls()
    CvEmptyState.define()
    MobileSurfaceLayout.define()
    if (!customElements.get('notes-quick-view-mobile')) {
      customElements.define('notes-quick-view-mobile', this)
    }
  }

  render() {
    return html`
      <mobile-surface-layout variant="standard" scroll="owned" data-layout="mobile">
        ${this.renderHeader('header')}
        <div class="quick-view__content">${this.renderContent()}</div>
      </mobile-surface-layout>
    `
  }

  override disconnectedCallback(): void {
    this.persistMobileScrollPosition()
    this.detachMobileScrollListener()
    this.cancelMobileScrollRestore()
    super.disconnectedCallback()
  }

  protected override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.syncMobileScrollElement()
    this.applyMobileScrollRestore()
    this.queueMobileScrollRestore()
    this.syncAfterMobileLayoutUpdate()
  }

  private getMobileLayout(): MobileSurfaceLayout | null {
    return this.renderRoot.querySelector('mobile-surface-layout')
  }

  private getMobileScrollElement(): HTMLElement | null {
    return this.getMobileLayout()?.shadowRoot?.querySelector<HTMLElement>('[part~="scroll"]') ?? null
  }

  private syncMobileScrollElement(): void {
    const nextScrollElement = this.getMobileScrollElement()
    if (nextScrollElement === this.scrollElement) {
      return
    }

    this.detachMobileScrollListener()
    this.scrollElement = nextScrollElement
    this.scrollElement?.addEventListener('scroll', this.scrollListener, {passive: true})
  }

  private detachMobileScrollListener(): void {
    this.scrollElement?.removeEventListener('scroll', this.scrollListener)
    this.scrollElement = null
  }

  private handleMobileScroll(): void {
    this.persistMobileScrollPosition()
  }

  private persistMobileScrollPosition(): void {
    const scrollElement = this.scrollElement ?? this.getMobileScrollElement()
    if (!scrollElement) {
      return
    }

    this.model.saveMobileScrollPosition(scrollElement.scrollTop)
  }

  private applyMobileScrollRestore(): void {
    const scrollElement = this.scrollElement ?? this.getMobileScrollElement()
    const scrollTop = this.model.getMobileScrollPosition()
    if (!scrollElement || scrollTop === null) {
      return
    }

    const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight)
    const nextScrollTop = maxScrollTop > 0 ? Math.min(maxScrollTop, scrollTop) : scrollTop
    if (Math.abs(scrollElement.scrollTop - nextScrollTop) > 1) {
      scrollElement.scrollTop = nextScrollTop
    }
  }

  private queueMobileScrollRestore(): void {
    const ownerWindow = this.ownerDocument.defaultView
    if (!ownerWindow || this.scrollRestoreFrame) {
      return
    }

    this.scrollRestoreFrame = ownerWindow.requestAnimationFrame(() => {
      this.scrollRestoreFrame = 0
      if (this.isConnected) {
        this.syncMobileScrollElement()
        this.applyMobileScrollRestore()
      }
    })
  }

  private cancelMobileScrollRestore(): void {
    const ownerWindow = this.ownerDocument.defaultView
    if (ownerWindow && this.scrollRestoreFrame) {
      ownerWindow.cancelAnimationFrame(this.scrollRestoreFrame)
    }
    this.scrollRestoreFrame = 0
  }

  private syncAfterMobileLayoutUpdate(): void {
    const layout = this.getMobileLayout()
    if (!layout) {
      return
    }

    void layout.updateComplete.then(() => {
      if (!this.isConnected) {
        return
      }

      this.syncMobileScrollElement()
      this.applyMobileScrollRestore()
      this.queueMobileScrollRestore()
    })
  }
}
