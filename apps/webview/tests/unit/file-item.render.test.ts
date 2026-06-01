import {render as renderTemplate} from 'lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FileItem} from '../../src/features/file-manager/components/file-item'
import {FileItemMobile} from '../../src/features/file-manager/components/file-item-mobile'
import {renderDesktopFileItem} from '../../src/features/file-manager/components/file-item/render'
import {getFocusedItemId} from '../../src/features/file-manager/components/virtual-file-list/handlers/utils'
import {
  renderFileItem as renderListItemHost,
  renderListView,
  type VirtualFileListItemCallbacks,
} from '../../src/features/file-manager/components/virtual-file-list/render-list'
import {renderGridView} from '../../src/features/file-manager/components/virtual-file-list/render-grid'
import {renderTableView} from '../../src/features/file-manager/components/virtual-file-list/render-table'
import type {FileListItem} from '../../src/shared/contracts/file-manager'

const ITEM: FileListItem = {
  id: 7,
  path: '/report.pdf',
  name: 'report.pdf',
  isDir: false,
  size: 1024,
  lastModified: 1710000000000,
}

const OVERLAP_ITEMS: FileListItem[] = [
  {...ITEM, id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
  {...ITEM, id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
  {...ITEM, id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
  {...ITEM, id: 4, name: 'four.jpg', path: '/four.jpg', mimeType: 'image/jpeg'},
]

const CALLBACKS: VirtualFileListItemCallbacks = {
  onFileItemClick: () => {},
  onFileItemDoubleClick: () => {},
  onFileItemContextMenu: () => {},
  onFileItemRename: () => {},
  onFileItemDownload: () => {},
  onFileItemDelete: () => {},
  onFileItemInfo: () => {},
  onFileItemDrop: () => {},
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  onTouchCancel: () => {},
  onDragStart: () => {},
  onDragOver: () => {},
  onDragLeave: () => {},
  onDrop: () => {},
}

let defined = false
let originalMatchMedia: typeof window.matchMedia

function setTouchCapability(enabled: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(hover: none) and (pointer: coarse)' ? enabled : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

function ensureDefined() {
  if (defined) return
  FileItem.define()
  FileItemMobile.define()
  defined = true
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia
})

afterEach(() => {
  document.body.innerHTML = ''
  window.matchMedia = originalMatchMedia
  vi.restoreAllMocks()
})

describe('file-item render split', () => {
  it('keeps inline actions on desktop without swipe shell', async () => {
    ensureDefined()

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.actions')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.swipe-container')).toBeNull()
  })

  it('omits inline actions on mobile desktop runtime without rendering swipe shell', async () => {
    ensureDefined()
    setTouchCapability(false)

    const element = document.createElement('file-item-mobile') as FileItemMobile
    element.item = ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.actions')).toBeNull()
    expect(element.shadowRoot?.querySelector('.swipe-container')).toBeNull()
  })

  it('keeps swipe shell on touch mobile list items', async () => {
    ensureDefined()
    setTouchCapability(true)

    const element = document.createElement('file-item-mobile') as FileItemMobile
    element.item = ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.actions')).toBeNull()
    expect(element.shadowRoot?.querySelector('.swipe-container')).not.toBeNull()
  })

  it('does not open the context menu on mobile long press', async () => {
    ensureDefined()
    setTouchCapability(true)
    vi.useFakeTimers()

    const element = document.createElement('file-item-mobile') as FileItemMobile
    element.item = ITEM
    element.viewMode = 'list'
    const contextMenuSpy = vi.fn()
    element.addEventListener('item-context-menu', contextMenuSpy as EventListener)
    document.body.appendChild(element)
    await settle(element)

    const touchStartEvent = new Event('touchstart', {bubbles: true, cancelable: true}) as TouchEvent
    Object.defineProperty(touchStartEvent, 'touches', {
      configurable: true,
      value: [{clientX: 12, clientY: 16}],
    })

    element.shadowRoot?.querySelector('.file-item')?.dispatchEvent(touchStartEvent)
    vi.advanceTimersByTime(600)

    expect(contextMenuSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not bind extra touchmove listener when touch capability is unavailable', async () => {
    ensureDefined()
    setTouchCapability(false)

    const addEventListenerSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener')

    const element = document.createElement('file-item-mobile') as FileItemMobile
    element.item = ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    const hasNonPassiveTouchMoveBinding = addEventListenerSpy.mock.calls.some((args, index) => {
      const [type, , options] = args
      const target = addEventListenerSpy.mock.instances[index]
      return (
        target instanceof HTMLElement &&
        target.classList.contains('file-item') &&
        type === 'touchmove' &&
        typeof options === 'object' &&
        options !== null &&
        'passive' in options &&
        options.passive === false
      )
    })

    expect(hasNonPassiveTouchMoveBinding).toBe(false)
  })

  it('renders desktop action titles without pending-open copy in the item layout', () => {
    const container = document.createElement('div')

    renderTemplate(
      renderDesktopFileItem({
        item: ITEM,
        selected: false,
        selectionMode: false,
        pendingExternalOpen: true,
        mediaActive: false,
        mediaPlaying: false,
        viewMode: 'list',
        dragEnabled: 'true',
        showSwipeActions: false,
        thumbnailUrl: null,
        callbacks: CALLBACKS,
      }),
      container,
    )

    const text = container.textContent ?? ''
    expect(text).not.toContain('Preparing file...')
    expect(container.querySelector('.pending-open-badge')).toBeNull()
    expect(container.querySelector('.file-item')?.getAttribute('aria-busy')).toBe('true')

    const actionButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('.actions .action-btn'))
    expect(actionButtons.map((button) => button.getAttribute('title'))).toEqual([
      'More',
      'Info',
      'Rename',
      'Download',
      'Delete',
    ])
  })

  it('renders a media-active spectrum in the leading icon slot', () => {
    const container = document.createElement('div')

    renderTemplate(
      renderDesktopFileItem({
        item: {...ITEM, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'},
        selected: false,
        selectionMode: false,
        pendingExternalOpen: false,
        mediaActive: true,
        mediaPlaying: true,
        viewMode: 'list',
        dragEnabled: 'true',
        showSwipeActions: false,
        thumbnailUrl: null,
        callbacks: CALLBACKS,
      }),
      container,
    )

    expect(container.querySelector('.file-item.media-active.media-playing')).not.toBeNull()
    expect(container.querySelector('.thumbnail-shell.file-media.is-media-active')).not.toBeNull()
    expect(container.querySelector('.media-active-spectrum.is-playing')).not.toBeNull()
    expect(container.querySelector('.media-active-spectrum')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.icon.file-media')).toBeNull()
  })

  it('omits the media-active spectrum when render data is inactive', () => {
    const container = document.createElement('div')

    renderTemplate(
      renderDesktopFileItem({
        item: ITEM,
        selected: false,
        selectionMode: false,
        pendingExternalOpen: false,
        mediaActive: false,
        mediaPlaying: false,
        viewMode: 'list',
        dragEnabled: 'true',
        showSwipeActions: false,
        thumbnailUrl: null,
        callbacks: CALLBACKS,
      }),
      container,
    )

    expect(container.querySelector('.media-active-spectrum')).toBeNull()
  })

  it('reflects media-active and media-playing on mobile file item hosts', async () => {
    ensureDefined()
    setTouchCapability(false)

    const element = document.createElement('file-item-mobile') as FileItemMobile
    element.item = {...ITEM, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}
    element.viewMode = 'list'
    element.mediaActive = true
    element.mediaPlaying = true
    document.body.appendChild(element)
    await settle(element)

    expect(element.hasAttribute('media-active')).toBe(true)
    expect(element.hasAttribute('media-playing')).toBe(true)
    expect(element.shadowRoot?.querySelector('.media-active-spectrum.is-playing')).not.toBeNull()
  })

  it('keeps selected and pending-open state with media-active state without local copy', () => {
    const container = document.createElement('div')

    renderTemplate(
      renderDesktopFileItem({
        item: {...ITEM, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'},
        selected: true,
        selectionMode: true,
        pendingExternalOpen: true,
        mediaActive: true,
        mediaPlaying: false,
        viewMode: 'list',
        dragEnabled: 'true',
        showSwipeActions: false,
        thumbnailUrl: null,
        callbacks: CALLBACKS,
      }),
      container,
    )

    expect(container.querySelector('.selection-indicator.is-selected')).not.toBeNull()
    expect(container.querySelector('.pending-open-badge')).toBeNull()
    expect(container.textContent ?? '').not.toContain('Preparing file...')
    expect(container.querySelector('.file-item')?.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('.media-active-spectrum')).not.toBeNull()
  })

  it('selects item host tag from virtual-file-list mobile flag', () => {
    const mobileContainer = document.createElement('div')
    renderTemplate(
      renderListItemHost({
        item: ITEM,
        mobile: true,
        selected: false,
        active: false,
        selectionMode: false,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      mobileContainer,
    )

    expect(mobileContainer.querySelector('file-item-mobile')).not.toBeNull()
    expect(mobileContainer.querySelector('file-item-desktop')).toBeNull()

    const desktopContainer = document.createElement('div')
    renderTemplate(
      renderListItemHost({
        item: ITEM,
        mobile: false,
        selected: false,
        active: false,
        selectionMode: false,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      desktopContainer,
    )

    expect(desktopContainer.querySelector('file-item-desktop')).not.toBeNull()
    expect(desktopContainer.querySelector('file-item-mobile')).toBeNull()
  })

  it('reflects selected and active state on desktop and mobile hosts', async () => {
    ensureDefined()

    const desktop = document.createElement('file-item-desktop') as FileItem
    desktop.item = ITEM
    desktop.viewMode = 'list'
    desktop.selected = true
    desktop.active = true
    document.body.appendChild(desktop)
    await settle(desktop)

    expect(desktop.hasAttribute('selected')).toBe(true)
    expect(desktop.hasAttribute('active')).toBe(true)

    const mobile = document.createElement('file-item-mobile') as FileItemMobile
    mobile.item = ITEM
    mobile.viewMode = 'list'
    mobile.selected = true
    mobile.active = true
    document.body.appendChild(mobile)
    await settle(mobile)

    expect(mobile.hasAttribute('selected')).toBe(true)
    expect(mobile.hasAttribute('active')).toBe(true)
  })

  it('keeps selected aria state on virtual list item hosts', () => {
    ensureDefined()

    const container = document.createElement('div')
    renderTemplate(
      renderListItemHost({
        item: ITEM,
        mobile: false,
        selected: true,
        active: true,
        selectionMode: true,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      container,
    )

    const host = container.querySelector('file-item-desktop')
    expect(host?.getAttribute('aria-selected')).toBe('true')
  })

  it('keeps selected table rows and pending-open state without local copy', () => {
    const container = document.createElement('div')
    const noop = () => {}

    renderTemplate(
      renderTableView({
        items: [ITEM],
        filteredItems: [ITEM],
        itemHeight: 48,
        virtualScrollTop: 0,
        viewportHeight: 96,
        sortBy: 'name',
        sortDirection: 'asc',
        selectedItems: [ITEM.id],
        pendingExternalOpenIds: [ITEM.id],
        selectionMode: true,
        onSortName: noop,
        onSortSize: noop,
        onSortDate: noop,
        onRowClick: noop,
        onRowDblClick: noop,
        onRowContextMenu: noop,
        onCheckboxClick: noop,
        onMoreButtonClick: noop,
        getAriaSort: () => 'none',
      }),
      container,
    )

    const row = container.querySelector('.table-view .file-item-wrapper.selected')
    expect(row?.getAttribute('data-id')).toBe(String(ITEM.id))
    expect(row?.getAttribute('aria-selected')).toBe('true')
    expect(row?.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('.table-open-status')).toBeNull()
    expect(container.textContent ?? '').not.toContain('Preparing file...')
  })

  it('keeps overlapping desktop list items on the same DOM hosts when the visible window shifts', () => {
    ensureDefined()

    const container = document.createElement('div')

    renderTemplate(
      renderListView({
        items: OVERLAP_ITEMS.slice(0, 3),
        totalItemsCount: OVERLAP_ITEMS.length,
        mobile: false,
        itemHeight: 80,
        virtualScrollTop: 0,
        selectedItems: [],
        selectionMode: false,
        activeItemId: null,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      container,
    )

    const firstTwo = container.querySelector('file-item-desktop[data-id="2"]')
    const firstThree = container.querySelector('file-item-desktop[data-id="3"]')

    expect(firstTwo).not.toBeNull()
    expect(firstThree).not.toBeNull()

    renderTemplate(
      renderListView({
        items: OVERLAP_ITEMS.slice(1, 4),
        totalItemsCount: OVERLAP_ITEMS.length,
        mobile: false,
        itemHeight: 80,
        virtualScrollTop: 80,
        selectedItems: [],
        selectionMode: false,
        activeItemId: null,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      container,
    )

    expect(container.querySelector('file-item-desktop[data-id="2"]')).toBe(firstTwo)
    expect(container.querySelector('file-item-desktop[data-id="3"]')).toBe(firstThree)
  })

  it('passes media-active state through renderListView without progress props', () => {
    ensureDefined()

    const container = document.createElement('div')

    renderTemplate(
      renderListView({
        items: [ITEM],
        totalItemsCount: 1,
        mobile: false,
        itemHeight: 80,
        virtualScrollTop: 0,
        selectedItems: [],
        selectionMode: false,
        activeItemId: null,
        mediaActiveItemId: ITEM.id,
        mediaPlaying: true,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      container,
    )

    const activeHost = container.querySelector('file-item-desktop')
    expect(activeHost?.mediaActive).toBe(true)
    expect(activeHost?.mediaPlaying).toBe(true)

    renderTemplate(
      renderListView({
        items: [ITEM],
        totalItemsCount: 1,
        mobile: false,
        itemHeight: 80,
        virtualScrollTop: 0,
        selectedItems: [],
        selectionMode: false,
        activeItemId: null,
        mediaActiveItemId: null,
        mediaPlaying: true,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      container,
    )

    const inactiveHost = container.querySelector('file-item-desktop')
    expect(inactiveHost?.mediaActive).toBe(false)
    expect(inactiveHost?.mediaPlaying).toBe(false)
  })

  it('keeps the virtual spacer height tied to the full filtered list', () => {
    ensureDefined()

    const container = document.createElement('div')

    renderTemplate(
      renderListView({
        items: OVERLAP_ITEMS.slice(0, 3),
        totalItemsCount: 20,
        mobile: false,
        itemHeight: 80,
        virtualScrollTop: 80,
        selectedItems: [],
        selectionMode: false,
        activeItemId: null,
        viewMode: 'list',
        callbacks: CALLBACKS,
      }),
      container,
    )

    const spacer = container.querySelector('.virtual-spacer')
    expect(spacer?.getAttribute('data-total-height')).toBe('1600')
  })

  it('keeps overlapping desktop grid items on the same DOM hosts when the visible window shifts', () => {
    ensureDefined()

    const renderGridItem = (item: FileListItem) =>
      renderListItemHost({
        item,
        mobile: false,
        selected: false,
        active: false,
        selectionMode: false,
        viewMode: 'grid',
        callbacks: CALLBACKS,
      })

    const container = document.createElement('div')
    renderTemplate(
      renderGridView({
        items: OVERLAP_ITEMS.slice(0, 3),
        totalHeight: 400,
        offsetY: 0,
        renderItem: renderGridItem,
      }),
      container,
    )

    const firstTwo = container.querySelector('file-item-desktop[data-id="2"]')
    const firstThree = container.querySelector('file-item-desktop[data-id="3"]')

    expect(firstTwo).not.toBeNull()
    expect(firstThree).not.toBeNull()

    renderTemplate(
      renderGridView({
        items: OVERLAP_ITEMS.slice(1, 4),
        totalHeight: 400,
        offsetY: 200,
        renderItem: renderGridItem,
      }),
      container,
    )

    expect(container.querySelector('file-item-desktop[data-id="2"]')).toBe(firstTwo)
    expect(container.querySelector('file-item-desktop[data-id="3"]')).toBe(firstThree)
  })

  it('renders grid virtualization spacer metadata without mounting the full list', () => {
    ensureDefined()

    const renderGridItem = (item: FileListItem) =>
      renderListItemHost({
        item,
        mobile: false,
        selected: false,
        active: false,
        selectionMode: false,
        viewMode: 'grid',
        callbacks: CALLBACKS,
      })

    const container = document.createElement('div')
    renderTemplate(
      renderGridView({
        items: OVERLAP_ITEMS.slice(0, 2),
        totalHeight: 1200,
        offsetY: 400,
        renderItem: renderGridItem,
      }),
      container,
    )

    expect(container.querySelector('.grid-virtual-spacer')?.getAttribute('data-total-height')).toBe('1200')
    expect(container.querySelector('.grid-virtual-window')?.getAttribute('data-offset-y')).toBe('400')
    expect(container.querySelectorAll('file-item-desktop')).toHaveLength(2)
  })

  it('resolves focused item ids for both desktop and mobile item hosts', () => {
    const desktopHost = document.createElement('file-item-desktop')
    desktopHost.setAttribute('data-id', '11')

    const mobileHost = document.createElement('file-item-mobile')
    mobileHost.setAttribute('data-id', '12')

    expect(
      getFocusedItemId({
        composedPath: () => [desktopHost],
      } as Event),
    ).toBe(11)

    expect(
      getFocusedItemId({
        composedPath: () => [mobileHost],
      } as Event),
    ).toBe(12)
  })
})
