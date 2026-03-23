import {XLitElement} from '@statx/lit'

import {html, nothing, type TemplateResult} from 'lit'
import {ifDefined} from 'lit/directives/if-defined.js'

import type {CVIcon} from '@chromvoid/uikit'
import {i18n} from '@project/passmanager'

import {
  PMEntryMovePickerModel,
  type PMEntryMoveOption,
  type PMEntryMoveViewState,
} from './pm-entry-move.model'

let pickerSequence = 0

export class PMEntryMoveBase extends XLitElement {
  protected readonly model = new PMEntryMovePickerModel()

  private readonly pickerId = ++pickerSequence

  set selectedId(value: string) {
    this.model.hydrateSelectedId(value)
  }

  get selectedId(): string {
    return this.model.getSelectedId()
  }

  set entryId(value: string) {
    this.model.setEntryId(value)
  }

  get entryId(): string {
    return this.model.getEntryId()
  }

  private get listboxId(): string {
    return `pm-entry-move-listbox-${this.pickerId}`
  }

  private get searchHintId(): string {
    return `pm-entry-move-search-hint-${this.pickerId}`
  }

  private getViewState(): PMEntryMoveViewState | null {
    return this.model.getViewState()
  }

  private optionId(key: string): string {
    return `pm-entry-move-option-${this.pickerId}-${encodeURIComponent(key)}`
  }

  private focusListbox(): void {
    const listbox = this.renderRoot.querySelector<HTMLElement>('.tree')
    listbox?.focus({preventScroll: true})
  }

  private scrollOptionIntoView(key: string): void {
    const option = this.renderRoot.querySelector<HTMLElement>(`#${this.optionId(key)}`)
    option?.scrollIntoView({block: 'nearest'})
  }

  private dispatchMoveSelected(id: string): void {
    this.dispatchEvent(new CustomEvent('move-selected', {detail: {id}, bubbles: true, composed: true}))
  }

  private handleSearchInput(event: Event): void {
    const customEvent = event as CustomEvent<{value?: string}>
    const target = event.target as {value?: string} | null
    const value = customEvent.detail?.value ?? target?.value ?? ''
    this.model.setSearchValue(String(value))
  }

  private handleSearchKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    event.preventDefault()
    const view = this.getViewState()
    if (!view) return

    const nextKey = this.model.handleSearchKey(event.key, view.options, view.activeKey)
    if (!nextKey) return

    this.focusListbox()
    this.scrollOptionIntoView(nextKey)
  }

  private handleListKeyDown(event: KeyboardEvent): void {
    const view = this.getViewState()
    if (!view) return

    const result = this.model.handleListKey(event.key, view.options, view.activeKey, view.hasSearch)
    if (!result.handled) return

    event.preventDefault()

    if (result.activeKey) {
      this.scrollOptionIntoView(result.activeKey)
    }

    if (result.selectedId) {
      this.dispatchMoveSelected(result.selectedId)
    }
  }

  private handleRowClick(event: Event): void {
    const element = event.currentTarget as HTMLElement | null
    const disabled = element?.dataset['disabled']
    const optionId = element?.dataset['optionId']
    if (disabled === 'true' || !optionId) return

    const selectedId = this.model.selectTarget(optionId)
    if (!selectedId) return

    this.dispatchMoveSelected(selectedId)
  }

  private handleRowMouseEnter(event: Event): void {
    const element = event.currentTarget as HTMLElement | null
    const optionKey = element?.dataset['optionKey']
    if (!optionKey) return
    this.model.setActiveOptionKey(optionKey)
  }

  private handleToggleExpanded(event: Event): void {
    event.stopPropagation()
    const element = event.currentTarget as HTMLElement | null
    const optionPath = element?.dataset['optionPath']
    if (!optionPath) return
    this.model.toggleExpanded(optionPath)
  }

  private handleRecentClick(event: Event): void {
    const element = event.currentTarget as HTMLElement | null
    const targetId = element?.dataset['targetId']
    if (!targetId) return

    const selectedId = this.model.selectTarget(targetId)
    if (!selectedId) return

    this.dispatchMoveSelected(selectedId)
  }

  private renderIndent(depth: number): TemplateResult | typeof nothing {
    if (depth <= 0) {
      return nothing
    }

    return html`
      <span class="indent" aria-hidden="true">
        ${Array.from({length: depth}, () => html`<span class="indent-step"></span>`)}
      </span>
    `
  }

  private renderRow(option: PMEntryMoveOption, activeKey: string, hasSearch: boolean): TemplateResult {
    const selected = option.id === this.selectedId
    const isActive = option.key === activeKey

    return html`
      <div
        id=${this.optionId(option.key)}
        class="row ${selected ? 'selected' : ''} ${isActive ? 'active' : ''}"
        role="option"
        aria-selected=${selected}
        aria-disabled=${option.disabled}
        data-disabled=${String(option.disabled)}
        data-option-id=${option.id}
        data-option-key=${option.key}
        @click=${this.handleRowClick}
        @mouseenter=${this.handleRowMouseEnter}
      >
        ${option.hasChildren && !hasSearch
          ? html`
              <button
                class="chevron"
                type="button"
                aria-label=${option.expanded ? i18n('button:collapse_group') : i18n('button:expand_group')}
                data-option-path=${ifDefined(option.path ?? undefined)}
                @click=${this.handleToggleExpanded}
              >
                <cv-icon name=${option.expanded ? 'chevron-down' : 'chevron-right'}></cv-icon>
              </button>
            `
          : html`<button class="chevron" type="button" aria-hidden="true" tabindex="-1"></button>`}
        <div class="label">
          ${this.renderIndent(option.depth)}
          <cv-icon class="folder-icon" name=${option.isRoot ? 'folder2-open' : 'folder'}></cv-icon>
          <span class="name ${option.isRoot ? 'root' : ''}">${option.label}</span>
        </div>
      </div>
    `
  }

  private renderRecent(disabledId: string): TemplateResult | typeof nothing {
    const recentTargets = this.model.getRecentTargets(disabledId)
    if (recentTargets.length === 0) return nothing

    return html`
      <div class="recent">
        <div class="recent-label">${i18n('dialog:move:recent_title')}</div>
        <div class="recent-items">
          ${recentTargets.map(
            (target) => html`
              <button
                class="recent-btn"
                type="button"
                data-target-id=${target.id}
                @click=${this.handleRecentClick}
              >
                ${target.label}
              </button>
            `,
          )}
        </div>
      </div>
    `
  }

  protected render() {
    const view = this.getViewState()
    if (!view) {
      return nothing
    }

    const activeOptionId = view.activeKey ? this.optionId(view.activeKey) : undefined

    return html`
      <div class="layout">
        <div id=${this.searchHintId} class="sr-only">${i18n('dialog:move:search_help')}</div>

        <div class="sr-only" role="status" aria-live="polite">${this.model.liveMessage()}</div>

        <div class="search">
          <cv-input
            size="small"
            placeholder=${i18n('dialog:move:search_placeholder')}
            .value=${this.model.searchValue()}
            @cv-input=${this.handleSearchInput}
            @keydown=${this.handleSearchKeyDown}
            aria-label=${i18n('dialog:move:search_placeholder')}
            aria-controls=${this.listboxId}
            aria-describedby=${this.searchHintId}
            aria-autocomplete="list"
          ></cv-input>
        </div>

        ${view.hasSearch ? nothing : this.renderRecent(view.disabledId)}

        <div class="tree-wrap">
          <div
            id=${this.listboxId}
            class="tree"
            role="listbox"
            tabindex="0"
            aria-label=${i18n('dialog:move:list_aria_label')}
            aria-activedescendant=${ifDefined(activeOptionId)}
            @keydown=${this.handleListKeyDown}
          >
            ${view.options.map((option) => this.renderRow(option, view.activeKey, view.hasSearch))}
          </div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-icon': CVIcon
  }
}
