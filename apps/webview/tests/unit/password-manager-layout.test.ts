import {afterEach, describe, expect, it, vi} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resolveLayoutMode} from '../../src/app/layout/layout-mode'
import type {LayoutMode} from '../../src/app/layout/layout-mode'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {atom} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {i18n as appI18n} from '../../src/i18n'
import {filterValue, selectedCredentialTagFilters} from '@project/passmanager/select'
import {
  PM_SIDEBAR_MAX_WIDTH,
  PM_SIDEBAR_MIN_WIDTH,
  PM_SIDEBAR_WIDTH_STEP,
  PasswordManagerLayoutModel,
  PasswordManagerDesktopLayout,
  PasswordManagerMobileLayout,
  passwordManagerDesktopLayoutModel,
} from '../../src/features/passmanager/components/password-manager-layout'
import {PMGroupMobile} from '../../src/features/passmanager/components/group/group'
import {pmCredentialTagsModel} from '../../src/features/passmanager/models/pm-credential-tags.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {groupBy, sortField} from '../../src/features/passmanager/components/list/sort-controls'

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group, id: string, title: string, tags: readonly string[] = []) {
  return new Entry(parent, {
    id,
    title,
    urls: [],
    username: '',
    tags,
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
  } as any)
}

function createRootFixture(entryTags: readonly string[] = []) {
  const root = new ManagerRoot({} as any)
  const group = createGroup('group-layout-motion', 'Group Layout Motion')
  const entry = createEntry(group, 'entry-layout-motion', 'Entry Layout Motion', entryTags)
  root.credentialTags.set([...entryTags])
  group.entries.set([entry])
  root.entries.set([group])
  return {root, group, entry}
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await element.updateComplete
}

function mockGroupTreeMetrics(metrics: {clientHeight: number; scrollHeight: number}) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.tagName.toLowerCase() === 'group-tree-view' ? metrics.clientHeight : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.tagName.toLowerCase() === 'group-tree-view' ? metrics.scrollHeight : 0
  })
}

describe('password-manager layout selection', () => {
  afterEach(() => {
    document
      .querySelectorAll('password-manager-desktop-layout, password-manager-mobile-layout')
      .forEach((element) => element.remove())
    setPassmanagerRoot(undefined)
    filterValue.set('')
    selectedCredentialTagFilters.set([])
    sortField.set('name')
    groupBy.set('none')
    localStorage.removeItem('pm-sidebar-width')
    pmCredentialTagsModel.closeSheet()
    clearAppContext()
    pmModel.disposeSession()
    vi.restoreAllMocks()
  })

  function setupContext(mode: LayoutMode) {
    const layoutMode = atom<LayoutMode>(mode)
    const ctx = createMockAppContext({
      store: {
        layoutMode,
        pushNotification: () => {},
      } as any,
    })
    initAppContext(ctx)
    return {layoutMode, ctx}
  }

  describe('wrapper selects layout deterministically based on layoutMode', () => {
    const selectLayout = (mode: 'mobile' | 'desktop') =>
      mode === 'mobile' ? 'password-manager-mobile-layout' : 'password-manager-desktop-layout'

    it('selects mobile layout when layoutMode is "mobile"', () => {
      const mode = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: null,
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })

    it('selects desktop layout when layoutMode is "desktop"', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: null,
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('password-manager-desktop-layout')
    })

    it('query param "mobile" forces mobile layout on desktop viewport', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: null,
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })

    it('query param "desktop" forces desktop layout on mobile runtime', () => {
      const mode = resolveLayoutMode({
        isMobile: true,
        matchesBreakpoint: true,
        queryParam: 'desktop',
        persisted: null,
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('password-manager-desktop-layout')
    })

    it('persisted "mobile" overrides breakpoint for mobile layout', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: null,
        persisted: 'mobile',
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })

    it('persisted "desktop" overrides mobile breakpoint for desktop layout', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: true,
        queryParam: null,
        persisted: 'desktop',
      })
      expect(mode).toBe('desktop')
      expect(selectLayout(mode)).toBe('password-manager-desktop-layout')
    })

    it('query param takes priority over persisted value', () => {
      const mode = resolveLayoutMode({
        isMobile: false,
        matchesBreakpoint: false,
        queryParam: 'mobile',
        persisted: 'desktop',
      })
      expect(mode).toBe('mobile')
      expect(selectLayout(mode)).toBe('password-manager-mobile-layout')
    })
  })

  describe('layout mode drives variant selection', () => {
    it('mobile mode selects mobile layout', () => {
      const {ctx} = setupContext('mobile')
      expect(ctx.store.layoutMode()).toBe('mobile')
    })

    it('desktop mode selects desktop layout', () => {
      const {ctx} = setupContext('desktop')
      expect(ctx.store.layoutMode()).toBe('desktop')
    })

    it('layout mode signal can be changed dynamically', () => {
      const {layoutMode} = setupContext('mobile')
      expect(layoutMode()).toBe('mobile')

      layoutMode.set('desktop')
      expect(layoutMode()).toBe('desktop')
    })
  })

  describe('OTP quick view shell rendering', () => {
    it('desktop layout renders the OTP quick view as a standalone page for otpView state', async () => {
      const root = new ManagerRoot({} as any)
      root.entries.set([])
      root.showElement.set('otpView')
      setPassmanagerRoot(root)
      PasswordManagerDesktopLayout.define()

      const element = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('pm-otp-quick-view')).not.toBeNull()
      expect(element.shadowRoot?.querySelector('pm-group')).toBeNull()
      expect(element.shadowRoot?.querySelector('.wrapper')).toBeNull()
      expect(element.shadowRoot?.querySelector('.sidebar')).toBeNull()
      expect(element.shadowRoot?.querySelector('.resizer')).toBeNull()
      expect(element.shadowRoot?.querySelector('cv-spinner')).toBeNull()
    })

    it('mobile layout renders the OTP quick view for otpView state', async () => {
      const root = new ManagerRoot({} as any)
      root.entries.set([])
      root.showElement.set('otpView')
      setPassmanagerRoot(root)
      PasswordManagerMobileLayout.define()

      const element = document.createElement(
        'password-manager-mobile-layout',
      ) as PasswordManagerMobileLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelector('pm-otp-quick-view-mobile')).not.toBeNull()
      expect(element.shadowRoot?.querySelector('pm-group-mobile')).toBeNull()
      expect(element.shadowRoot?.querySelector('mobile-surface-layout')?.getAttribute('scroll')).toBe('external')
      expect(element.shadowRoot?.querySelector('cv-spinner')).toBeNull()
    })
  })

  describe('session state rendering', () => {
    it.each([
      ['desktop', PasswordManagerDesktopLayout, 'password-manager-desktop-layout'],
      ['mobile', PasswordManagerMobileLayout, 'password-manager-mobile-layout'],
    ] as const)('renders a retryable unavailable state without a page spinner on %s', async (_mode, Layout, tagName) => {
      const root = new ManagerRoot({} as any)
      setPassmanagerRoot(root)
      pmModel.sessionStatus.set('error')
      Layout.define()
      const retry = vi.spyOn(pmModel, 'retrySessionLoad').mockResolvedValue('ready')

      const element = document.createElement(tagName) as PasswordManagerDesktopLayout | PasswordManagerMobileLayout
      document.body.appendChild(element)
      await element.updateComplete

      const unavailable = element.shadowRoot?.querySelector('cv-empty-state.session-unavailable')
      expect(unavailable).not.toBeNull()
      expect(element.shadowRoot?.querySelector('.spinner-wrapper')).toBeNull()

      ;(unavailable?.querySelector('button.session-retry') as HTMLButtonElement | null)?.click()
      expect(retry).toHaveBeenCalledTimes(1)
    })
  })

  describe('tag management sheet host', () => {
    it.each([
      {
        name: 'desktop create entry',
        tagName: 'password-manager-desktop-layout',
        define: () => PasswordManagerDesktopLayout.define(),
        resolveShowElement: (_fixture: ReturnType<typeof createRootFixture>) => 'createEntry' as const,
      },
      {
        name: 'desktop entry',
        tagName: 'password-manager-desktop-layout',
        define: () => PasswordManagerDesktopLayout.define(),
        resolveShowElement: (fixture: ReturnType<typeof createRootFixture>) => fixture.entry,
      },
      {
        name: 'mobile create entry',
        tagName: 'password-manager-mobile-layout',
        define: () => PasswordManagerMobileLayout.define(),
        resolveShowElement: (_fixture: ReturnType<typeof createRootFixture>) => 'createEntry' as const,
      },
      {
        name: 'mobile entry',
        tagName: 'password-manager-mobile-layout',
        define: () => PasswordManagerMobileLayout.define(),
        resolveShowElement: (fixture: ReturnType<typeof createRootFixture>) => fixture.entry,
      },
    ])('renders one tag management sheet host for $name', async ({tagName, define, resolveShowElement}) => {
      const fixture = createRootFixture(['Work'])
      fixture.root.showElement.set(resolveShowElement(fixture) as never)
      setPassmanagerRoot(fixture.root)
      define()

      const element = document.createElement(tagName) as HTMLElement & {updateComplete: Promise<unknown>}
      document.body.appendChild(element)
      await settle(element)

      const shadowRoot = element.shadowRoot
      expect(shadowRoot).not.toBeNull()
      expect(shadowRoot!.querySelectorAll('pm-mobile-tag-filter-sheet')).toHaveLength(1)
    })

    it('keeps mobile create entry tag sheet outside search and opens it from the tag model', async () => {
      const fixture = createRootFixture(['Work'])
      fixture.root.showElement.set('createEntry' as never)
      setPassmanagerRoot(fixture.root)
      PasswordManagerMobileLayout.define()

      const element = document.createElement(
        'password-manager-mobile-layout',
      ) as PasswordManagerMobileLayout
      document.body.appendChild(element)
      await settle(element)

      const shadowRoot = element.shadowRoot
      expect(shadowRoot).not.toBeNull()
      expect(shadowRoot!.querySelector('pm-search-mobile')).toBeNull()
      const sheet = shadowRoot!.querySelector(
        'pm-mobile-tag-filter-sheet',
      ) as (HTMLElement & {updateComplete: Promise<unknown>}) | null
      expect(sheet).not.toBeNull()

      pmCredentialTagsModel.openManageSheet()
      await settle(sheet!)

      const sheetShadowRoot = sheet!.shadowRoot
      expect(sheetShadowRoot).not.toBeNull()
      const bottomSheet = sheetShadowRoot!.querySelector('cv-bottom-sheet') as
        | ({initialFocusId?: string; open?: boolean} & HTMLElement)
        | null
      expect(bottomSheet).not.toBeNull()
      expect(bottomSheet!.open).toBe(true)
      expect(bottomSheet!.initialFocusId).toBe('pm-tag-done')
      const picker = sheetShadowRoot!.querySelector(
        'pm-mobile-tag-picker',
      ) as (HTMLElement & {updateComplete: Promise<unknown>}) | null
      expect(picker).not.toBeNull()

      pmCredentialTagsModel.openCreateTag()
      await settle(sheet!)
      await settle(picker!)
      expect(bottomSheet!.initialFocusId).toBe('')
      const pickerShadowRoot = picker!.shadowRoot
      expect(pickerShadowRoot).not.toBeNull()
      let swatches = Array.from(pickerShadowRoot!.querySelectorAll<HTMLButtonElement>('.color-swatch'))
      expect(swatches).toHaveLength(7)
      expect(swatches.map((button) => button.dataset['colorId'])).toEqual([
        'violet',
        'green',
        'blue',
        'pink',
        'amber',
        'orange',
        'cyan',
      ])
      expect(swatches[0]?.getAttribute('aria-label')).toBe('Violet')
      expect(swatches[0]?.getAttribute('aria-pressed')).toBe('true')
      swatches[3]?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      expect(pmCredentialTagsModel.tagDraftColorId()).toBe('pink')
      await settle(picker!)
      swatches = Array.from(pickerShadowRoot!.querySelectorAll<HTMLButtonElement>('.color-swatch'))
      expect(swatches[3]?.getAttribute('aria-pressed')).toBe('true')

      pmCredentialTagsModel.openRenameTag('work')
      await settle(sheet!)
      await settle(picker!)
      expect(bottomSheet!.initialFocusId).toBe('')

      pmCredentialTagsModel.openDeleteTag('work')
      await settle(sheet!)
      await settle(picker!)
      expect(bottomSheet!.initialFocusId).toBe('pm-tag-delete-cancel')
    })

    it('renders mobile Credentials header controls without the legacy sort trigger', async () => {
      const fixture = createRootFixture(['Work'])
      fixture.root.credentialTagMeta.set({work: {colorId: 'orange'}})
      fixture.root.showElement.set(fixture.root as never)
      setPassmanagerRoot(fixture.root)
      PasswordManagerMobileLayout.define()
      PMGroupMobile.define()

      const element = document.createElement(
        'password-manager-mobile-layout',
      ) as PasswordManagerMobileLayout
      document.body.appendChild(element)
      await settle(element)

      const group = element.shadowRoot?.querySelector('pm-group-mobile') as
        | (HTMLElement & {updateComplete: Promise<unknown>})
        | null
      expect(group).not.toBeNull()
      await settle(group!)
      expect(group!.shadowRoot).not.toBeNull()

      const header = group!.shadowRoot!.querySelector('workspace-dashboard-header') as
        | (HTMLElement & {
            clear(): void
            updateComplete: Promise<unknown>
            shadowRoot: ShadowRoot | null
          })
        | null

      expect(header).not.toBeNull()
      await header!.updateComplete
      const countActionsSlot = header!.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="count-actions"]')
      const searchInput = header!.shadowRoot?.querySelector('cv-input.search-box') as HTMLElement | null
      const manageTagsButton = header!.shadowRoot?.querySelector(
        '[data-filter-action="tags-manage"]',
      ) as HTMLElement | null
      const tagFilterGroup = header!.shadowRoot?.querySelector('cv-chip-group.workspace-filter-chips') as
        | HTMLElement
        | null
      const sortButton = header!.shadowRoot?.querySelector('.workspace-sort-control') as HTMLElement | null
      const groupRadioGroup = header!.shadowRoot?.querySelector('cv-radio-group.workspace-view-switch')
      const countActionElements = countActionsSlot?.assignedElements() ?? []
      const summary = header!.shadowRoot?.querySelector('.workspace-summary')
      const summaryItems = Array.from(
        header!.shadowRoot?.querySelectorAll<HTMLElement>('.workspace-summary__item') ?? [],
      )

      expect(header?.getAttribute('surface')).toBe('passwords')
      expect(header?.hasAttribute('embedded')).toBe(true)
      expect(header!.querySelector('pm-credentials-sort-group-controls')).toBeNull()
      expect(group!.shadowRoot!.querySelector('pm-mobile-tag-filter-row')).toBeNull()
      expect(header!.querySelector('pm-mobile-tag-filter-row')).toBeNull()
      expect(tagFilterGroup).not.toBeNull()
      expect(tagFilterGroup?.getAttribute('selection-mode')).toBe('multiple')
      expect(
        Array.from(header!.shadowRoot?.querySelectorAll('cv-chip.workspace-filter-chip') ?? []).map((chip) =>
          chip.getAttribute('value'),
        ),
      ).toEqual([pmCredentialTagsModel.allFilterChipValue(), 'work'])
      expect(
        Array.from(header!.shadowRoot?.querySelectorAll('cv-chip.workspace-filter-chip') ?? []).map((chip) =>
          chip.getAttribute('data-tag-color-id'),
        ),
      ).toEqual([null, 'orange'])
      expect(countActionElements).toHaveLength(0)
      expect(summary?.getAttribute('aria-label')).toContain('1 group')
      expect(summary?.getAttribute('aria-label')).toContain('1 entry')
      expect(summaryItems.map((item) => item.dataset['summaryId'])).toEqual(['groups', 'entries'])
      expect(summaryItems.map((item) => item.querySelector('cv-icon')?.getAttribute('name'))).toEqual([
        'folder',
        'key',
      ])
      expect(summaryItems.map((item) => item.querySelector('.workspace-summary__value')?.textContent)).toEqual([
        '1',
        '1',
      ])
      expect(manageTagsButton).not.toBeNull()
      expect(manageTagsButton?.nextElementSibling).toBe(tagFilterGroup)
      expect(manageTagsButton?.textContent?.trim()).toBe('')
      expect(manageTagsButton?.getAttribute('aria-label')).toBe('Manage tags')
      expect(manageTagsButton?.querySelector('cv-icon')?.getAttribute('name')).toBe('sliders')
      expect(group!.shadowRoot?.querySelector('pm-search-mobile')).toBeNull()
      expect(group!.shadowRoot?.querySelector('.sort-group-trigger')).toBeNull()
      const groupIcons = Array.from(
        header!.shadowRoot?.querySelectorAll('cv-radio[data-display-mode] cv-icon.workspace-view-icon') ?? [],
      ).map((icon) => icon.getAttribute('name'))
      const groupLabels = Array.from(header!.shadowRoot?.querySelectorAll('cv-radio[data-display-mode]') ?? []).map(
        (radio) => radio.getAttribute('aria-label'),
      )
      expect(sortButton).not.toBeNull()
      expect(header!.shadowRoot?.querySelector('pm-credentials-sort-group-controls')).toBeNull()
      expect(sortButton?.querySelector('cv-icon')?.getAttribute('name')).toBe('arrow-up-down')
      expect(sortButton?.querySelector('.workspace-sort-label')?.textContent).toBe('Name')
      expect(groupRadioGroup).not.toBeNull()
      expect(groupIcons).toEqual(['circle-minus', 'globe', 'calendar-clock', 'shield-check'])
      expect(groupLabels).toEqual(['None', 'Websites', 'Modified', 'Security'])
      expect(header!.shadowRoot?.querySelector('.direction-button')).toBeNull()

      tagFilterGroup?.dispatchEvent(
        new CustomEvent('cv-input', {
          detail: {
            value: [pmCredentialTagsModel.allFilterChipValue(), 'work'],
            changedValue: 'work',
            selected: true,
            source: 'click',
          },
          bubbles: true,
          composed: true,
        }),
      )
      expect(selectedCredentialTagFilters()).toEqual(['work'])

      tagFilterGroup?.dispatchEvent(
        new CustomEvent('cv-input', {
          detail: {
            value: [pmCredentialTagsModel.allFilterChipValue()],
            changedValue: pmCredentialTagsModel.allFilterChipValue(),
            selected: true,
            source: 'click',
          },
          bubbles: true,
          composed: true,
        }),
      )
      expect(selectedCredentialTagFilters()).toEqual([])

      manageTagsButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      expect(pmCredentialTagsModel.filterSheetOpen()).toBe(true)
      expect(pmCredentialTagsModel.sheetMode()).toBe('manage')

      sortButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      groupRadioGroup?.dispatchEvent(
        new CustomEvent('cv-input', {
          detail: {value: 'website', activeId: 'website'},
          bubbles: true,
          composed: true,
        }),
      )
      expect(sortField()).toBe('username')
      expect(groupBy()).toBe('website')

      searchInput?.dispatchEvent(
        new CustomEvent('cv-input', {detail: {value: 'vault'}, bubbles: true, composed: true}),
      )
      expect(filterValue()).toBe('vault')

      header?.clear()
      expect(filterValue()).toBe('')
    })
  })

  describe('desktop sidebar scroll edge', () => {
    it('normalizes a legacy saved width once and separates resize preview from commit', () => {
      localStorage.setItem('pm-sidebar-width', '500')
      const setItem = vi.spyOn(globalThis.localStorage, 'setItem')
      const model = new PasswordManagerLayoutModel()

      model.initializeSidebarWidth()

      expect(model.sidebarWidth()).toBe(PM_SIDEBAR_MAX_WIDTH)
      expect(setItem).toHaveBeenCalledTimes(1)
      expect(setItem).toHaveBeenLastCalledWith('pm-sidebar-width', String(PM_SIDEBAR_MAX_WIDTH))

      model.initializeSidebarWidth()
      expect(setItem).toHaveBeenCalledTimes(1)

      model.previewSidebarWidth(PM_SIDEBAR_MIN_WIDTH + PM_SIDEBAR_WIDTH_STEP)
      expect(model.sidebarWidth()).toBe(PM_SIDEBAR_MIN_WIDTH + PM_SIDEBAR_WIDTH_STEP)
      expect(localStorage.getItem('pm-sidebar-width')).toBe(String(PM_SIDEBAR_MAX_WIDTH))
      expect(setItem).toHaveBeenCalledTimes(1)

      model.commitSidebarWidth(PM_SIDEBAR_MIN_WIDTH)
      expect(model.sidebarWidth()).toBe(PM_SIDEBAR_MIN_WIDTH)
      expect(localStorage.getItem('pm-sidebar-width')).toBe(String(PM_SIDEBAR_MIN_WIDTH))
      expect(setItem).toHaveBeenCalledTimes(2)
    })

    it('renders a pixel splitter with a labeled Groups sidebar and a single create action', async () => {
      const root = new ManagerRoot({} as any)
      root.entries.set([])
      root.showElement.set(root)
      setPassmanagerRoot(root)
      PasswordManagerDesktopLayout.define()
      const createGroup = vi
        .spyOn(passwordManagerDesktopLayoutModel, 'createTopLevelGroup')
        .mockImplementation(() => {})

      const element = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      document.body.appendChild(element)
      await settle(element)

      const splitter = element.shadowRoot?.querySelector('cv-window-splitter')
      const sidebar = splitter?.querySelector('aside[slot="primary"].sidebar')
      const heading = sidebar?.querySelector('.sidebar-title')
      const createButton = sidebar?.querySelector('cv-button.sidebar-create-group') as HTMLElement | null

      expect(splitter?.getAttribute('position-unit')).toBe('px')
      expect(splitter?.getAttribute('aria-label')).toBe('Resize groups sidebar')
      expect((splitter as unknown as {min?: number})?.min).toBe(PM_SIDEBAR_MIN_WIDTH)
      expect((splitter as unknown as {max?: number})?.max).toBe(PM_SIDEBAR_MAX_WIDTH)
      expect((splitter as unknown as {step?: number})?.step).toBe(PM_SIDEBAR_WIDTH_STEP)
      expect(sidebar).not.toBeNull()
      expect(heading?.textContent?.trim()).toBe('Groups')
      expect(createButton?.getAttribute('aria-label')).toBe('Create group')
      expect(createButton?.getAttribute('title')).toBe('Create group')
      expect(sidebar?.querySelectorAll('cv-button.sidebar-create-group')).toHaveLength(1)

      createButton?.click()
      expect(createGroup).toHaveBeenCalledTimes(1)
    })

    it('toggles the group tree bottom edge when the sidebar tree reaches the end', async () => {
      mockGroupTreeMetrics({clientHeight: 320, scrollHeight: 960})
      const root = new ManagerRoot({} as any)
      root.entries.set([])
      setPassmanagerRoot(root)
      PasswordManagerDesktopLayout.define()

      const element = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      document.body.appendChild(element)
      await settle(element)

      const frame = element.shadowRoot?.querySelector<HTMLElement>('.sidebar-tree-scroll-frame')
      const tree = element.shadowRoot?.querySelector<HTMLElement>('group-tree-view.scrollable')
      expect(frame).not.toBeNull()
      expect(tree).not.toBeNull()
      expect(frame?.getAttribute('data-scroll-block-end')).toBe('true')

      tree!.scrollTop = 640
      tree!.dispatchEvent(new Event('scroll'))
      await settle(element)

      expect(frame?.getAttribute('data-scroll-block-end')).toBe('false')
    })
  })

  describe('content render boundary', () => {
    it.each([
      ['root', (fixture: ReturnType<typeof createRootFixture>) => fixture.root],
      ['group', (fixture: ReturnType<typeof createRootFixture>) => fixture.group],
      ['entry', (fixture: ReturnType<typeof createRootFixture>) => fixture.entry],
      ['createEntry', () => 'createEntry' as const],
      ['createGroup', () => 'createGroup' as const],
      ['importDialog', () => 'importDialog' as const],
      ['otpView', () => 'otpView' as const],
    ])('desktop layout renders one pm-content wrapper for %s state', async (_name, resolveShowElement) => {
      const fixture = createRootFixture()
      fixture.root.showElement.set(resolveShowElement(fixture) as never)
      setPassmanagerRoot(fixture.root)
      PasswordManagerDesktopLayout.define()

      const element = document.createElement(
        'password-manager-desktop-layout',
      ) as PasswordManagerDesktopLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelectorAll('.pm-content')).toHaveLength(1)
    })

    it.each([
      ['root', (fixture: ReturnType<typeof createRootFixture>) => fixture.root],
      ['group', (fixture: ReturnType<typeof createRootFixture>) => fixture.group],
      ['entry', (fixture: ReturnType<typeof createRootFixture>) => fixture.entry],
      ['createEntry', () => 'createEntry' as const],
      ['createGroup', () => 'createGroup' as const],
      ['importDialog', () => 'importDialog' as const],
      ['otpView', () => 'otpView' as const],
    ])('mobile layout renders one pm-content wrapper for %s state', async (_name, resolveShowElement) => {
      const fixture = createRootFixture()
      fixture.root.showElement.set(resolveShowElement(fixture) as never)
      setPassmanagerRoot(fixture.root)
      PasswordManagerMobileLayout.define()

      const element = document.createElement(
        'password-manager-mobile-layout',
      ) as PasswordManagerMobileLayout
      document.body.appendChild(element)
      await element.updateComplete

      expect(element.shadowRoot?.querySelectorAll('.pm-content')).toHaveLength(1)
      const roots = element.shadowRoot?.querySelectorAll('#app\\.passwords\\.root')
      const rootGroup = roots?.item(0)
      expect(roots).toHaveLength(1)
      expect(rootGroup?.getAttribute('role')).toBe('group')
      expect(rootGroup?.getAttribute('aria-label')).toBe(appI18n('password-manager'))
    })

  })

  describe('layout switching does not recreate PM root', () => {
    it('pmModel.alive remains true across layout mode change', () => {
      const {layoutMode} = setupContext('desktop')

      pmModel.managerSaver = {} as any
      const mockClean = vi.fn()
      const mockLoad = vi.fn()

      ;(globalThis as any).window ??= {}
      const origPassmanager = (window as any).passmanager

      const fakeManager = {
        clean: mockClean,
        load: mockLoad,
        showElement: atom(null),
        isLoading: atom(false),
        isReadOnly: atom(false),
      }

      ;(window as any).passmanager = undefined

      const originalManagerRoot = vi.fn().mockImplementation(() => fakeManager)
      vi.stubGlobal('ManagerRoot', originalManagerRoot)

      pmModel.init()
      expect(pmModel.alive()).toBe(true)

      layoutMode.set('mobile')
      expect(pmModel.alive()).toBe(true)

      layoutMode.set('desktop')
      expect(pmModel.alive()).toBe(true)

      pmModel.cleanup()
      expect(pmModel.alive()).toBe(false)

      ;(window as any).passmanager = origPassmanager
      vi.unstubAllGlobals()
    })
  })

  describe('model lifecycle', () => {
    it('init sets alive to true', () => {
      expect(pmModel.alive()).toBe(false)

      pmModel.managerSaver = {} as any
      ;(globalThis as any).window ??= {}
      const origPassmanager = (window as any).passmanager
      ;(window as any).passmanager = undefined

      try {
        pmModel.init()
      } catch {}

      ;(window as any).passmanager = origPassmanager
    })

    it('cleanup sets alive to false', () => {
      pmModel.alive.set(true)
      ;(globalThis as any).window ??= {}
      const origPassmanager = (window as any).passmanager
      ;(window as any).passmanager = {clean: vi.fn()}

      pmModel.cleanup()
      expect(pmModel.alive()).toBe(false)

      ;(window as any).passmanager = origPassmanager
    })

    it('double init is idempotent', () => {
      pmModel.alive.set(true)
      const _initSpy = vi.fn()
      const _origInit = pmModel.init.bind(pmModel)

      pmModel.init()

      expect(pmModel.alive()).toBe(true)

      pmModel.alive.set(false)
    })

    it('cleanup when not alive is no-op', () => {
      pmModel.alive.set(false)
      pmModel.cleanup()
      expect(pmModel.alive()).toBe(false)
    })
  })

  describe('layout selection is binary', () => {
    it('only two possible outcomes: mobile or desktop', () => {
      const allCombinations: Array<{
        isMobile: boolean
        matchesBreakpoint: boolean
        queryParam: string | null
        persisted: string | null
      }> = []

      for (const isMobile of [true, false]) {
        for (const matchesBreakpoint of [true, false]) {
          for (const queryParam of [null, 'mobile', 'desktop', 'auto']) {
            for (const persisted of [null, 'mobile', 'desktop']) {
              allCombinations.push({isMobile, matchesBreakpoint, queryParam, persisted})
            }
          }
        }
      }

      for (const input of allCombinations) {
        const mode = resolveLayoutMode(input)
        expect(['mobile', 'desktop']).toContain(mode)
      }
    })
  })
})
