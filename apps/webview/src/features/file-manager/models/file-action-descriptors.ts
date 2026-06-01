import type {KeyboardShortcutId} from 'root/shared/keyboard'

export type FileManagerActionId =
  | 'open'
  | 'open-external'
  | 'share'
  | 'rename'
  | 'move'
  | 'download'
  | 'delete'
  | 'save-to-gallery'
  | 'info'

export type FileManagerActionDescriptor = {
  id: FileManagerActionId
  label: string
  icon: string
  disabled?: boolean
  shortcutId?: KeyboardShortcutId
  separatorBefore?: boolean
}
