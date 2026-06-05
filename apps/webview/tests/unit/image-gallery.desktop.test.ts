import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {ImageGallery} from '../../src/features/media/components/image-gallery-v2/image-gallery-desktop'
import type {ImageGalleryViewerModel} from '../../src/features/media/components/image-gallery-v2/gallery-viewer.model'

const IMAGES = [
  {id: 1, name: 'one.jpg', path: '/one.jpg', size: 12, lastModified: 111, mimeType: 'image/jpeg'},
  {id: 2, name: 'two.heic', path: '/two.heic', size: 24, lastModified: 222, mimeType: 'image/heic'},
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

  it('renders desktop viewer actions, keeps info local, and emits file actions for the current image', async () => {
    const element = await mountGallery({currentIndex: 1})
    const actions: Array<{action: string; fileId: number}> = []
    element.addEventListener('action', ((event: CustomEvent<{action: string; fileId: number}>) => {
      actions.push(event.detail)
    }) as EventListener)

    for (const action of ['download', 'open-external', 'save-to-gallery', 'share']) {
      ;(
        element.shadowRoot?.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null
      )?.click()
    }
    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
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

    expect(element.shadowRoot?.querySelector('[data-action="download"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-action="open-external"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-action="info"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-action="save-to-gallery"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[data-action="share"]')).toBeNull()
  })

  it('shows a pending share affordance for the current desktop image', async () => {
    const element = await mountGallery({currentIndex: 1, sharePending: true})

    const shareButton = element.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="share"]')
    expect(shareButton).not.toBeNull()
    expect(shareButton?.disabled).toBe(true)
    expect(shareButton?.querySelector('cv-spinner')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.share-pending-overlay')).not.toBeNull()
    expect(element.shadowRoot?.textContent).toContain('Preparing file...')
  })
})
