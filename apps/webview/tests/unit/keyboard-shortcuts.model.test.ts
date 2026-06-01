import {atom} from '@reatom/core'
import {afterEach, describe, expect, it} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {KEYBOARD_SHORTCUT_IDS, keyboardShortcutsModel} from '../../src/shared/keyboard'
import type {KeyboardShortcutId, KeyboardShortcutPlatform} from '../../src/shared/keyboard'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type LayoutMode = 'desktop' | 'mobile'

const macLabels: Record<KeyboardShortcutId, string> = {
  'app.commandPalette.open': '⌘K',
  'app.vault.lock': '⌘L',
  'nav.files': '⌘1',
  'nav.passwords': '⌘2',
  'files.newFolder': '⌘⇧N',
  'files.upload': '⌘U',
  'files.openExternal': '⌘O',
  'files.rename': 'F2',
  'files.delete': 'Del',
  'files.selectAll': '⌘A',
  'passmanager.createEntry': '⌘N',
  'passmanager.focusSearch': '/',
  'passmanager.copyPassword': '⌘C',
  'markdown.save': '⌘S',
  'markdown.undo': '⌘Z',
  'markdown.redo': '⌘⇧Z',
}

const ctrlLabels: Record<KeyboardShortcutId, string> = {
  'app.commandPalette.open': 'Ctrl+K',
  'app.vault.lock': 'Ctrl+L',
  'nav.files': 'Ctrl+1',
  'nav.passwords': 'Ctrl+2',
  'files.newFolder': 'Ctrl+Shift+N',
  'files.upload': 'Ctrl+U',
  'files.openExternal': 'Ctrl+O',
  'files.rename': 'F2',
  'files.delete': 'Del',
  'files.selectAll': 'Ctrl+A',
  'passmanager.createEntry': 'Ctrl+N',
  'passmanager.focusSearch': '/',
  'passmanager.copyPassword': 'Ctrl+C',
  'markdown.save': 'Ctrl+S',
  'markdown.undo': 'Ctrl+Z',
  'markdown.redo': 'Ctrl+Shift+Z',
}

function setupRuntime(platform: KeyboardShortcutPlatform, layoutMode: LayoutMode = 'desktop') {
  setRuntimeCapabilities({
    platform,
    desktop: layoutMode === 'desktop',
    mobile: layoutMode === 'mobile',
  })
}

function setupContext(layoutMode: LayoutMode) {
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode: atom<LayoutMode>(layoutMode),
      } as any,
    }),
  )
}

function keyEvent(
  key: string,
  options: Partial<Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>> = {},
) {
  return {
    key,
    code: options.code ?? '',
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    shiftKey: options.shiftKey ?? false,
    altKey: options.altKey ?? false,
  } as KeyboardEvent
}

afterEach(() => {
  clearAppContext()
  resetRuntimeCapabilities()
})

describe('keyboardShortcutsModel', () => {
  it('formats all registered macOS desktop labels', () => {
    setupRuntime('macos')

    for (const id of KEYBOARD_SHORTCUT_IDS) {
      expect(keyboardShortcutsModel.label(id)).toBe(macLabels[id])
      expect(keyboardShortcutsModel.hasBinding(id)).toBe(true)
    }
  })

  it('formats all registered Windows and Linux desktop labels', () => {
    for (const platform of ['windows', 'linux'] as const) {
      setupRuntime(platform)

      for (const id of KEYBOARD_SHORTCUT_IDS) {
        expect(keyboardShortcutsModel.label(id)).toBe(ctrlLabels[id])
        expect(keyboardShortcutsModel.hasBinding(id)).toBe(true)
      }
    }
  })

  it('hides desktop shortcuts on Android and iOS', () => {
    for (const platform of ['android', 'ios'] as const) {
      setupRuntime(platform, 'mobile')

      for (const id of KEYBOARD_SHORTCUT_IDS) {
        expect(keyboardShortcutsModel.label(id)).toBeUndefined()
        expect(keyboardShortcutsModel.hasBinding(id)).toBe(false)
      }

      expect(
        keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('k', {ctrlKey: true, code: 'KeyK'})),
      ).toBe(false)
    }
  })

  it('uses Ctrl labels on desktop web and hides them on mobile web', () => {
    setupRuntime('web', 'desktop')
    setupContext('desktop')

    expect(keyboardShortcutsModel.label('app.commandPalette.open')).toBe('Ctrl+K')
    expect(keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('k', {ctrlKey: true}))).toBe(true)

    clearAppContext()
    setupRuntime('web', 'mobile')
    setupContext('mobile')

    expect(keyboardShortcutsModel.label('app.commandPalette.open')).toBeUndefined()
    expect(keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('k', {ctrlKey: true}))).toBe(false)
  })

  it('matches macOS command shortcuts without accepting Ctrl or extra modifiers', () => {
    setupRuntime('macos')

    expect(keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('K', {metaKey: true}))).toBe(true)
    expect(keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('k', {ctrlKey: true}))).toBe(false)
    expect(
      keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('k', {metaKey: true, shiftKey: true})),
    ).toBe(false)
  })

  it('matches Windows/Linux Ctrl shortcuts and keeps shifted bindings distinct', () => {
    setupRuntime('windows')

    expect(keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('k', {ctrlKey: true}))).toBe(true)
    expect(keyboardShortcutsModel.matches('app.commandPalette.open', keyEvent('k', {metaKey: true}))).toBe(false)
    expect(keyboardShortcutsModel.matches('passmanager.createEntry', keyEvent('n', {ctrlKey: true}))).toBe(true)
    expect(
      keyboardShortcutsModel.matches('passmanager.createEntry', keyEvent('N', {ctrlKey: true, shiftKey: true})),
    ).toBe(false)
    expect(keyboardShortcutsModel.matches('files.newFolder', keyEvent('N', {ctrlKey: true, shiftKey: true}))).toBe(
      true,
    )
    expect(keyboardShortcutsModel.matches('files.newFolder', keyEvent('n', {ctrlKey: true}))).toBe(false)
  })

  it('matches desktop-neutral keys and delete aliases', () => {
    setupRuntime('linux')

    expect(keyboardShortcutsModel.matches('files.rename', keyEvent('F2'))).toBe(true)
    expect(keyboardShortcutsModel.matches('files.rename', keyEvent('F2', {ctrlKey: true}))).toBe(false)
    expect(keyboardShortcutsModel.matches('files.delete', keyEvent('Delete'))).toBe(true)
    expect(keyboardShortcutsModel.matches('files.delete', keyEvent('Del'))).toBe(true)
    expect(keyboardShortcutsModel.matches('passmanager.focusSearch', keyEvent('/'))).toBe(true)
  })

  it('matches Markdown save, undo, and redo shortcuts through the registry', () => {
    setupRuntime('macos')

    expect(keyboardShortcutsModel.matches('markdown.save', keyEvent('s', {metaKey: true, code: 'KeyS'}))).toBe(true)
    expect(keyboardShortcutsModel.matches('markdown.undo', keyEvent('z', {metaKey: true, code: 'KeyZ'}))).toBe(true)
    expect(
      keyboardShortcutsModel.matches('markdown.redo', keyEvent('Z', {metaKey: true, shiftKey: true, code: 'KeyZ'})),
    ).toBe(true)
    expect(keyboardShortcutsModel.matches('markdown.redo', keyEvent('y', {metaKey: true, code: 'KeyY'}))).toBe(false)

    setupRuntime('windows')

    expect(keyboardShortcutsModel.matches('markdown.save', keyEvent('s', {ctrlKey: true, code: 'KeyS'}))).toBe(true)
    expect(keyboardShortcutsModel.matches('markdown.undo', keyEvent('z', {ctrlKey: true, code: 'KeyZ'}))).toBe(true)
    expect(
      keyboardShortcutsModel.matches('markdown.redo', keyEvent('Z', {ctrlKey: true, shiftKey: true, code: 'KeyZ'})),
    ).toBe(true)
    expect(keyboardShortcutsModel.matches('markdown.redo', keyEvent('y', {ctrlKey: true, code: 'KeyY'}))).toBe(true)
  })

  it('supports explicit context overrides', () => {
    setupRuntime('android', 'mobile')

    expect(keyboardShortcutsModel.label('app.commandPalette.open', {platform: 'windows'})).toBe('Ctrl+K')
    expect(keyboardShortcutsModel.label('app.commandPalette.open', {platform: 'windows', enabled: false})).toBeUndefined()
    expect(keyboardShortcutsModel.label('app.commandPalette.open', {platform: 'web', layoutMode: 'desktop'})).toBe(
      'Ctrl+K',
    )
    expect(keyboardShortcutsModel.label('app.commandPalette.open', {platform: 'web', layoutMode: 'mobile'})).toBeUndefined()
  })
})
