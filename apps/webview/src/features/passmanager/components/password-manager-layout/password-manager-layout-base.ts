import {XLitElement} from '@statx/lit'
import {html} from 'lit'

import {Entry, i18n} from '@project/passmanager'
import {PasswordManagerLayoutModel, type PMGlobalShortcutAction} from './password-manager-layout.model'

export interface SearchElement {
  focusInput?(): void
  clear?(): void
}

export abstract class PMLayoutBase extends XLitElement implements EventListenerObject {
  protected readonly model = new PasswordManagerLayoutModel()

  protected abstract getSearchElement(): SearchElement | null

  protected shouldHideCreateBackButton(): boolean {
    return false
  }

  protected handleExtraKeys(_event: KeyboardEvent, _shortcutBlocked: boolean): boolean {
    return false
  }

  protected renderEntry(entry: Entry, editing: boolean) {
    return html`<pm-entry class="card" .entry=${entry} .editing=${editing}></pm-entry>`
  }

  protected renderGroup() {
    return html`<pm-group class="card"></pm-group>`
  }

  protected renderCreateEntry() {
    return html`<pm-entry-create
      class="card"
      ?hide-back=${this.shouldHideCreateBackButton()}
    ></pm-entry-create>`
  }

  protected onCreateEntry() {
    this.model.createEntry()
  }

  protected onCreateGroup() {
    this.model.createGroup()
  }

  protected onExportClick() {
    this.model.exportEntries()
  }

  protected onFullCleanClick() {
    this.model.fullClean()
  }

  protected onImportClick() {
    this.model.importEntries()
  }

  protected handleImportComplete(event: Event) {
    this.model.handleImportComplete(event)
  }

  protected handleImportClose() {
    this.model.handleImportClose()
  }

  protected async onGlobalKeyDown(event: KeyboardEvent): Promise<void> {
    const shortcutBlocked = this.model.isShortcutBlocked(event)
    if (this.handleExtraKeys(event, shortcutBlocked)) {
      return
    }

    const action = this.model.resolveGlobalShortcut(event, shortcutBlocked)
    if (action === 'none') {
      return
    }

    await this.handleGlobalShortcut(event, action)
  }

  protected async handleGlobalShortcut(
    event: KeyboardEvent,
    action: Exclude<PMGlobalShortcutAction, 'none'>,
  ): Promise<void> {
    switch (action) {
      case 'create-entry':
        event.preventDefault()
        this.onCreateEntry()
        return
      case 'focus-search':
        event.preventDefault()
        this.focusSearch()
        return
      case 'clear-search':
        this.clearSearch()
        return
      case 'go-back':
        event.preventDefault()
        this.model.goBackFromCurrent()
        return
      case 'open-first-search-result':
        event.preventDefault()
        this.model.openFirstSearchResult()
        return
      case 'copy-password':
        event.preventDefault()
        await this.model.copyCurrentPassword()
        return
    }
  }

  protected focusSearch() {
    const search = this.getSearchElement()
    if (search?.focusInput) {
      search.focusInput()
      return
    }

    this.model.openSearchPalette()
  }

  protected clearSearch() {
    const search = this.getSearchElement()
    if (!search) {
      return
    }

    search.clear?.()
    const active = this.shadowRoot?.activeElement as HTMLElement | undefined
    active?.blur?.()
  }

  protected renderMain() {
    const showElement = this.model.getCurrentShowElement()

    if (this.model.isLoading()) {
      return html`<div class="spinner-wrapper">
        <cv-spinner class="spinner" label=${i18n('loading')}></cv-spinner>
      </div>`
    }

    if (showElement === 'createEntry') {
      return this.renderCreateEntry()
    }

    if (showElement === 'createGroup') {
      return html`<pm-group-create
        class="card"
        ?hide-back=${this.shouldHideCreateBackButton()}
      ></pm-group-create>`
    }

    if (showElement instanceof Entry) {
      return this.renderEntry(showElement, this.model.isEditingEntry())
    }

    if (showElement === 'importDialog') {
      return html`<pm-import-dialog class="card"></pm-import-dialog>`
    }

    return this.renderGroup()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    window.addEventListener('keydown', this, {capture: true})
    this.addEventListener('import-complete', this)
    this.addEventListener('import-close', this)
  }

  override disconnectedCallback(): void {
    window.removeEventListener('keydown', this, {capture: true})
    this.removeEventListener('import-complete', this)
    this.removeEventListener('import-close', this)
    super.disconnectedCallback()
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case 'keydown':
        void this.onGlobalKeyDown(event as KeyboardEvent)
        return
      case 'import-complete':
        this.handleImportComplete(event)
        return
      case 'import-close':
        this.handleImportClose()
        return
      default:
        return
    }
  }
}
