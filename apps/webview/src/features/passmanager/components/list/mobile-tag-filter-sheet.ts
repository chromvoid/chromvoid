import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {css, nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {
  CREDENTIAL_TAG_DEFAULT_COLOR_ID,
  type CredentialTagColorId,
  type CredentialTagOption,
} from '@project/passmanager/tags'
import {pmCredentialTagsModel, type PMCredentialTagSheetMode} from '../../models/pm-credential-tags.model'

export class PMMobileTagFilterSheet extends ReatomLitElement {
  static elementName = 'pm-mobile-tag-filter-sheet'

  static define(): void {
    CVBottomSheet.define()
    CVButton.define()
    CVIcon.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet {
      --cv-bottom-sheet-max-height: min(80dvh, calc(100dvh - 28px));
      --cv-bottom-sheet-border-radius: 28px 28px 0 0;
      --cv-bottom-sheet-grabber-width: 38px;
      --cv-bottom-sheet-grabber-height: 5px;
      --cv-bottom-sheet-grabber-color: var(--cv-color-border-strong);
    }

    cv-bottom-sheet::part(content) {
      border-color: var(--cv-color-border-glass);
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-4);
    }

    cv-bottom-sheet::part(body) {
      padding: 0;
      overflow: hidden;
    }

    cv-bottom-sheet::part(footer) {
      display: flex;
      gap: var(--cv-space-2);
      padding: var(--cv-space-2) var(--cv-space-4) max(26px, env(safe-area-inset-bottom, 0px));
      border-block-start: 1px solid var(--cv-color-border-glass);
      background: var(--cv-color-surface-elevated);
    }

    .sheet-body {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      max-block-size: inherit;
    }

    .sheet-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--cv-space-3);
      padding: var(--cv-space-1) 22px var(--cv-space-2);
    }

    .sheet-title {
      display: grid;
      gap: 2px;
      min-inline-size: 0;
    }

    .sheet-title strong,
    .delete-title {
      min-inline-size: 0;
      overflow-wrap: anywhere;
      color: var(--cv-color-text);
      font-size: 1.3125rem;
      font-weight: 800;
      letter-spacing: 0;
      line-height: 1.15;
    }

    .sheet-title span {
      min-inline-size: 0;
      overflow-wrap: anywhere;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      line-height: 1.35;
    }

    .edit-toggle {
      min-inline-size: 62px;
      block-size: 32px;
      padding: 0 var(--cv-space-3);
      border: 1px solid var(--cv-color-border-soft);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
      font: inherit;
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      cursor: pointer;
      transition:
        background var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .edit-toggle[data-active] {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
    }

    .edit-toggle:focus-visible,
    .tag-chip:focus-visible,
    .new-tag-button:focus-visible,
    .draft-input:focus-visible,
    .chip-delete:focus-visible,
    .color-swatch:focus-visible,
    .draft-submit:focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: 2px;
    }

    .edit-toggle:active,
    .tag-chip:active,
    .new-tag-button:active,
    .chip-delete:active,
    .color-swatch:active,
    .draft-submit:active {
      transform: scale(0.97);
    }

    .tag-scroll {
      flex: 1 1 auto;
      min-block-size: 0;
      overflow-y: auto;
      padding: var(--cv-space-3) var(--cv-space-4) var(--cv-space-2);
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .tag-scroll::-webkit-scrollbar {
      display: none;
    }

    .tag-grid {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 9px;
      min-inline-size: 0;
    }

    .tag-chip-wrap {
      display: inline-flex;
      align-items: center;
      max-inline-size: 100%;
      border: 1px solid var(--cv-color-border-soft);
      border-radius: 12px;
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
      box-shadow: inset 0 1px 0 var(--cv-alpha-white-4);
    }

    .tag-chip-wrap[data-selected] {
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-text);
    }

    .tag-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-inline-size: 100%;
      min-block-size: 37px;
      padding: 8px 13px;
      border: 0;
      border-radius: inherit;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      cursor: pointer;
      transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .tag-chip-label {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tag-dot {
      inline-size: 9px;
      block-size: 9px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--cv-color-primary);
      box-shadow: 0 0 0 3px var(--cv-color-primary-ring);
    }

    .chip-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 24px;
      block-size: 24px;
      margin-inline: 0 7px;
      border: 0;
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-danger-surface);
      color: var(--cv-color-danger);
      cursor: pointer;
    }

    .chip-delete cv-icon {
      inline-size: 13px;
      block-size: 13px;
    }

    .new-tag-button {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-block-size: 37px;
      padding: 8px 14px;
      border: 1.5px dashed var(--cv-color-border-strong);
      border-radius: 12px;
      background: transparent;
      color: var(--cv-color-text-muted);
      font: inherit;
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      cursor: pointer;
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .new-tag-button:hover {
      border-color: var(--cv-color-primary-border);
      color: var(--cv-color-primary);
    }

    .draft-control {
      display: grid;
      gap: 8px;
      inline-size: min(100%, 320px);
    }

    .inline-tag-form {
      display: grid;
      grid-template-columns: auto minmax(70px, 108px) auto;
      align-items: center;
      gap: 8px;
      inline-size: 100%;
      min-block-size: 37px;
      padding: 6px 8px 6px 12px;
      border: 1px solid var(--cv-color-primary-border-strong);
      border-radius: 12px;
      background: var(--cv-color-surface-elevated);
    }

    .tag-color-picker {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      min-inline-size: 0;
    }

    .color-swatch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 30px;
      block-size: 30px;
      padding: 0;
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
      cursor: pointer;
      transition:
        background var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .color-swatch[aria-pressed='true'] {
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface-strong);
      box-shadow: 0 0 0 2px var(--cv-color-primary-ring);
    }

    .color-swatch:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .color-swatch-dot {
      inline-size: 12px;
      block-size: 12px;
      border-radius: 50%;
      background: var(--cv-color-primary);
      box-shadow: inset 0 1px 0 var(--cv-alpha-white-30);
    }

    .draft-input {
      min-inline-size: 0;
      inline-size: 100%;
      border: 0;
      background: transparent;
      color: var(--cv-color-text);
      font: inherit;
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      outline: none;
    }

    .draft-input::placeholder {
      color: var(--cv-color-text-muted);
    }

    .draft-submit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 27px;
      block-size: 27px;
      border: 0;
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-primary);
      color: var(--pm-tag-on-accent);
      cursor: pointer;
    }

    .draft-submit:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .form-error,
    .empty-state {
      inline-size: 100%;
      color: var(--cv-color-danger);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-medium);
      line-height: 1.4;
    }

    .empty-state {
      color: var(--cv-color-text-muted);
    }

    .sheet-hint {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-block-start: 18px;
      padding-block-start: 15px;
      border-block-start: 1px solid var(--cv-color-border-glass);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      line-height: 1.4;
    }

    .sheet-hint .tag-dot {
      inline-size: 8px;
      block-size: 8px;
      box-shadow: none;
    }

    .footer-action {
      flex: 1 1 0;
      min-block-size: 50px;
      --cv-button-border-radius: 15px;
      --cv-button-font-weight: 800;
    }

    .footer-action::part(base) {
      min-block-size: inherit;
    }

    .delete-overlay {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: flex;
      align-items: flex-end;
      padding: 0 var(--cv-space-4) max(30px, env(safe-area-inset-bottom, 0px));
      background: var(--cv-alpha-black-62);
      backdrop-filter: blur(3px);
    }

    .delete-panel {
      display: grid;
      gap: var(--cv-space-3);
      inline-size: 100%;
      padding: 22px 20px 18px;
      border: 1px solid var(--cv-color-border-glass);
      border-radius: 24px;
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-4);
    }

    .delete-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 46px;
      block-size: 46px;
      border-radius: 13px;
      background: var(--cv-color-danger-surface);
      color: var(--cv-color-danger);
    }

    .delete-copy {
      display: grid;
      gap: 7px;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
    }

    .delete-copy p {
      margin: 0;
    }

    .delete-copy strong {
      color: var(--cv-color-danger);
      font-weight: var(--cv-font-weight-semibold);
    }

    .delete-actions {
      display: flex;
      gap: var(--cv-space-2);
      margin-block-start: var(--cv-space-1);
    }

    .delete-action {
      flex: 1 1 0;
      min-block-size: 48px;
      --cv-button-border-radius: 14px;
      --cv-button-font-weight: 800;
    }

    .delete-action::part(base) {
      min-block-size: inherit;
    }

    [data-color-id='violet'] {
      &.tag-chip-wrap {
        border-color: var(--pm-tag-violet-border);
        background: var(--pm-tag-violet-surface);
      }
      &.tag-chip-wrap[data-selected] {
        border-color: var(--pm-tag-violet-border-strong);
        color: var(--cv-color-text);
      }
      &.draft-control {
        border-color: var(--pm-tag-violet-border-strong);
      }
      &.color-swatch {
        border-color: var(--pm-tag-violet-border);
        background: var(--pm-tag-violet-surface);
        color: var(--pm-tag-violet);
      }
      &.color-swatch[aria-pressed='true'] {
        border-color: var(--pm-tag-violet-border-strong);
        background: var(--pm-tag-violet-surface-strong);
        box-shadow: 0 0 0 2px var(--pm-tag-violet-ring);
      }
      .tag-dot {
        background: var(--pm-tag-violet);
        box-shadow: 0 0 0 3px var(--pm-tag-violet-ring);
      }
      .swatch-dot,
      .chip-save {
        background: var(--pm-tag-violet);
      }
    }

    [data-color-id='green'] {
      &.tag-chip-wrap {
        border-color: var(--pm-tag-green-border);
        background: var(--pm-tag-green-surface);
      }
      &.tag-chip-wrap[data-selected] {
        border-color: var(--pm-tag-green-border-strong);
        color: var(--cv-color-text);
      }
      &.draft-control {
        border-color: var(--pm-tag-green-border-strong);
      }
      &.color-swatch {
        border-color: var(--pm-tag-green-border);
        background: var(--pm-tag-green-surface);
        color: var(--pm-tag-green);
      }
      &.color-swatch[aria-pressed='true'] {
        border-color: var(--pm-tag-green-border-strong);
        background: var(--pm-tag-green-surface-strong);
        box-shadow: 0 0 0 2px var(--pm-tag-green-ring);
      }
      .tag-dot {
        background: var(--pm-tag-green);
        box-shadow: 0 0 0 3px var(--pm-tag-green-ring);
      }
      .swatch-dot,
      .chip-save {
        background: var(--pm-tag-green);
      }
    }

    [data-color-id='blue'] {
      &.tag-chip-wrap {
        border-color: var(--pm-tag-blue-border);
        background: var(--pm-tag-blue-surface);
      }
      &.tag-chip-wrap[data-selected] {
        border-color: var(--pm-tag-blue-border-strong);
        color: var(--cv-color-text);
      }
      &.draft-control {
        border-color: var(--pm-tag-blue-border-strong);
      }
      &.color-swatch {
        border-color: var(--pm-tag-blue-border);
        background: var(--pm-tag-blue-surface);
        color: var(--pm-tag-blue);
      }
      &.color-swatch[aria-pressed='true'] {
        border-color: var(--pm-tag-blue-border-strong);
        background: var(--pm-tag-blue-surface-strong);
        box-shadow: 0 0 0 2px var(--pm-tag-blue-ring);
      }
      .tag-dot {
        background: var(--pm-tag-blue);
        box-shadow: 0 0 0 3px var(--pm-tag-blue-ring);
      }
      .swatch-dot,
      .chip-save {
        background: var(--pm-tag-blue);
      }
    }

    [data-color-id='pink'] {
      &.tag-chip-wrap {
        border-color: var(--pm-tag-pink-border);
        background: var(--pm-tag-pink-surface);
      }
      &.tag-chip-wrap[data-selected] {
        border-color: var(--pm-tag-pink-border-strong);
        color: var(--cv-color-text);
      }
      &.draft-control {
        border-color: var(--pm-tag-pink-border-strong);
      }
      &.color-swatch {
        border-color: var(--pm-tag-pink-border);
        background: var(--pm-tag-pink-surface);
        color: var(--pm-tag-pink);
      }
      &.color-swatch[aria-pressed='true'] {
        border-color: var(--pm-tag-pink-border-strong);
        background: var(--pm-tag-pink-surface-strong);
        box-shadow: 0 0 0 2px var(--pm-tag-pink-ring);
      }
      .tag-dot {
        background: var(--pm-tag-pink);
        box-shadow: 0 0 0 3px var(--pm-tag-pink-ring);
      }
      .swatch-dot,
      .chip-save {
        background: var(--pm-tag-pink);
      }
    }

    [data-color-id='amber'] {
      &.tag-chip-wrap {
        border-color: var(--pm-tag-amber-border);
        background: var(--pm-tag-amber-surface);
      }
      &.tag-chip-wrap[data-selected] {
        border-color: var(--pm-tag-amber-border-strong);
        color: var(--cv-color-text);
      }
      &.draft-control {
        border-color: var(--pm-tag-amber-border-strong);
      }
      &.color-swatch {
        border-color: var(--pm-tag-amber-border);
        background: var(--pm-tag-amber-surface);
        color: var(--pm-tag-amber);
      }
      &.color-swatch[aria-pressed='true'] {
        border-color: var(--pm-tag-amber-border-strong);
        background: var(--pm-tag-amber-surface-strong);
        box-shadow: 0 0 0 2px var(--pm-tag-amber-ring);
      }
      .tag-dot {
        background: var(--pm-tag-amber);
        box-shadow: 0 0 0 3px var(--pm-tag-amber-ring);
      }
      .swatch-dot,
      .chip-save {
        background: var(--pm-tag-amber);
      }
    }

    [data-color-id='orange'] {
      &.tag-chip-wrap {
        border-color: var(--pm-tag-orange-border);
        background: var(--pm-tag-orange-surface);
      }
      &.tag-chip-wrap[data-selected] {
        border-color: var(--pm-tag-orange-border-strong);
        color: var(--cv-color-text);
      }
      &.draft-control {
        border-color: var(--pm-tag-orange-border-strong);
      }
      &.color-swatch {
        border-color: var(--pm-tag-orange-border);
        background: var(--pm-tag-orange-surface);
        color: var(--pm-tag-orange);
      }
      &.color-swatch[aria-pressed='true'] {
        border-color: var(--pm-tag-orange-border-strong);
        background: var(--pm-tag-orange-surface-strong);
        box-shadow: 0 0 0 2px var(--pm-tag-orange-ring);
      }
      .tag-dot {
        background: var(--pm-tag-orange);
        box-shadow: 0 0 0 3px var(--pm-tag-orange-ring);
      }
      .swatch-dot,
      .chip-save {
        background: var(--pm-tag-orange);
      }
    }

    [data-color-id='cyan'] {
      &.tag-chip-wrap {
        border-color: var(--pm-tag-cyan-border);
        background: var(--pm-tag-cyan-surface);
      }
      &.tag-chip-wrap[data-selected] {
        border-color: var(--pm-tag-cyan-border-strong);
        color: var(--cv-color-text);
      }
      &.draft-control {
        border-color: var(--pm-tag-cyan-border-strong);
      }
      &.color-swatch {
        border-color: var(--pm-tag-cyan-border);
        background: var(--pm-tag-cyan-surface);
        color: var(--pm-tag-cyan);
      }
      &.color-swatch[aria-pressed='true'] {
        border-color: var(--pm-tag-cyan-border-strong);
        background: var(--pm-tag-cyan-surface-strong);
        box-shadow: 0 0 0 2px var(--pm-tag-cyan-ring);
      }
      .tag-dot {
        background: var(--pm-tag-cyan);
        box-shadow: 0 0 0 3px var(--pm-tag-cyan-ring);
      }
      .swatch-dot,
      .chip-save {
        background: var(--pm-tag-cyan);
      }
    }

    @media (max-width: 360px) {
      .sheet-head,
      .tag-scroll {
        padding-inline: var(--cv-space-3);
      }

      cv-bottom-sheet::part(footer) {
        padding-inline: var(--cv-space-3);
      }

      .inline-tag-form {
        grid-template-columns: auto minmax(54px, 1fr) auto;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .edit-toggle,
      .tag-chip,
      .new-tag-button,
      .chip-delete,
      .color-swatch,
      .draft-submit {
        transition-duration: 0ms;
      }

      .delete-overlay {
        backdrop-filter: none;
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

  private handleDone(): void {
    void pmCredentialTagsModel.confirmSheetSelection()
  }

  private handleToggleEditMode(): void {
    pmCredentialTagsModel.toggleSheetEditMode()
  }

  private handleOpenCreate(): void {
    pmCredentialTagsModel.openCreateTag()
  }

  private handleCancelMutation(): void {
    pmCredentialTagsModel.cancelTagMutation()
  }

  private handleDeletePanelClick(event: Event): void {
    event.stopPropagation()
  }

  private handleDraftInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null
    pmCredentialTagsModel.setTagDraft(input?.value ?? '')
  }

  private handleColorPick(event: Event): void {
    const colorId = (event.currentTarget as HTMLElement | null)?.dataset['colorId']
    pmCredentialTagsModel.setTagDraftColorId(colorId)
  }

  private handleTagChipClick(event: Event): void {
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (key) {
      pmCredentialTagsModel.activateTagChip(key)
    }
  }

  private handleTagChipKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    this.handleTagChipClick(event)
  }

  private handleDeleteClick(event: Event): void {
    event.stopPropagation()
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (key) {
      pmCredentialTagsModel.openDeleteTag(key)
    }
  }

  private async handleCreateSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (await pmCredentialTagsModel.createTag()) return
    await this.updateComplete
    this.shadowRoot?.querySelector<HTMLInputElement>('#pm-tag-draft-input')?.focus()
  }

  private async handleRenameSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (await pmCredentialTagsModel.renameTag()) return
    await this.updateComplete
    this.shadowRoot?.querySelector<HTMLInputElement>('#pm-tag-draft-input')?.focus()
  }

  private handleDeleteConfirm(): void {
    void pmCredentialTagsModel.deleteTag()
  }

  private renderColorPicker(
    mode: 'create' | 'rename',
    selectedColorId: CredentialTagColorId,
    saving: boolean,
    canMutate: boolean,
  ): TemplateResult {
    const label =
      mode === 'create' ? i18n('tags:new_color_label' as never) : i18n('tags:color_label' as never)

    return html`
      <div class="tag-color-picker" role="group" aria-label=${label}>
        ${pmCredentialTagsModel.tagColorOptions().map(
          (option) => html`
            <button
              class="color-swatch"
              type="button"
              data-color-id=${option.colorId}
              aria-label=${option.label}
              aria-pressed=${String(option.colorId === selectedColorId)}
              ?disabled=${!canMutate || saving}
              @click=${this.handleColorPick}
            >
              <span class="color-swatch-dot" aria-hidden="true"></span>
            </button>
          `,
        )}
      </div>
    `
  }

  private renderDraftForm(mode: 'create' | 'rename'): TemplateResult {
    const draft = pmCredentialTagsModel.tagDraft()
    const draftColorId = pmCredentialTagsModel.tagDraftColorId()
    const saving = pmCredentialTagsModel.tagSaving()
    const error = pmCredentialTagsModel.tagError()
    const canMutate = pmCredentialTagsModel.canMutateTags()
    const formId = mode === 'create' ? 'pm-tag-create-inline' : 'pm-tag-rename-inline'
    const onSubmit = mode === 'create' ? this.handleCreateSubmit : this.handleRenameSubmit

    return html`
      <div class="draft-control">
        <form id=${formId} class="inline-tag-form" data-color-id=${draftColorId} @submit=${onSubmit}>
          <span class="tag-dot" aria-hidden="true"></span>
          <input
            id="pm-tag-draft-input"
            class="draft-input"
            type="text"
            autocomplete="off"
            placeholder=${i18n('tags:name_label' as never)}
            .value=${draft}
            ?disabled=${!canMutate || saving}
            aria-invalid=${error ? 'true' : 'false'}
            aria-describedby=${error ? 'pm-tag-draft-error' : nothing}
            @input=${this.handleDraftInput}
          />
          <button
            class="draft-submit"
            type="submit"
            ?disabled=${!canMutate || saving}
            aria-label=${mode === 'create' ? i18n('button:createNew') : i18n('button:save')}
          >
            <cv-icon name=${mode === 'create' ? 'plus' : 'check'} aria-hidden="true"></cv-icon>
          </button>
        </form>
        ${this.renderColorPicker(mode, draftColorId, saving, canMutate)}
        ${error
          ? html`<div id="pm-tag-draft-error" class="form-error" role="alert">${error}</div>`
          : nothing}
      </div>
    `
  }

  private renderCreateControl(mode: PMCredentialTagSheetMode, canMutate: boolean): TemplateResult {
    if (mode === 'create') {
      return this.renderDraftForm('create')
    }

    return html`
      <button class="new-tag-button" type="button" ?disabled=${!canMutate} @click=${this.handleOpenCreate}>
        <cv-icon name="plus" aria-hidden="true"></cv-icon>
        <span>${i18n('tags:new' as never)}</span>
      </button>
    `
  }

  private renderTagChip(
    option: CredentialTagOption,
    selectedKeys: ReadonlySet<string>,
    mode: PMCredentialTagSheetMode,
    editMode: boolean,
    canMutate: boolean,
  ): TemplateResult {
    const selected = selectedKeys.has(option.key)
    const isRenaming = mode === 'rename' && pmCredentialTagsModel.activeTagKey() === option.key

    if (isRenaming) {
      return this.renderDraftForm('rename')
    }

    return html`
      <span class="tag-chip-wrap" data-color-id=${option.colorId} ?data-selected=${selected}>
        <span
          class="tag-chip"
          role="button"
          tabindex=${canMutate ? '0' : '-1'}
          aria-pressed=${String(selected)}
          data-tag-key=${option.key}
          title=${option.count > 0 ? i18n('tags:usage_count' as never, {count: option.count}) : option.label}
          @click=${canMutate ? this.handleTagChipClick : undefined}
          @keydown=${canMutate ? this.handleTagChipKeyDown : undefined}
        >
          <span class="tag-dot" aria-hidden="true"></span>
          <span class="tag-chip-label">${option.label}</span>
        </span>
        ${editMode
          ? html`
              <button
                class="chip-delete"
                type="button"
                data-tag-key=${option.key}
                aria-label=${i18n('tags:delete_aria' as never, {tag: option.label})}
                ?disabled=${!canMutate}
                @click=${this.handleDeleteClick}
              >
                <cv-icon name="x" aria-hidden="true"></cv-icon>
              </button>
            `
          : nothing}
      </span>
    `
  }

  private renderManageMode(mode: PMCredentialTagSheetMode): TemplateResult {
    const options = pmCredentialTagsModel.availableTags()
    const selectedKeys = new Set(pmCredentialTagsModel.effectiveSheetSelectedTagKeys())
    const editMode = pmCredentialTagsModel.sheetEditMode()
    const canMutate = pmCredentialTagsModel.canMutateTags()
    const entrySelectionSaving = pmCredentialTagsModel.entrySelectionSaving()
    const entrySelectionError = pmCredentialTagsModel.entrySelectionError()
    const canInteract = canMutate && !entrySelectionSaving
    const selectedCount = selectedKeys.size

    return html`
      <div class="sheet-body">
        <div class="sheet-head">
          <div class="sheet-title">
            <strong>${i18n('tags:title')}</strong>
            <span>
              ${editMode
                ? i18n('tags:edit_subtitle' as never)
                : i18n('tags:selected_count' as never, {count: selectedCount})}
            </span>
          </div>
          <button
            class="edit-toggle"
            type="button"
            ?data-active=${editMode}
            ?disabled=${!canInteract}
            @click=${this.handleToggleEditMode}
          >
            ${editMode ? i18n('button:done') : i18n('tags:edit_short' as never)}
          </button>
        </div>

        <div class="tag-scroll">
          <div class="tag-grid">
            ${this.renderCreateControl(mode, canInteract)}
            ${options.length > 0
              ? options.map((option) => this.renderTagChip(option, selectedKeys, mode, editMode, canInteract))
              : mode === 'create'
                ? nothing
                : html`<div class="empty-state" role="status">${i18n('tags:empty_manage' as never)}</div>`}
          </div>

          <div class="sheet-hint" data-color-id=${CREDENTIAL_TAG_DEFAULT_COLOR_ID}>
            <span class="tag-dot" aria-hidden="true"></span>
            <span> ${editMode ? i18n('tags:edit_hint' as never) : i18n('tags:select_hint' as never)} </span>
          </div>
          ${entrySelectionError ? html`<div class="form-error" role="alert">${entrySelectionError}</div>` : nothing}
        </div>
      </div>

      <cv-button
        id="pm-tag-done"
        slot="footer"
        type="button"
        class="footer-action"
        variant="primary"
        .loading=${entrySelectionSaving}
        ?disabled=${entrySelectionSaving}
        @click=${this.handleDone}
      >
        ${i18n('button:done')}
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
      <div class="delete-overlay" role="presentation" @click=${this.handleCancelMutation}>
        <section
          class="delete-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pm-tag-delete-title"
          @click=${this.handleDeletePanelClick}
        >
          <div class="delete-icon" aria-hidden="true">
            <cv-icon name="trash"></cv-icon>
          </div>
          <div class="delete-copy">
            <div id="pm-tag-delete-title" class="delete-title">${i18n('tags:delete_title' as never)}</div>
            <p>
              ${i18n('tags:delete_confirm' as never, {
                tag: option?.label ?? '',
                count: affectedCount,
              })}
            </p>
            <p><strong>${i18n('tags:delete_keeps_entries' as never)}</strong></p>
          </div>
          ${error ? html`<div class="form-error" role="alert">${error}</div>` : nothing}
          <div class="delete-actions">
            <cv-button
              id="pm-tag-delete-cancel"
              type="button"
              class="delete-action"
              variant="ghost"
              ?disabled=${saving}
              @click=${this.handleCancelMutation}
            >
              ${i18n('button:cancel')}
            </cv-button>
            <cv-button
              type="button"
              class="delete-action"
              variant="danger"
              .loading=${saving}
              ?disabled=${!option || !canMutate || saving}
              @click=${this.handleDeleteConfirm}
            >
              ${i18n('button:remove')}
            </cv-button>
          </div>
        </section>
      </div>
    `
  }

  private renderMode(mode: PMCredentialTagSheetMode): TemplateResult {
    if (mode === 'delete-confirm') {
      return html`${this.renderManageMode('manage')}${this.renderDeleteConfirmMode()}`
    }

    return this.renderManageMode(mode)
  }

  private getInitialFocusId(mode: PMCredentialTagSheetMode): string {
    if (mode === 'delete-confirm') {
      return 'pm-tag-delete-cancel'
    }

    if (mode === 'create' || mode === 'rename') {
      return ''
    }

    return 'pm-tag-done'
  }

  protected render(): TemplateResult {
    const open = pmCredentialTagsModel.filterSheetOpen()
    const mode = pmCredentialTagsModel.sheetMode()

    return html`
      <cv-bottom-sheet
        .open=${open}
        .closeOnOutsideFocus=${false}
        no-header
        show-handle
        drag-to-close
        .initialFocusId=${this.getInitialFocusId(mode)}
        @cv-change=${this.handleSheetChange}
      >
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
