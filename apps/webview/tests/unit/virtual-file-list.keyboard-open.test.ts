import {afterEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {createKeyboardHandlers} from '../../src/features/file-manager/components/virtual-file-list/handlers/keyboard'
import type {FileListItem} from '../../src/shared/contracts/file-manager'

const ITEM: FileListItem = {
  id: 11,
  path: '/report.pdf',
  name: 'report.pdf',
  isDir: false,
}

const ORDERED_ITEMS: FileListItem[] = [
  {id: 1, path: '/a.txt', name: 'a.txt', isDir: false},
  {id: 2, path: '/b.txt', name: 'b.txt', isDir: false},
  {id: 3, path: '/c.txt', name: 'c.txt', isDir: false},
]

function createHandlers(emitItemAction = vi.fn(), emitSelectionChange = vi.fn()) {
  return createKeyboardHandlers({
    getItems: () => [ITEM],
    getSelectedItems: () => [ITEM.id],
    emitSelectionChange,
    emitNavigate: () => {},
    emitItemAction,
    getActiveItemId: () => ITEM.id,
    getSelectionAnchorId: () => null,
    getKeyboardAnchorId: () => null,
    setActiveItemId: () => {},
    focusItemById: () => {},
    getItemClientRect: () => null,
    ensureIndexVisible: () => {},
    getViewMode: () => 'list',
    getItemHeight: () => 64,
    getViewportHeight: () => 640,
    getGridColumnsCount: () => 1,
    getCurrentPath: () => '/',
    normalizePath: (path: string) => path,
    getParentPath: () => '/',
    afterUpdate: (callback: () => void) => callback(),
    setSelectionAnchorId: () => {},
    setKeyboardAnchorId: () => {},
  })
}

afterEach(() => {
  resetRuntimeCapabilities()
})

describe('virtual-file-list keyboard open shortcut', () => {
  it('keeps platform desktop open-external shortcuts mapped to open-external', () => {
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    const emitItemAction = vi.fn()
    const handlers = createHandlers(emitItemAction)

    const event = new KeyboardEvent('keydown', {key: 'o', ctrlKey: true, cancelable: true})
    handlers.onContainerKeyDown(event)

    expect(emitItemAction).toHaveBeenCalledWith('open-external', ITEM)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not map Android desktop open-external shortcuts', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const emitItemAction = vi.fn()
    const handlers = createHandlers(emitItemAction)

    const event = new KeyboardEvent('keydown', {key: 'o', ctrlKey: true, cancelable: true})
    handlers.onContainerKeyDown(event)

    expect(emitItemAction).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('uses the shortcut model for select-all keyboard selection', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    const emitSelectionChange = vi.fn()
    const handlers = createHandlers(vi.fn(), emitSelectionChange)

    const event = new KeyboardEvent('keydown', {key: 'a', metaKey: true, cancelable: true})
    handlers.onContainerKeyDown(event)

    expect(emitSelectionChange).toHaveBeenCalledWith([ITEM.id])
    expect(event.defaultPrevented).toBe(true)
  })

  it('uses the current anchor item id for shift selection after the list order changes', () => {
    let selectionAnchorId: number | null = 1
    let keyboardAnchorId: number | null = null
    const items = [...ORDERED_ITEMS].reverse()
    const emitSelectionChange = vi.fn()
    const handlers = createKeyboardHandlers({
      getItems: () => items,
      getSelectedItems: () => [],
      emitSelectionChange,
      emitNavigate: () => {},
      emitItemAction: () => {},
      getActiveItemId: () => 3,
      getSelectionAnchorId: () => selectionAnchorId,
      getKeyboardAnchorId: () => keyboardAnchorId,
      setActiveItemId: () => {},
      focusItemById: () => {},
      getItemClientRect: () => null,
      ensureIndexVisible: () => {},
      getViewMode: () => 'list',
      getItemHeight: () => 64,
      getViewportHeight: () => 640,
      getGridColumnsCount: () => 1,
      getCurrentPath: () => '/',
      normalizePath: (path: string) => path,
      getParentPath: () => '/',
      afterUpdate: (callback: () => void) => callback(),
      setSelectionAnchorId: (id: number | null) => {
        selectionAnchorId = id
      },
      setKeyboardAnchorId: (id: number | null) => {
        keyboardAnchorId = id
      },
    })

    const event = new KeyboardEvent('keydown', {key: ' ', shiftKey: true, cancelable: true})
    handlers.onContainerKeyDown(event)

    expect(emitSelectionChange).toHaveBeenCalledWith([3, 2, 1])
    expect(selectionAnchorId).toBe(1)
    expect(keyboardAnchorId).toBe(3)
    expect(event.defaultPrevented).toBe(true)
  })
})
