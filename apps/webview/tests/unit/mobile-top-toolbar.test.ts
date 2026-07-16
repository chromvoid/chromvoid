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
    document.querySelectorAll('[data-mobile-toolbar-focus-test]').forEach((el) => el.remove())
    vi.restoreAllMocks()
  })

  it('renders title with menu leading and dispatches the toolbar event', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Files'
    toolbar.leading = 'menu'

    const onLeading = vi.fn()
    toolbar.addEventListener('mobile-toolbar-leading', onLeading as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const title = toolbar.shadowRoot?.querySelector('.title')?.textContent?.trim()
    expect(title).toBe('Files')
    let leadingButton = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    let leadingIcon = leadingButton?.querySelector('cv-icon')
    expect(leadingButton).toBeTruthy()
    expect(leadingButton?.getAttribute('aria-label')).toBe('Open menu')
    expect(leadingIcon?.getAttribute('name')).toBe('list')

    toolbar.menuOpen = true
    await toolbar.updateComplete
    leadingButton = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    leadingIcon = leadingButton?.querySelector('cv-icon')
    expect(leadingButton?.getAttribute('aria-label')).toBe('Close menu')
    expect(leadingIcon?.getAttribute('name')).toBe('x')

    leadingButton?.click()

    expect(onLeading).toHaveBeenCalledTimes(1)
    expect((onLeading.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({mode: 'menu'})
  })

  it('hides optional controls and blocks back event when disabled', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Storage'
    toolbar.leading = 'back'
    toolbar.backDisabled = true

    const onLeading = vi.fn()
    toolbar.addEventListener('mobile-toolbar-leading', onLeading as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const leading = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    expect(leading).toBeTruthy()
    expect(Boolean(leading?.disabled)).toBe(true)
    leading?.click()
    expect(onLeading).toHaveBeenCalledTimes(0)

    toolbar.leading = 'none'
    await toolbar.updateComplete
    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]')).toBeNull()
  })

  it('optionally turns the title into an accessible toolbar action', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Personal Wallet'
    toolbar.subtitle = 'Bitcoin · Savings'
    toolbar.titleAction = {
      id: 'switch-wallet',
      label: 'Switch wallet, current Personal Wallet',
      popup: 'dialog',
      expanded: false,
    }
    const onAction = vi.fn()
    toolbar.addEventListener('mobile-toolbar-action', onAction as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const titleButton = toolbar.shadowRoot?.querySelector('.title-action') as HTMLButtonElement | null
    expect(titleButton?.getAttribute('aria-label')).toBe('Switch wallet, current Personal Wallet')
    expect(titleButton?.getAttribute('aria-haspopup')).toBe('dialog')
    expect(titleButton?.getAttribute('aria-expanded')).toBe('false')
    expect(titleButton?.querySelector('cv-icon')?.getAttribute('name')).toBe('chevron-down')

    titleButton?.click()
    expect((onAction.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({actionId: 'switch-wallet'})

    toolbar.titleAction = {...toolbar.titleAction!, disabled: true, expanded: true}
    await toolbar.updateComplete
    const disabledTitle = toolbar.shadowRoot?.querySelector('.title-action') as HTMLButtonElement | null
    expect(disabledTitle?.disabled).toBe(true)
    expect(disabledTitle?.getAttribute('aria-expanded')).toBe('true')
    disabledTitle?.click()
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders compact meta counters under the title', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Selected'
    toolbar.metaLabel = 'Selected: Entries: 2, Groups: 1'
    toolbar.meta = [
      {id: 'entries', icon: 'key', label: 'Entries', value: '2'},
      {id: 'groups', icon: 'folder', label: 'Groups', value: '1'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const metaRow = toolbar.shadowRoot?.querySelector('.meta-row') as HTMLElement | null
    const metaItems = Array.from(toolbar.shadowRoot?.querySelectorAll('.meta-item') ?? [])
    const icons = metaItems.map((item) => item.querySelector('cv-icon')?.getAttribute('name'))
    const values = metaItems.map((item) => item.textContent?.trim())

    expect(toolbar.shadowRoot?.querySelector('.title')?.textContent?.trim()).toBe('Selected')
    expect(metaRow?.getAttribute('aria-label')).toBe('Selected: Entries: 2, Groups: 1')
    expect(icons).toEqual(['key', 'folder'])
    expect(values).toEqual(['2', '1'])
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

  it('keeps overflow-only actions in the overflow menu', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.overflowFromIndex = 2
    toolbar.actions = [
      {id: 'image', icon: 'image-plus', label: 'Image', overflowOnly: true},
      {id: 'paste', icon: 'clipboard', label: 'Paste'},
      {id: 'undo', icon: 'undo-2', label: 'Undo'},
      {id: 'redo', icon: 'redo-2', label: 'Redo'},
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

    expect(buttons).toEqual(['paste', 'More actions'])
    expect(overflowItems).toEqual(['image', 'undo', 'redo'])
  })

  it('prevents pointer focus transfer for focus-preserving visible actions', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.actions = [
      {id: 'undo', icon: 'undo-2', label: 'Undo', preserveFocusOnPress: true},
      {id: 'paste', icon: 'clipboard', label: 'Paste'},
    ]

    const onAction = vi.fn()
    toolbar.addEventListener('mobile-toolbar-action', onAction as EventListener)
    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const undoButton = toolbar.shadowRoot?.querySelector('[data-action="undo"]') as HTMLElement | null
    const pasteButton = toolbar.shadowRoot?.querySelector('[data-action="paste"]') as HTMLElement | null
    const undoPointerDown = new Event('pointerdown', {bubbles: true, cancelable: true})
    const pastePointerDown = new Event('pointerdown', {bubbles: true, cancelable: true})

    expect(undoButton?.dispatchEvent(undoPointerDown)).toBe(false)
    expect(undoPointerDown.defaultPrevented).toBe(true)
    expect(pasteButton?.dispatchEvent(pastePointerDown)).toBe(true)
    expect(pastePointerDown.defaultPrevented).toBe(false)

    undoButton?.click()

    expect(onAction).toHaveBeenCalledTimes(1)
    expect((onAction.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({actionId: 'undo'})
  })

  it('preserves current focus when opening overflow for focus-preserving actions', async () => {
    ensureDefined()
    const focusedInput = document.createElement('input')
    focusedInput.setAttribute('data-mobile-toolbar-focus-test', 'true')
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.maxVisible = 1
    toolbar.actions = [
      {id: 'paste', icon: 'clipboard', label: 'Paste', preserveFocusOnPress: true},
      {id: 'rename', icon: 'pencil', label: 'Rename'},
    ]
    const onAction = vi.fn()
    toolbar.addEventListener('mobile-toolbar-action', onAction as EventListener)

    document.body.append(focusedInput, toolbar)
    await toolbar.updateComplete
    focusedInput.focus()

    const menu = getOverflowMenu(toolbar)
    const trigger = getOverflowTrigger(toolbar)
    const pointerDown = new Event('pointerdown', {bubbles: true, composed: true, cancelable: true})

    expect(menu?.preserveFocusOnPointerOpen).toBe(true)
    expect(trigger?.dispatchEvent(pointerDown)).toBe(false)
    expect(pointerDown.defaultPrevented).toBe(true)

    trigger?.click()
    await menu?.updateComplete

    expect(menu?.open).toBe(true)
    expect(document.activeElement).toBe(focusedInput)

    const pasteItem = getOverflowPortalItem('paste')
    expect(pasteItem).not.toBeNull()
    pasteItem!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await menu?.updateComplete

    expect(onAction).toHaveBeenCalledTimes(1)
    expect((onAction.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({actionId: 'paste'})
    expect(document.activeElement).toBe(focusedInput)
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

  it('shows an active indicator on the overflow button', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.maxVisible = 3
    toolbar.actions = [
      {id: 'a1', icon: 'plus-lg', label: 'One'},
      {id: 'a2', icon: 'plus-lg', label: 'Two'},
      {id: 'a3', icon: 'plus-lg', label: 'Three', active: true},
      {id: 'a4', icon: 'plus-lg', label: 'Four'},
    ]

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const overflowMenu = getOverflowMenu(toolbar)

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
