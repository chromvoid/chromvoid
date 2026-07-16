import {atom} from '@reatom/core'

export type SettingsMobileSheet = 'language' | 'auto-lock' | 'attachment-folder' | null

export class SettingsMobileUiModel {
  readonly openSheet = atom<SettingsMobileSheet>(null, 'settings.mobile.openSheet')
  readonly attachmentFolderDraft = atom('', 'settings.mobile.attachmentFolderDraft')

  openLanguage(): void {
    this.openSheet.set('language')
  }

  openAutoLock(): void {
    this.openSheet.set('auto-lock')
  }

  openAttachmentFolder(currentPath: string): void {
    this.attachmentFolderDraft.set(currentPath)
    this.openSheet.set('attachment-folder')
  }

  setAttachmentFolderDraft(value: string): void {
    this.attachmentFolderDraft.set(value)
  }

  closeSheet(): void {
    this.openSheet.set(null)
  }
}
