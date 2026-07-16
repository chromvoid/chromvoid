import {afterEach, describe, expect, it, vi} from 'vitest'

import {VirtualFileList} from '../../src/features/file-manager/components/virtual-file-list'
import {VirtualFileListMobile} from '../../src/features/file-manager/components/virtual-file-list-mobile'
import type {FileListItem, SearchFilters} from '../../src/shared/contracts/file-manager'

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: true,
  fileTypes: [],
}

const DESKTOP_ROW_HEIGHT = 36

function createItems(count: number): FileListItem[] {
  return Array.from({length: count}, (_, index) => {
    const id = index + 1
    const label = String(id).padStart(2, '0')
    return {
      id,
      path: `/Docs/file-${label}.md`,
      name: `file-${label}.md`,
      isDir: false,
      size: id * 100,
      mimeType: 'text/markdown',
    }
  })
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await element.updateComplete
}

function mockListHeight(height: number) {
  return vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
}

async function setContainerScroll(
  element: HTMLElement & {updateComplete?: Promise<unknown>},
  scrollTop: number,
) {
  const container = element.shadowRoot?.querySelector<HTMLElement>('.list-container')
  expect(container).not.toBeNull()
  container!.scrollTop = scrollTop
  container!.dispatchEvent(new Event('scroll'))
  await settle(element)
  return container!
}

function mockBrowserFocusScroll() {
  return vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    if (options?.preventScroll) return

    if (this.classList.contains('list-container')) {
      this.scrollTop = 0
      return
    }

    const container = this.closest<HTMLElement>('.list-container')
    if (container) {
      container.scrollTop = 0
    }
  })
}

function getDeepActiveElement(): Element | null {
  let active: Element | null = document.activeElement
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }
  return active
}

const MOBILE_LIST_TAG = 'test-virtual-file-list-mobile-restore'
const MOBILE_SCROLL_LIST_TAG = 'test-virtual-file-list-mobile-scroll-restore'

function createMobileListElement(): VirtualFileListMobile {
  if (!customElements.get(MOBILE_LIST_TAG)) {
    customElements.define(MOBILE_LIST_TAG, class extends VirtualFileListMobile {})
  }

  return document.createElement(MOBILE_LIST_TAG) as VirtualFileListMobile
}

function createMobileScrollListElement(): VirtualFileListMobile & {renderedUpdates: number} {
  if (!customElements.get(MOBILE_SCROLL_LIST_TAG)) {
    customElements.define(
      MOBILE_SCROLL_LIST_TAG,
      class extends VirtualFileListMobile {
        renderedUpdates = 0

        override updated(changed: Map<string, unknown>) {
          super.updated(changed)
          this.renderedUpdates += 1
        }
      },
    )
  }

  return document.createElement(MOBILE_SCROLL_LIST_TAG) as VirtualFileListMobile & {
    renderedUpdates: number
  }
}

describe('virtual-file-list viewport restoration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('reflects the mobile platform contract on the production virtual list', async () => {
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = createItems(3)
    element.filters = {...DEFAULT_FILTERS}
    element.mobile = true

    document.body.appendChild(element)
    await settle(element)

    expect(element.hasAttribute('mobile')).toBe(true)

    element.mobile = false
    await settle(element)

    expect(element.hasAttribute('mobile')).toBe(false)
  })

  it('restores saved scroll position and focus target on mount', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    const restored = vi.fn()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = createItems(60)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.restoreViewport = {
      path: '/Docs',
      viewMode: 'list',
      scrollTop: DESKTOP_ROW_HEIGHT * 21,
      activeItemId: 22,
      focusItemId: 22,
      revision: 3,
    }
    element.addEventListener('viewport-state-restored', restored)

    document.body.appendChild(element)
    await settle(element)

    const container = element.shadowRoot?.querySelector<HTMLElement>('.list-container')
    const active = getDeepActiveElement()
    const activeHost = element.shadowRoot?.querySelector('file-item-desktop[data-id="22"]') as
      | (HTMLElement & {active?: boolean})
      | null
    expect(container?.scrollTop).toBe(DESKTOP_ROW_HEIGHT * 21)
    expect(container?.getAttribute('aria-activedescendant')).toBe('file-option-22')
    expect(activeHost?.active).toBe(true)
    expect(active?.getAttribute('data-id')).toBe('22')
    expect(restored).toHaveBeenCalledWith(expect.objectContaining({detail: {revision: 3}}))
  })

  it('restores saved scroll position and focus target for mobile rows on mount', async () => {
    mockListHeight(400)
    const restored = vi.fn()
    const element = createMobileListElement()
    element.items = createItems(60)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 96
    element.currentPath = '/Docs'
    element.mobile = true
    element.restoreViewport = {
      path: '/Docs',
      viewMode: 'list',
      scrollTop: 1680,
      activeItemId: 22,
      focusItemId: 22,
      revision: 4,
    }
    element.addEventListener('viewport-state-restored', restored)

    document.body.appendChild(element)
    await settle(element)

    const container = element.shadowRoot?.querySelector<HTMLElement>('.list-container')
    const active = getDeepActiveElement()
    const activeHost = element.shadowRoot?.querySelector('file-item-mobile[data-id="22"]') as
      | (HTMLElement & {active?: boolean})
      | null
    expect(container?.scrollTop).toBe(1680)
    expect(container?.getAttribute('aria-activedescendant')).toBe('file-option-22')
    expect(active?.tagName.toLowerCase()).toBe('file-item-mobile')
    expect(activeHost?.active).toBe(true)
    expect(active?.getAttribute('data-id')).toBe('22')
    expect(restored).toHaveBeenCalledWith(expect.objectContaining({detail: {revision: 4}}))
  })

  it('emits the current viewport snapshot before opening an item', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    const events: string[] = []
    const viewportChange = vi.fn((event: Event) => {
      events.push('viewport')
      return event
    })
    const itemAction = vi.fn((event: Event) => {
      events.push('action')
      return event
    })
    const items = createItems(12)
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = items
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 96
    element.currentPath = '/Docs'
    element.addEventListener('viewport-state-change', viewportChange)
    element.addEventListener('item-action', itemAction)

    document.body.appendChild(element)
    await settle(element)

    const container = element.shadowRoot?.querySelector<HTMLElement>('.list-container')
    if (container) {
      container.scrollTop = 320
    }

    const item = items[5]!
    element.shadowRoot?.querySelector<HTMLElement>(`file-item-desktop[data-id="${item.id}"]`)?.dispatchEvent(
      new CustomEvent('item-double-click', {
        detail: {item},
        bubbles: true,
        composed: true,
      }),
    )

    expect(events).toEqual(['viewport', 'action'])
    expect(viewportChange).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          path: '/Docs',
          viewMode: 'list',
          scrollTop: 320,
          activeItemId: 1,
          focusItemId: item.id,
        },
      }),
    )
    expect(itemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({action: 'open', item}),
      }),
    )
  })

  it('preserves desktop list scroll when selection mode rerenders visible rows', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = createItems(60)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80
    element.currentPath = '/Docs'

    document.body.appendChild(element)
    await settle(element)

    const container = await setContainerScroll(element, DESKTOP_ROW_HEIGHT * 21)
    element.selectionMode = true
    element.selectedItems = [22]
    await settle(element)

    expect(element.shadowRoot?.querySelector('.list-container')).toBe(container)
    expect(container.scrollTop).toBe(DESKTOP_ROW_HEIGHT * 21)
  })

  it('resets stale scroll when a lazy folder path renders empty before items arrive', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = createItems(60)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.itemsPreFiltered = true

    document.body.appendChild(element)
    await settle(element)

    const container = await setContainerScroll(element, 1680)
    element.currentPath = '/Docs/Nested'
    element.items = []
    await settle(element)

    element.items = createItems(3)
    await settle(element)

    expect(container.scrollTop).toBe(0)
    expect(element.shadowRoot?.querySelector('file-item-desktop[data-id="1"]')).not.toBeNull()
    expect(element.getAttribute('style')).toBeNull()
  })

  it('preserves mobile list scroll when selection mode rerenders visible rows', async () => {
    mockListHeight(400)
    const element = createMobileListElement()
    element.items = createItems(60)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.mobile = true

    document.body.appendChild(element)
    await settle(element)

    const container = await setContainerScroll(element, 1680)
    element.selectionMode = true
    element.selectedItems = [22]
    await settle(element)

    expect(element.shadowRoot?.querySelector('.list-container')).toBe(container)
    expect(container.scrollTop).toBe(1680)
  })

  it('skips mobile virtual list rerenders for scroll deltas inside the same virtual row', async () => {
    mockListHeight(400)
    const element = createMobileScrollListElement()
    element.items = createItems(60)
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.mobile = true

    document.body.appendChild(element)
    await settle(element)

    const container = await setContainerScroll(element, 10)
    const updatesAfterFirstScroll = element.renderedUpdates

    container.scrollTop = 20
    container.dispatchEvent(new Event('scroll'))
    await settle(element)

    expect(element.renderedUpdates).toBe(updatesAfterFirstScroll)

    container.scrollTop = 80
    container.dispatchEvent(new Event('scroll'))
    await settle(element)

    expect(element.renderedUpdates).toBeGreaterThan(updatesAfterFirstScroll)
  })

  it('preserves mobile list scroll when contextmenu enters selection mode on a visible row', async () => {
    mockListHeight(400)
    mockBrowserFocusScroll()
    const items = createItems(60)
    const element = createMobileListElement()
    element.items = items
    element.filters = {...DEFAULT_FILTERS}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.mobile = true
    element.addEventListener('selection-mode-requested', (event) => {
      element.selectionMode = (event as CustomEvent<{enabled: boolean}>).detail.enabled
    })
    element.addEventListener('selection-change', (event) => {
      element.selectedItems = (event as CustomEvent<{selectedItems: number[]}>).detail.selectedItems
    })

    document.body.appendChild(element)
    await settle(element)

    const container = await setContainerScroll(element, 1680)
    const item = items[21]!
    const host = element.shadowRoot?.querySelector<HTMLElement>(`file-item-mobile[data-id="${item.id}"]`)
    expect(host).not.toBeNull()

    host!.dispatchEvent(
      new CustomEvent('item-context-menu', {
        detail: {
          item,
          event: new MouseEvent('contextmenu', {bubbles: true, cancelable: true}),
        },
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    expect(element.selectionMode).toBe(true)
    expect(element.selectedItems).toEqual([item.id])
    expect(container.scrollTop).toBe(1680)
  })

  it('preserves table scroll when selecting a visible row checkbox', async () => {
    mockListHeight(400)
    mockBrowserFocusScroll()
    const items = createItems(60)
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = items
    element.filters = {...DEFAULT_FILTERS, viewMode: 'table'}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.selectionMode = true
    element.addEventListener('selection-change', (event) => {
      element.selectedItems = (event as CustomEvent<{selectedItems: number[]}>).detail.selectedItems
    })

    document.body.appendChild(element)
    await settle(element)

    const container = await setContainerScroll(element, DESKTOP_ROW_HEIGHT * 21)
    const item = items[21]!
    const checkbox = element.shadowRoot?.querySelector<HTMLElement>(
      `.selection-checkbox[data-id="${item.id}"]`,
    )
    expect(checkbox).not.toBeNull()

    checkbox!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    expect(element.selectedItems).toEqual([item.id])
    expect(container.scrollTop).toBe(DESKTOP_ROW_HEIGHT * 21)
  })

  it('keeps saved scroll when cross-view restore focus target is missing', async () => {
    mockListHeight(400)
    VirtualFileList.define()
    const restored = vi.fn()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = createItems(60)
    element.filters = {...DEFAULT_FILTERS, viewMode: 'list'}
    element.itemHeight = 80
    element.currentPath = '/Docs'
    element.restoreViewport = {
      path: '/Docs',
      viewMode: 'grid',
      scrollTop: 1680,
      activeItemId: 999,
      focusItemId: 999,
      revision: 5,
    }
    element.addEventListener('viewport-state-restored', restored)

    document.body.appendChild(element)
    await settle(element)

    const container = element.shadowRoot?.querySelector<HTMLElement>('.list-container')
    expect(container?.scrollTop).toBe(1680)
    expect(container?.getAttribute('aria-activedescendant')).toBe(
      `file-option-${Math.floor(1680 / DESKTOP_ROW_HEIGHT) + 1}`,
    )
    expect(restored).toHaveBeenCalledWith(expect.objectContaining({detail: {revision: 5}}))
  })
})
