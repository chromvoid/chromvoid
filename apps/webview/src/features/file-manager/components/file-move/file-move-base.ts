import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {nothing, type TemplateResult} from 'lit'
import {ifDefined} from 'lit/directives/if-defined.js'

import type {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {i18n} from 'root/i18n'

import {
  FileMovePickerModel,
  type FileMoveOption,
  type FileMoveViewState,
} from './file-move.model'

let pickerSequence = 0

export class FileMoveBase extends ReatomLitElement {
  protected readonly model = new FileMovePickerModel()

  private readonly pickerId = ++pickerSequence

  set selectedPath(value: string) {
    this.model.hydrateSelectedPath(value)
  }

  get selectedPath(): string {
    return this.model.getSelectedPath()
  }

  set itemId(value: number | null | undefined) {
    this.model.setItemId(value)
  }

  get itemId(): number | null {
    return this.model.getItemId()
  }

  set disabledPaths(value: string[]) {
    this.model.setDisabledPaths(value)
  }

  get disabledPaths(): string[] {
    return this.model.getDisabledPaths()
  }

  private get listboxId(): string {
    return `file-move-listbox-${this.pickerId}`
  }

  private get searchHintId(): string {
    return `file-move-search-hint-${this.pickerId}`
  }

  private getViewState(): FileMoveViewState {
    return this.model.getViewState()
  }

  private optionId(key: string): string {
    return `file-move-option-${this.pickerId}-${encodeURIComponent(key)}`
  }

  private focusListbox(): void {
    const listbox = this.renderRoot.querySelector<HTMLElement>('.tree')
    listbox?.focus({preventScroll: true})
  }

  private scrollOptionIntoView(key: string): void {
    const option = this.renderRoot.querySelector<HTMLElement>(`#${this.optionId(key)}`)
    option?.scrollIntoView({block: 'nearest'})
  }

  private dispatchMoveSelected(path: string): void {
    this.dispatchEvent(new CustomEvent('move-selected', {detail: {path}, bubbles: true, composed: true}))
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
    const nextKey = this.model.handleSearchKey(event.key, view.options, view.activeKey)
    if (!nextKey) return

    this.focusListbox()
    this.scrollOptionIntoView(nextKey)
  }

  private handleListKeyDown(event: KeyboardEvent): void {
    const view = this.getViewState()
    const result = this.model.handleListKey(event.key, view.options, view.activeKey, view.hasSearch)
    if (!result.handled) return

    event.preventDefault()

    if (result.activeKey) {
      this.scrollOptionIntoView(result.activeKey)
    }

    if (result.selectedPath) {
      this.dispatchMoveSelected(result.selectedPath)
    }
  }

  private handleRowClick(event: Event): void {
    const element = event.currentTarget as HTMLElement | null
    const disabled = element?.dataset['disabled']
    const optionPath = element?.dataset['optionPath']
    if (disabled === 'true' || !optionPath) return

    const selectedPath = this.model.selectTarget(optionPath)
    if (!selectedPath) return

    this.dispatchMoveSelected(selectedPath)
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
    const targetPath = element?.dataset['targetPath']
    if (!targetPath) return

    const selectedPath = this.model.selectTarget(targetPath)
    if (!selectedPath) return

    this.dispatchMoveSelected(selectedPath)
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

  private renderRow(option: FileMoveOption, activeKey: string, hasSearch: boolean): TemplateResult {
    const selected = option.path === this.selectedPath
    const isActive = option.key === activeKey

    return html`
      <div
        id=${this.optionId(option.key)}
        class="row ${selected ? 'selected' : ''} ${isActive ? 'active' : ''}"
        role="option"
        aria-selected=${selected}
        aria-disabled=${option.disabled}
        data-disabled=${String(option.disabled)}
        data-option-path=${option.path}
        data-option-key=${option.key}
        @click=${this.handleRowClick}
        @mouseenter=${this.handleRowMouseEnter}
      >
        ${option.hasChildren && !hasSearch && !option.isRoot
          ? html`
              <cv-button
                unstyled
                class="chevron"
                type="button"
                aria-label=${option.expanded ? i18n('button:collapse') : i18n('button:expand')}
                data-option-path=${ifDefined(option.path)}
                @click=${this.handleToggleExpanded}
              >
                <cv-icon name=${option.expanded ? 'chevron-down' : 'chevron-right'}></cv-icon>
              </cv-button>
            `
          : html`<cv-button unstyled class="chevron" type="button" aria-hidden="true" button-tabindex="-1"></cv-button>`}
        <div class="label">
          ${this.renderIndent(option.depth)}
          <cv-icon class="folder-icon" name=${option.isRoot ? 'folder2-open' : 'folder'}></cv-icon>
          <span class="label-text">
            <span class="name ${option.isRoot ? 'root' : ''}">${option.label}</span>
            ${option.subtitle ? html`<span class="subtitle">${option.subtitle}</span>` : nothing}
          </span>
        </div>
        ${selected
          ? html`<cv-icon class="row-check" name="check" aria-hidden="true"></cv-icon>`
          : html`<span class="row-check-spacer" aria-hidden="true"></span>`}
      </div>
    `
  }

  private renderRecent(disabledPaths: string[]): TemplateResult | typeof nothing {
    const recentTargets = this.model.getRecentTargets(disabledPaths)
    if (recentTargets.length === 0) return nothing

    return html`
      <div class="recent">
        <div class="recent-label">${i18n('file-manager:move:recent-title')}</div>
        <div class="recent-items">
          ${recentTargets.map(
            (target) => html`
              <cv-button
                unstyled
                class="recent-btn"
                type="button"
                data-target-path=${target.path}
                @click=${this.handleRecentClick}
              >
                ${target.label}
              </cv-button>
            `,
          )}
        </div>
      </div>
    `
  }

  protected override render() {
    const view = this.getViewState()
    const activeOptionId = view.activeKey ? this.optionId(view.activeKey) : undefined

    return html`
      <div class="layout">
        <div id=${this.searchHintId} class="sr-only">${i18n('file-manager:move:search-help')}</div>

        <div class="sr-only" role="status" aria-live="polite">${this.model.liveMessage()}</div>

        <div class="search">
          <cv-input
            size="small"
            placeholder=${i18n('file-manager:move:search-placeholder')}
            .value=${this.model.searchValue()}
            @cv-input=${this.handleSearchInput}
            @keydown=${this.handleSearchKeyDown}
            aria-label=${i18n('file-manager:move:search-placeholder')}
            aria-controls=${this.listboxId}
            aria-describedby=${this.searchHintId}
            aria-autocomplete="list"
          ></cv-input>
        </div>

        ${view.hasSearch ? nothing : this.renderRecent(view.disabledPaths)}

        <div class="tree-wrap">
          <div
            id=${this.listboxId}
            class="tree"
            role="listbox"
            tabindex="0"
            aria-label=${i18n('file-manager:move:list-aria-label')}
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
