import {atom} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {render} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {DesktopShellToolbar} from '../../src/features/shell/components/desktop-shell-toolbar'
import {PasswordManagerDesktopLayout} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-layout'
import {
  definePasswordManagerDesktopToolbarContent,
  executePasswordManagerDesktopToolbarButtonEvent,
  executePasswordManagerDesktopToolbarMenuInput,
  renderPasswordManagerDesktopToolbarContent,
} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-toolbar-content'
import {passwordManagerDesktopLayoutModel} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import {PMEntry} from '../../src/features/passmanager/components/card/entry/entry'
import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {PMGroup} from '../../src/features/passmanager/components/group/group'
import {PMGroupModel} from '../../src/features/passmanager/components/group/group/group.model'
import {pmComponentLoaderModel} from '../../src/features/passmanager/models/pm-component-loader.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

type PassmanagerMock = {
  showElement: ReturnType<typeof atom<any>>
  isLoading: ReturnType<typeof atom<boolean>>
  isReadOnly: ReturnType<typeof atom<boolean>>
  isEditMode: ReturnType<typeof atom<boolean>>
  allEntries: Array<Entry | Group>
  entriesList: () => Array<Entry | Group>
}

let desktopLayoutDefined = false
let originalPassmanager: unknown
const originalExtendedReady = pmComponentLoaderModel.extendedReady()

function ensureDefined() {
  if (desktopLayoutDefined) return
  definePasswordManagerDesktopToolbarContent()
  PasswordManagerDesktopLayout.define()
  PMEntry.define()
  PMGroup.define()
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
    allEntries: [],
    entriesList: () => [],
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

async function renderToolbar(passmanager: PassmanagerMock) {
  ensureDefined()
  originalPassmanager = (window as any).passmanager
  ;(window as any).passmanager = passmanager
  setPassmanagerRoot(passmanager as any)
  pmComponentLoaderModel.extendedReady.set(true)

  const toolbar = document.createElement(DesktopShellToolbar.elementName) as DesktopShellToolbar
  toolbar.classList.add('passwords-desktop-toolbar')
  if (passmanager.showElement() !== 'otpView') {
    toolbar.setAttribute('two-row', '')
  }
  document.body.appendChild(toolbar)
  render(
    renderPasswordManagerDesktopToolbarContent({
      model: passwordManagerDesktopLayoutModel,
      onToolbarButtonClick: (event) =>
        executePasswordManagerDesktopToolbarButtonEvent(passwordManagerDesktopLayoutModel, event),
      onActionsMenuInput: (event) =>
        executePasswordManagerDesktopToolbarMenuInput(passwordManagerDesktopLayoutModel, event),
    }),
    toolbar,
  )
  await flush(toolbar)
  await flush(toolbar)
  return toolbar
}

async function flush(element: {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

type ToolbarHost = PasswordManagerDesktopLayout | DesktopShellToolbar

function getToolbarItem(host: ToolbarHost, action: string) {
  return (getToolbarButton(host, action) ?? getToolbarMenuItem(host, action)) as HTMLElement | null
}

function getToolbarButton(host: ToolbarHost, action: string) {
  return (getToolbar(host)?.querySelector(`cv-button[data-action="${action}"]`) ?? null) as HTMLElement | null
}

function getToolbarMenuItem(host: ToolbarHost, action: string) {
  return (getToolbar(host)?.querySelector(`cv-menu-item[data-action="${action}"]`) ??
    null) as HTMLElement | null
}

function getToolbar(host: ToolbarHost) {
  return host.localName === DesktopShellToolbar.elementName ? (host as DesktopShellToolbar) : null
}

function getComponentToolbarItem(host: Element | null | undefined, action: string) {
  return host?.shadowRoot?.querySelector(`cv-toolbar-item[data-action="${action}"]`) as HTMLElement | null
}

function clickToolbarItem(item: HTMLElement | null): void {
  const target = item?.shadowRoot?.querySelector('.item') ?? item
  target?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
}

describe('PasswordManagerDesktopLayout toolbar', () => {
  afterEach(async () => {
    pmComponentLoaderModel.extendedReady.set(true)
    await Promise.resolve()
    document
      .querySelectorAll(`${PasswordManagerDesktopLayout.elementName}, ${DesktopShellToolbar.elementName}`)
      .forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    setPassmanagerRoot(originalPassmanager as any)
    new PMGroupModel().exitEditMode()
    pmComponentLoaderModel.extendedReady.set(originalExtendedReady)
    vi.restoreAllMocks()
  })

  it('renders create actions as visible buttons and keeps only vault actions in the gear dropdown', async () => {
    const goBackSpy = vi.spyOn(pmModel, 'goBackFromCurrent').mockReturnValue(false)
    const onImport = vi.spyOn(pmModel, 'onImport').mockResolvedValue(undefined)
    const onExport = vi.spyOn(pmModel, 'onExport').mockImplementation(() => {})
    const onFullClean = vi.spyOn(pmModel, 'onFullClean').mockImplementation(() => {})
    const onCreateGroup = vi.spyOn(pmModel, 'onCreateGroup').mockImplementation(() => {})
    const onCreateEntry = vi.spyOn(pmModel, 'onCreateEntry').mockImplementation(() => {})

    const toolbar = await renderToolbar(createPassmanager(new ManagerRoot({} as any)))

    const menuActions = ['pm-import', 'pm-export', 'pm-clean']
    const removedMenuActions = ['pm-back', 'pm-edit', 'pm-delete', 'pm-move']

    expect(menuActions.map((action) => getToolbarMenuItem(toolbar, action))).toSatisfy(
      (items: Array<HTMLElement | null>) => items.every((item) => item instanceof HTMLElement),
    )
    expect(removedMenuActions.map((action) => getToolbarMenuItem(toolbar, action))).toEqual([
      null,
      null,
      null,
      null,
    ])
    expect(getToolbarButton(toolbar, 'pm-create-entry')).toBeInstanceOf(HTMLElement)
    expect(getToolbarButton(toolbar, 'pm-create-group')).toBeInstanceOf(HTMLElement)
    const primaryRow = toolbar.querySelector('.toolbar-primary-row')
    const controlsRow = toolbar.querySelector('.toolbar-controls-row')
    const search = primaryRow?.querySelector('pm-search.toolbar-password-search')
    const quickFilters = controlsRow?.querySelector('pm-quick-filters.toolbar-quick-filters')
    const sortControls = controlsRow?.querySelector('pm-sort-controls.toolbar-sort-controls')
    expect(toolbar.classList.contains('passwords-desktop-toolbar')).toBe(true)
    expect(toolbar.hasAttribute('two-row')).toBe(true)
    expect(primaryRow?.getAttribute('slot')).toBe('leading')
    expect(controlsRow?.getAttribute('slot')).toBe('center')
    expect(search).toBeInstanceOf(HTMLElement)
    expect(quickFilters).toBeInstanceOf(HTMLElement)
    expect(sortControls).toBeInstanceOf(HTMLElement)
    expect(search?.shadowRoot?.querySelector('.quick-filters')).toBeNull()
    expect(passwordManagerDesktopLayoutModel.getDesktopToolbarSearchElement()).toBe(search)
    expect(getToolbarMenuItem(toolbar, 'pm-create-entry')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-create-group')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-otp-view')).toBeNull()
    expect(
      Array.from(getToolbar(toolbar)?.querySelectorAll<HTMLElement>('cv-button[data-action]') ?? []).map(
        (button) => button.dataset['action'],
      ),
    ).toEqual(['pm-create-entry', 'pm-create-group'])
    expect(getToolbar(toolbar)?.querySelectorAll('.toolbar-cluster').length).toBe(0)
    expect(getToolbar(toolbar)?.querySelector('cv-menu-button.toolbar-actions-menu')).not.toBeNull()
    expect(
      getToolbar(toolbar)
        ?.querySelector('.toolbar-side-end')
        ?.lastElementChild?.matches('cv-menu-button.toolbar-actions-menu'),
    ).toBe(true)
    expect(getToolbar(toolbar)?.querySelector('.toolbar-search-cluster')).toBeNull()

    getToolbarItem(toolbar, 'pm-import')?.click()
    getToolbarItem(toolbar, 'pm-export')?.click()
    getToolbarItem(toolbar, 'pm-clean')?.click()
    getToolbarItem(toolbar, 'pm-create-group')?.click()
    getToolbarItem(toolbar, 'pm-create-entry')?.click()

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onFullClean).toHaveBeenCalledTimes(1)
    expect(onCreateGroup).toHaveBeenCalledTimes(1)
    expect(onCreateEntry).toHaveBeenCalledTimes(1)
    expect(goBackSpy).toHaveBeenCalledTimes(0)

    expect(getToolbarItem(toolbar, 'pm-back')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-edit')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-delete')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-move')).toBeNull()
  })

  it('keeps selection actions inactive while the import dialog is open', async () => {
    const toolbar = await renderToolbar(createPassmanager('importDialog'))
    const importAnchor = toolbar.querySelector('cv-guidance-anchor[anchor-id="passwords.import"]')
    const helpButton = getToolbarItem(toolbar, 'pm-import-help')

    expect(importAnchor).toBeNull()
    expect(helpButton).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-edit')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-move')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-delete')).toBeNull()
  })

  it('renders OTP search instead of create actions on the desktop OTP quick view', async () => {
    const toolbar = await renderToolbar(createPassmanager('otpView'))
    await flush(toolbar)

    const search = toolbar.querySelector('pm-otp-quick-view-search')
    expect(search).not.toBeNull()
    expect(search?.getAttribute('slot')).toBe('center')
    expect(toolbar.classList.contains('passwords-desktop-toolbar')).toBe(true)
    expect(toolbar.hasAttribute('two-row')).toBe(false)
    expect(toolbar.querySelector('[slot="title"]')?.textContent).toBe('OTP codes')
    expect(toolbar.querySelector('[slot="subtitle"]')?.textContent).toBe(
      'Live codes from saved login entries.',
    )
    expect(toolbar.querySelector('pm-search')).toBeNull()
    expect(toolbar.querySelector('pm-quick-filters')).toBeNull()
    expect(toolbar.querySelector('pm-sort-controls')).toBeNull()
    expect(getToolbarButton(toolbar, 'pm-create-entry')).toBeNull()
    expect(getToolbarButton(toolbar, 'pm-create-group')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-create-entry')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-create-group')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-import')).not.toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-export')).not.toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-clean')).not.toBeNull()
  })

  it('keeps desktop search out of the password manager sidebar', async () => {
    const layout = await renderLayout(createPassmanager(new ManagerRoot({} as any)))

    expect(layout.shadowRoot?.querySelector('pm-search')).toBeNull()
    expect(layout.shadowRoot?.querySelector('.sidebar')).not.toBeNull()
  })

  it('routes edit, delete, and move actions through the current desktop group toolbar', async () => {
    const group = createGroup('group-desktop-toolbar')
    const layout = await renderLayout(createPassmanager(group))

    const groupElement = layout.shadowRoot?.querySelector('pm-group') as HTMLElement & {
      showToolbarActions?: boolean
    }
    await flush(groupElement)

    const editSpy = vi.spyOn(PMGroupModel.prototype, 'enterEditMode').mockImplementation(() => {})
    const moveSpy = vi.spyOn(PMGroupModel.prototype, 'moveGroup').mockResolvedValue(undefined)
    const deleteSpy = vi.spyOn(PMGroupModel.prototype, 'deleteGroup').mockImplementation(() => {})
    const goBackSpy = vi.spyOn(pmModel, 'goBackFromCurrent').mockReturnValue(true)

    clickToolbarItem(getComponentToolbarItem(groupElement, 'move-group'))
    clickToolbarItem(getComponentToolbarItem(groupElement, 'remove-group'))
    clickToolbarItem(getComponentToolbarItem(groupElement, 'edit-group'))

    expect(groupElement.showToolbarActions).toBe(true)
    expect(getToolbarItem(layout, 'pm-back')).toBeNull()
    expect(getToolbarItem(layout, 'pm-edit')).toBeNull()
    expect(getToolbarItem(layout, 'pm-move')).toBeNull()
    expect(getToolbarItem(layout, 'pm-delete')).toBeNull()
    expect(goBackSpy).toHaveBeenCalledTimes(0)
    expect(editSpy).toHaveBeenCalledTimes(1)
    expect(editSpy).toHaveBeenCalledWith()
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(group)
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(group)
  })

  it('routes edit, delete, and move actions through the current desktop entry header', async () => {
    const group = createGroup('entry-parent')
    const entry = createEntry(group, 'entry-desktop-toolbar')
    pmComponentLoaderModel.extendedReady.set(true)
    const layout = await renderLayout(createPassmanager(entry))

    const entryElement = layout.shadowRoot?.querySelector('pm-entry') as HTMLElement & {
      showBackButton?: boolean
      showHeaderActions?: boolean
    }
    await flush(entryElement)

    const editSpy = vi.spyOn(PMEntryModel.prototype, 'startEntryEdit').mockImplementation(() => {})
    const moveSpy = vi.spyOn(PMEntryModel.prototype, 'moveEntryCard').mockResolvedValue(undefined)
    const deleteSpy = vi.spyOn(PMEntryModel.prototype, 'deleteEntryCard').mockImplementation(() => {})

    clickToolbarItem(getComponentToolbarItem(entryElement, 'edit-entry'))
    clickToolbarItem(getComponentToolbarItem(entryElement, 'delete-entry'))
    clickToolbarItem(getComponentToolbarItem(entryElement, 'move-entry'))

    expect(entryElement.showHeaderActions).toBe(true)
    expect(entryElement.showBackButton).toBe(true)
    expect(getToolbarItem(layout, 'pm-edit')).toBeNull()
    expect(getToolbarItem(layout, 'pm-delete')).toBeNull()
    expect(getToolbarItem(layout, 'pm-move')).toBeNull()
    expect(editSpy).toHaveBeenCalledTimes(1)
    expect(editSpy).toHaveBeenCalledWith()
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(entry)
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(entry)
  })

  it('does not expose entry move in the desktop toolbar before pm-entry mounts', async () => {
    const group = createGroup('entry-parent-spinner')
    const entry = createEntry(group, 'entry-spinner')

    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockResolvedValue(undefined)
    const moveSpy = vi.spyOn(PMEntryModel.prototype, 'moveEntryCard').mockResolvedValue(undefined)

    const layout = await renderLayout(createPassmanager(entry), {extendedReady: false})

    expect(layout.shadowRoot?.querySelector('pm-entry')).toBeNull()

    getToolbarItem(layout, 'pm-move')?.click()

    expect(getToolbarItem(layout, 'pm-move')).toBeNull()
    expect(moveSpy).toHaveBeenCalledTimes(0)
  })

  it('does not expose group move in the desktop toolbar without a mounted pm-group element', async () => {
    const group = createGroup('group-removal-toolbar')
    const moveSpy = vi.spyOn(PMGroupModel.prototype, 'moveGroup').mockResolvedValue(undefined)

    const layout = await renderLayout(createPassmanager(group))
    layout.shadowRoot?.querySelector('pm-group')?.remove()

    getToolbarItem(layout, 'pm-move')?.click()

    expect(layout.shadowRoot?.querySelector('pm-group')).toBeNull()
    expect(getToolbarItem(layout, 'pm-move')).toBeNull()
    expect(moveSpy).toHaveBeenCalledTimes(0)
  })

  it('renders group actions at component level after switching desktop context from root to group', async () => {
    const rootPassmanager = createPassmanager('createGroup')
    const layout = await renderLayout(rootPassmanager)
    const group = createGroup('group-toolbar-transition')
    const moveSpy = vi.spyOn(PMGroupModel.prototype, 'moveGroup').mockResolvedValue(undefined)

    expect(getToolbarItem(layout, 'pm-move')).toBeNull()

    rootPassmanager.showElement.set(group)
    await flush(layout)
    await flush(layout)
    const groupElement = layout.shadowRoot?.querySelector('pm-group')
    await flush(groupElement ?? {})

    expect(getToolbarItem(layout, 'pm-edit')).toBeNull()
    expect(getToolbarItem(layout, 'pm-delete')).toBeNull()
    expect(getToolbarItem(layout, 'pm-move')).toBeNull()
    expect(getComponentToolbarItem(groupElement, 'edit-group')?.hasAttribute('disabled')).toBe(false)
    expect(getComponentToolbarItem(groupElement, 'remove-group')?.hasAttribute('disabled')).toBe(false)
    expect(getComponentToolbarItem(groupElement, 'move-group')?.hasAttribute('disabled')).toBe(false)

    clickToolbarItem(getComponentToolbarItem(groupElement, 'move-group'))

    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledWith(group)
  })
})
