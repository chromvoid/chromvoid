import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {PasswordManagerMobileLayout} from '../../src/features/passmanager/components/password-manager-layout/password-manager-mobile-layout'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'
import {pmSelectionModeModel} from '../../src/features/passmanager/models/pm-selection-mode.model'

type FakePassmanager = {
  id: string
  showElement: ReturnType<typeof atom<any>>
  isEditMode: ReturnType<typeof atom<boolean>>
  isLoading: ReturnType<typeof atom<boolean>>
  isReadOnly: ReturnType<typeof atom<boolean>>
  getCardByID: (id: string) => Entry | Group | undefined
}

function createRootLike() {
  const root = Object.create(ManagerRoot.prototype) as ManagerRoot & {
    entriesList: () => Array<Entry | Group>
    searched: () => Array<Entry | Group>
  }
  root.isRoot = true
  root.entries = atom<Array<Entry | Group>>([])
  root.isLoading = atom(false)
  root.isReadOnly = atom(false)
  root.isEditMode = atom(false)
  root.showElement = atom<any>(root)
  root.updatedTs = atom(Date.now())
  root.createdTs = atom(Date.now())
  root.entriesList = () => root.entries()
  root.searched = () => root.entries()
  return root
}

function createEntry(parent: Group, id: string, title = id) {
  return new Entry(
    parent as any,
    {
      id,
      title,
      username: '',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function createPassmanager(initialShowElement: unknown, items: Array<Entry | Group>): FakePassmanager {
  return {
    id: 'pm-selection-toolbar-test',
    showElement: atom<any>(initialShowElement),
    isEditMode: atom(false),
    isLoading: atom(false),
    isReadOnly: atom(false),
    getCardByID: (id: string) => items.find((item) => item.id === id),
  }
}

async function flush(layout: PasswordManagerMobileLayout) {
  await Promise.resolve()
  await layout.updateComplete
  await Promise.resolve()
}

describe('PasswordManagerMobileLayout selection toolbar', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('password-manager-mobile-layout')) {
      PasswordManagerMobileLayout.define()
    }
    pmSelectionModeModel.exit()
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    pmSelectionModeModel.exit()
    window.passmanager = originalPassmanager
    vi.useRealTimers()
  })

  it('switches toolbar context and actions to passwords-selection mode', async () => {
    const root = createRootLike()
    const group = new Group({
      id: 'selection-toolbar-group',
      name: 'Selection Toolbar Group',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)
    const entry = createEntry(group, 'selection-toolbar-entry', 'Selection Toolbar Entry')
    group.entries.set([entry])

    window.passmanager = createPassmanager(root, [group, entry]) as typeof window.passmanager

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.append(layout)
    await flush(layout)

    pmSelectionModeModel.enterWithEntry(entry.id)
    await flush(layout)

    expect(pmMobileChromeModel.getCommandContext()).toMatchObject({
      kind: 'passwords-selection',
      selectedCount: 1,
      singleSelectionKind: 'entry',
    })
    expect(pmMobileChromeModel.getToolbarContext()).toMatchObject({
      canGoBack: true,
      showCommand: false,
      maxVisible: 4,
    })
    expect(pmMobileChromeModel.getToolbarActions()).toMatchObject([
      {id: 'pm-selection-done', icon: 'check-lg'},
      {id: 'pm-selection-delete', icon: 'trash', disabled: false},
    ])

    pmSelectionModeModel.toggleGroup(group.id)
    await flush(layout)

    expect(pmMobileChromeModel.getCommandContext()).toMatchObject({
      kind: 'passwords-selection',
      selectedCount: 2,
      singleSelectionKind: null,
    })
    expect(pmMobileChromeModel.getToolbarActions()).toMatchObject([
      {id: 'pm-selection-done', icon: 'check-lg'},
      {id: 'pm-selection-delete', icon: 'trash', disabled: false},
    ])
  })

  it('updates toolbar context after direct selection activation', async () => {
    const root = createRootLike()
    const group = new Group({
      id: 'selection-toolbar-cancel-group',
      name: 'Selection Toolbar Cancel Group',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)
    const entry = createEntry(group, 'selection-toolbar-cancel-entry', 'Selection Toolbar Cancel Entry')
    group.entries.set([entry])

    window.passmanager = createPassmanager(root, [group, entry]) as typeof window.passmanager

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.append(layout)
    await flush(layout)

    pmSelectionModeModel.enterWithEntry(entry.id)
    await flush(layout)

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmSelectionModeModel.isEntrySelected(entry.id)).toBe(true)
    expect(pmMobileChromeModel.getCommandContext()).toMatchObject({
      kind: 'passwords-selection',
      selectedCount: 1,
    })
  })

})
