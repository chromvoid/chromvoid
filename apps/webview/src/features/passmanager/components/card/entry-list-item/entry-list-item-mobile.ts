import {peek} from '@reatom/core'
import {nothing, type PropertyValues} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

import {pmMobileDebug} from '../../../models/pm-mobile-debug'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {passwordManagerMobileLayoutModel} from '../../password-manager-layout/password-manager-mobile-layout.model'
import {PMEntryListItemBase} from './entry-list-item-base'
import {type PMEntryListBadge} from './entry-list-item.model'
import {pmEntryListItemBaseStyles, pmEntryListItemMobileStyles} from './styles'

export class PMEntryListItemMobile extends PMEntryListItemBase {
  static define() {
    if (!customElements.get('pm-entry-list-item-mobile')) {
      customElements.define('pm-entry-list-item-mobile', this)
    }
  }

  static styles = [...pmEntryListItemBaseStyles, pmEntryListItemMobileStyles]

  private selectionTapToken: number | null = null

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    this.syncSwipeOffsetStyle()
  }

  override disconnectedCallback() {
    this.model.dispose()
    super.disconnectedCallback()
  }

  // ── Touch handlers ──

  private handleTouchStart(event: TouchEvent) {
    const entry = peek(this.model.entry)
    if (!(entry instanceof Entry)) return

    if (passwordManagerMobileLayoutModel.selection.active()) {
      pmMobileDebug('entryRow', 'touchStart.skip.selectionActive', {entryId: entry.id})
      return
    }

    this.model.startTouch(event)

    const touch = event.touches[0]
    if (!touch) return

    this.selectionTapToken = passwordManagerMobileLayoutModel.beginEntryLongPress(entry.id, {
      x: touch.clientX,
      y: touch.clientY,
    }, () => {
      try {
        event.preventDefault?.()
        event.stopPropagation?.()
      } catch {}
    })
    pmMobileDebug('entryRow', 'touchStart.arm', {entryId: entry.id, token: this.selectionTapToken})
  }

  private handleTouchMove(event: TouchEvent) {
    if (passwordManagerMobileLayoutModel.selection.active()) {
      return
    }

    const touch = event.touches[0]
    if (touch) {
      passwordManagerMobileLayoutModel.moveLongPress({
        x: touch.clientX,
        y: touch.clientY,
      })
    }

    const result = this.model.onTouchMove(event)
    if (!result) return
    if (result.preventDefault) event.preventDefault()
    this.syncSwipeOffsetStyle()
  }

  private handleTouchEnd() {
    const token = passwordManagerMobileLayoutModel.endLongPress()
    const entry = peek(this.model.entry)
    pmMobileDebug('entryRow', 'touchEnd', {
      entryId: entry instanceof Entry ? entry.id : null,
      token,
      selectionActive: passwordManagerMobileLayoutModel.selection.active(),
    })

    if (passwordManagerMobileLayoutModel.selection.active()) {
      return
    }

    const result = this.model.onTouchEnd()
    if (!result) return
    this.syncSwipeOffsetStyle()
  }

  private handlePointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch') return

    const entry = peek(this.model.entry)
    if (!(entry instanceof Entry)) return

    if (passwordManagerMobileLayoutModel.selection.active()) {
      pmMobileDebug('entryRow', 'pointerDown.skip.selectionActive', {entryId: entry.id})
      return
    }

    this.selectionTapToken = passwordManagerMobileLayoutModel.beginEntryLongPress(entry.id, {
      x: event.clientX,
      y: event.clientY,
    })
    pmMobileDebug('entryRow', 'pointerDown.arm', {entryId: entry.id, token: this.selectionTapToken})
  }

  private handlePointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') return

    passwordManagerMobileLayoutModel.moveLongPress({
      x: event.clientX,
      y: event.clientY,
    })
  }

  private handlePointerEnd(event: PointerEvent) {
    if (event.pointerType !== 'touch') return

    const token = passwordManagerMobileLayoutModel.endLongPress()
    const entry = peek(this.model.entry)
    pmMobileDebug('entryRow', 'pointerEnd', {
      entryId: entry instanceof Entry ? entry.id : null,
      token,
      selectionActive: passwordManagerMobileLayoutModel.selection.active(),
    })
  }

  // ── Swipe action handlers ──

  private onSwipeCopyUsername(event: Event) {
    event.stopPropagation()
    this.model.copyUsername(event)
    this.model.closeSwipe()
  }

  private onSwipeCopyOtp(event: Event) {
    event.stopPropagation()
    // OTP copy is handled by the entry detail view for now
    this.model.closeSwipe()
  }

  private onSwipeDelete(event: Event) {
    event.stopPropagation()
    this.model.closeSwipe()
    this.dispatchEvent(new CustomEvent('entry-delete', {detail: peek(this.model.entry), bubbles: true, composed: true}))
  }

  private enterSelectionMode(event?: Event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()

    const entry = peek(this.model.entry)
    if (!(entry instanceof Entry)) return

    if (this.model.isSwipeOpen) {
      this.model.closeSwipe()
    }

    this.selectionTapToken = passwordManagerMobileLayoutModel.triggerEntryContextSelection(entry.id)
    pmMobileDebug('entryRow', 'contextSelection', {entryId: entry.id, token: this.selectionTapToken})
  }

  private handleContextMenu(event: Event) {
    if (passwordManagerMobileLayoutModel.selection.active()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    this.enterSelectionMode(event)
  }

  // ── Click override ──

  protected override onClick(event: Event) {
    const entry = peek(this.model.entry)
    const decision = entry
      ? passwordManagerMobileLayoutModel.handleEntryTap(entry.id, this.selectionTapToken)
      : 'noop'
    pmMobileDebug('entryRow', 'click', {
      entryId: entry instanceof Entry ? entry.id : null,
      token: this.selectionTapToken,
      decision,
      selectionActive: passwordManagerMobileLayoutModel.selection.active(),
    })

    this.selectionTapToken = null

    if (decision === 'noop') {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (this.model.isSwipeOpen) {
      this.model.closeSwipe()
      return
    }

    if (decision === 'toggle' && entry) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    super.onClick(event)
  }

  // ── Render ──

  protected override renderBadgeIcon(_badge: PMEntryListBadge) {
    return html``
  }

  private renderStatusDots(badges: readonly PMEntryListBadge[]) {
    if (badges.length === 0) return nothing

    return html`
      <div class="entry-status-dots" aria-label=${i18n('entry:badges')}>
        ${badges.map(
          (badge) => html`
            <span
              class="entry-status-dot"
              data-badge-id=${badge.id}
              data-family=${badge.family}
              data-severity=${badge.severity}
              title=${badge.label}
              aria-label=${badge.label}
              role="img"
            ></span>
          `,
        )}
      </div>
    `
  }

  override render() {
    if (!getPassmanagerRoot()) return nothing

    const entry = this.model.entry()
    if (!(entry instanceof Entry)) return nothing

    const presentation = this.model.getMobilePresentation(entry)
    const selectionModeActive = this.selectionActive
    const selectedClass = this.isSelected ? ' selected' : ''
    const activeClass = this.manageActiveRowState && this.activeRow ? ' active-row' : ''
    const swipeState = this.model.swipeState()
    const swipeOffsetX = this.model.swipeOffsetX()
    const swipeSettling = this.model.swipeSettling()
    const swipeSideClass =
      swipeState === 'open-left' || swipeOffsetX < 0
        ? ' swipe-left'
        : swipeState === 'open-right' || swipeOffsetX > 0
          ? ' swipe-right'
          : ''
    const swipeActiveClass = swipeState !== 'idle' || swipeOffsetX !== 0 ? ' swipe-active' : ''
    const swipeClass = `swipe-container${swipeActiveClass}${swipeSideClass}`
    const swipeMotionClass = swipeState === 'tracking' && !swipeSettling ? ' swiping' : swipeSettling ? ' snap-back' : ''

    return html`
      <div class=${swipeClass}>
        ${selectionModeActive ? nothing : this.renderSwipeActions()}

        <div
          class="list-item mobile-list-row-surface${selectedClass}${activeClass}${swipeMotionClass}"
          data-entry-id=${entry.id}
          data-swipe-state=${swipeState}
          @click=${this.onClick}
          @keydown=${this.onKeyDown}
          @focusin=${this.onFocusIn}
          @focusout=${this.onFocusOut}
          @touchstart=${this.handleTouchStart}
          @touchmove=${this.handleTouchMove}
          @touchend=${this.handleTouchEnd}
          @touchcancel=${this.handleTouchEnd}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerEnd}
          @pointercancel=${this.handlePointerEnd}
          @contextmenu=${this.handleContextMenu}
          @transitionend=${this.handleSwipeTransitionEnd}
          role="button"
          tabindex=${String(this.getRowTabIndex())}
        >
          ${this.renderIcon(entry)}

          <div class="item-content">
            <div class="item-title">${presentation.title}</div>
            ${presentation.subtitle ? html`<div class="item-subtitle">${presentation.subtitle}</div>` : nothing}
          </div>

          ${this.renderStatusDots(presentation.statusBadges)}
          ${this.renderBadgeList(presentation.visibleTextBadges, presentation.textOverflowCount)}

          ${selectionModeActive
            ? nothing
            : html`
                <cv-button unstyled
                  class="action-button primary-action entry-menu-button"
                  button-tabindex=${String(this.getActionTabIndex())}
                  @click=${this.onMoreActions}
                  aria-label=${presentation.rowActionLabel}
                >
                  <cv-icon name=${presentation.rowActionIcon}></cv-icon>
                </cv-button>
              `}
        </div>
      </div>
    `
  }

  private renderSwipeActions() {
    const hasUsername = this.model.hasUsername()
    const hasOtp = this.model.hasOtp()

    return html`
      <div class="swipe-actions-left">
        ${hasUsername
          ? html`
              <cv-button unstyled class="swipe-action" @click=${this.onSwipeCopyUsername} aria-label=${i18n('tooltip:copy-username')}>
                <cv-icon name="person-circle"></cv-icon>
              </cv-button>
            `
          : nothing}
        ${hasOtp
          ? html`
              <cv-button unstyled class="swipe-action" @click=${this.onSwipeCopyOtp} aria-label=${i18n('tooltip:copy-otp')}>
                <cv-icon name="shield-check"></cv-icon>
              </cv-button>
            `
          : nothing}
      </div>
      <div class="swipe-actions-right">
        <cv-button unstyled class="swipe-action" @click=${this.onSwipeDelete} aria-label=${i18n('button:delete_entry')}>
          <cv-icon name="trash"></cv-icon>
        </cv-button>
      </div>
    `
  }

  private handleSwipeTransitionEnd(event: TransitionEvent) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
    this.model.finishSwipeTransition()
  }

  private syncSwipeOffsetStyle() {
    this.style.setProperty('--pm-entry-swipe-offset-x', `${Math.round(this.model.swipeOffsetX())}px`)
  }
}
