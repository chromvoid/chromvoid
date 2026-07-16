import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues} from 'lit'

import {Group} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {PMMobileRowSwipeModel} from '../../list/mobile-row-swipe.model'
import {pmGroupListItemMobileStyles} from './group-list-item-mobile.styles'
import type {PMGroupRowPresentation} from './group.model'

export class PMGroupListItemMobile extends ReatomLitElement {
  static properties = {
    group: {attribute: false},
    presentation: {attribute: false},
    activeRow: {type: Boolean, attribute: 'active-row'},
    rowTabIndex: {type: Number, attribute: 'row-tab-index'},
    readOnly: {type: Boolean, attribute: 'read-only'},
    selectionActive: {type: Boolean, attribute: 'selection-active'},
    selectedInSelectionMode: {attribute: false},
  }

  static define() {
    if (!customElements.get('pm-group-list-item-mobile')) {
      customElements.define('pm-group-list-item-mobile', this)
    }
  }

  static styles = [pmGroupListItemMobileStyles]

  declare group: Group | undefined
  declare presentation: PMGroupRowPresentation | undefined
  declare activeRow: boolean
  declare rowTabIndex: number
  declare readOnly: boolean
  declare selectionActive: boolean
  declare selectedInSelectionMode: boolean

  private readonly swipe = new PMMobileRowSwipeModel({
    atomPrefix: 'passmanager.groupListItem.swipe',
    directions: ['left'],
  })

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed)
    if (
      changed.has('group') ||
      (changed.has('selectionActive') && this.selectionActive) ||
      (changed.has('readOnly') && this.readOnly)
    ) {
      this.swipe.dispose()
    }
    this.syncSwipeOffsetStyle()
  }

  override disconnectedCallback(): void {
    this.swipe.dispose()
    super.disconnectedCallback()
  }

  focusRow() {
    const row = this.renderRoot.querySelector('.group-row') as HTMLElement | null
    row?.focus()
  }

  private handleFocus() {
    this.dispatchEvent(new CustomEvent('pm-group-row-focus', {bubbles: true, composed: true}))
  }

  private isSelected(): boolean {
    return this.selectionActive && this.selectedInSelectionMode
  }

  private isActive(): boolean {
    return this.activeRow && !this.selectionActive
  }

  private handleTouchStart(event: TouchEvent): void {
    if (this.selectionActive || this.readOnly) return
    this.swipe.startTouch(event)
  }

  private handleTouchMove(event: TouchEvent): void {
    if (this.selectionActive || this.readOnly) return

    const result = this.swipe.moveTouch(event)
    if (!result) return
    if (result.preventDefault) event.preventDefault()
    this.syncSwipeOffsetStyle()
  }

  private handleTouchEnd(): void {
    if (this.selectionActive || this.readOnly) return

    const result = this.swipe.finishTouch()
    if (!result) return
    this.syncSwipeOffsetStyle()
  }

  private handleRowClick(event: Event): void {
    if (!this.swipe.isOpen) return

    event.preventDefault()
    event.stopPropagation()
    this.swipe.close()
  }

  private handleSwipeDelete(event: Event): void {
    event.preventDefault()
    event.stopPropagation()

    const group = this.group
    if (!(group instanceof Group)) return

    this.swipe.close()
    this.dispatchEvent(new CustomEvent<Group>('group-delete', {detail: group, bubbles: true, composed: true}))
  }

  private handleSwipeTransitionEnd(event: TransitionEvent): void {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
    this.swipe.finishTransition()
  }

  private renderSwipeActions() {
    return html`
      <div class="group-swipe-actions-right">
        <cv-button
          unstyled
          class="swipe-action"
          @click=${this.handleSwipeDelete}
          aria-label=${i18n('button:remove')}
        >
          <cv-icon name="trash"></cv-icon>
        </cv-button>
      </div>
    `
  }

  private syncSwipeOffsetStyle(): void {
    this.style.setProperty('--_pm-group-swipe-offset-inline', `${Math.round(this.swipe.offsetX())}px`)
  }

  protected render() {
    const group = this.group
    const presentation = this.presentation
    if (!(group instanceof Group) || !presentation) {
      return nothing
    }

    const riskIndicator = presentation.riskIndicator
    const activeClass = this.isActive() ? ' active-row' : ''
    const selectedClass = this.isSelected() ? ' selected' : ''
    const rowTabIndex = this.rowTabIndex ?? 0
    const swipeState = this.swipe.state()
    const swipeOffsetX = this.swipe.offsetX()
    const swipeClass = swipeState !== 'idle' || swipeOffsetX !== 0 ? ' swipe-active swipe-left' : ''
    const swipeMotionClass = this.swipe.settling() ? ' snap-back' : ''

    return html`
      <div class="swipe-container${swipeClass}">
        ${this.selectionActive || this.readOnly ? nothing : this.renderSwipeActions()}

        <div
          class="group-row mobile-list-row-surface${activeClass}${selectedClass}${swipeMotionClass}"
          data-swipe-state=${swipeState}
          role="button"
          tabindex=${String(rowTabIndex)}
          @focus=${this.handleFocus}
          @click=${this.handleRowClick}
          @touchstart=${this.handleTouchStart}
          @touchmove=${this.handleTouchMove}
          @touchend=${this.handleTouchEnd}
          @touchcancel=${this.handleTouchEnd}
          @transitionend=${this.handleSwipeTransitionEnd}
        >
          <div class="group-icon-wrap">
            <pm-avatar-icon class="folder-custom-icon" .item=${group} icon="folder"></pm-avatar-icon>
          </div>
          <div class="group-copy">
            <div class="group-name">${presentation.displayName}</div>
            ${presentation.description
              ? html`<div class="group-description">${presentation.description}</div>`
              : nothing}
          </div>
          <div class="group-trail">
            <span class="group-entry-count">${presentation.entryCount}</span>
            <span class="group-risk-slot" aria-hidden=${riskIndicator ? nothing : 'true'}>
              ${riskIndicator
                ? html`
                    <span
                      class="group-risk-dot"
                      data-severity=${riskIndicator.severity}
                      role="img"
                      aria-label=${riskIndicator.label}
                      title=${riskIndicator.label}
                    ></span>
                  `
                : nothing}
            </span>
            <cv-icon class="group-chevron" name="chevron-right"></cv-icon>
          </div>
        </div>
      </div>
    `
  }
}
