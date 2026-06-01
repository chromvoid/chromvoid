import type {Entry} from '@project/passmanager/core'
import type {CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import type {PMEntryCredentialEditField, PMEntryEditData, PMEntryEditModel} from '../entry-edit.model'

export interface PMEntryMobileUIAdapter {
  handleQuickCopyUsername(): void
  handleQuickCopyPassword(): void
  handleOpenFirstUrl(): void
  handleOpenUrlClick(event: MouseEvent): void
  handleStartEdit(): void
  handleCancelEntryEdit(): void
  handleSaveEntryEdit(): void
  handleAddMissingOtpInEntryView(): void
  handleAddMissingSshInEntryView(): void
  handleHeaderAvatarAction(): void
  handleInlineIconChange(event: CustomEvent<{iconRef: string | undefined}>): void
  handleInlineEditInput(event: Event): void
  handleInlineEditSubmit(event: Event): void
  handleSaveInlineEdit(): void
  handleInlineEditorKeyDown(event: KeyboardEvent): void
  handleInlinePasswordLengthInput(event: Event): void
  handleCredentialTapStart(event: PointerEvent, field: PMEntryCredentialEditField): void
  handleCredentialTapMove(event: PointerEvent): void
  handleCredentialTapEnd(event: PointerEvent): void
  handleCredentialTapCancel(): void
  handleCredentialDoubleTap(event: Event, field: PMEntryCredentialEditField): void
  handleTitleEntryTapStart(event: PointerEvent): void
  handleTitleEntryTapMove(event: PointerEvent): void
  handleTitleEntryTapEnd(event: PointerEvent): void
  handleTitleEntryTapCancel(): void
  handleTitleEntryDoubleTap(event: Event): void
  handleNoteSubmit(event: Event): void
  handleNoteInput(event: CVTextareaInputEvent): void
  handleSaveNote(): void
  handleNoteEditorKeyDown(event: KeyboardEvent): void
  handlePaymentCardInput(event: Event): void
  handleSavePaymentCard(): void
  handleToggleCardCvv(): void
  handleTagSelect(event: Event): void
  handleTagInput(event: Event): void
  handleTagAdd(event: Event): void
  handleSaveTags(): void
  handleOtpSave(): void
  handleOtpRemove(event: CustomEvent<{otpId: string}>): void
  handleSectionSnippetKeyDown(event: KeyboardEvent): void
  handleGenerateSshKeyRequest(event?: Event): void
  handleSshKeyRemove(event: CustomEvent<{keyId: string}>): Promise<void>
}

export interface PMEntryMobileRenderContext {
  card: Entry
  data: PMEntryEditData
  model: PMEntryEditModel
  ui: PMEntryMobileUIAdapter
}
