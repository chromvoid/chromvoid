export type KeyboardShortcutPlatform =
  | 'macos'
  | 'windows'
  | 'linux'
  | 'android'
  | 'ios'
  | 'web'
  | 'unknown'

export type KeyboardShortcutId =
  | 'app.commandPalette.open'
  | 'app.vault.lock'
  | 'nav.files'
  | 'nav.passwords'
  | 'files.newFolder'
  | 'files.upload'
  | 'files.openExternal'
  | 'files.rename'
  | 'files.delete'
  | 'files.selectAll'
  | 'passmanager.createEntry'
  | 'passmanager.focusSearch'
  | 'passmanager.copyPassword'
  | 'markdown.save'
  | 'markdown.undo'
  | 'markdown.redo'

export type KeyboardShortcutBinding = {
  key: string
  code?: string
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  label: string
}

export type KeyboardShortcutContext = {
  platform?: KeyboardShortcutPlatform
  layoutMode?: 'desktop' | 'mobile'
  surface?: string
  enabled?: boolean
}

export type KeyboardShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
>
