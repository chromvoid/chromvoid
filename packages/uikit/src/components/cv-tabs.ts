import {createTabs, type TabsActivationMode, type TabsModel, type TabsOrientation} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVTab} from './cv-tab'
import {CVTabPanel} from './cv-tab-panel'

export interface CVTabsEventDetail {
  activeTabId: string | null
  selectedTabId: string | null
}

interface TabRecord {
  id: string
  disabled: boolean
  element: CVTab
  panel?: CVTabPanel
}

interface PendingCloseRequest {
  id: string
  wasActive: boolean
  wasSelected: boolean
  fallbackId: string | null
}

const tabsKeyboardKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Enter',
  ' ',
  'Spacebar',
])

let cvTabsNonce = 0

export class CVTabs extends ReatomLitElement {
  static elementName = 'cv-tabs'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      orientation: {type: String, reflect: true},
      activationMode: {type: String, attribute: 'activation-mode', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
    }
  }

  declare value: string
  declare orientation: TabsOrientation
  declare activationMode: TabsActivationMode
  declare ariaLabel: string

  private readonly idBase = `cv-tabs-${++cvTabsNonce}`
  private tabRecords: TabRecord[] = []
  private orphanPanels: CVTabPanel[] = []
  private unsupportedTabs: CVTab[] = []
  private unsupportedPanels: CVTabPanel[] = []
  private tabListeners = new WeakMap<CVTab, {click: EventListener; keydown: EventListener; close: EventListener}>()
  private model?: TabsModel
  private pendingCloseRequest: PendingCloseRequest | null = null

  constructor() {
    super()
    this.value = ''
    this.orientation = 'horizontal'
    this.activationMode = 'automatic'
    this.ariaLabel = ''
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='list'] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        position: relative;
      }

      :host([orientation='vertical']) [part='base'] {
        grid-template-columns: auto 1fr;
        align-items: start;
      }

      :host([orientation='vertical']) [part='list'] {
        flex-direction: column;
        align-items: stretch;
      }

      [part='list']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='indicator'] {
        position: absolute;
        background: var(--cv-tabs-indicator-color, var(--cv-color-primary, #65d7ff));
        transition: transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          width var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          height var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
        pointer-events: none;
      }

      :host(:not([orientation='vertical'])) [part='indicator'] {
        bottom: 0;
        left: 0;
        height: var(--cv-tabs-indicator-size, 3px);
        border-radius: var(--cv-tabs-indicator-size, 3px);
      }

      :host([orientation='vertical']) [part='indicator'] {
        top: 0;
        left: 0;
        width: var(--cv-tabs-indicator-size, 3px);
        border-radius: var(--cv-tabs-indicator-size, 3px);
      }

      [part='panels'] {
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 75%, transparent);
        padding: var(--cv-space-3, 12px);
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.model) {
      this.rebuildModelFromSlot(false, false)
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachTabListeners()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('orientation') || changedProperties.has('activationMode') || changedProperties.has('ariaLabel')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (changedProperties.has('value') && this.model) {
      const next = this.value.trim()
      if (next.length === 0) return
      if (this.model.state.selectedTabId() !== next) {
        const previousSelected = this.model.state.selectedTabId()
        const previousActive = this.model.state.activeTabId()
        this.model.actions.select(next)
        this.applyInteractionResult(previousSelected, previousActive)
      }
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (!changedProperties.has('value')) {
      this.syncTabElements()
    }
  }

  private isNavTabElement(tab: CVTab): boolean {
    return tab.slot === 'nav'
  }

  private isDefaultPanelElement(panel: CVTabPanel): boolean {
    const slot = panel.getAttribute('slot')
    return slot === null || slot.trim().length === 0
  }

  private getAllTabElements(): CVTab[] {
    return Array.from(this.children).filter(
      (element): element is CVTab => element.tagName.toLowerCase() === CVTab.elementName,
    )
  }

  private getTabElements(): CVTab[] {
    return this.getAllTabElements().filter((tab) => this.isNavTabElement(tab))
  }

  private getAllPanelElements(): CVTabPanel[] {
    return Array.from(this.children).filter(
      (element): element is CVTabPanel => element.tagName.toLowerCase() === CVTabPanel.elementName,
    )
  }

  private getPanelElements(): CVTabPanel[] {
    return this.getAllPanelElements().filter((panel) => this.isDefaultPanelElement(panel))
  }

  private ensureTabValue(tab: CVTab, index: number): string {
    const normalized = tab.value?.trim()
    if (normalized) return normalized

    const fallback = `tab-${index + 1}`
    tab.value = fallback
    return fallback
  }

  private resolveConfiguredValue(tabElements: CVTab[]): string | null {
    const fromProperty = this.value.trim()
    if (fromProperty.length > 0) {
      return fromProperty
    }

    for (const [index, tab] of tabElements.entries()) {
      if (tab.selected && !tab.disabled) {
        return this.ensureTabValue(tab, index)
      }
    }

    return null
  }

  private rebuildModelFromSlot(preserveSelection: boolean, requestRender = true): void {
    const allTabElements = this.getAllTabElements()
    const allPanelElements = this.getAllPanelElements()
    const tabElements = this.getTabElements()
    const panelElements = this.getPanelElements()
    const modelBeforeRebuild = this.model

    this.unsupportedTabs = allTabElements.filter((tab) => !this.isNavTabElement(tab))
    this.unsupportedPanels = allPanelElements.filter((panel) => !this.isDefaultPanelElement(panel))

    const configuredValue = this.resolveConfiguredValue(tabElements)
    let previousSelected = preserveSelection ? this.model?.state.selectedTabId() ?? configuredValue : configuredValue
    let previousActive = preserveSelection ? this.model?.state.activeTabId() ?? previousSelected : previousSelected

    const pendingCloseRequest = this.pendingCloseRequest
    let emitCloseTransition = false
    if (pendingCloseRequest) {
      const closeReflectedInDom = !tabElements.some((tab) => tab.value?.trim() === pendingCloseRequest.id)

      if (closeReflectedInDom) {
        if (pendingCloseRequest.wasSelected) {
          previousSelected = pendingCloseRequest.fallbackId
        }

        if (pendingCloseRequest.wasActive) {
          previousActive = pendingCloseRequest.fallbackId
        }

        emitCloseTransition = true
        this.pendingCloseRequest = null
      }
    }

    this.detachTabListeners()

    const panelByTab = new Map<string, CVTabPanel>()
    for (const [index, panel] of panelElements.entries()) {
      let tabId = panel.tab?.trim()
      if (!tabId) {
        const matchingTab = tabElements[index]
        if (matchingTab) {
          tabId = this.ensureTabValue(matchingTab, index)
          panel.tab = tabId
        }
      }

      if (!tabId || panelByTab.has(tabId)) continue
      panelByTab.set(tabId, panel)
    }

    const attachedPanels = new Set<CVTabPanel>()
    this.tabRecords = tabElements.map((element, index) => {
      const id = this.ensureTabValue(element, index)
      const panel = panelByTab.get(id)
      if (panel) attachedPanels.add(panel)

      element.slot = 'nav'

      return {
        id,
        disabled: element.disabled,
        element,
        panel,
      }
    })

    this.orphanPanels = panelElements.filter((panel) => !attachedPanels.has(panel))

    const enabledIds = new Set(this.tabRecords.filter((record) => !record.disabled).map((record) => record.id))
    const initialSelected = previousSelected && enabledIds.has(previousSelected) ? previousSelected : null
    const initialActive =
      previousActive && enabledIds.has(previousActive)
        ? previousActive
        : (initialSelected ?? this.tabRecords.find((record) => !record.disabled)?.id ?? null)

    this.model = createTabs({
      idBase: this.idBase,
      tabs: this.tabRecords.map((record) => ({
        id: record.id,
        disabled: record.disabled,
      })),
      ariaLabel: this.ariaLabel || undefined,
      orientation: this.orientation,
      activationMode: this.activationMode,
      initialSelectedTabId: initialSelected,
      initialActiveTabId: initialActive,
    })

    this.attachTabListeners()
    this.syncTabElements()
    this.value = this.model.state.selectedTabId() ?? ''

    if (emitCloseTransition && modelBeforeRebuild) {
      const beforeSelected = modelBeforeRebuild.state.selectedTabId()
      const beforeActive = modelBeforeRebuild.state.activeTabId()
      const afterSelected = this.model.state.selectedTabId()
      const afterActive = this.model.state.activeTabId()
      const selectedChanged = beforeSelected !== afterSelected
      const activeChanged = beforeActive !== afterActive

      if (selectedChanged || activeChanged) {
        const detail: CVTabsEventDetail = {
          activeTabId: afterActive,
          selectedTabId: afterSelected,
        }

        this.dispatchInput(detail)
        if (selectedChanged) {
          this.dispatchChange(detail)
        }

        if (activeChanged) {
          this.focusActiveTab()
        }
      }
    }

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private detachTabListeners(): void {
    for (const record of this.tabRecords) {
      const listeners = this.tabListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('click', listeners.click)
      record.element.removeEventListener('keydown', listeners.keydown)
      record.element.removeEventListener('cv-close', listeners.close)
      this.tabListeners.delete(record.element)
    }
  }

  private attachTabListeners(): void {
    if (!this.model) return

    for (const record of this.tabRecords) {
      const click = () => {
        this.handleTabClick(record.id)
      }

      const keydown = (event: Event) => {
        event.stopPropagation()
        this.handleTabsKeyDown(event as KeyboardEvent)
      }

      const close = (event: Event) => {
        this.handleTabClose(event as CustomEvent<{value?: string}>, record.id)
      }

      record.element.addEventListener('click', click)
      record.element.addEventListener('keydown', keydown)
      record.element.addEventListener('cv-close', close)
      this.tabListeners.set(record.element, {click, keydown, close})
    }
  }

  private resolveCloseFallbackId(closingId: string): string | null {
    const closingIndex = this.tabRecords.findIndex((record) => record.id === closingId)
    if (closingIndex < 0) {
      return null
    }

    for (let index = closingIndex + 1; index < this.tabRecords.length; index += 1) {
      const candidate = this.tabRecords[index]
      if (candidate && !candidate.disabled && candidate.id !== closingId) {
        return candidate.id
      }
    }

    for (let index = closingIndex - 1; index >= 0; index -= 1) {
      const candidate = this.tabRecords[index]
      if (candidate && !candidate.disabled && candidate.id !== closingId) {
        return candidate.id
      }
    }

    return null
  }

  private handleTabClose(event: CustomEvent<{value?: string}>, fallbackId: string): void {
    if (!this.model) {
      return
    }

    const requestedId = event.detail?.value?.trim() || fallbackId
    const activeId = this.model.state.activeTabId()
    const selectedId = this.model.state.selectedTabId()
    const wasActive = activeId === requestedId
    const wasSelected = selectedId === requestedId
    const nextFallbackId = this.resolveCloseFallbackId(requestedId)

    if (!wasActive && !wasSelected) {
      this.pendingCloseRequest = null
      return
    }

    this.pendingCloseRequest = {
      id: requestedId,
      wasActive,
      wasSelected,
      fallbackId: nextFallbackId,
    }

    if (!nextFallbackId || nextFallbackId === selectedId) {
      return
    }

    const previousSelected = selectedId
    const previousActive = activeId
    this.model.actions.select(nextFallbackId)
    this.applyInteractionResult(previousSelected, previousActive)
  }

  private syncTabElements(): void {
    if (!this.model) return

    for (const record of this.tabRecords) {
      const tabProps = this.model.contracts.getTabProps(record.id)

      record.element.id = tabProps.id
      record.element.slot = 'nav'
      record.element.setAttribute('role', tabProps.role)
      record.element.setAttribute('tabindex', tabProps.tabindex)
      record.element.setAttribute('aria-selected', tabProps['aria-selected'])
      record.element.setAttribute('aria-controls', tabProps['aria-controls'])

      if (tabProps['aria-disabled']) {
        record.element.setAttribute('aria-disabled', tabProps['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      record.element.setAttribute('data-active', tabProps['data-active'])
      record.element.setAttribute('data-selected', tabProps['data-selected'])
      record.element.disabled = tabProps['aria-disabled'] === 'true'
      record.element.active = tabProps['data-active'] === 'true'
      record.element.selected = tabProps['data-selected'] === 'true'

      if (!record.panel) continue

      const panelProps = this.model.contracts.getPanelProps(record.id)
      record.panel.removeAttribute('slot')
      record.panel.tab = record.id
      record.panel.id = panelProps.id
      record.panel.setAttribute('role', panelProps.role)
      record.panel.setAttribute('tabindex', panelProps.tabindex)
      record.panel.setAttribute('aria-labelledby', panelProps['aria-labelledby'])
      record.panel.hidden = panelProps.hidden
      record.panel.selected = !panelProps.hidden
    }

    for (const panel of this.orphanPanels) {
      panel.hidden = true
      panel.selected = false
    }

    for (const tab of this.unsupportedTabs) {
      tab.active = false
      tab.selected = false
    }

    for (const panel of this.unsupportedPanels) {
      panel.hidden = true
      panel.selected = false
    }
  }

  private focusActiveTab(): void {
    if (!this.model) return
    const activeId = this.model.state.activeTabId()
    if (!activeId) return

    const activeRecord = this.tabRecords.find((record) => record.id === activeId)
    activeRecord?.element.focus()
  }

  private dispatchInput(detail: CVTabsEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVTabsEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private applyInteractionResult(previousSelected: string | null, previousActive: string | null): void {
    if (!this.model) return

    this.syncTabElements()

    const nextSelected = this.model.state.selectedTabId()
    const nextActive = this.model.state.activeTabId()
    const selectedChanged = previousSelected !== nextSelected
    const activeChanged = previousActive !== nextActive

    this.value = nextSelected ?? ''

    if (!selectedChanged && !activeChanged) return

    const detail: CVTabsEventDetail = {
      activeTabId: nextActive,
      selectedTabId: nextSelected,
    }

    this.dispatchInput(detail)
    if (selectedChanged) {
      this.dispatchChange(detail)
    }

    if (activeChanged) {
      this.focusActiveTab()
    }
  }

  private handleTabClick(id: string): void {
    if (!this.model) return

    const previousSelected = this.model.state.selectedTabId()
    const previousActive = this.model.state.activeTabId()
    this.model.actions.select(id)
    this.applyInteractionResult(previousSelected, previousActive)
  }

  private handleTabsKeyDown(event: KeyboardEvent) {
    if (!this.model) return

    if (tabsKeyboardKeys.has(event.key)) {
      event.preventDefault()
    }

    const previousSelected = this.model.state.selectedTabId()
    const previousActive = this.model.state.activeTabId()
    this.model.actions.handleKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })
    this.applyInteractionResult(previousSelected, previousActive)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const tabListProps = this.model?.contracts.getTabListProps() ?? {
      id: `${this.idBase}-tablist`,
      role: 'tablist' as const,
      'aria-orientation': this.orientation,
      'aria-label': this.ariaLabel || undefined,
    }

    return html`
      <div part="base">
        <div
          id=${tabListProps.id}
          role=${tabListProps.role}
          aria-orientation=${tabListProps['aria-orientation']}
          aria-label=${tabListProps['aria-label'] ?? nothing}
          part="list"
          @keydown=${this.handleTabsKeyDown}
        >
          <slot name="nav" @slotchange=${this.handleSlotChange}></slot>
          <div part="indicator"></div>
        </div>

        <div part="panels">
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `
  }
}
