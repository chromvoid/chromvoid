import {render as renderTemplate} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {renderCommandBar, renderResults} from '../../src/features/file-manager/components/command-bar.render'
import type {Command} from '../../src/features/file-manager/components/command-bar.types'
import type {CommandBarModel} from '../../src/features/file-manager/models/command-bar.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

function createModel(overrides?: Partial<CommandBarModel>): CommandBarModel {
  const command: Command = {
    id: 'create-dir',
    icon: 'folder-plus',
    label: 'Create folder',
    category: 'actions',
    shortcutId: 'files.newFolder',
    action: vi.fn(),
  }

  const groups = {
    actions: [command],
    navigation: [],
    filters: [],
    search: [],
  }

  return {
    commandList: [command],
    getSortedCommandGroups: () => groups,
    commandIsSelected: (index: number) => index === 0,
    onBackdropClick: vi.fn(),
    query: () => '',
    onInput: vi.fn(),
    onFileInputChange: vi.fn(),
    ...overrides,
  } as unknown as CommandBarModel
}

afterEach(() => {
  document.body.innerHTML = ''
  resetRuntimeCapabilities()
  vi.restoreAllMocks()
})

describe('command-bar render', () => {
  it('renders translated dialog chrome and grouped commands', () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    const model = createModel()
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderTemplate(renderCommandBar(model), container)

    const dialog = container.querySelector('.dialog')
    const input = container.querySelector<HTMLInputElement>('.search-input')
    const category = container.querySelector('.category-label')
    const selected = container.querySelector('.command.selected')

    expect(dialog?.getAttribute('aria-label')).toBe('Command palette')
    expect(input?.getAttribute('placeholder')).toBe('Type a command…')
    expect(category?.textContent).toBe('Actions')
    expect(selected?.getAttribute('data-command-id')).toBe('create-dir')
    expect(selected?.textContent).toContain('Create folder')
    expect(selected?.textContent).toContain('⌘⇧N')
  })

  it('omits shortcut suffix when the current platform has no binding', () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const model = createModel()
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderTemplate(renderCommandBar(model), container)

    expect(container.querySelector('.shortcut')).toBeNull()
    expect(container.textContent).not.toContain('⌘⇧N')
    expect(container.textContent).not.toContain('Ctrl+Shift+N')
  })

  it('renders translated empty state when no commands are available', () => {
    const model = createModel({
      commandList: [],
      getSortedCommandGroups: () => ({
        actions: [],
        navigation: [],
        filters: [],
        search: [],
      }),
    })
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderTemplate(renderResults(model), container)

    expect(container.textContent).toContain('No results')
  })
})
