import {atom} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {moduleAccessModel} from '../../src/core/modules/module-access.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {PasswordManagerDesktopLayout} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-layout'
import {PasswordManagerDesktopToolbar} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-toolbar'
import {passwordManagerDesktopLayoutModel} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import {PMEntry} from '../../src/features/passmanager/components/card/entry/entry'
import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {PMGroup} from '../../src/features/passmanager/components/group/group'
import {PMGroupModel} from '../../src/features/passmanager/components/group/group/group.model'
import type {PMQuickFilters} from '../../src/features/passmanager/components/list/quick-filters'
import {pmSshKeysViewModel} from '../../src/features/passmanager/components/ssh-keys-view/ssh-keys-view.model'
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
  PasswordManagerDesktopToolbar.define()
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

  const toolbar = document.createElement(
    PasswordManagerDesktopToolbar.elementName,
  ) as PasswordManagerDesktopToolbar
  toolbar.model = passwordManagerDesktopLayoutModel
  document.body.appendChild(toolbar)
  await flush(toolbar)
  await flush(toolbar)
  return toolbar
}

async function flush(element: {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

type ToolbarHost = PasswordManagerDesktopLayout | PasswordManagerDesktopToolbar

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
  return host.localName === PasswordManagerDesktopToolbar.elementName
    ? (host as PasswordManagerDesktopToolbar).shadowRoot
    : null
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
      .querySelectorAll(
        `${PasswordManagerDesktopLayout.elementName}, ${PasswordManagerDesktopToolbar.elementName}, pm-quick-filters`,
      )
      .forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    setPassmanagerRoot(originalPassmanager as any)
    new PMGroupModel().exitEditMode()
    pmSshKeysViewModel.closeCreate()
    pmComponentLoaderModel.extendedReady.set(originalExtendedReady)
    moduleAccessModel.reset()
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
  })

  it('renders quick filters as one accessible popover with independent choices', async () => {
    ensureDefined()
    const quickFilters = document.createElement('pm-quick-filters') as PMQuickFilters
    document.body.appendChild(quickFilters)
    await flush(quickFilters)

    const root = quickFilters.shadowRoot
    expect(root?.querySelector('cv-popover.filters-popover')).not.toBeNull()
    expect(root?.querySelector('cv-popover')?.getAttribute('aria-label')).toBe('Filters')
    expect(root?.querySelectorAll('cv-checkbox[data-quick-filter]')).toHaveLength(4)
    expect(quickFilters.hasAttribute('single-row')).toBe(false)
  })

  it('renders one ordered workbench row with Create entry and an ellipsis menu', async () => {
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
    const toolbarRoot = getToolbar(toolbar)
    const shellToolbar = toolbarRoot?.querySelector('desktop-shell-toolbar')
    const search = toolbarRoot?.querySelector('pm-search.toolbar-password-search')
    const controls = toolbarRoot?.querySelector('.toolbar-controls')
    const quickFilters = controls?.querySelector('pm-quick-filters.toolbar-quick-filters') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    const sortControls = controls?.querySelector('pm-sort-controls.toolbar-sort-controls') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    const actions = toolbarRoot?.querySelector('.toolbar-actions')

    expect(getToolbarButton(toolbar, 'pm-create-entry')).toBeInstanceOf(HTMLElement)
    expect(getToolbarButton(toolbar, 'pm-create-entry')?.getAttribute('variant')).toBe('primary')
    expect(getToolbarButton(toolbar, 'pm-create-entry')?.textContent).toContain('Create entry')
    expect(getToolbarButton(toolbar, 'pm-create-group')).toBeNull()
    expect(shellToolbar?.hasAttribute('single-row')).toBe(true)
    expect(toolbarRoot?.querySelector('[slot="title"]')?.textContent?.trim()).toBe('Credentials')
    expect(search?.getAttribute('slot')).toBe('start')
    expect(controls?.getAttribute('slot')).toBe('center')
    expect(actions?.getAttribute('slot')).toBe('actions')
    expect(search).toBeInstanceOf(HTMLElement)
    expect(quickFilters).toBeInstanceOf(HTMLElement)
    expect(sortControls).toBeInstanceOf(HTMLElement)
    expect(quickFilters?.hasAttribute('single-row')).toBe(false)
    expect(sortControls?.hasAttribute('single-row')).toBe(false)
    expect(search?.shadowRoot?.querySelector('.quick-filters')).toBeNull()
    expect(passwordManagerDesktopLayoutModel.getDesktopToolbarSearchElement()).toBe(search)
    expect(getToolbarMenuItem(toolbar, 'pm-create-entry')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-create-group')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-otp-view')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-ssh-view')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-env-runtime-view')).toBeNull()
    expect(
      Array.from(getToolbar(toolbar)?.querySelectorAll<HTMLElement>('cv-button[data-action]') ?? []).map(
        (button) => button.dataset['action'],
      ),
    ).toEqual(['pm-create-entry'])
    const menu = toolbarRoot?.querySelector('cv-menu-button.toolbar-actions-menu')
    expect(menu).not.toBeNull()
    expect(menu?.getAttribute('aria-label')).toBe('More actions')
    expect(menu?.querySelector('cv-icon[slot="prefix"]')?.getAttribute('name')).toBe('three-dots')
    expect(actions?.lastElementChild?.matches('cv-menu-button.toolbar-actions-menu')).toBe(true)

    expect(
      Array.from(
        toolbarRoot?.querySelectorAll(
          'pm-search, pm-quick-filters, pm-sort-controls, cv-button[data-action="pm-create-entry"], cv-menu-button.toolbar-actions-menu',
        ) ?? [],
      ).map((element) =>
        element instanceof HTMLElement ? (element.dataset['action'] ?? element.localName) : element.localName,
      ),
    ).toEqual(['pm-search', 'pm-quick-filters', 'pm-sort-controls', 'pm-create-entry', 'cv-menu-button'])

    await flush(quickFilters ?? {})
    const quickFilterChoices = Array.from(
      quickFilters?.shadowRoot?.querySelectorAll<HTMLElement>('cv-checkbox[data-quick-filter]') ?? [],
    )
    expect(quickFilterChoices).toHaveLength(4)
    expect(quickFilterChoices.every((choice) => Boolean(choice.getAttribute('aria-label')))).toBe(true)

    await flush(sortControls ?? {})
    expect(sortControls?.shadowRoot?.querySelectorAll('cv-popover.control-popover')).toHaveLength(2)
    expect(sortControls?.shadowRoot?.querySelectorAll('cv-radio-group')).toHaveLength(3)

    getToolbarItem(toolbar, 'pm-import')?.click()
    getToolbarItem(toolbar, 'pm-export')?.click()
    getToolbarItem(toolbar, 'pm-clean')?.click()
    getToolbarItem(toolbar, 'pm-create-entry')?.click()

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onFullClean).toHaveBeenCalledTimes(1)
    expect(onCreateGroup).toHaveBeenCalledTimes(0)
    expect(onCreateEntry).toHaveBeenCalledTimes(1)
    expect(goBackSpy).toHaveBeenCalledTimes(0)

    expect(getToolbarItem(toolbar, 'pm-back')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-edit')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-delete')).toBeNull()
    expect(getToolbarItem(toolbar, 'pm-move')).toBeNull()
  })

  it('keeps selection actions inactive while the import dialog is open', async () => {
    const toolbar = await renderToolbar(createPassmanager('importDialog'))
    const importAnchor = getToolbar(toolbar)?.querySelector(
      'cv-guidance-anchor[anchor-id="passwords.import"]',
    )
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

    const toolbarRoot = getToolbar(toolbar)
    const search = toolbarRoot?.querySelector('pm-otp-quick-view-search')
    expect(search).not.toBeNull()
    expect(search?.getAttribute('slot')).toBe('start')
    expect(toolbar.hasAttribute('two-row')).toBe(false)
    expect(toolbarRoot?.querySelector('desktop-shell-toolbar')?.hasAttribute('single-row')).toBe(true)
    expect(toolbarRoot?.querySelector('[slot="title"]')?.textContent).toBe('OTP codes')
    expect(toolbarRoot?.querySelector('[slot="subtitle"]')?.textContent).toBe('Time-based one-time passwords')
    expect(toolbarRoot?.querySelector('pm-search')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-quick-filters')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-sort-controls')).toBeNull()
    expect(getToolbarButton(toolbar, 'pm-create-entry')).toBeNull()
    expect(getToolbarButton(toolbar, 'pm-create-group')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-create-entry')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-create-group')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-import')).not.toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-export')).not.toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-clean')).not.toBeNull()
  })

  it('renders the SSH key creation action without list controls on the desktop SSH view', async () => {
    const toolbar = await renderToolbar(createPassmanager('sshView'))
    await flush(toolbar)

    const toolbarRoot = getToolbar(toolbar)
    expect(toolbarRoot?.querySelector('[slot="title"]')?.textContent).toBe('SSH keys')
    expect(toolbarRoot?.querySelector('pm-search')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-quick-filters')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-sort-controls')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-otp-quick-view-search')).toBeNull()
    const createButton = getToolbarButton(toolbar, 'pm-create-ssh-key')
    expect(createButton).not.toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-ssh-view')).toBeNull()

    createButton?.click()
    expect(pmSshKeysViewModel.createOpen()).toBe(true)
  })

  it('renders the macOS Env Runtime title without an action in the vault menu', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    moduleAccessModel.resolution.set({
      phase: 'resolved',
      states: [
        {feature_key: 'env-runtime', status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
      ],
    })

    const toolbar = await renderToolbar(createPassmanager('envRuntimeView'))
    await flush(toolbar)

    const toolbarRoot = getToolbar(toolbar)
    expect(toolbar.hasAttribute('two-row')).toBe(false)
    expect(toolbarRoot?.querySelector('[slot="title"]')?.textContent).toBe('Env Runtime')
    expect(toolbarRoot?.querySelector('[slot="subtitle"]')?.textContent).toContain(
      'Inject vault secrets into approved local commands',
    )
    expect(toolbarRoot?.querySelector('pm-search')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-quick-filters')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-sort-controls')).toBeNull()
    expect(toolbarRoot?.querySelector('pm-otp-quick-view-search')).toBeNull()
    expect(getToolbarMenuItem(toolbar, 'pm-env-runtime-view')).toBeNull()
  })

  it('renders Env Runtime as a full-width desktop view without the credentials sidebar', async () => {
    expect(pmComponentLoaderModel.requiresExtendedComponents('envRuntimeView')).toBe(true)
    const layout = await renderLayout(createPassmanager('envRuntimeView'))

    expect(layout.shadowRoot?.querySelector('pm-env-runtime-page')).not.toBeNull()
    expect(layout.shadowRoot?.querySelector('.sidebar')).toBeNull()
    expect(layout.shadowRoot?.querySelector('.wrapper')).toBeNull()
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

    const editAction = entryElement.shadowRoot?.querySelector(
      '.entry-primary-action[data-action="edit-entry"]',
    ) as HTMLElement | null
    const actionMenu = entryElement.shadowRoot?.querySelector('.entry-actions-menu') as HTMLElement | null

    editAction?.click()
    for (const action of ['delete-entry', 'move-entry']) {
      actionMenu?.dispatchEvent(
        new CustomEvent('cv-input', {
          detail: {value: action, open: false},
          bubbles: true,
          composed: true,
        }),
      )
    }

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
    vi.spyOn(pmComponentLoaderModel, 'isReadyFor').mockReturnValue(false)
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
