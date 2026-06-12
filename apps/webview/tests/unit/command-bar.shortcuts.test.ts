import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {CommandBarModel, type CommandBarRuntime} from '../../src/features/file-manager/models/command-bar.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function keyEvent(key: string, options: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', {key, cancelable: true, ...options})
}

function setupModel(runtimeOverrides: Partial<CommandBarRuntime> = {}) {
  navigationModel.disconnect()

  const searchFilters = atom<SearchFilters>({...DEFAULT_FILTERS})
  const store = {
    layoutMode: atom<'mobile' | 'desktop'>('desktop'),
    searchFilters,
    setSearchFilters(next: SearchFilters | ((prev: SearchFilters) => SearchFilters)) {
      searchFilters.set(typeof next === 'function' ? next(searchFilters()) : next)
    },
    remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
  }

  initAppContext(
    createMockAppContext({
      store: store as any,
    }),
  )

  navigationModel.reset()

  const runtime: CommandBarRuntime = {
    requestOpen: vi.fn(),
    requestClose: vi.fn(),
    focusSearchInput: vi.fn(),
    openFileInput: vi.fn(),
    dispatchCommand: vi.fn(),
    ...runtimeOverrides,
  }

  return {model: new CommandBarModel(runtime), runtime, store}
}

afterEach(() => {
  navigationModel.disconnect()
  clearAppContext()
  resetRuntimeCapabilities()
  vi.restoreAllMocks()
})

describe('CommandBar shortcut handling', () => {
  it('opens the command palette with the macOS command shortcut', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    const {model, runtime} = setupModel()
    const event = keyEvent('k', {metaKey: true})

    model.onKeyDown(event)

    expect(event.defaultPrevented).toBe(true)
    expect(model.isOpen).toBe(true)
    expect(runtime.requestOpen).toHaveBeenCalledTimes(1)
  })

  it('opens the command palette with Ctrl+K on Windows/Linux desktop', () => {
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    const {model, runtime} = setupModel()
    const event = keyEvent('k', {ctrlKey: true})

    model.onKeyDown(event)

    expect(event.defaultPrevented).toBe(true)
    expect(model.isOpen).toBe(true)
    expect(runtime.requestOpen).toHaveBeenCalledTimes(1)
  })

  it('does not open or execute desktop command-bar shortcuts on Android', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const {model, runtime} = setupModel()

    const openEvent = keyEvent('k', {ctrlKey: true})
    const uploadEvent = keyEvent('u', {ctrlKey: true})
    model.onKeyDown(openEvent)
    model.onKeyDown(uploadEvent)

    expect(openEvent.defaultPrevented).toBe(false)
    expect(uploadEvent.defaultPrevented).toBe(false)
    expect(model.isOpen).toBe(false)
    expect(runtime.requestOpen).not.toHaveBeenCalled()
    expect(runtime.openFileInput).not.toHaveBeenCalled()
  })

  it('executes displayed navigation shortcuts through command actions', () => {
    setRuntimeCapabilities({platform: 'linux', desktop: true})
    const {model} = setupModel()
    navigationModel.navigateToSurface('passwords')

    const event = keyEvent('1', {ctrlKey: true})
    model.onKeyDown(event)

    expect(event.defaultPrevented).toBe(true)
    expect(navigationModel.currentSurface()).toBe('files')
  })

  it('exposes and executes the Notes navigation command', () => {
    setRuntimeCapabilities({platform: 'linux', desktop: true})
    const {model} = setupModel()
    const command = model.getContextCommands('files').find((item) => item.id === 'nav-notes')

    command?.action()

    expect(command?.label).toBe('Go to Notes')
    expect(navigationModel.currentSurface()).toBe('notes')
  })

  it('executes displayed file action shortcuts through command actions', () => {
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    const {model, runtime} = setupModel()

    const newFolderEvent = keyEvent('N', {ctrlKey: true, shiftKey: true})
    model.onKeyDown(newFolderEvent)
    const uploadEvent = keyEvent('u', {ctrlKey: true})
    model.onKeyDown(uploadEvent)

    expect(newFolderEvent.defaultPrevented).toBe(true)
    expect(uploadEvent.defaultPrevented).toBe(true)
    expect(runtime.dispatchCommand).toHaveBeenCalledWith({kind: 'create-dir'})
    expect(runtime.openFileInput).toHaveBeenCalledTimes(1)
  })

  it('executes the command at the highlighted rendered order on Enter', () => {
    setRuntimeCapabilities({platform: 'linux', desktop: true})
    const {model, runtime} = setupModel()
    model.open('all')
    const firstRenderedCommand = model.commandList[0]

    const event = keyEvent('Enter')
    model.onKeyDown(event)

    expect(event.defaultPrevented).toBe(true)
    expect(firstRenderedCommand?.category).toBe('actions')
    expect(firstRenderedCommand?.id).toBe('action-new-note')
    expect(runtime.dispatchCommand).toHaveBeenCalledWith({kind: 'create-markdown-note'})
  })
})
