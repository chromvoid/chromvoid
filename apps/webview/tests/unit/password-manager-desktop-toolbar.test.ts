import {atom} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {ImportDialog} from '@chromvoid/password-import/ui/import-dialog'
import {PasswordManagerDesktopLayout} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-layout'
import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {PMGroupModel} from '../../src/features/passmanager/components/group/group/group.model'
import {pmComponentLoaderModel} from '../../src/features/passmanager/models/pm-component-loader.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

type PassmanagerMock = {
  showElement: ReturnType<typeof atom<any>>
  isLoading: ReturnType<typeof atom<boolean>>
  isReadOnly: ReturnType<typeof atom<boolean>>
  isEditMode: ReturnType<typeof atom<boolean>>
}

let desktopLayoutDefined = false
let originalPassmanager: unknown
const originalExtendedReady = pmComponentLoaderModel.extendedReady()

function ensureDefined() {
  if (desktopLayoutDefined) return
  PasswordManagerDesktopLayout.define()
  ImportDialog.define()
  desktopLayoutDefined = true
}

function createGroup(id: string, name = 'Group A') {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(group: Group, id: string, title = 'Entry A') {
  return new Entry(
    group as any,
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

function createPassmanager(showElement: unknown, readOnly = false, editMode = false): PassmanagerMock {
  return {
    showElement: atom(showElement),
    isLoading: atom(false),
    isReadOnly: atom(readOnly),
    isEditMode: atom(editMode),
  }
}

async function renderLayout(passmanager: PassmanagerMock, options: {extendedReady?: boolean} = {}) {
  ensureDefined()
  originalPassmanager = (window as any).passmanager
  ;(window as any).passmanager = passmanager
  setPassmanagerRoot(passmanager as any)
  pmComponentLoaderModel.extendedReady.set(options.extendedReady ?? true)

  const element = document.createElement(
    PasswordManagerDesktopLayout.elementName,
  ) as PasswordManagerDesktopLayout
  document.body.appendChild(element)
  await flush(element)
  await flush(element)
  return element
}

async function flush(element: {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function getToolbarItem(layout: PasswordManagerDesktopLayout, action: string) {
  return layout.shadowRoot
    ?.querySelector('pm-desktop-toolbar')
    ?.shadowRoot?.querySelector(`cv-button[data-action="${action}"]`) as HTMLElement | null
}

describe('PasswordManagerDesktopLayout toolbar', () => {
  afterEach(async () => {
    pmComponentLoaderModel.extendedReady.set(true)
    await Promise.resolve()
    document.querySelectorAll(PasswordManagerDesktopLayout.elementName).forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    setPassmanagerRoot(originalPassmanager as any)
    new PMGroupModel().exitEditMode()
    pmComponentLoaderModel.extendedReady.set(originalExtendedReady)
    vi.restoreAllMocks()
  })

  it('renders all top toolbar actions and disables contextual ones outside entry/group context', async () => {
    const goBackSpy = vi.spyOn(pmModel, 'goBackFromCurrent').mockReturnValue(false)
    const onImport = vi.spyOn(pmModel, 'onImport').mockResolvedValue(undefined)
    const onExport = vi.spyOn(pmModel, 'onExport').mockImplementation(() => {})
    const onFullClean = vi.spyOn(pmModel, 'onFullClean').mockImplementation(() => {})
    const onCreateGroup = vi.spyOn(pmModel, 'onCreateGroup').mockImplementation(() => {})
    const onCreateEntry = vi.spyOn(pmModel, 'onCreateEntry').mockImplementation(() => {})

    const layout = await renderLayout(createPassmanager(new ManagerRoot({} as any)))

    const actions = [
      'pm-back',
      'pm-import',
      'pm-export',
      'pm-clean',
      'pm-create-group',
      'pm-create-entry',
      'pm-edit',
      'pm-delete',
      'pm-move',
    ]

    expect(actions.map((action) => getToolbarItem(layout, action))).toSatisfy((items: Array<HTMLElement | null>) =>
      items.every((item) => item instanceof HTMLElement),
    )

    getToolbarItem(layout, 'pm-import')?.click()
    getToolbarItem(layout, 'pm-export')?.click()
    getToolbarItem(layout, 'pm-clean')?.click()
    getToolbarItem(layout, 'pm-create-group')?.click()
    getToolbarItem(layout, 'pm-create-entry')?.click()

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onFullClean).toHaveBeenCalledTimes(1)
    expect(onCreateGroup).toHaveBeenCalledTimes(1)
    expect(onCreateEntry).toHaveBeenCalledTimes(1)
    expect(goBackSpy).toHaveBeenCalledTimes(0)

    expect(getToolbarItem(layout, 'pm-back')?.hasAttribute('disabled')).toBe(true)
    expect(getToolbarItem(layout, 'pm-edit')?.hasAttribute('disabled')).toBe(true)
    expect(getToolbarItem(layout, 'pm-delete')?.hasAttribute('disabled')).toBe(true)
    expect(getToolbarItem(layout, 'pm-move')?.hasAttribute('disabled')).toBe(true)
  })

  it('keeps selection actions inactive while the import dialog is open', async () => {
    const layout = await renderLayout(createPassmanager('importDialog'))
    const dialog = layout.shadowRoot?.querySelector('pm-import-dialog') as ImportDialog | null
    await flush(dialog ?? {})

    const toolbar = layout.shadowRoot?.querySelector('pm-desktop-toolbar')
    const importAnchor = toolbar?.shadowRoot?.querySelector('cv-guidance-anchor[anchor-id="passwords.import"]')
    const helpButton = getToolbarItem(layout, 'pm-import-help')
    const selectionCluster = Array.from(toolbar?.shadowRoot?.querySelectorAll('.toolbar-cluster') ?? []).find(
      (cluster) => cluster.textContent?.includes('Selection'),
    ) as HTMLElement | undefined

    expect(importAnchor).toBeNull()
    expect(helpButton).toBeNull()
    expect(dialog?.shadowRoot?.querySelector('[data-action="import-help"]')).toBeNull()
    expect(selectionCluster?.dataset['state']).toBe('inactive')
    expect(getToolbarItem(layout, 'pm-edit')?.hasAttribute('disabled')).toBe(true)
    expect(getToolbarItem(layout, 'pm-move')?.hasAttribute('disabled')).toBe(true)
    expect(getToolbarItem(layout, 'pm-delete')?.hasAttribute('disabled')).toBe(true)
  })

  it('routes edit and delete actions to the current desktop group and hides the inner group toolbar', async () => {
    const group = createGroup('group-desktop-toolbar')
    const layout = await renderLayout(createPassmanager(group))

    const groupElement = layout.shadowRoot?.querySelector('pm-group') as HTMLElement & {
      showBackButton?: boolean
      showToolbarActions?: boolean
    }

    const editSpy = vi.spyOn(PMGroupModel.prototype, 'enterEditMode').mockImplementation(() => {})
    const moveSpy = vi.spyOn(PMGroupModel.prototype, 'moveGroup').mockResolvedValue(undefined)
    const deleteSpy = vi.spyOn(PMGroupModel.prototype, 'deleteGroup').mockImplementation(() => {})
    const goBackSpy = vi.spyOn(pmModel, 'goBackFromCurrent').mockReturnValue(true)

    getToolbarItem(layout, 'pm-back')?.click()
    getToolbarItem(layout, 'pm-edit')?.click()
    getToolbarItem(layout, 'pm-move')?.click()
    getToolbarItem(layout, 'pm-delete')?.click()

    expect(groupElement.showToolbarActions).toBe(false)
    expect(groupElement.showBackButton).toBe(false)
    expect(goBackSpy).toHaveBeenCalledTimes(1)
    expect(editSpy).toHaveBeenCalledTimes(1)
    expect(editSpy).toHaveBeenCalledWith()
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(group)
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(group)
    expect(getToolbarItem(layout, 'pm-back')?.hasAttribute('disabled')).toBe(false)
    expect(getToolbarItem(layout, 'pm-move')?.hasAttribute('disabled')).toBe(false)
  })

  it('routes edit, delete, and move actions to the current desktop entry and hides inner header actions', async () => {
    const group = createGroup('entry-parent')
    const entry = createEntry(group, 'entry-desktop-toolbar')
    pmComponentLoaderModel.extendedReady.set(true)
    const layout = await renderLayout(createPassmanager(entry))

    const entryElement = layout.shadowRoot?.querySelector('pm-entry') as HTMLElement & {
      showBackButton?: boolean
      showHeaderActions?: boolean
    }

    const editSpy = vi.spyOn(PMEntryModel.prototype, 'startEntryEdit').mockImplementation(() => {})
    const moveSpy = vi.spyOn(PMEntryModel.prototype, 'moveEntryCard').mockResolvedValue(undefined)
    const deleteSpy = vi.spyOn(PMEntryModel.prototype, 'deleteEntryCard').mockImplementation(() => {})

    getToolbarItem(layout, 'pm-edit')?.click()
    getToolbarItem(layout, 'pm-delete')?.click()
    getToolbarItem(layout, 'pm-move')?.click()

    expect(entryElement.showHeaderActions).toBe(false)
    expect(entryElement.showBackButton).toBe(false)
    expect(editSpy).toHaveBeenCalledTimes(1)
    expect(editSpy).toHaveBeenCalledWith()
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(entry)
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(entry)
  })

  it('launches entry move from the desktop toolbar before pm-entry mounts', async () => {
    const group = createGroup('entry-parent-spinner')
    const entry = createEntry(group, 'entry-spinner')

    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockResolvedValue(undefined)
    const moveSpy = vi.spyOn(PMEntryModel.prototype, 'moveEntryCard').mockResolvedValue(undefined)

    const layout = await renderLayout(createPassmanager(entry), {extendedReady: false})

    expect(layout.shadowRoot?.querySelector('pm-entry')).toBeNull()

    getToolbarItem(layout, 'pm-move')?.click()

    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(entry)
  })

  it('launches group move from the desktop toolbar without a mounted pm-group element', async () => {
    const group = createGroup('group-removal-toolbar')
    const moveSpy = vi.spyOn(PMGroupModel.prototype, 'moveGroup').mockResolvedValue(undefined)

    const layout = await renderLayout(createPassmanager(group))
    layout.shadowRoot?.querySelector('pm-group')?.remove()

    getToolbarItem(layout, 'pm-move')?.click()

    expect(layout.shadowRoot?.querySelector('pm-group')).toBeNull()
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(group)
  })

  it('re-enables selection actions after switching desktop context from root to group', async () => {
    const rootPassmanager = createPassmanager('createGroup')
    const layout = await renderLayout(rootPassmanager)
    const group = createGroup('group-toolbar-transition')
    const moveSpy = vi.spyOn(PMGroupModel.prototype, 'moveGroup').mockResolvedValue(undefined)

    expect(getToolbarItem(layout, 'pm-move')?.hasAttribute('disabled')).toBe(true)

    rootPassmanager.showElement.set(group)
    await flush(layout)
    await flush(layout)

    expect(getToolbarItem(layout, 'pm-edit')?.hasAttribute('disabled')).toBe(false)
    expect(getToolbarItem(layout, 'pm-delete')?.hasAttribute('disabled')).toBe(false)
    expect(getToolbarItem(layout, 'pm-move')?.hasAttribute('disabled')).toBe(false)

    getToolbarItem(layout, 'pm-move')?.click()

    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(group)
  })
})
