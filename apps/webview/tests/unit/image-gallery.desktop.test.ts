import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {ImageGallery} from '../../src/features/media/components/image-gallery-v2/image-gallery-desktop'
import type {ImageGalleryViewerModel} from '../../src/features/media/components/image-gallery-v2/gallery-viewer.model'
import type {CVImageViewer} from '@chromvoid/uikit/components/cv-image-viewer'

const IMAGES = [
  {id: 1, name: 'one.jpg', path: '/one.jpg', size: 12, lastModified: 111, mimeType: 'image/jpeg'},
  {
    id: 2,
    name: 'two.heic',
    path: '/two.heic',
    size: 24,
    lastModified: 222,
    mimeType: 'image/heic',
  },
]

const originalNavigatorShare = navigator.share
const originalNavigatorCanShare = navigator.canShare

async function mountGallery(options?: {currentIndex?: number; sharePending?: boolean}) {
  ImageGallery.define()

  const element = document.createElement('image-gallery') as ImageGallery & {
    model: ImageGalleryViewerModel
  }
  element.images = IMAGES
  element.currentIndex = options?.currentIndex ?? 0
  element.open = true
  element.sharePending = Boolean(options?.sharePending)

  vi.spyOn(element.model, 'open').mockImplementation((images, currentIndex) => {
    element.model.session.setImages(images, currentIndex)
  })
  vi.spyOn(element.model, 'syncImages').mockImplementation((images, currentIndex) => {
    element.model.session.setImages(images, currentIndex)
  })
  vi.spyOn(element.model, 'close').mockImplementation(() => {})
  vi.spyOn(element.model, 'loadCurrentImage').mockResolvedValue(undefined)
  vi.spyOn(element.model, 'preloadAdjacentImages').mockImplementation(() => {})

  document.body.append(element)
  await element.updateComplete
  return element
}

function getViewer(element: ImageGallery) {
  const viewer = element.shadowRoot?.querySelector('cv-image-viewer') as CVImageViewer | null
  expect(viewer).not.toBeNull()
  return viewer!
}

function queryViewer<T extends Element = Element>(element: ImageGallery, selector: string) {
  return getViewer(element).shadowRoot?.querySelector<T>(selector) ?? null
}

describe('image-gallery desktop actions', () => {
  beforeEach(() => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_photo_library_save: true,
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    vi.restoreAllMocks()
    resetRuntimeCapabilities()
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: originalNavigatorShare,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: originalNavigatorCanShare,
    })
  })

  it('sets up and tears down an already-open gallery exactly once per open cycle', async () => {
    const element = await mountGallery()
    const open = vi.mocked(element.model.open)
    const syncImages = vi.mocked(element.model.syncImages)
    const close = vi.mocked(element.model.close)

    expect(open).toHaveBeenCalledTimes(1)
    expect(syncImages).not.toHaveBeenCalled()

    element.requestUpdate()
    await element.updateComplete

    expect(open).toHaveBeenCalledTimes(1)
    expect(syncImages).not.toHaveBeenCalled()

    element.currentIndex = 1
    await element.updateComplete

    expect(syncImages).toHaveBeenCalledTimes(1)

    element.open = false
    await element.updateComplete

    expect(close).toHaveBeenCalledTimes(1)

    element.open = true
    await element.updateComplete

    expect(open).toHaveBeenCalledTimes(2)
    expect(syncImages).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('restores focus to an element active inside a shadow root', async () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({mode: 'open'})
    const button = document.createElement('button')
    shadow.append(button)
    document.body.append(host)
    button.focus()
    const focus = vi.spyOn(button, 'focus')

    const element = await mountGallery()
    await element.updateComplete

    element.open = false
    await element.updateComplete

    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('renders the desktop overlay through cv-image-viewer', async () => {
    const element = await mountGallery()

    const viewer = getViewer(element)
    expect(viewer.open).toBe(true)
    expect(viewer.layout).toBe('desktop')
    expect(queryViewer(element, '[part="base"]')?.hasAttribute('role')).toBe(false)
  })

  it('emits desktop route navigation from viewer input events', async () => {
    const element = await mountGallery()
    const navigates: Array<{index: number; direction: string}> = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number; direction: string}>) => {
      navigates.push(event.detail)
    }) as EventListener)

    getViewer(element).dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {index: 1, itemId: 2, direction: 'forward', source: 'control'},
        bubbles: true,
        composed: true,
      }),
    )

    expect(navigates).toEqual([{index: 1, direction: 'forward'}])
  })

  it('does not emit duplicate desktop navigation from committed viewer changes', async () => {
    const element = await mountGallery()
    const navigate = vi.fn()
    element.addEventListener('navigate', navigate)

    getViewer(element).dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {index: 1, itemId: 2, direction: 'forward', source: 'programmatic'},
        bubbles: true,
        composed: true,
      }),
    )

    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders desktop viewer actions, keeps info local, and emits file actions for the current image', async () => {
    const element = await mountGallery({currentIndex: 1})
    const actions: Array<{action: string; fileId: number}> = []
    element.addEventListener('action', ((event: CustomEvent<{action: string; fileId: number}>) => {
      actions.push(event.detail)
    }) as EventListener)

    for (const action of ['download', 'open-external', 'save-to-gallery', 'share']) {
      ;(queryViewer<HTMLElement>(element, `[data-action="${action}"]`) as HTMLElement | null)?.click()
    }
    ;(queryViewer<HTMLElement>(element, '[data-action="info"]') as HTMLElement | null)?.click()
    await element.updateComplete

    expect(actions).toEqual([
      {action: 'download', fileId: 2},
      {action: 'open-external', fileId: 2},
      {action: 'save-to-gallery', fileId: 2},
      {action: 'share', fileId: 2},
    ])
    expect(element.shadowRoot?.textContent).toContain('two.heic')
    expect(element.shadowRoot?.textContent).toContain('image/heic')
    await vi.waitFor(() => {
      expect(element.shadowRoot?.querySelector('.info-panel')).not.toBeNull()
    })
    expect(element.shadowRoot?.textContent).toContain('/two.heic')
  })

  it('keeps shared desktop actions visible when share and save are unavailable', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: vi.fn(() => false),
    })

    const element = await mountGallery()

    expect(queryViewer(element, '[data-action="download"]')).not.toBeNull()
    expect(queryViewer(element, '[data-action="open-external"]')).not.toBeNull()
    expect(queryViewer(element, '[data-action="info"]')).not.toBeNull()
    expect(queryViewer(element, '[data-action="save-to-gallery"]')).toBeNull()
    expect(queryViewer(element, '[data-action="share"]')).toBeNull()
  })

  it('shows a pending share affordance for the current desktop image', async () => {
    const element = await mountGallery({currentIndex: 1, sharePending: true})

    const shareButton = queryViewer<HTMLElement>(element, '[data-action="share"]')
    expect(shareButton).not.toBeNull()
    expect((shareButton as HTMLElementTagNameMap['cv-menu-item'])?.disabled).toBe(true)
    expect(shareButton?.querySelector('cv-spinner')).not.toBeNull()
    expect(queryViewer(element, '[part="busy-overlay"]')).not.toBeNull()
    expect(getViewer(element).shadowRoot?.textContent).toContain('Preparing file...')
  })
})
