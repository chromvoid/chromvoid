import {createCommandPalette, type CommandPaletteModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVCommandItem} from './cv-command-item'

export interface CVCommandPaletteEventDetail {
  value: string | null
  inputValue: string
  activeId: string | null
  open: boolean
  lastExecutedValue: string | null
}

export type CVCommandPaletteInputEvent = CustomEvent<CVCommandPaletteEventDetail>
export type CVCommandPaletteChangeEvent = CustomEvent<CVCommandPaletteEventDetail>
export type CVCommandPaletteExecuteEvent = CustomEvent<CVCommandPaletteEventDetail>

interface CommandItemRecord {
  id: string
  label: string
  disabled: boolean
  element: CVCommandItem
}

interface CommandPaletteSnapshot {
  value: string | null
  inputValue: string
  activeId: string | null
  open: boolean
  lastExecutedValue: string | null
  restoreTargetId: string | null
}

const commandPaletteKeysToPrevent = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Escape'])

let cvCommandPaletteNonce = 0

export class CVCommandPalette extends ReatomLitElement {
  static elementName = 'cv-command-palette'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      inputValue: {type: String, attribute: 'input-value'},
      open: {type: Boolean, reflect: true},
      lastExecutedValue: {attribute: false},
      placeholder: {type: String},
      ariaLabel: {type: String, attribute: 'aria-label'},
      openShortcutKey: {type: String, attribute: 'open-shortcut-key'},
      closeOnExecute: {type: Boolean, attribute: 'close-on-execute', reflect: true},
      closeOnOutsidePointer: {type: Boolean, attribute: 'close-on-outside-pointer', reflect: true},
      listenGlobalShortcut: {type: Boolean, attribute: 'listen-global-shortcut', reflect: true},
    }
  }

  declare value: string
  declare inputValue: string
  declare open: boolean
  declare lastExecutedValue: string | null
  declare placeholder: string
  declare ariaLabel: string
  declare openShortcutKey: string
  declare closeOnExecute: boolean
  declare closeOnOutsidePointer: boolean
  declare listenGlobalShortcut: boolean

  private readonly idBase = `cv-command-palette-${++cvCommandPaletteNonce}`
  private itemRecords: CommandItemRecord[] = []
  private itemListeners = new WeakMap<CVCommandItem, {click: EventListener}>()
  private model?: CommandPaletteModel

  constructor() {
    super()
    this.value = ''
    this.inputValue = ''
    this.open = false
    this.lastExecutedValue = null
    this.placeholder = ''
    this.ariaLabel = ''
    this.openShortcutKey = 'k'
    this.closeOnExecute = true
    this.closeOnOutsidePointer = true
    this.listenGlobalShortcut = true
  }

  static styles = [
    css`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: inline-grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='dialog'] {
        position: fixed;
        inset-inline: 16px;
        inset-block-start: 10vh;
        z-index: 90;
        inline-size: min(640px, calc(100vw - 32px));
        margin-inline: auto;
        display: grid;
        gap: var(--cv-space-2, 8px);
        padding: var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-lg, 14px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-2, 0 8px 30px rgba(0, 0, 0, 0.35));
      }

      [part='dialog'][hidden] {
        display: none;
      }

      [part='input'] {
        inline-size: 100%;
        min-block-size: 38px;
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        padding: 0 var(--cv-space-3, 12px);
      }

      [part='input']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='listbox'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        max-block-size: min(420px, 60vh);
        overflow: auto;
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
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

    this.syncOutsidePointerListener()
    this.syncGlobalShortcutListener()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachItemListeners()
    this.syncOutsidePointerListener(true)
    this.syncGlobalShortcutListener(true)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('ariaLabel') ||
      changedProperties.has('openShortcutKey') ||
      changedProperties.has('closeOnExecute') ||
      changedProperties.has('closeOnOutsidePointer')
    ) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (!this.model) return

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      const previous = this.captureState()
      if (this.open) {
        this.model.actions.open()
      } else {
        this.model.actions.close()
      }

      this.applyInteractionResult(previous)
    }

    if (changedProperties.has('value')) {
      const normalized = this.value.trim()
      if (this.value !== normalized) {
        this.value = normalized
      }

      if (normalized.length > 0 && normalized !== this.model.state.selectedId()) {
        const previous = this.captureState()
        this.model.actions.execute(normalized)
        this.applyInteractionResult(previous)
      }
    }

    if (changedProperties.has('inputValue') && this.model.state.inputValue() !== this.inputValue) {
      const previous = this.captureState()
      this.model.actions.setInputValue(this.inputValue)
      this.applyInteractionResult(previous)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    this.syncOutsidePointerListener()
    this.syncGlobalShortcutListener()

    if (!changedProperties.has('open') && !changedProperties.has('value') && !changedProperties.has('inputValue')) {
      this.syncItemElements()
    }

    if (changedProperties.has('open') && this.open) {
      this.focusInput()
    }
  }

  openPalette(): void {
    if (!this.model) return

    const previous = this.captureState()
    this.model.actions.open()
    this.applyInteractionResult(previous)
  }

  closePalette(): void {
    if (!this.model) return

    const previous = this.captureState()
    this.model.actions.close()
    this.applyInteractionResult(previous)
  }

  private getItemElements(): CVCommandItem[] {
    return Array.from(this.children).filter(
      (element): element is CVCommandItem => element.tagName.toLowerCase() === CVCommandItem.elementName,
    )
  }

  private ensureItemValue(item: CVCommandItem, index: number): string {
    const normalized = item.value?.trim()
    if (normalized) return normalized

    const fallback = `command-${index + 1}`
    item.value = fallback
    return fallback
  }

  private rebuildModelFromSlot(preserveState: boolean, requestRender = true): void {
    const itemElements = this.getItemElements()
    const previous = preserveState
      ? this.captureState()
      : {
          value: this.value.trim() || null,
          inputValue: this.inputValue,
          activeId: null,
          open: this.open,
          lastExecutedValue: this.lastExecutedValue,
          restoreTargetId: null,
        }

    this.detachItemListeners()

    this.itemRecords = itemElements.map((element, index) => {
      const id = this.ensureItemValue(element, index)
      const label = element.textContent?.trim() || id

      return {
        id,
        label,
        disabled: element.disabled,
        element,
      }
    })

    const validIds = new Set(this.itemRecords.map((record) => record.id))
    const validEnabledIds = new Set(this.itemRecords.filter((record) => !record.disabled).map((record) => record.id))

    this.model = createCommandPalette({
      idBase: this.idBase,
      commands: this.itemRecords.map((record) => ({
        id: record.id,
        label: record.label,
        disabled: record.disabled,
      })),
      ariaLabel: this.ariaLabel || undefined,
      initialOpen: previous.open,
      openShortcutKey: this.openShortcutKey,
      closeOnExecute: this.closeOnExecute,
      closeOnOutsidePointer: this.closeOnOutsidePointer,
    })

    if (previous.value && validIds.has(previous.value)) {
      this.model.state.selectedId.set(previous.value)
    }

    if (previous.activeId && validEnabledIds.has(previous.activeId)) {
      this.model.state.activeId.set(previous.activeId)
    }

    if (previous.inputValue.length > 0) {
      this.model.state.inputValue.set(previous.inputValue)
    }

    if (previous.lastExecutedValue && validIds.has(previous.lastExecutedValue)) {
      this.model.state.lastExecutedId.set(previous.lastExecutedValue)
    }

    this.attachItemListeners()
    this.syncItemElements()

    this.value = this.model.state.selectedId() ?? ''
    this.inputValue = this.model.state.inputValue()
    this.open = this.model.state.isOpen()
    this.lastExecutedValue = this.model.state.lastExecutedId()

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private detachItemListeners(): void {
    for (const record of this.itemRecords) {
      const listeners = this.itemListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('click', listeners.click)
      this.itemListeners.delete(record.element)
    }
  }

  private attachItemListeners(): void {
    if (!this.model) return

    for (const record of this.itemRecords) {
      const click = (event: Event) => {
        event.preventDefault()
        this.handleItemClick(record.id)
      }

      record.element.addEventListener('click', click)
      this.itemListeners.set(record.element, {click})
    }
  }

  private syncItemElements(): void {
    if (!this.model) return

    const visibleIds = new Set(this.model.contracts.getVisibleCommands().map((command) => command.id))
    const currentSelectedId = this.model.state.selectedId()

    for (const record of this.itemRecords) {
      const props = this.model.contracts.getOptionProps(record.id)

      record.element.id = props.id
      record.element.setAttribute('role', props.role)
      record.element.setAttribute('tabindex', props.tabindex)

      // Use selectedId directly because command palette execute() sets selectedId
      // but the underlying combobox getOptionProps uses selectedIds which may not be in sync.
      const isSelected = currentSelectedId === record.id
      record.element.setAttribute('aria-selected', isSelected ? 'true' : 'false')

      if (props['aria-disabled']) {
        record.element.setAttribute('aria-disabled', props['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      record.element.setAttribute('data-active', props['data-active'])
      record.element.active = props['data-active'] === 'true'
      record.element.selected = isSelected
      record.element.disabled = props['aria-disabled'] === 'true'
      record.element.hidden = !this.open || !visibleIds.has(record.id)
    }
  }

  private captureState(): CommandPaletteSnapshot {
    return {
      value: this.model?.state.selectedId() ?? (this.value.trim() || null),
      inputValue: this.model?.state.inputValue() ?? this.inputValue,
      activeId: this.model?.state.activeId() ?? null,
      open: this.model?.state.isOpen() ?? this.open,
      lastExecutedValue: this.model?.state.lastExecutedId() ?? this.lastExecutedValue,
      restoreTargetId: this.model?.state.restoreTargetId() ?? null,
    }
  }

  private dispatchInput(detail: CVCommandPaletteEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVCommandPaletteEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchExecute(detail: CVCommandPaletteEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-execute', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private focusInput(): void {
    const input = this.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement | null
    input?.focus()
  }

  private applyInteractionResult(previous: CommandPaletteSnapshot): void {
    if (!this.model) return

    const next = this.captureState()
    this.value = next.value ?? ''
    this.inputValue = next.inputValue
    this.open = next.open
    this.lastExecutedValue = next.lastExecutedValue
    this.syncItemElements()

    const valueChanged = previous.value !== next.value
    const inputChanged = previous.inputValue !== next.inputValue
    const activeChanged = previous.activeId !== next.activeId
    const openChanged = previous.open !== next.open
    const executedChanged = previous.lastExecutedValue !== next.lastExecutedValue

    if (valueChanged || inputChanged || activeChanged || openChanged || executedChanged) {
      const detail: CVCommandPaletteEventDetail = {
        value: next.value,
        inputValue: next.inputValue,
        activeId: next.activeId,
        open: next.open,
        lastExecutedValue: next.lastExecutedValue,
      }

      this.dispatchInput(detail)
      if (valueChanged) {
        this.dispatchChange(detail)
      }

      if (executedChanged && next.lastExecutedValue) {
        this.dispatchExecute(detail)
      }
    }

    if (!next.open && next.restoreTargetId && previous.restoreTargetId !== next.restoreTargetId) {
      const trigger = this.shadowRoot?.querySelector(`[id="${next.restoreTargetId}"]`) as HTMLElement | null
      trigger?.focus()
    }
  }

  private syncOutsidePointerListener(forceOff = false): void {
    const shouldListen = !forceOff && this.open
    if (shouldListen) {
      document.addEventListener('pointerdown', this.handleDocumentPointerDown)
    } else {
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown)
    }
  }

  private syncGlobalShortcutListener(forceOff = false): void {
    const shouldListen = !forceOff && this.listenGlobalShortcut
    if (shouldListen) {
      document.addEventListener('keydown', this.handleDocumentKeyDown)
    } else {
      document.removeEventListener('keydown', this.handleDocumentKeyDown)
    }
  }

  private handleDocumentPointerDown = (event: Event) => {
    if (!this.model || !this.model.state.isOpen()) return

    const path = event.composedPath()
    if (path.includes(this)) return

    const previous = this.captureState()
    this.model.actions.handleOutsidePointer()
    this.applyInteractionResult(previous)
  }

  private handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (!this.model || !this.listenGlobalShortcut) return

    const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === this.openShortcutKey.toLowerCase()
    if (!isShortcut) return

    event.preventDefault()

    const previous = this.captureState()
    this.model.actions.handleGlobalKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previous)
  }

  private handleTriggerClick() {
    if (!this.model) return

    const previous = this.captureState()
    this.model.contracts.getTriggerProps().onClick()
    this.applyInteractionResult(previous)
  }

  private handleTriggerKeyDown(event: KeyboardEvent) {
    if (!this.model) return

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      const previous = this.captureState()
      this.model.contracts.getTriggerProps().onClick()
      this.applyInteractionResult(previous)
    }
  }

  private handleDialogKeyDown(event: KeyboardEvent) {
    if (!this.model) return

    if (commandPaletteKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureState()
    this.model.contracts.getDialogProps().onKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previous)
  }

  private handleInputChange(event: Event) {
    if (!this.model) return

    const previous = this.captureState()
    this.model.actions.setInputValue((event.currentTarget as HTMLInputElement).value)
    this.applyInteractionResult(previous)
  }

  private handleInputKeyDown(event: KeyboardEvent) {
    event.stopPropagation()
    this.handleDialogKeyDown(event)
  }

  private handleItemClick(id: string): void {
    if (!this.model) return

    const previous = this.captureState()
    this.model.contracts.getOptionProps(id).onClick()
    this.applyInteractionResult(previous)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const triggerProps = this.model?.contracts.getTriggerProps() ?? {
      id: `${this.idBase}-trigger`,
      role: 'button' as const,
      tabindex: '0' as const,
      'aria-haspopup': 'dialog' as const,
      'aria-expanded': this.open ? 'true' : 'false',
      'aria-controls': `${this.idBase}-dialog`,
    }

    const dialogProps = this.model?.contracts.getDialogProps() ?? {
      id: `${this.idBase}-dialog`,
      role: 'dialog' as const,
      tabindex: '-1' as const,
      hidden: !this.open,
      'aria-modal': 'true' as const,
      'aria-label': this.ariaLabel || undefined,
    }

    const inputProps = this.model?.contracts.getInputProps() ?? {
      id: `${this.idBase}-input`,
      role: 'combobox' as const,
      tabindex: '0' as const,
      'aria-haspopup': 'listbox' as const,
      'aria-expanded': this.open ? 'true' : 'false',
      'aria-controls': `${this.idBase}-listbox`,
      'aria-autocomplete': 'list' as const,
      'aria-activedescendant': undefined,
      'aria-label': this.ariaLabel || undefined,
    }

    const listboxProps = this.model?.contracts.getListboxProps() ?? {
      id: `${this.idBase}-listbox`,
      role: 'listbox' as const,
      tabindex: '-1' as const,
      'aria-label': this.ariaLabel || undefined,
    }

    return html`
      <div part="base">
        <button
          id=${triggerProps.id}
          role=${triggerProps.role}
          tabindex=${triggerProps.tabindex}
          aria-haspopup=${triggerProps['aria-haspopup']}
          aria-expanded=${triggerProps['aria-expanded']}
          aria-controls=${triggerProps['aria-controls']}
          part="trigger"
          type="button"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger">Command palette</slot>
        </button>

        <div
          id=${dialogProps.id}
          role=${dialogProps.role}
          tabindex=${dialogProps.tabindex}
          aria-modal=${dialogProps['aria-modal']}
          aria-label=${dialogProps['aria-label'] ?? nothing}
          ?hidden=${dialogProps.hidden}
          part="dialog"
          @keydown=${this.handleDialogKeyDown}
        >
          <input
            id=${inputProps.id}
            role=${inputProps.role}
            tabindex=${inputProps.tabindex}
            aria-haspopup=${inputProps['aria-haspopup']}
            aria-expanded=${inputProps['aria-expanded']}
            aria-controls=${inputProps['aria-controls']}
            aria-autocomplete=${inputProps['aria-autocomplete']}
            aria-activedescendant=${inputProps['aria-activedescendant'] ?? nothing}
            aria-label=${inputProps['aria-label'] ?? nothing}
            .value=${this.inputValue}
            placeholder=${this.placeholder}
            part="input"
            @input=${this.handleInputChange}
            @keydown=${this.handleInputKeyDown}
          />

          <div
            id=${listboxProps.id}
            role=${listboxProps.role}
            tabindex=${listboxProps.tabindex}
            aria-label=${listboxProps['aria-label'] ?? nothing}
            part="listbox"
          >
            <slot @slotchange=${this.handleSlotChange}></slot>
          </div>
        </div>
      </div>
    `
  }
}
