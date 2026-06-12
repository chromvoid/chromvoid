import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {
  PasswordManagerLayoutModel,
  type PMGlobalShortcutAction,
  type PMSearchElement,
} from './password-manager-layout.model'

export type SearchElement = PMSearchElement

export abstract class PMLayoutBase extends ReatomLitElement implements EventListenerObject {
  protected readonly model: PasswordManagerLayoutModel

  constructor(model = new PasswordManagerLayoutModel()) {
    super()
    this.model = model
  }

  protected abstract getSearchElement(): SearchElement | null

  protected handleExtraKeys(_event: KeyboardEvent, _shortcutBlocked: boolean): boolean {
    return false
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
    event.stopPropagation()
    this.model.handleImportComplete(event)
  }

  protected handleImportClose(event?: Event) {
    event?.stopPropagation()
    this.model.handleImportClose()
  }

  protected renderImportDialog() {
    return html`
      <pm-import-dialog
        class="card"
        @import-complete=${this.handleImportComplete}
        @import-close=${this.handleImportClose}
      ></pm-import-dialog>
    `
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
        this.handleImportClose(event)
        return
      default:
        return
    }
  }
}
