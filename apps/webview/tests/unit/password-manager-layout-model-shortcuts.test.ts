import {afterEach, describe, expect, it} from 'vitest'

import {Group, ManagerRoot} from '@project/passmanager/core'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {PasswordManagerLayoutModel} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import type {KeyboardShortcutPlatform} from '../../src/shared/keyboard'

function createKeyboardEvent(
  key: string,
  target: EventTarget,
  path: EventTarget[],
  options: Partial<Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {},
): KeyboardEvent {
  return {
    key,
    code: options.code ?? '',
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    altKey: options.altKey ?? false,
    target,
    composedPath: () => path,
  } as unknown as KeyboardEvent
}

function setupRuntime(platform: KeyboardShortcutPlatform) {
  setRuntimeCapabilities({
    platform,
    desktop: platform !== 'android' && platform !== 'ios',
    mobile: platform === 'android' || platform === 'ios',
  })
}

describe('PasswordManagerLayoutModel shortcut guards', () => {
  afterEach(() => {
    resetRuntimeCapabilities()
  })

  it('does not block arrows when focus is on an active entry row target', () => {
    const model = new PasswordManagerLayoutModel()
    const row = document.createElement('div')
    row.className = 'list-item active-row'
    row.setAttribute('role', 'button')

    const event = createKeyboardEvent('ArrowDown', row, [row, document.body, document, window])

    expect(model.isShortcutBlocked(event)).toBe(false)
  })

  it('still blocks shortcuts for real action buttons inside a row', () => {
    const model = new PasswordManagerLayoutModel()
    const row = document.createElement('div')
    row.className = 'list-item active-row'
    row.setAttribute('role', 'button')

    const action = document.createElement('button')
    row.appendChild(action)

    const event = createKeyboardEvent('ArrowDown', action, [action, row, document.body, document, window])

    expect(model.isShortcutBlocked(event)).toBe(true)
  })

  it('does not block arrows when focus is on an active folder row target', () => {
    const model = new PasswordManagerLayoutModel()
    const row = document.createElement('div')
    row.className = 'group-row active'
    row.setAttribute('role', 'button')

    const event = createKeyboardEvent('ArrowUp', row, [row, document.body, document, window])

    expect(model.isShortcutBlocked(event)).toBe(false)
  })

  it('does not block backspace when focus is on a sidebar tree row', () => {
    const model = new PasswordManagerLayoutModel()
    const tree = document.createElement('group-tree-view')
    const root = tree.attachShadow({mode: 'open'})
    const row = document.createElement('div')
    row.className = 'row selected'
    row.setAttribute('role', 'button')
    root.appendChild(row)
    document.body.appendChild(tree)

    const event = createKeyboardEvent('Backspace', row, [row, root, tree, document.body, document, window])

    expect(model.isShortcutBlocked(event)).toBe(false)
  })

  it('still blocks shortcuts for sidebar action buttons inside a tree row', () => {
    const model = new PasswordManagerLayoutModel()
    const tree = document.createElement('group-tree-view')
    const root = tree.attachShadow({mode: 'open'})
    const row = document.createElement('div')
    row.className = 'row selected'
    row.setAttribute('role', 'button')
    const action = document.createElement('button')
    row.appendChild(action)
    root.appendChild(row)
    document.body.appendChild(tree)

    const event = createKeyboardEvent('Backspace', action, [
      action,
      row,
      root,
      tree,
      document.body,
      document,
      window,
    ])

    expect(model.isShortcutBlocked(event)).toBe(true)
  })

  it('returns a stable root view key for manager root content', () => {
    const originalPassmanager = window.passmanager
    const model = new PasswordManagerLayoutModel()
    const root = new ManagerRoot({} as any)

    try {
      window.passmanager = root
      expect(model.getGroupViewKey()).toBe('pm-group-view:root:root')
    } finally {
      window.passmanager = originalPassmanager
    }
  })

  it('returns a stable group view key for group content', () => {
    const originalPassmanager = window.passmanager
    const model = new PasswordManagerLayoutModel()
    const root = new ManagerRoot({} as any)
    const group = new Group({
      id: 'group-a',
      name: 'Group A',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)

    try {
      root.entries.set([group])
      root.showElement.set(group)
      window.passmanager = root

      expect(model.getGroupViewKey()).toBe('pm-group-view:group:group-a')
    } finally {
      window.passmanager = originalPassmanager
    }
  })

  it('resolves macOS Meta+N to create entry when shortcuts are not blocked', () => {
    setupRuntime('macos')
    const model = new PasswordManagerLayoutModel()
    const target = document.createElement('div')
    const event = createKeyboardEvent('n', target, [target, document.body, document, window], {
      code: 'KeyN',
      metaKey: true,
    })

    expect(model.resolveGlobalShortcut(event, false)).toBe('create-entry')
    expect(model.resolveGlobalShortcut(event, true)).toBe('none')
  })

  it('resolves Windows and Linux Ctrl+N to create entry when shortcuts are not blocked', () => {
    for (const platform of ['windows', 'linux'] as const) {
      setupRuntime(platform)
      const model = new PasswordManagerLayoutModel()
      const target = document.createElement('div')
      const event = createKeyboardEvent('n', target, [target, document.body, document, window], {
        code: 'KeyN',
        ctrlKey: true,
      })

      expect(model.resolveGlobalShortcut(event, false)).toBe('create-entry')
      expect(model.resolveGlobalShortcut(event, true)).toBe('none')
    }
  })

  it('does not resolve desktop create or copy shortcuts on Android and iOS', () => {
    for (const platform of ['android', 'ios'] as const) {
      setupRuntime(platform)
      const model = new PasswordManagerLayoutModel()
      const target = document.createElement('div')
      const createEvent = createKeyboardEvent('n', target, [target, document.body, document, window], {
        code: 'KeyN',
        ctrlKey: true,
      })
      const copyEvent = createKeyboardEvent('c', target, [target, document.body, document, window], {
        code: 'KeyC',
        ctrlKey: true,
      })

      expect(model.resolveGlobalShortcut(createEvent, false)).toBe('none')
      expect(model.resolveGlobalShortcut(copyEvent, false)).toBe('none')
    }
  })

  it('keeps focus, clear, back, and enter contextual shortcuts unchanged', () => {
    setupRuntime('linux')
    const originalPassmanager = window.passmanager
    const model = new PasswordManagerLayoutModel()
    const target = document.createElement('div')
    const root = new ManagerRoot({} as any)
    const group = new Group({
      id: 'group-a',
      name: 'Group A',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)

    try {
      root.entries.set([group])
      root.showElement.set(group)
      window.passmanager = root

      expect(
        model.resolveGlobalShortcut(
          createKeyboardEvent('/', target, [target, document.body, document, window], {code: 'Slash'}),
          false,
        ),
      ).toBe('focus-search')
      expect(
        model.resolveGlobalShortcut(
          createKeyboardEvent('/', target, [target, document.body, document, window], {code: 'Slash'}),
          true,
        ),
      ).toBe('none')
      expect(model.resolveGlobalShortcut(createKeyboardEvent('Escape', target, [target]), true)).toBe(
        'clear-search',
      )
      expect(model.resolveGlobalShortcut(createKeyboardEvent('Backspace', target, [target]), false)).toBe('go-back')
      expect(model.resolveGlobalShortcut(createKeyboardEvent('Backspace', target, [target]), true)).toBe(
        'none',
      )
      root.showElement.set(root)
      expect(model.resolveGlobalShortcut(createKeyboardEvent('Enter', target, [target]), false)).toBe(
        'open-first-search-result',
      )
      expect(model.resolveGlobalShortcut(createKeyboardEvent('Enter', target, [target]), true)).toBe('none')
    } finally {
      window.passmanager = originalPassmanager
    }
  })
})
