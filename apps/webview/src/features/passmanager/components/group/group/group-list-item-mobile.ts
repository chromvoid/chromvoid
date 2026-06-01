import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing} from 'lit'

import {Group} from '@project/passmanager/core'
import {pmGroupListItemMobileStyles} from './group-list-item-mobile.styles'
import type {PMGroupRowPresentation} from './group.model'

export class PMGroupListItemMobile extends ReatomLitElement {
  static properties = {
    group: {attribute: false},
    presentation: {attribute: false},
    activeRow: {type: Boolean, attribute: 'active-row'},
    rowTabIndex: {type: Number, attribute: 'row-tab-index'},
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
  declare selectionActive: boolean
  declare selectedInSelectionMode: boolean

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

    return html`
      <div
        class="group-row mobile-list-row-surface${activeClass}${selectedClass}"
        role="button"
        tabindex=${String(rowTabIndex)}
        @focus=${this.handleFocus}
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
          <cv-icon class="group-chevron" name="chevron-right"></cv-icon>
        </div>
      </div>
    `
  }
}
