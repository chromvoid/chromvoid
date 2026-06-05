import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {nothing} from 'lit'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {PMEntryListItemModel, type PMEntryListBadge, type PMEntryListPresentation} from './entry-list-item.model'

export class PMEntryListItemBase extends ReatomLitElement {
  static properties = {
    selectionStateManaged: {type: Boolean, attribute: 'selection-state-managed'},
    selectionActive: {type: Boolean, attribute: 'selection-active'},
    selectedInSelectionMode: {attribute: false},
  }

  protected readonly model = new PMEntryListItemModel()

  viewMode: 'default' | 'compact' | 'dense' = 'default'

  set entry(entry: Entry) {
    this.model.setEntry(entry)
  }

  set activeRow(value: boolean) {
    this.model.setActiveRow(value)
  }

  get activeRow(): boolean {
    return this.model.activeRow()
  }

  set rowTabIndex(value: number) {
    this.model.setRowTabIndex(value)
  }

  get rowTabIndex(): number {
    return this.model.rowTabIndex()
  }

  set manageActiveRowState(value: boolean) {
    this.model.setManageActiveRowState(value)
  }

  get manageActiveRowState(): boolean {
    return this.model.manageActiveRowState()
  }

  set selectionStateManaged(value: boolean) {
    this.model.setSelectionStateManaged(value)
  }

  get selectionStateManaged(): boolean {
    return this.model.selectionStateManaged()
  }

  set selectionActive(value: boolean) {
    this.model.setSelectionActive(value)
  }

  get selectionActive(): boolean {
    return this.model.selectionActive()
  }

  set selectedInSelectionMode(value: boolean) {
    this.model.setSelectedInSelectionMode(value)
  }

  get selectedInSelectionMode(): boolean {
    return this.model.selectedInSelectionMode()
  }

  get isSelected() {
    return this.model.isRowSelected()
  }

  protected onClick(event: Event) {
    this.model.openEntry(event)
  }

  protected onCopyUsername(event: Event) {
    this.model.copyUsername(event)
  }

  protected async onCopyPassword(event: Event) {
    await this.model.copyPassword(event)
  }

  protected onMoreActions(event: Event) {
    this.model.showRowActions(event)
  }

  protected onDragStart(event: DragEvent) {
    this.model.startDrag(event)
  }

  protected onDragEnd() {
    this.model.endDrag()
  }

  protected onKeyDown(event: KeyboardEvent) {
    this.model.handleKeyDown(event)
  }

  protected isDragEnabled(entry: Entry): boolean {
    return this.model.isDragEnabled(entry)
  }

  protected onPointerEnter() {
    this.model.setSecondaryActionsVisible(true)
  }

  protected onPointerLeave() {
    this.model.setSecondaryActionsVisible(false)
  }

  protected onFocusIn() {
    this.model.setSecondaryActionsVisible(true)
    this.dispatchEvent(new CustomEvent('pm-entry-row-focus', {bubbles: true, composed: true}))
  }

  protected onFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget
    const currentTarget = event.currentTarget

    if (
      currentTarget instanceof HTMLElement &&
      nextTarget instanceof Node &&
      currentTarget.contains(nextTarget)
    ) {
      return
    }

    this.model.setSecondaryActionsVisible(false)
  }

  protected renderIcon(entry: Entry, presentation: PMEntryListPresentation) {
    return html`
      <span class="entry-icon-shell">
        <pm-avatar-icon class="entry-favicon" .item=${entry}></pm-avatar-icon>
        ${presentation.typeMarker
          ? html`
              <span
                class="entry-type-glyph"
                data-badge-id=${presentation.typeMarker.id}
                aria-hidden="true"
              >
                <cv-icon name=${presentation.typeMarker.icon}></cv-icon>
              </span>
            `
          : nothing}
      </span>
    `
  }

  protected renderStatusIndicators(entry: Entry) {
    const indicators = []

    if (entry.otps().length > 0) {
      indicators.push(html`<div class="status-indicator has-otp" title=${i18n('tooltip:has-otp')}></div>`)
    }

    return indicators
  }

  protected renderBadges(presentation: PMEntryListPresentation) {
    return this.renderBadgeList(presentation.visibleBadges, presentation.overflowCount)
  }

  protected renderBadgeList(
    visibleBadges: readonly PMEntryListBadge[],
    overflowCount: number,
    typeMarker: PMEntryListBadge | null = null,
  ) {
    if (visibleBadges.length === 0 && overflowCount === 0 && !typeMarker) {
      return nothing
    }

    return html`
      <div class="entry-badges" aria-label=${i18n('entry:badges')}>
        ${typeMarker
          ? html`
              <span
                class="entry-badge entry-type-chip"
                data-badge-id=${typeMarker.id}
                data-family=${typeMarker.family}
                data-severity=${typeMarker.severity}
                title=${typeMarker.label}
              >
                <cv-icon name=${typeMarker.icon} aria-hidden="true"></cv-icon>
                <span class="entry-badge-label">${typeMarker.label}</span>
              </span>
            `
          : nothing}
        ${visibleBadges.map(
          (badge) => html`
            <span
              class="entry-badge"
              data-badge-id=${badge.id}
              data-family=${badge.family}
              data-severity=${badge.severity}
              title=${badge.label}
            >
              ${this.renderBadgeIcon(badge)}
              <span class="entry-badge-label">${badge.label}</span>
            </span>
          `,
        )}
        ${overflowCount > 0
          ? html`
              <span
                class="entry-badge entry-badge-overflow"
                aria-label=${i18n('entry:badge:overflow_label', {count: String(overflowCount)})}
              >
                +${overflowCount}
              </span>
            `
          : nothing}
      </div>
    `
  }

  protected renderBadgeIcon(badge: PMEntryListBadge) {
    return html`<cv-icon name=${badge.icon} aria-hidden="true"></cv-icon>`
  }

  protected renderActions(entry: Entry) {
    const actionTabIndex = this.getActionTabIndex()

    return html`
      <div class="item-actions">
        <cv-tooltip arrow show-delay="150" hide-delay="0">
          <cv-button unstyled
            slot="trigger"
            class="action-button"
            button-tabindex=${String(actionTabIndex)}
            @click=${this.onCopyUsername}
            ?disabled=${!entry.username}
          >
            <cv-icon name="person-circle"></cv-icon>
          </cv-button>
          <span slot="content">${i18n('tooltip:copy-username')}</span>
        </cv-tooltip>
        ${entry.otps().length > 0
          ? html`
              <cv-tooltip arrow show-delay="150" hide-delay="0">
                <cv-button unstyled slot="trigger" class="action-button" button-tabindex=${String(actionTabIndex)}>
                  <cv-icon name="shield-check"></cv-icon>
                </cv-button>
                <span slot="content">${i18n('tooltip:copy-otp')}</span>
              </cv-tooltip>
            `
          : nothing}
      </div>
    `
  }

  focusRow() {
    const row = this.renderRoot.querySelector('.list-item') as HTMLElement | null
    row?.focus()
  }

  protected getActionTabIndex(): number {
    return this.model.effectiveActionTabIndex()
  }

  protected getRowTabIndex(): number {
    return this.model.effectiveRowTabIndex()
  }

  connectedCallback() {
    super.connectedCallback()
    this.setAttribute('view-mode', this.viewMode)
  }

  render() {
    if (!getPassmanagerRoot()) {
      return nothing
    }

    const entry = this.model.entry()
    if (!(entry instanceof Entry)) {
      return nothing
    }

    const presentation = this.model.getPresentation(entry)
    const dragEnabled = this.isDragEnabled(entry)
    const showSecondaryActions = this.model.shouldRenderSecondaryActions()
    const selectedClass = this.isSelected ? ' selected' : ''
    const activeClass = this.manageActiveRowState && this.activeRow ? ' active-row' : ''

    return html`
      <div
        class="list-item mobile-list-row-surface${selectedClass}${activeClass}"
        data-secondary-actions=${showSecondaryActions ? 'true' : 'false'}
        data-entry-type=${presentation.entryType}
        @click=${this.onClick}
        @keydown=${this.onKeyDown}
        @pointerenter=${this.onPointerEnter}
        @pointerleave=${this.onPointerLeave}
        @focusin=${this.onFocusIn}
        @focusout=${this.onFocusOut}
        .draggable=${dragEnabled}
        @dragstart=${this.onDragStart}
        @dragend=${this.onDragEnd}
        role="button"
        tabindex=${String(this.getRowTabIndex())}
      >
        ${this.renderIcon(entry, presentation)}

        <div class="item-content">
          <div class="item-title">${presentation.title}</div>
          ${presentation.subtitle ? html`<div class="item-subtitle">${presentation.subtitle}</div>` : nothing}
        </div>

        ${this.renderBadges(presentation)}

        <cv-button unstyled
          class="action-button primary-action entry-menu-button"
          button-tabindex=${String(this.getActionTabIndex())}
          @click=${this.onMoreActions}
          aria-label=${presentation.rowActionLabel}
          title=${presentation.rowActionLabel}
        >
          <cv-icon name=${presentation.rowActionIcon}></cv-icon>
        </cv-button>

        ${showSecondaryActions ? this.renderActions(entry) : nothing}
      </div>
    `
  }
}
