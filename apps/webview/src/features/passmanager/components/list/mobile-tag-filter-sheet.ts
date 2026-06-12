import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {css, nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {CredentialTagOption} from '@project/passmanager/tags'
import {
  pmCredentialTagsModel,
  type PMCredentialTagSheetMode,
} from '../../models/pm-credential-tags.model'

export class PMMobileTagFilterSheet extends ReatomLitElement {
  static elementName = 'pm-mobile-tag-filter-sheet'

  static define(): void {
    CVBottomSheet.define()
    CVButton.define()
    CVIcon.define()
    CVInput.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet::part(content) {
      border-color: var(--cv-color-border-strong);
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-4);
    }

    cv-bottom-sheet::part(header) {
      padding: 0 var(--cv-space-4) var(--cv-space-1);
      border-block-end: 1px solid var(--cv-color-border-glass);
    }

    cv-bottom-sheet::part(title) {
      font-size: var(--cv-font-size-lg);
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
    }

    cv-bottom-sheet::part(body) {
      padding: 0;
    }

    cv-bottom-sheet::part(footer) {
      display: flex;
      gap: var(--cv-space-2);
      padding: var(--cv-space-3) var(--cv-space-4) max(var(--cv-space-3), env(safe-area-inset-bottom, 0px));
      border-block-start: 1px solid var(--cv-color-border-glass);
      background: var(--cv-color-surface-elevated);
    }

    .sheet-body {
      display: grid;
      gap: var(--cv-space-4);
      padding: var(--cv-space-3) var(--cv-space-4);
    }

    .tag-search {
      inline-size: 100%;
      --cv-input-search-mobile-shadow:
        inset 0 1px 2px var(--cv-alpha-black-10),
        0 1px 0 var(--cv-alpha-white-4);
    }

    .tag-search cv-icon {
      color: var(--cv-color-text-muted);
    }

    .tag-search:focus-within cv-icon {
      color: var(--cv-color-primary);
    }

    .section {
      display: grid;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .empty-state {
      min-block-size: 40px;
      display: flex;
      align-items: center;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
    }

    .manage-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--cv-space-2);
      align-items: center;
      min-inline-size: 0;
    }

    .create-action {
      min-block-size: 42px;
      white-space: nowrap;
    }

    .tag-list {
      display: grid;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .tag-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: var(--cv-space-1);
      align-items: center;
      min-inline-size: 0;
      min-block-size: 48px;
      padding: 6px 8px 6px 12px;
      border: 1px solid var(--cv-color-border-soft);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-secondary-glass);
      box-shadow: inset 0 1px 0 var(--cv-alpha-white-4);
    }

    .tag-row__main {
      display: grid;
      gap: 3px;
      min-inline-size: 0;
    }

    .tag-row__label,
    .tag-row__meta {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tag-row__label {
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
    }

    .tag-row__meta {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
    }

    .row-action {
      inline-size: 34px;
      block-size: 34px;
      color: var(--cv-color-text-muted);
    }

    .row-action::part(base) {
      inline-size: 34px;
      block-size: 34px;
      min-block-size: 34px;
      padding: 0;
      border-radius: var(--cv-radius-1);
    }

    .row-action:hover {
      color: var(--cv-color-primary);
    }

    .row-action.danger:hover {
      color: var(--cv-color-danger);
    }

    .tag-form {
      display: grid;
      gap: var(--cv-space-3);
      min-inline-size: 0;
    }

    .tag-form cv-input {
      inline-size: 100%;
    }

    .delete-confirm {
      display: grid;
      gap: var(--cv-space-2);
      min-inline-size: 0;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      line-height: 1.5;
    }

    .delete-confirm strong {
      color: var(--cv-color-danger);
      font-weight: var(--cv-font-weight-semibold);
    }

    .error-banner {
      min-block-size: 34px;
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border: 1px solid var(--cv-color-danger-border, var(--cv-color-danger));
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-danger-surface);
      color: var(--cv-color-danger);
      font-size: var(--cv-font-size-sm);
    }

    .footer-action {
      flex: 1 1 0;
      min-block-size: 44px;
    }

    .footer-action::part(base) {
      min-block-size: inherit;
    }

    @media (max-width: 360px) {
      .sheet-body {
        padding-inline: var(--cv-space-3);
      }

      cv-bottom-sheet::part(header),
      cv-bottom-sheet::part(footer) {
        padding-inline: var(--cv-space-3);
      }

      .manage-toolbar {
        grid-template-columns: minmax(0, 1fr);
      }

      .create-action {
        inline-size: 100%;
      }
    }
  `

  private handleSheetClose(): void {
    pmCredentialTagsModel.closeSheet()
  }

  private handleSheetChange(event: CustomEvent<{open?: boolean}>): void {
    if (event.target !== event.currentTarget) return
    if (event.detail.open !== false) return
    this.handleSheetClose()
  }

  private handleSearchInput(event: CVInputInputEvent): void {
    pmCredentialTagsModel.setFilterSheetQuery(event.detail.value)
  }

  private handleDraftInput(event: CVInputInputEvent): void {
    pmCredentialTagsModel.setTagDraft(event.detail.value)
  }

  private handleDone(): void {
    pmCredentialTagsModel.closeSheet()
  }

  private handleOpenManage(): void {
    pmCredentialTagsModel.openManageSheet()
  }

  private handleOpenCreate(): void {
    pmCredentialTagsModel.openCreateTag()
  }

  private handleRenameClick(event: Event): void {
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (key) {
      pmCredentialTagsModel.openRenameTag(key)
    }
  }

  private handleDeleteClick(event: Event): void {
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (key) {
      pmCredentialTagsModel.openDeleteTag(key)
    }
  }

  private handleCreateSubmit(event: Event): void {
    event.preventDefault()
    void pmCredentialTagsModel.createTag()
  }

  private handleRenameSubmit(event: Event): void {
    event.preventDefault()
    void pmCredentialTagsModel.renameTag()
  }

  private handleDeleteConfirm(): void {
    void pmCredentialTagsModel.deleteTag()
  }

  private renderSearchInput(id: string, value: string): TemplateResult {
    return html`
      <cv-input
        id=${id}
        class="tag-search"
        type="search"
        size="large"
        preset="search-mobile"
        clearable
        placeholder=${i18n('tags:filter_placeholder')}
        .value=${value}
        @cv-input=${this.handleSearchInput}
      >
        <cv-icon name="search" slot="prefix"></cv-icon>
      </cv-input>
    `
  }

  private renderManageTagRow(option: CredentialTagOption, canMutate: boolean): TemplateResult {
    return html`
      <div class="tag-row">
        <div class="tag-row__main">
          <span class="tag-row__label">${option.label}</span>
          <span class="tag-row__meta">${i18n('tags:usage_count' as never, {count: option.count})}</span>
        </div>
        <cv-button
          unstyled
          class="row-action"
          type="button"
          data-tag-key=${option.key}
          title=${i18n('button:edit')}
          aria-label=${i18n('tags:rename_aria' as never, {tag: option.label})}
          ?disabled=${!canMutate}
          @click=${this.handleRenameClick}
        >
          <cv-icon name="pencil-square" aria-hidden="true"></cv-icon>
        </cv-button>
        <cv-button
          unstyled
          class="row-action danger"
          type="button"
          data-tag-key=${option.key}
          title=${i18n('button:remove')}
          aria-label=${i18n('tags:delete_aria' as never, {tag: option.label})}
          ?disabled=${!canMutate}
          @click=${this.handleDeleteClick}
        >
          <cv-icon name="trash" aria-hidden="true"></cv-icon>
        </cv-button>
      </div>
    `
  }

  private renderManageMode(): TemplateResult {
    const query = pmCredentialTagsModel.filterSheetQuery()
    const options = pmCredentialTagsModel.filteredAvailableTags()
    const canMutate = pmCredentialTagsModel.canMutateTags()

    return html`
      <div class="sheet-body">
        <div class="manage-toolbar">
          ${this.renderSearchInput('pm-tag-manage-query', query)}
          <cv-button
            class="create-action"
            type="button"
            variant="primary"
            ?disabled=${!canMutate}
            @click=${this.handleOpenCreate}
          >
            <cv-icon slot="prefix" name="plus-lg" aria-hidden="true"></cv-icon>
            <span>${i18n('tags:create' as never)}</span>
          </cv-button>
        </div>
        <section class="section" aria-label=${i18n('tags:manage_title' as never)}>
          ${options.length > 0
            ? html`<div class="tag-list">${options.map((option) => this.renderManageTagRow(option, canMutate))}</div>`
            : html`<div class="empty-state" role="status">${i18n('tags:empty_manage' as never)}</div>`}
        </section>
      </div>

      <cv-button
        slot="footer"
        type="button"
        class="footer-action"
        variant="primary"
        @click=${this.handleDone}
      >
        ${i18n('button:done')}
      </cv-button>
    `
  }

  private renderFormMode(mode: 'create' | 'rename'): TemplateResult {
    const formId = mode === 'create' ? 'pm-tag-create-form' : 'pm-tag-rename-form'
    const saving = pmCredentialTagsModel.tagSaving()
    const error = pmCredentialTagsModel.tagError()
    const draft = pmCredentialTagsModel.tagDraft()
    const canMutate = pmCredentialTagsModel.canMutateTags()
    const submitLabel = mode === 'create' ? i18n('button:createNew') : i18n('button:save')
    const onSubmit = mode === 'create' ? this.handleCreateSubmit : this.handleRenameSubmit

    return html`
      <div class="sheet-body">
        <form id=${formId} class="tag-form" @submit=${onSubmit}>
          <cv-input
            id="pm-tag-form-input"
            type="text"
            size="large"
            autocomplete="off"
            .value=${draft}
            ?disabled=${!canMutate || saving}
            ?invalid=${Boolean(error)}
            @cv-input=${this.handleDraftInput}
          >
            <span slot="label">${i18n('tags:name_label' as never)}</span>
            ${error ? html`<span slot="help-text" class="field-error">${error}</span>` : nothing}
          </cv-input>
        </form>
      </div>

      <cv-button
        slot="footer"
        type="button"
        class="footer-action"
        variant="ghost"
        ?disabled=${saving}
        @click=${this.handleOpenManage}
      >
        ${i18n('button:cancel')}
      </cv-button>
      <cv-button
        slot="footer"
        type="submit"
        form=${formId}
        class="footer-action"
        variant="primary"
        .loading=${saving}
        ?disabled=${!canMutate || saving || !draft.trim()}
      >
        ${submitLabel}
      </cv-button>
    `
  }

  private renderDeleteConfirmMode(): TemplateResult {
    const option = pmCredentialTagsModel.activeTagOption()
    const plan = pmCredentialTagsModel.deletePlan()
    const saving = pmCredentialTagsModel.tagSaving()
    const error = pmCredentialTagsModel.tagError()
    const canMutate = pmCredentialTagsModel.canMutateTags()
    const affectedCount = plan?.affectedEntryIds.length ?? option?.count ?? 0

    return html`
      <div class="sheet-body">
        <div class="delete-confirm">
          <p>
            ${i18n('tags:delete_confirm' as never, {
              tag: option?.label ?? '',
              count: affectedCount,
            })}
          </p>
          <p><strong>${i18n('tags:delete_keeps_entries' as never)}</strong></p>
        </div>
        ${error ? html`<div class="error-banner" role="alert">${error}</div>` : nothing}
      </div>

      <cv-button
        slot="footer"
        type="button"
        class="footer-action"
        variant="ghost"
        ?disabled=${saving}
        @click=${this.handleOpenManage}
      >
        ${i18n('button:cancel')}
      </cv-button>
      <cv-button
        slot="footer"
        type="button"
        class="footer-action"
        variant="danger"
        .loading=${saving}
        ?disabled=${!option || !canMutate || saving}
        @click=${this.handleDeleteConfirm}
      >
        ${i18n('button:remove')}
      </cv-button>
    `
  }

  private renderMode(mode: PMCredentialTagSheetMode): TemplateResult {
    switch (mode) {
      case 'manage':
        return this.renderManageMode()
      case 'create':
        return this.renderFormMode('create')
      case 'rename':
        return this.renderFormMode('rename')
      case 'delete-confirm':
        return this.renderDeleteConfirmMode()
      default:
        return this.renderManageMode()
    }
  }

  private getTitle(mode: PMCredentialTagSheetMode): string {
    switch (mode) {
      case 'manage':
        return i18n('tags:manage_title' as never)
      case 'create':
        return i18n('tags:create_title' as never)
      case 'rename':
        return i18n('tags:rename_title' as never)
      case 'delete-confirm':
        return i18n('tags:delete_title' as never)
      default:
        return i18n('tags:manage_title' as never)
    }
  }

  private getInitialFocusId(mode: PMCredentialTagSheetMode): string {
    switch (mode) {
      case 'manage':
        return 'pm-tag-manage-query'
      case 'create':
      case 'rename':
        return 'pm-tag-form-input'
      default:
        return 'pm-tag-manage-query'
    }
  }

  protected render(): TemplateResult {
    const open = pmCredentialTagsModel.filterSheetOpen()
    const mode = pmCredentialTagsModel.sheetMode()

    return html`
      <cv-bottom-sheet
        .open=${open}
        show-handle
        drag-to-close
        .initialFocusId=${this.getInitialFocusId(mode)}
        @cv-change=${this.handleSheetChange}
      >
        <span slot="title">${this.getTitle(mode)}</span>
        ${this.renderMode(mode)}
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-mobile-tag-filter-sheet': PMMobileTagFilterSheet
  }
}
