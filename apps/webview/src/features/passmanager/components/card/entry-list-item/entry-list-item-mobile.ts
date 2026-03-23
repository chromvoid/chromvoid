import {html, nothing} from 'lit'

import {Entry} from '@project/passmanager'
import {i18n} from '@project/passmanager'

import {PMEntryListItemBase} from './entry-list-item-base'
import {PMEntryListItemModel, type SwipeFinishResult} from './entry-list-item.model'
import {pmEntryListItemBaseStyles, pmEntryListItemMobileStyles} from './styles'

export class PMEntryListItemMobile extends PMEntryListItemBase {
  static define() {
    if (!customElements.get('pm-entry-list-item-mobile')) {
      customElements.define('pm-entry-list-item-mobile', this)
    }
  }

  static styles = [...pmEntryListItemBaseStyles, pmEntryListItemMobileStyles]

  private contextMenuOpen = false
  private contextMenuX = 0
  private contextMenuY = 0
  private mobileTouchMoveBound = false

  override connectedCallback() {
    super.connectedCallback()
    if (!this.mobileTouchMoveBound) {
      this.updateComplete.then(() => {
        const listItem = this.renderRoot.querySelector('.list-item')
        listItem?.addEventListener('touchmove', this.handleTouchMove as EventListener, {passive: false})
        this.mobileTouchMoveBound = true
      })
    }
  }

  override disconnectedCallback() {
    this.mobileTouchMoveBound = false
    const listItem = this.renderRoot.querySelector('.list-item')
    listItem?.removeEventListener('touchmove', this.handleTouchMove as EventListener)
    this.model.dispose()
    super.disconnectedCallback()
  }

  // ── Touch handlers ──

  private readonly handleTouchStart = (event: TouchEvent) => {
    this.model.startTouch(event, (e) => this.openContextMenu(e))
  }

  private readonly handleTouchMove = (event: TouchEvent) => {
    const result = this.model.onTouchMove(event)
    if (!result) return
    if (result.preventDefault) event.preventDefault()
    this.applySwipeMoveVisual(result.offset)
  }

  private readonly handleTouchEnd = () => {
    const result = this.model.onTouchEnd()
    if (!result) return
    this.applySwipeFinishVisual(result)
  }

  // ── Swipe visual helpers ──

  private applySwipeMoveVisual(offset: number) {
    const container = this.renderRoot.querySelector('.swipe-container') as HTMLElement | null
    const listItem = this.renderRoot.querySelector('.list-item') as HTMLElement | null
    if (!container || !listItem) return

    container.classList.add('swipe-active')
    container.classList.toggle('swipe-right', offset > 0)
    container.classList.toggle('swipe-left', offset < 0)
    listItem.classList.add('swiping')
    listItem.classList.remove('snap-back')
    listItem.style.transform = `translateX(${offset}px)`
  }

  private applySwipeFinishVisual(finish: SwipeFinishResult) {
    const container = this.renderRoot.querySelector('.swipe-container') as HTMLElement | null
    const listItem = this.renderRoot.querySelector('.list-item') as HTMLElement | null
    if (!listItem) return

    listItem.classList.remove('swiping')
    listItem.classList.add('snap-back')

    if (finish.state === 'open-left') {
      listItem.style.transform = `translateX(-${PMEntryListItemModel.SWIPE_ACTION_WIDTH}px)`
      container?.classList.add('swipe-left')
      container?.classList.remove('swipe-right')
    } else if (finish.state === 'open-right') {
      listItem.style.transform = `translateX(${PMEntryListItemModel.SWIPE_ACTION_WIDTH}px)`
      container?.classList.add('swipe-right')
      container?.classList.remove('swipe-left')
    } else {
      listItem.style.transform = 'translateX(0)'
      container?.classList.remove('swipe-active', 'swipe-left', 'swipe-right')
    }

    listItem.addEventListener('transitionend', () => listItem.classList.remove('snap-back'), {once: true})
  }

  private applySwipeCloseVisual() {
    const container = this.renderRoot.querySelector('.swipe-container') as HTMLElement | null
    const listItem = this.renderRoot.querySelector('.list-item') as HTMLElement | null
    if (!listItem) return

    listItem.classList.remove('swiping')
    listItem.classList.add('snap-back')
    listItem.style.transform = 'translateX(0)'
    container?.classList.remove('swipe-active', 'swipe-left', 'swipe-right')
    listItem.addEventListener('transitionend', () => listItem.classList.remove('snap-back'), {once: true})
  }

  // ── Swipe action handlers ──

  private onSwipeCopyUsername(event: Event) {
    event.stopPropagation()
    this.model.copyUsername(event)
    this.model.closeSwipe()
    this.applySwipeCloseVisual()
  }

  private onSwipeCopyOtp(event: Event) {
    event.stopPropagation()
    // OTP copy is handled by the entry detail view for now
    this.model.closeSwipe()
    this.applySwipeCloseVisual()
  }

  private onSwipeDelete(event: Event) {
    event.stopPropagation()
    this.model.closeSwipe()
    this.applySwipeCloseVisual()
    this.dispatchEvent(new CustomEvent('entry-delete', {detail: this.model.entry.peek(), bubbles: true, composed: true}))
  }

  // ── Context menu ──

  private openContextMenu(event: TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    if (!touch) return

    this.contextMenuX = touch.clientX
    this.contextMenuY = touch.clientY
    this.contextMenuOpen = true
    this.requestUpdate()
  }

  private closeContextMenu() {
    this.contextMenuOpen = false
    this.requestUpdate()
  }

  private onContextAction(action: string) {
    this.closeContextMenu()
    const entry = this.model.entry.peek()
    if (!entry) return

    switch (action) {
      case 'open':
        this.model.openEntry(new Event('click'))
        break
      case 'copy-username':
        this.model.copyUsername(new Event('click'))
        break
      case 'copy-password':
        void this.model.copyPassword(new Event('click'))
        break
      case 'delete':
        this.dispatchEvent(new CustomEvent('entry-delete', {detail: entry, bubbles: true, composed: true}))
        break
    }
  }

  // ── Click override ──

  protected override onClick(event: Event) {
    if (this.model.isSwipeOpen) {
      this.model.closeSwipe()
      this.applySwipeCloseVisual()
      return
    }
    super.onClick(event)
  }

  // ── Render ──

  override render() {
    if (!window.passmanager) return nothing

    const entry = this.model.entry()
    if (!(entry instanceof Entry)) return nothing

    const hasUsername = this.model.hasUsername()
    const hasOtp = this.model.hasOtp()
    const hasSshKeys = this.model.hasSshKeys()

    return html`
      <div class="swipe-container">
        ${this.renderSwipeActions(entry)}

        <div
          class="list-item ${this.isSelected ? 'selected' : ''}"
          @click=${this.onClick}
          @keydown=${this.onKeyDown}
          @touchstart=${this.handleTouchStart}
          @touchend=${this.handleTouchEnd}
          @touchcancel=${this.handleTouchEnd}
          role="button"
          tabindex="0"
        >
          ${this.renderIcon(entry)}

          <div class="item-content">
            <div class="item-title">
              ${entry.title || i18n('no_title')}
              ${hasOtp ? html`<span class="otp-indicator"></span>` : nothing}
              ${hasSshKeys ? html`<span class="ssh-indicator" title=${i18n('tooltip:has-ssh')}></span>` : nothing}
            </div>
            ${hasUsername ? html`<div class="item-subtitle">${entry.username}</div>` : nothing}
          </div>

          <button class="action-button primary-action" @click=${this.onCopyPassword} aria-label=${i18n('tooltip:copy-password')}>
            <cv-icon name="key"></cv-icon>
          </button>
        </div>
      </div>

      ${this.contextMenuOpen ? this.renderContextMenu(entry) : nothing}
    `
  }

  private renderSwipeActions(entry: Entry) {
    const hasUsername = this.model.hasUsername()
    const hasOtp = this.model.hasOtp()

    return html`
      <div class="swipe-actions-left">
        <button class="swipe-action" @click=${(e: Event) => this.onSwipeDelete(e)} aria-label=${i18n('button:delete_entry')}>
          <cv-icon name="trash"></cv-icon>
        </button>
      </div>
      <div class="swipe-actions-right">
        ${hasUsername
          ? html`
              <button class="swipe-action" @click=${(e: Event) => this.onSwipeCopyUsername(e)} aria-label=${i18n('tooltip:copy-username')}>
                <cv-icon name="person-circle"></cv-icon>
              </button>
            `
          : nothing}
        ${hasOtp
          ? html`
              <button class="swipe-action" @click=${(e: Event) => this.onSwipeCopyOtp(e)} aria-label=${i18n('tooltip:copy-otp')}>
                <cv-icon name="shield-check"></cv-icon>
              </button>
            `
          : nothing}
      </div>
    `
  }

  private renderContextMenu(entry: Entry) {
    const hasUsername = this.model.hasUsername()
    const hasOtp = this.model.hasOtp()
    const isReadOnly = window.passmanager.isReadOnly()

    return html`
      <div class="context-menu-backdrop" @click=${() => this.closeContextMenu()}></div>
      <div class="context-menu" style="left:${this.contextMenuX}px;top:${this.contextMenuY}px">
        <button class="context-menu-item" @click=${() => this.onContextAction('open')}>
          <cv-icon name="box-arrow-up-right"></cv-icon>
          ${entry.title || i18n('no_title')}
        </button>
        <div class="context-menu-separator"></div>
        <button class="context-menu-item" @click=${() => this.onContextAction('copy-username')} ?disabled=${!hasUsername}>
          <cv-icon name="person-circle"></cv-icon>
          ${i18n('tooltip:copy-username')}
        </button>
        <button class="context-menu-item" @click=${() => this.onContextAction('copy-password')}>
          <cv-icon name="key"></cv-icon>
          ${i18n('tooltip:copy-password')}
        </button>
        ${hasOtp
          ? html`
              <button class="context-menu-item" @click=${() => this.onContextAction('copy-otp')}>
                <cv-icon name="shield-check"></cv-icon>
                ${i18n('tooltip:copy-otp')}
              </button>
            `
          : nothing}
        <div class="context-menu-separator"></div>
        <button class="context-menu-item destructive" @click=${() => this.onContextAction('delete')} ?disabled=${isReadOnly}>
          <cv-icon name="trash"></cv-icon>
          ${i18n('button:delete_entry')}
        </button>
      </div>
    `
  }
}
