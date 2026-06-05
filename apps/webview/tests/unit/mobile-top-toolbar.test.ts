import {afterEach, describe, expect, it, vi} from 'vitest'

import {MobileTopToolbar} from '../../src/features/shell/components/mobile-top-toolbar'

let defined = false

function ensureDefined() {
  if (defined) return
  MobileTopToolbar.define()
  defined = true
}

function getOverflowMenu(toolbar: MobileTopToolbar) {
  return toolbar.shadowRoot?.querySelector('cv-menu-button.overflow-menu') as HTMLElementTagNameMap['cv-menu-button'] | null
}

function getOverflowTrigger(toolbar: MobileTopToolbar) {
  return getOverflowMenu(toolbar)?.shadowRoot?.querySelector('[part="trigger"]') as HTMLButtonElement | null
}

function getOverflowPortalItem(value: string) {
  return document.body.querySelector(
    `[data-cv-menu-button-portal] cv-menu-item[value="${value}"]`,
  ) as HTMLElementTagNameMap['cv-menu-item'] | null
}

describe('MobileTopToolbar', () => {
  afterEach(() => {
    document.querySelectorAll('mobile-top-toolbar').forEach((el) => el.remove())
    vi.restoreAllMocks()
  })

  it('renders title with menu leading and command, dispatching toolbar events', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Files'
    toolbar.leading = 'menu'
    toolbar.showCommand = true

    const onLeading = vi.fn()
    const onCommand = vi.fn()
    toolbar.addEventListener('mobile-toolbar-leading', onLeading as EventListener)
    toolbar.addEventListener('mobile-toolbar-command', onCommand as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const title = toolbar.shadowRoot?.querySelector('.title')?.textContent?.trim()
    expect(title).toBe('Files')
    let leadingButton = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    let leadingIcon = leadingButton?.querySelector('cv-icon')
    expect(leadingButton).toBeTruthy()
    expect(leadingButton?.getAttribute('aria-label')).toBe('Open menu')
    expect(leadingIcon?.getAttribute('name')).toBe('list')
    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]')).toBeTruthy()

    toolbar.menuOpen = true
    await toolbar.updateComplete
    leadingButton = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    leadingIcon = leadingButton?.querySelector('cv-icon')
    expect(leadingButton?.getAttribute('aria-label')).toBe('Close menu')
    expect(leadingIcon?.getAttribute('name')).toBe('x')

    leadingButton?.click()
    ;(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]') as HTMLElement | null)?.click()

    expect(onLeading).toHaveBeenCalledTimes(1)
    expect((onLeading.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({mode: 'menu'})
    expect(onCommand).toHaveBeenCalledTimes(1)
  })

  it('hides optional controls and blocks back event when disabled', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Storage'
    toolbar.leading = 'back'
    toolbar.backDisabled = true
    toolbar.showCommand = false

    const onLeading = vi.fn()
    toolbar.addEventListener('mobile-toolbar-leading', onLeading as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]')).toBeNull()

    const leading = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    expect(leading).toBeTruthy()
    expect(Boolean(leading?.disabled)).toBe(true)
    leading?.click()
    expect(onLeading).toHaveBeenCalledTimes(0)

    toolbar.leading = 'none'
    await toolbar.updateComplete
    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]')).toBeNull()
  })

  it('uses configurable max visible actions before collapsing into overflow', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.maxVisible = 6
    toolbar.actions = [
      {id: 'a1', icon: 'plus-lg', label: 'One'},
      {id: 'a2', icon: 'plus-lg', label: 'Two'},
      {id: 'a3', icon: 'plus-lg', label: 'Three'},
      {id: 'a4', icon: 'plus-lg', label: 'Four'},
      {id: 'a5', icon: 'plus-lg', label: 'Five'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    expect(toolbar.shadowRoot?.querySelectorAll('.action-btn[data-action]').length).toBe(5)
    expect(toolbar.shadowRoot?.querySelector('[aria-label="More actions"]')).toBeNull()
  })

  it('renders the overflow button before visible actions', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.maxVisible = 3
    toolbar.actions = [
      {id: 'a1', icon: 'plus-lg', label: 'One'},
      {id: 'a2', icon: 'plus-lg', label: 'Two'},
      {id: 'a3', icon: 'plus-lg', label: 'Three'},
      {id: 'a4', icon: 'plus-lg', label: 'Four'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const buttons = Array.from(toolbar.shadowRoot?.querySelector('.trailing')?.children ?? [])
      .map((element) =>
        element.tagName.toLowerCase() === 'cv-popover'
          ? 'button:more_actions'
          : element.getAttribute('data-action') ?? element.getAttribute('aria-label'),
      )
      .filter((value): value is string => Boolean(value))

    expect(buttons).toEqual(['button:more_actions', 'a1', 'a2'])
  })

  it('renders explicit overflow after visible actions from overflowFromIndex', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.overflowFromIndex = 2
    toolbar.actions = [
      {id: 'a1', icon: 'plus-lg', label: 'One'},
      {id: 'a2', icon: 'plus-lg', label: 'Two'},
      {id: 'a3', icon: 'plus-lg', label: 'Three'},
      {id: 'a4', icon: 'plus-lg', label: 'Four'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const buttons = Array.from(
      toolbar.shadowRoot?.querySelectorAll('.trailing > .action-btn[data-action], .trailing > .overflow-menu') ?? [],
    )
      .map((element) => (element.classList.contains('overflow-menu') ? 'More actions' : element.getAttribute('data-action')))
      .filter((value): value is string => Boolean(value))
    const overflowItems = Array.from(getOverflowMenu(toolbar)?.querySelectorAll('cv-menu-item') ?? []).map((item) =>
      item.getAttribute('value'),
    )

    expect(buttons).toEqual(['a1', 'a2', 'More actions'])
    expect(overflowItems).toEqual(['a3', 'a4'])
  })

  it('renders all actions inside overflow when overflowFromIndex is zero', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.overflowFromIndex = 0
    toolbar.actions = [
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
      {id: 'create-dir', icon: 'folder-plus', label: 'Create folder'},
      {id: 'upload', icon: 'upload', label: 'Upload files'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const overflowMenu = getOverflowMenu(toolbar)
    const visibleActionButtons = Array.from(toolbar.shadowRoot?.querySelectorAll('.action-btn[data-action]') ?? [])
    const overflowItems = Array.from(overflowMenu?.querySelectorAll('cv-menu-item') ?? []).map((item) =>
      item.getAttribute('value'),
    )

    expect(visibleActionButtons).toHaveLength(0)
    expect(overflowMenu).not.toBeNull()
    expect(overflowItems).toEqual(['create-note', 'create-dir', 'upload'])
  })

  it('executes an overflow action even when the menu item was already selected', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.maxVisible = 3
    toolbar.actions = [
      {id: 'selection-done', icon: 'check-lg', label: 'Done'},
      {id: 'open', icon: 'eye', label: 'Open'},
      {id: 'rename', icon: 'pencil', label: 'Rename'},
      {id: 'download', icon: 'download', label: 'Download'},
      {id: 'delete', icon: 'trash', label: 'Delete'},
    ]
    const onAction = vi.fn()
    toolbar.addEventListener('mobile-toolbar-action', onAction as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const menu = getOverflowMenu(toolbar)
    const renameItem = menu?.querySelector<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item[value="rename"]')
    expect(menu).not.toBeNull()
    expect(renameItem).not.toBeNull()

    menu!.value = 'rename'
    renameItem!.selected = true

    getOverflowTrigger(toolbar)?.click()
    await menu?.updateComplete

    expect(onAction).toHaveBeenCalledTimes(0)

    const portalRenameItem = getOverflowPortalItem('rename')
    expect(portalRenameItem).not.toBeNull()

    portalRenameItem!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await menu?.updateComplete

    expect(onAction).toHaveBeenCalledTimes(1)
    expect((onAction.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({actionId: 'rename'})
    expect(menu?.value).toBe('')
    expect(renameItem?.selected).toBe(false)
  })

  it('shows active indicators on the command and overflow buttons', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.showCommand = true
    toolbar.commandActive = true
    toolbar.maxVisible = 3
    toolbar.actions = [
      {id: 'a1', icon: 'plus-lg', label: 'One'},
      {id: 'a2', icon: 'plus-lg', label: 'Two'},
      {id: 'a3', icon: 'plus-lg', label: 'Three', active: true},
      {id: 'a4', icon: 'plus-lg', label: 'Four'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const commandButton = toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]') as HTMLButtonElement | null
    const overflowMenu = getOverflowMenu(toolbar)

    expect(commandButton?.classList.contains('active')).toBe(true)
    expect(commandButton?.querySelector('.action-indicator')).not.toBeNull()
    expect(overflowMenu?.classList.contains('active')).toBe(true)
    expect(overflowMenu?.querySelector('.action-indicator')).not.toBeNull()
  })

  it('opens overflow only after trigger click and closes on outside pointer down', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.maxVisible = 3
    toolbar.actions = [
      {id: 'a1', icon: 'plus-lg', label: 'One'},
      {id: 'a2', icon: 'plus-lg', label: 'Two'},
      {id: 'a3', icon: 'plus-lg', label: 'Three'},
      {id: 'a4', icon: 'plus-lg', label: 'Four'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const menu = getOverflowMenu(toolbar)
    expect(menu?.open).toBe(false)

    getOverflowTrigger(toolbar)?.click()
    await menu?.updateComplete

    expect(menu?.open).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', {bubbles: true, composed: true}))
    await menu?.updateComplete

    expect(menu?.open).toBe(false)
  })

  it('renders accent tone for emphasized toolbar actions', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.maxVisible = 4
    toolbar.actions = [
      {id: 'reset', icon: 'x', label: 'Reset Filters', tone: 'accent'},
      {id: 'settings', icon: 'sliders', label: 'Filters'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const accentButton = toolbar.shadowRoot?.querySelector('[data-action="reset"]') as HTMLButtonElement | null
    expect(accentButton?.classList.contains('tone-accent')).toBe(true)
  })

})
