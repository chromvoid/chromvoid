import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVDrawer} from '@chromvoid/uikit/components/cv-drawer'
import {CVField} from '@chromvoid/uikit/components/cv-field'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {credentialTagKey, type CredentialTagColorId, type CredentialTagOption} from '@project/passmanager/tags'
import {i18n as appI18n} from 'root/i18n'
import {pmCredentialTagsModel, type PMCredentialTagSheetMode} from '../../models/pm-credential-tags.model'

export class PMDesktopTagManagerDrawer extends ReatomLitElement {
  static elementName = 'pm-desktop-tag-manager-drawer'

  static styles = css`
    :host {
      display: contents;
    }

    cv-drawer {
      --cv-drawer-size: min(440px, calc(100vw - var(--cv-space-6)));
      --cv-drawer-max-size: 100vw;
      --cv-drawer-body-spacing: 0;
      --cv-drawer-header-spacing: var(--cv-space-5) var(--cv-space-5) var(--cv-space-4);
      --cv-drawer-border-radius: var(--cv-radius-3);
    }

    cv-drawer::part(trigger),
    cv-drawer::part(footer) {
      display: none;
    }

    cv-drawer::part(panel) {
      border-block: 0;
      border-inline-end: 0;
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-4);
    }

    cv-drawer::part(header) {
      border-block-end: 1px solid var(--cv-color-border-soft);
    }

    .manager {
      min-block-size: 100%;
      color: var(--cv-color-text);
    }

    .toolbar {
      position: sticky;
      inset-block-start: 0;
      z-index: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--cv-space-3);
      padding: var(--cv-space-4) var(--cv-space-5);
      border-block-end: 1px solid var(--cv-color-border-soft);
      background: var(--cv-color-surface-elevated);
    }

    .search {
      min-inline-size: 0;
    }

    .readonly-note,
    .empty-state,
    .no-results {
      margin: var(--cv-space-4) var(--cv-space-5) 0;
      padding: var(--cv-space-4);
      border: 1px solid var(--cv-color-border-soft);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
    }

    .tag-list {
      display: grid;
      margin: 0;
      padding: var(--cv-space-2) var(--cv-space-3) var(--cv-space-5);
      list-style: none;
    }

    .tag-row,
    .mutation-row {
      min-inline-size: 0;
      border-block-end: 1px solid var(--cv-color-border-soft);
    }

    .tag-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--cv-space-3);
      min-block-size: 64px;
      padding: var(--cv-space-2);
    }

    .tag-dot {
      inline-size: 10px;
      block-size: 10px;
      border-radius: var(--cv-radius-pill);
      background: var(--_pm-desktop-tag-color);
      box-shadow: 0 0 0 3px var(--_pm-desktop-tag-ring);
    }

    .tag-copy {
      display: grid;
      gap: 2px;
      min-inline-size: 0;
    }

    .tag-name {
      overflow: hidden;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tag-usage {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
    }

    .row-actions,
    .form-actions,
    .delete-actions {
      display: flex;
      align-items: center;
    }

    .row-actions {
      gap: var(--cv-space-2);
    }

    .form-actions,
    .delete-actions {
      gap: var(--cv-space-1);
    }

    .row-action {
      inline-size: 36px;
      --cv-button-padding-inline: 0;
      --cv-button-border-radius: var(--cv-radius-2);
      --cv-button-text-color: var(--cv-color-text-muted);
    }

    .row-action::part(base) {
      min-block-size: 36px;
      border-color: var(--cv-color-border-strong);
      background: var(--cv-color-surface-2);
    }

    .row-action:hover::part(base) {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-text);
    }

    .row-action-danger:hover::part(base) {
      border-color: var(--cv-color-danger-border, var(--cv-color-danger));
      background: var(--cv-color-danger-surface, var(--cv-color-surface-highlight));
      color: var(--cv-color-danger);
    }

    .row-action cv-icon {
      font-size: 16px;
    }

    .mutation-row {
      display: grid;
      gap: var(--cv-space-4);
      padding: var(--cv-space-4) var(--cv-space-2);
    }

    .tag-form {
      display: grid;
      gap: var(--cv-space-4);
    }

    .color-group {
      display: grid;
      gap: var(--cv-space-2);
    }

    .color-label {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
    }

    .color-options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cv-space-2);
    }

    .color-swatch {
      inline-size: 28px;
      block-size: 28px;
      padding: 0;
      border: 1px solid var(--cv-color-border-strong);
      border-radius: var(--cv-radius-pill);
      background: var(--_pm-desktop-tag-color);
      cursor: pointer;
    }

    .color-swatch[aria-checked='true'] {
      border-color: var(--_pm-desktop-tag-color);
      box-shadow:
        0 0 0 2px var(--cv-color-surface-elevated),
        0 0 0 4px var(--_pm-desktop-tag-ring);
    }

    .color-swatch:focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: 2px;
    }

    .color-swatch:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .form-actions,
    .delete-actions {
      justify-content: flex-end;
    }

    .delete-copy {
      display: grid;
      gap: var(--cv-space-2);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
    }

    .delete-copy p {
      margin: 0;
    }

    .delete-copy strong {
      color: var(--cv-color-danger);
    }

    [data-color-id='violet'] {
      --_pm-desktop-tag-color: var(--pm-tag-violet);
      --_pm-desktop-tag-ring: var(--pm-tag-violet-ring);
    }

    [data-color-id='green'] {
      --_pm-desktop-tag-color: var(--pm-tag-green);
      --_pm-desktop-tag-ring: var(--pm-tag-green-ring);
    }

    [data-color-id='blue'] {
      --_pm-desktop-tag-color: var(--pm-tag-blue);
      --_pm-desktop-tag-ring: var(--pm-tag-blue-ring);
    }

    [data-color-id='pink'] {
      --_pm-desktop-tag-color: var(--pm-tag-pink);
      --_pm-desktop-tag-ring: var(--pm-tag-pink-ring);
    }

    [data-color-id='amber'] {
      --_pm-desktop-tag-color: var(--pm-tag-amber);
      --_pm-desktop-tag-ring: var(--pm-tag-amber-ring);
    }

    [data-color-id='orange'] {
      --_pm-desktop-tag-color: var(--pm-tag-orange);
      --_pm-desktop-tag-ring: var(--pm-tag-orange-ring);
    }

    [data-color-id='cyan'] {
      --_pm-desktop-tag-color: var(--pm-tag-cyan);
      --_pm-desktop-tag-ring: var(--pm-tag-cyan-ring);
    }
  `

  static define(): void {
    CVButton.define()
    CVDrawer.define()
    CVField.define()
    CVIcon.define()
    CVInput.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  private focusSearch(): void {
    this.shadowRoot?.querySelector<CVInput>('#pm-tag-catalog-search')?.focus()
  }

  private focusDraft(): void {
    this.shadowRoot?.querySelector<CVInput>('#pm-tag-catalog-draft')?.focus()
  }

  private focusTagAction(key: string | undefined): void {
    const target = [...(this.shadowRoot?.querySelectorAll<HTMLElement>('[data-tag-primary]') ?? [])].find(
      (element) => element.dataset['tagPrimary'] === key,
    )
    if (target) {
      target.focus()
      return
    }

    this.focusSearch()
  }

  private handleDrawerChange(event: CustomEvent<{open?: boolean}>): void {
    if (event.detail.open === false) {
      pmCredentialTagsModel.closeCatalogManager()
    }
  }

  private handleAfterShow(): void {
    this.focusSearch()
  }

  private handleManagerKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || pmCredentialTagsModel.sheetMode() === 'manage') return

    event.preventDefault()
    pmCredentialTagsModel.cancelTagMutation()
    void this.updateComplete.then(() => this.focusSearch())
  }

  private handleQueryInput(event: CVInputInputEvent): void {
    pmCredentialTagsModel.setCatalogQuery(event.detail.value)
  }

  private async handleOpenCreate(): Promise<void> {
    pmCredentialTagsModel.openCreateTag()
    await this.updateComplete
    this.focusDraft()
  }

  private async handleOpenRename(event: Event): Promise<void> {
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (!key) return

    pmCredentialTagsModel.openRenameTag(key)
    await this.updateComplete
    this.focusDraft()
  }

  private async handleOpenDelete(event: Event): Promise<void> {
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (!key) return

    pmCredentialTagsModel.openDeleteTag(key)
    await this.updateComplete
    this.shadowRoot?.querySelector<HTMLElement>('#pm-tag-delete-cancel')?.focus()
  }

  private handleDraftInput(event: CVInputInputEvent): void {
    pmCredentialTagsModel.setTagDraft(event.detail.value)
  }

  private handleColorPick(event: Event): void {
    pmCredentialTagsModel.setTagDraftColorId(
      (event.currentTarget as HTMLElement | null)?.dataset['colorId'],
    )
  }

  private handleCancelMutation(): void {
    pmCredentialTagsModel.cancelTagMutation()
    void this.updateComplete.then(() => this.focusSearch())
  }

  private async handleCreateSubmit(event: Event): Promise<void> {
    event.preventDefault()
    const nextKey = credentialTagKey(pmCredentialTagsModel.tagDraft())
    if (!(await pmCredentialTagsModel.createTag())) {
      await this.updateComplete
      this.focusDraft()
      return
    }

    await this.updateComplete
    this.focusTagAction(nextKey)
  }

  private async handleRenameSubmit(event: Event): Promise<void> {
    event.preventDefault()
    const nextKey = credentialTagKey(pmCredentialTagsModel.tagDraft())
    if (!(await pmCredentialTagsModel.renameTag())) {
      await this.updateComplete
      this.focusDraft()
      return
    }

    await this.updateComplete
    this.focusTagAction(nextKey)
  }

  private async handleDeleteConfirm(): Promise<void> {
    const activeKey = pmCredentialTagsModel.activeTagKey()
    const options = pmCredentialTagsModel.filteredCatalogTags()
    const index = options.findIndex((option) => option.key === activeKey)
    const nextKey = options[index + 1]?.key ?? options[index - 1]?.key

    if (!(await pmCredentialTagsModel.deleteTag())) return

    await this.updateComplete
    this.focusTagAction(nextKey)
  }

  private renderColorPicker(
    mode: 'create' | 'rename',
    selectedColorId: CredentialTagColorId,
    disabled: boolean,
  ): TemplateResult {
    const label =
      mode === 'create' ? i18n('tags:new_color_label' as never) : i18n('tags:color_label' as never)

    return html`
      <div class="color-group">
        <span id="pm-tag-color-label" class="color-label">${label}</span>
        <div class="color-options" role="radiogroup" aria-labelledby="pm-tag-color-label">
          ${pmCredentialTagsModel.tagColorOptions().map(
            (option) => html`
              <button
                class="color-swatch"
                type="button"
                role="radio"
                data-color-id=${option.colorId}
                aria-label=${option.label}
                aria-checked=${String(option.colorId === selectedColorId)}
                ?disabled=${disabled}
                @click=${this.handleColorPick}
              ></button>
            `,
          )}
        </div>
      </div>
    `
  }

  private renderDraftForm(mode: 'create' | 'rename'): TemplateResult {
    const saving = pmCredentialTagsModel.tagSaving()
    const error = pmCredentialTagsModel.tagError()
    const canMutate = pmCredentialTagsModel.canMutateTags()
    const disabled = saving || !canMutate
    const onSubmit = mode === 'create' ? this.handleCreateSubmit : this.handleRenameSubmit

    return html`
      <li class="mutation-row">
        <form class="tag-form" @submit=${onSubmit}>
          <cv-field required ?invalid=${Boolean(error)}>
            <span slot="label">${i18n('tags:name_label' as never)}</span>
            <cv-input
              id="pm-tag-catalog-draft"
              type="text"
              autocomplete="off"
              maxlength="32"
              required
              .value=${pmCredentialTagsModel.tagDraft()}
              ?invalid=${Boolean(error)}
              ?disabled=${disabled}
              @cv-input=${this.handleDraftInput}
            ></cv-input>
            ${error ? html`<span slot="error" role="alert">${error}</span>` : nothing}
          </cv-field>
          ${this.renderColorPicker(mode, pmCredentialTagsModel.tagDraftColorId(), disabled)}
          <div class="form-actions">
            <cv-button type="button" size="small" variant="ghost" ?disabled=${saving} @click=${this.handleCancelMutation}>
              ${i18n('button:cancel')}
            </cv-button>
            <cv-button type="submit" size="small" variant="primary" .loading=${saving} ?disabled=${disabled}>
              ${i18n(mode === 'create' ? 'button:createNew' : 'button:save')}
            </cv-button>
          </div>
        </form>
      </li>
    `
  }

  private renderDeleteConfirmation(option: CredentialTagOption): TemplateResult {
    const saving = pmCredentialTagsModel.tagSaving()
    const error = pmCredentialTagsModel.tagError()
    const affectedCount = pmCredentialTagsModel.deletePlan()?.affectedEntryIds.length ?? option.count

    return html`
      <li class="mutation-row">
        <div class="delete-copy">
          <strong>${i18n('tags:delete_title' as never)}</strong>
          <p>${i18n('tags:delete_confirm' as never, {tag: option.label, count: affectedCount})}</p>
          <p><strong>${i18n('tags:delete_keeps_entries' as never)}</strong></p>
          ${error ? html`<p role="alert">${error}</p>` : nothing}
        </div>
        <div class="delete-actions">
          <cv-button
            id="pm-tag-delete-cancel"
            type="button"
            size="small"
            variant="ghost"
            ?disabled=${saving}
            @click=${this.handleCancelMutation}
          >
            ${i18n('button:cancel')}
          </cv-button>
          <cv-button
            type="button"
            size="small"
            variant="danger"
            .loading=${saving}
            ?disabled=${saving || !pmCredentialTagsModel.canMutateTags()}
            @click=${this.handleDeleteConfirm}
          >
            ${i18n('button:remove')}
          </cv-button>
        </div>
      </li>
    `
  }

  private renderTagRow(option: CredentialTagOption, mode: PMCredentialTagSheetMode): TemplateResult {
    const isActive = pmCredentialTagsModel.activeTagKey() === option.key
    if (isActive && mode === 'rename') return this.renderDraftForm('rename')
    if (isActive && mode === 'delete-confirm') return this.renderDeleteConfirmation(option)

    const disabled = !pmCredentialTagsModel.canMutateTags() || pmCredentialTagsModel.tagSaving()
    return html`
      <li class="tag-row" data-tag-row-key=${option.key}>
        <span class="tag-dot" data-color-id=${option.colorId} aria-hidden="true"></span>
        <span class="tag-copy">
          <span class="tag-name" title=${option.label}>${option.label}</span>
          <span class="tag-usage">${i18n('tags:usage_count' as never, {count: option.count})}</span>
        </span>
        <span class="row-actions">
          <cv-button
            class="row-action"
            type="button"
            size="small"
            variant="ghost"
            data-tag-key=${option.key}
            data-tag-primary=${option.key}
            aria-label=${i18n('tags:rename_aria' as never, {tag: option.label})}
            title=${i18n('button:edit')}
            ?disabled=${disabled}
            @click=${this.handleOpenRename}
          >
            <cv-icon name="pencil" aria-hidden="true"></cv-icon>
          </cv-button>
          <cv-button
            class="row-action row-action-danger"
            type="button"
            size="small"
            variant="ghost"
            data-tag-key=${option.key}
            aria-label=${i18n('tags:delete_aria' as never, {tag: option.label})}
            title=${i18n('button:remove')}
            ?disabled=${disabled}
            @click=${this.handleOpenDelete}
          >
            <cv-icon name="trash" aria-hidden="true"></cv-icon>
          </cv-button>
        </span>
      </li>
    `
  }

  private renderCatalog(): TemplateResult {
    const mode = pmCredentialTagsModel.sheetMode()
    const allOptions = pmCredentialTagsModel.availableTags()
    const options = pmCredentialTagsModel.filteredCatalogTags()

    return html`
      ${!pmCredentialTagsModel.canMutateTags()
        ? html`<p class="readonly-note" role="status">${i18n('tags:error_readonly' as never)}</p>`
        : nothing}
      <ul class="tag-list" aria-label=${i18n('tags:title')}>
        ${mode === 'create' ? this.renderDraftForm('create') : nothing}
        ${options.map((option) => this.renderTagRow(option, mode))}
      </ul>
      ${allOptions.length === 0 && mode !== 'create'
        ? html`<p class="empty-state" role="status">${i18n('tags:empty_manage' as never)}</p>`
        : allOptions.length > 0 && options.length === 0
          ? html`<p class="no-results" role="status">${i18n('tags:no_matches' as never)}</p>`
          : nothing}
    `
  }

  protected render(): TemplateResult {
    const saving = pmCredentialTagsModel.tagSaving()
    const canMutate = pmCredentialTagsModel.canMutateTags()

    return html`
      <cv-drawer
        .open=${pmCredentialTagsModel.catalogManagerOpen()}
        .modal=${false}
        .closeOnEscape=${pmCredentialTagsModel.sheetMode() === 'manage'}
        .closeOnOutsidePointer=${false}
        .closeOnOutsideFocus=${false}
        .closeLabel=${appI18n('button:close')}
        @cv-change=${this.handleDrawerChange}
        @cv-after-show=${this.handleAfterShow}
        @keydown=${this.handleManagerKeyDown}
      >
        <span slot="title">${i18n('tags:manage_open' as never)}</span>
        <div class="manager">
          <div class="toolbar">
            <cv-input
              id="pm-tag-catalog-search"
              class="search"
              type="search"
              size="small"
              clearable
              .value=${pmCredentialTagsModel.catalogQuery()}
              placeholder=${i18n('tags:filter_placeholder' as never)}
              aria-label=${i18n('tags:filter_placeholder' as never)}
              @cv-input=${this.handleQueryInput}
            >
              <cv-icon name="search" slot="prefix" aria-hidden="true"></cv-icon>
            </cv-input>
            <cv-button
              type="button"
              size="small"
              variant="primary"
              ?disabled=${!canMutate || saving}
              @click=${this.handleOpenCreate}
            >
              <cv-icon name="plus" slot="prefix" aria-hidden="true"></cv-icon>
              ${i18n('tags:new' as never)}
            </cv-button>
          </div>
          ${this.renderCatalog()}
        </div>
      </cv-drawer>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-desktop-tag-manager-drawer': PMDesktopTagManagerDrawer
  }
}
