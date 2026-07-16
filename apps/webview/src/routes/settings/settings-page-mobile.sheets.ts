import type {CVBottomSheetChangeEvent} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'
import type {SettingsMobileUiModel} from './settings-mobile-ui.model'
import type {settingsPageModel} from './settings.model'

const AUTO_LOCK_OPTIONS = [0, 60, 300, 900, 1800, 3600] as const

type SettingsMobileSheetHandlers = {
  handleSheetChange(event: CVBottomSheetChangeEvent): void
  handleLanguageSelect(event: Event): void
  handleAutoLockSelect(event: Event): Promise<void>
  handleAttachmentFolderInput(event: Event): void
  handleAttachmentFolderSave(): Promise<void>
}

export function renderSettingsMobileSheets(input: {
  model: typeof settingsPageModel
  uiModel: SettingsMobileUiModel
  handlers: SettingsMobileSheetHandlers
}): TemplateResult {
  const {model, uiModel, handlers} = input
  const currentAutoLock = model.settings().auto_lock_timeout_secs

  return html`
    <cv-bottom-sheet
      .open=${uiModel.openSheet() === 'language'}
      show-handle
      drag-to-close
      @cv-change=${handlers.handleSheetChange}
    >
      <span slot="title">${i18n('settings:language-title')}</span>
      <span slot="description">${i18n('settings:language-hint')}</span>
      <div class="sheet-list" role="radiogroup">
        ${model.languageOptions().map(
          (option) => html`
            <button
              class="sheet-option"
              type="button"
              role="radio"
              aria-checked=${model.currentLanguage() === option.value}
              data-value=${option.value}
              @click=${handlers.handleLanguageSelect}
            >
              <span>${option.label}</span>
              ${model.currentLanguage() === option.value
                ? html`<cv-icon name="check" aria-hidden="true"></cv-icon>`
                : nothing}
            </button>
          `,
        )}
      </div>
    </cv-bottom-sheet>

    <cv-bottom-sheet
      .open=${uiModel.openSheet() === 'auto-lock'}
      show-handle
      drag-to-close
      @cv-change=${handlers.handleSheetChange}
    >
      <span slot="title">${i18n('settings:auto-lock-after')}</span>
      <span slot="description">${i18n('settings:auto-lock-hint')}</span>
      <div class="sheet-list" role="radiogroup">
        ${AUTO_LOCK_OPTIONS.map(
          (seconds) => html`
            <button
              class="sheet-option"
              type="button"
              role="radio"
              aria-checked=${currentAutoLock === seconds}
              data-value=${seconds}
              @click=${handlers.handleAutoLockSelect}
              ?disabled=${model.preferenceSavePending()}
            >
              <span>${model.autoLockLabel(seconds)}</span>
              ${currentAutoLock === seconds
                ? html`<cv-icon name="check" aria-hidden="true"></cv-icon>`
                : nothing}
            </button>
          `,
        )}
      </div>
      ${model.preferenceErrorFor('auto_lock_timeout_secs')
        ? html`<p class="sheet-error" role="status" aria-live="polite">
            ${model.preferenceErrorFor('auto_lock_timeout_secs')}
          </p>`
        : nothing}
    </cv-bottom-sheet>

    <cv-bottom-sheet
      .open=${uiModel.openSheet() === 'attachment-folder'}
      show-handle
      drag-to-close
      @cv-change=${handlers.handleSheetChange}
    >
      <span slot="title">${i18n('settings:markdown-attachment-folder')}</span>
      <span slot="description">${i18n('settings:markdown-attachment-folder-hint')}</span>
      <div class="sheet-form">
        <input
          id="settings-attachment-folder-input"
          class="sheet-input"
          type="text"
          inputmode="text"
          .value=${uiModel.attachmentFolderDraft()}
          @input=${handlers.handleAttachmentFolderInput}
          ?disabled=${model.preferenceSavePending()}
        />
        <div class="sheet-actions">
          <cv-button
            variant="primary"
            .loading=${model.isPreferencePending('markdown_attachment_folder_path')}
            ?disabled=${model.preferenceSavePending()}
            @click=${handlers.handleAttachmentFolderSave}
          >
            ${i18n('settings:save-action')}
          </cv-button>
        </div>
        ${model.preferenceErrorFor('markdown_attachment_folder_path')
          ? html`<p class="sheet-error" role="status" aria-live="polite">
              ${model.preferenceErrorFor('markdown_attachment_folder_path')}
            </p>`
          : nothing}
      </div>
    </cv-bottom-sheet>
  `
}
