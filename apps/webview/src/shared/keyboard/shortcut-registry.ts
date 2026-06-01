import type {KeyboardShortcutBinding, KeyboardShortcutId} from './shortcut.types'

export type KeyboardShortcutPlatformBindingMap = {
  macos?: readonly KeyboardShortcutBinding[]
  windows?: readonly KeyboardShortcutBinding[]
  linux?: readonly KeyboardShortcutBinding[]
  web?: readonly KeyboardShortcutBinding[]
}

export type KeyboardShortcutDefinition = {
  id: KeyboardShortcutId
  bindings: KeyboardShortcutPlatformBindingMap
}

const mac = (
  key: string,
  label: string,
  options: Pick<KeyboardShortcutBinding, 'code' | 'shift' | 'alt'> = {},
): KeyboardShortcutBinding => ({
  key,
  label,
  meta: true,
  ...options,
})

const ctrl = (
  key: string,
  label: string,
  options: Pick<KeyboardShortcutBinding, 'code' | 'shift' | 'alt'> = {},
): KeyboardShortcutBinding => ({
  key,
  label,
  ctrl: true,
  ...options,
})

const neutral = (
  key: string,
  label: string,
  options: Pick<KeyboardShortcutBinding, 'code' | 'shift' | 'alt'> = {},
): KeyboardShortcutBinding => ({
  key,
  label,
  ...options,
})

const desktop = (binding: KeyboardShortcutBinding): KeyboardShortcutPlatformBindingMap => ({
  macos: [binding],
  windows: [binding],
  linux: [binding],
  web: [binding],
})

const modifierDesktop = (
  macos: KeyboardShortcutBinding,
  nonMacos: KeyboardShortcutBinding,
): KeyboardShortcutPlatformBindingMap => ({
  macos: [macos],
  windows: [nonMacos],
  linux: [nonMacos],
  web: [nonMacos],
})

export const KEYBOARD_SHORTCUT_IDS = [
  'app.commandPalette.open',
  'app.vault.lock',
  'nav.files',
  'nav.passwords',
  'files.newFolder',
  'files.upload',
  'files.openExternal',
  'files.rename',
  'files.delete',
  'files.selectAll',
  'passmanager.createEntry',
  'passmanager.focusSearch',
  'passmanager.copyPassword',
  'markdown.save',
  'markdown.undo',
  'markdown.redo',
] as const satisfies readonly KeyboardShortcutId[]

export const keyboardShortcutRegistry: Readonly<Record<KeyboardShortcutId, KeyboardShortcutDefinition>> = {
  'app.commandPalette.open': {
    id: 'app.commandPalette.open',
    bindings: modifierDesktop(mac('k', '⌘K', {code: 'KeyK'}), ctrl('k', 'Ctrl+K', {code: 'KeyK'})),
  },
  'app.vault.lock': {
    id: 'app.vault.lock',
    bindings: modifierDesktop(mac('l', '⌘L', {code: 'KeyL'}), ctrl('l', 'Ctrl+L', {code: 'KeyL'})),
  },
  'nav.files': {
    id: 'nav.files',
    bindings: modifierDesktop(mac('1', '⌘1', {code: 'Digit1'}), ctrl('1', 'Ctrl+1', {code: 'Digit1'})),
  },
  'nav.passwords': {
    id: 'nav.passwords',
    bindings: modifierDesktop(mac('2', '⌘2', {code: 'Digit2'}), ctrl('2', 'Ctrl+2', {code: 'Digit2'})),
  },
  'files.newFolder': {
    id: 'files.newFolder',
    bindings: modifierDesktop(
      mac('n', '⌘⇧N', {code: 'KeyN', shift: true}),
      ctrl('n', 'Ctrl+Shift+N', {code: 'KeyN', shift: true}),
    ),
  },
  'files.upload': {
    id: 'files.upload',
    bindings: modifierDesktop(mac('u', '⌘U', {code: 'KeyU'}), ctrl('u', 'Ctrl+U', {code: 'KeyU'})),
  },
  'files.openExternal': {
    id: 'files.openExternal',
    bindings: modifierDesktop(mac('o', '⌘O', {code: 'KeyO'}), ctrl('o', 'Ctrl+O', {code: 'KeyO'})),
  },
  'files.rename': {
    id: 'files.rename',
    bindings: desktop(neutral('F2', 'F2', {code: 'F2'})),
  },
  'files.delete': {
    id: 'files.delete',
    bindings: desktop(neutral('Delete', 'Del', {code: 'Delete'})),
  },
  'files.selectAll': {
    id: 'files.selectAll',
    bindings: modifierDesktop(mac('a', '⌘A', {code: 'KeyA'}), ctrl('a', 'Ctrl+A', {code: 'KeyA'})),
  },
  'passmanager.createEntry': {
    id: 'passmanager.createEntry',
    bindings: modifierDesktop(mac('n', '⌘N', {code: 'KeyN'}), ctrl('n', 'Ctrl+N', {code: 'KeyN'})),
  },
  'passmanager.focusSearch': {
    id: 'passmanager.focusSearch',
    bindings: desktop(neutral('/', '/', {code: 'Slash'})),
  },
  'passmanager.copyPassword': {
    id: 'passmanager.copyPassword',
    bindings: modifierDesktop(mac('c', '⌘C', {code: 'KeyC'}), ctrl('c', 'Ctrl+C', {code: 'KeyC'})),
  },
  'markdown.save': {
    id: 'markdown.save',
    bindings: modifierDesktop(mac('s', '⌘S', {code: 'KeyS'}), ctrl('s', 'Ctrl+S', {code: 'KeyS'})),
  },
  'markdown.undo': {
    id: 'markdown.undo',
    bindings: modifierDesktop(mac('z', '⌘Z', {code: 'KeyZ'}), ctrl('z', 'Ctrl+Z', {code: 'KeyZ'})),
  },
  'markdown.redo': {
    id: 'markdown.redo',
    bindings: {
      macos: [mac('z', '⌘⇧Z', {code: 'KeyZ', shift: true})],
      windows: [
        ctrl('z', 'Ctrl+Shift+Z', {code: 'KeyZ', shift: true}),
        ctrl('y', 'Ctrl+Y', {code: 'KeyY'}),
      ],
      linux: [
        ctrl('z', 'Ctrl+Shift+Z', {code: 'KeyZ', shift: true}),
        ctrl('y', 'Ctrl+Y', {code: 'KeyY'}),
      ],
      web: [
        ctrl('z', 'Ctrl+Shift+Z', {code: 'KeyZ', shift: true}),
        ctrl('y', 'Ctrl+Y', {code: 'KeyY'}),
      ],
    },
  },
}
