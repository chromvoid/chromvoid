import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {androidSystemBackModel} from '../../src/app/navigation/android-system-back.model'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {ImageGalleryMobile} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile'
import {MobileThumbnailStripFollowController} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-thumbnail-strip-scroll-controller'
import {ImageGalleryMobileTrack} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-track'
import type {
  MobileGalleryBackAction,
  MobileGalleryTrackSlot,
  MobileGalleryTrackSlotSnapshot,
} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile.model'
import type {MobileGalleryImageMeta} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile.types'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const IMAGES = [
  {id: 1, name: 'one.jpg', mimeType: 'image/jpeg'},
  {id: 2, name: 'two.heic', mimeType: 'image/heic'},
  {id: 3, name: 'three.jpg', mimeType: 'image/jpeg'},
  {id: 4, name: 'four.jpg', mimeType: 'image/jpeg'},
]
const STRIP_IMAGES = Array.from({length: 16}, (_, index) => ({
  id: index + 1,
  name: `${index + 1}.jpg`,
  mimeType: 'image/jpeg',
}))

const originalNavigatorShare = navigator.share
const originalNavigatorCanShare = navigator.canShare
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
const originalTauriInternals = (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__

type MobileGalleryHarness = ImageGalleryMobile & {
  model: {
    session: {
      setImages: (images: MobileGalleryImageMeta[], currentIndex: number) => void
    }
    open: (images: MobileGalleryImageMeta[], currentIndex: number) => void
    syncImages: (images: MobileGalleryImageMeta[], currentIndex: number) => void
    setImages: (images: MobileGalleryImageMeta[], currentIndex: number) => void
    loadCurrentImage: () => Promise<void>
    preloadAdjacentImages: () => void
    navigate: (index: number, options?: {syncThumbnailCenter?: boolean}) => void
    primeImage: (index: number) => void
    primeThumbnailVirtualWindow: (index: number) => void
    captureVisibleTrackSlot: (index: number) => MobileGalleryTrackSlotSnapshot | null
    peekVisiblePanelUrl: (index: number) => string | null
    peekThumbnailStripUrl: (index: number) => string | null
    setThumbnailScrollCenterIndex: (index: number) => void
    setThumbnailProgrammaticScrollCenterIndex: (index: number) => void
    handleImageRenderError: (imageId: number | null, sourceUrl: string | null) => void
    currentImageUrl: {
      (): string | null
      set: (value: string | null) => void
    }
    loading: {
      (): boolean
      set: (value: boolean) => void
    }
    loadingImageIds: {
      (): number[]
      set: (value: number[]) => void
    }
  }
  mobileModel: {
    setup: (
      imageCount: number,
      currentIndex: number,
      snapshotResolver: (index: number) => MobileGalleryTrackSlotSnapshot | null,
    ) => void
    teardown: () => void
    syncFromProps: (
      imageCount: number,
      currentIndex: number,
      snapshotResolver: (index: number) => MobileGalleryTrackSlotSnapshot | null,
    ) => 'keep-local' | 'external-sync'
    fillEmptyTrackSlotsIfIdle: () => void
    handleBack: () => MobileGalleryBackAction
    handleImageRenderError: (imageId: number | null) => void
    getPendingThumbnailStripFollow: () => {index: number; behavior: ScrollBehavior} | null
    openExternalBrowserUrl: (url: string) => void
    state: {
      photoMetadata: {set: (value: unknown) => void}
      photoMetadataLoading: {set: (value: boolean) => void}
      photoMetadataError: {set: (value: string | null) => void}
      zoomScale: () => number
      dismissOffsetY: () => number
    }
  }
  handleTouchStart: (event: TouchEvent) => void
  handleTouchMove: (event: TouchEvent) => void
  handleTouchEnd: (event?: TouchEvent) => void
  displayIndex: number
  gestureState: string
  queuedDelta: number
  activeSettleDirection: number
  pendingRouteSyncIndices: number[]
  infoSheetOpen: boolean
  infoSheetDetent: string
  chromeVisible: boolean
  handleTouchCancel: () => void
  onImagesUpdated: () => void
}

type TestTouchEvent = TouchEvent & {
  preventDefault: ReturnType<typeof vi.fn>
  stopPropagation: ReturnType<typeof vi.fn>
}

function touchEvent(x: number, y = 24, cancelable?: boolean): TestTouchEvent {
  return {
    touches: [{clientX: x, clientY: y}],
    cancelable: cancelable ?? false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as TestTouchEvent
}

function touchEndEvent(x: number, y = 24) {
  return {
    changedTouches: [{clientX: x, clientY: y}],
    stopPropagation: vi.fn(),
  } as unknown as TestTouchEvent
}

async function flush(element: ImageGalleryMobile) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()

  const trackHost = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'image-gallery-mobile-track',
  )
  const stripHost = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'image-gallery-mobile-thumbnail-strip',
  )

  await trackHost?.updateComplete
  await stripHost?.updateComplete
  await Promise.resolve()
}

function createTrackSnapshot(
  images: readonly {id: number}[],
  index: number,
  srcPrefix = 'slot',
  loadingIds: number[] = [],
): MobileGalleryTrackSlotSnapshot | null {
  const image = images[index]
  if (!image) {
    return null
  }

  return {
    imageIndex: index,
    imageId: image.id,
    src: `${srcPrefix}:${index}`,
    loading: loadingIds.includes(image.id),
  }
}

async function mountGallery(options?: {
  currentIndex?: number
  images?: MobileGalleryImageMeta[]
  sharePending?: boolean
  setupModel?: (element: MobileGalleryHarness) => void
}) {
  ImageGalleryMobile.define()

  const element = document.createElement('image-gallery-mobile') as MobileGalleryHarness
  element.images = options?.images ?? IMAGES
  element.currentIndex = options?.currentIndex ?? 0
  element.open = true
  element.sharePending = Boolean(options?.sharePending)

  vi.spyOn(element.model, 'open').mockImplementation((images, currentIndex) => {
    element.model.session.setImages(images, currentIndex)
  })
  vi.spyOn(element.model, 'syncImages').mockImplementation((images, currentIndex) => {
    element.model.session.setImages(images, currentIndex)
  })
  vi.spyOn(element.model, 'loadCurrentImage').mockResolvedValue(undefined)
  vi.spyOn(element.model, 'preloadAdjacentImages').mockImplementation(() => {})
  vi.spyOn(element.model, 'navigate').mockImplementation(() => {})
  vi.spyOn(element.model, 'primeImage').mockImplementation(() => {})
  vi.spyOn(element.model, 'primeThumbnailVirtualWindow').mockImplementation(() => {})
  vi.spyOn(element.model, 'setThumbnailScrollCenterIndex').mockImplementation(() => {})
  vi.spyOn(element.model, 'setThumbnailProgrammaticScrollCenterIndex').mockImplementation(() => {})
  options?.setupModel?.(element)

  document.body.append(element)
  await flush(element)
  return element
}

function swipeLeft(element: MobileGalleryHarness) {
  element.handleTouchStart(touchEvent(120))
  element.handleTouchMove(touchEvent(24))
  element.handleTouchEnd()
}

function swipeRight(element: MobileGalleryHarness) {
  element.handleTouchStart(touchEvent(24))
  element.handleTouchMove(touchEvent(120))
  element.handleTouchEnd()
}

function mockMainRect(element: ImageGalleryMobile, width = 240, height = 360) {
  const main = element.shadowRoot?.querySelector('.main') as HTMLElement | null
  expect(main).not.toBeNull()
  vi.spyOn(main!, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect)
}

function getTrackHost(element: ImageGalleryMobile) {
  const trackHost = element.shadowRoot?.querySelector('image-gallery-mobile-track') as HTMLElement | null
  expect(trackHost).not.toBeNull()
  return trackHost
}

function getTrack(element: ImageGalleryMobile) {
  const track = getTrackHost(element).shadowRoot?.querySelector<HTMLElement>('.track') ?? null
  expect(track).not.toBeNull()
  return track
}

function getThumbnailStripHost(element: ImageGalleryMobile) {
  const stripHost = element.shadowRoot?.querySelector(
    'image-gallery-mobile-thumbnail-strip',
  ) as HTMLElement | null
  expect(stripHost).not.toBeNull()
  return stripHost
}

function settle(element: ImageGalleryMobile) {
  getTrack(element)?.dispatchEvent(new Event('transitionend'))
}

async function clickHeaderMenuAction(element: ImageGalleryMobile, action: string) {
  const item = element.shadowRoot?.querySelector<HTMLElement>(`cv-menu-button cv-menu-item[value="${action}"]`)
  expect(item).not.toBeNull()

  item?.click()
  await flush(element)
}

function installScrollIntoViewSpy() {
  const spy = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: spy,
  })
  return spy
}

function installRequestAnimationFrameSpy() {
  return vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
}

describe('image-gallery-mobile fast swipe queue', () => {
  beforeEach(() => {
    clearAppContext()
    ImageGalleryMobile.define()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_share: true,
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
    clearAppContext()
    document.body.innerHTML = ''
    vi.useRealTimers()
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
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: originalScrollIntoView,
    })
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: originalTauriInternals,
    })
  })

  it('shows save-to-gallery only when photo library save is supported', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
    })

    const withoutSave = await mountGallery()
    expect(withoutSave.shadowRoot?.querySelector('cv-menu-item[value="save-to-gallery"]')).toBeNull()

    withoutSave.remove()

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_photo_library_save: true,
    })

    const withSave = await mountGallery()
    expect(withSave.shadowRoot?.querySelector('cv-menu-item[value="save-to-gallery"]')).not.toBeNull()
  })

  it('keeps mobile header info and overflow action order stable', async () => {
    const element = await mountGallery()

    expect(
      [...(element.shadowRoot?.querySelectorAll<HTMLElement>('.header-actions [data-action]') ?? [])].map(
        (button) => button.dataset['action'],
      ),
    ).toEqual(['info'])

    expect(
      [...(element.shadowRoot?.querySelectorAll<HTMLElement>('cv-menu-button cv-menu-item') ?? [])].map(
        (item) => item.getAttribute('value'),
      ),
    ).toEqual(['download', 'open-external', 'save-to-gallery', 'share', 'delete'])

    const deleteAction = element.shadowRoot?.querySelector<HTMLElement>(
      'cv-menu-button cv-menu-item[value="delete"]',
    )
    expect(deleteAction).not.toBeNull()
    expect(deleteAction?.classList.contains('danger')).toBe(true)
  })

  it('sets up an already-open mobile gallery exactly once', async () => {
    const element = document.createElement('image-gallery-mobile') as MobileGalleryHarness
    element.images = IMAGES
    element.currentIndex = 0
    element.open = true

    const setup = vi.spyOn(element.mobileModel, 'setup')
    const open = vi.spyOn(element.model, 'open').mockImplementation((images, currentIndex) => {
      element.model.session.setImages(images, currentIndex)
    })
    const syncImages = vi.spyOn(element.model, 'syncImages').mockImplementation((images, currentIndex) => {
      element.model.session.setImages(images, currentIndex)
    })
    vi.spyOn(element.model, 'loadCurrentImage').mockResolvedValue(undefined)

    document.body.append(element)
    await flush(element)

    expect(open).toHaveBeenCalledTimes(1)
    expect(syncImages).not.toHaveBeenCalled()
    expect(setup).toHaveBeenCalledTimes(1)

    element.requestUpdate()
    await flush(element)

    expect(open).toHaveBeenCalledTimes(1)
    expect(syncImages).not.toHaveBeenCalled()
    expect(setup).toHaveBeenCalledTimes(1)

    element.currentIndex = 1
    await flush(element)

    expect(syncImages).toHaveBeenCalledTimes(1)
  })

  it('shows share actions on Android Tauri even when Web Share API is unavailable', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: {invoke: vi.fn()},
    })

    const element = await mountGallery()

    expect(element.shadowRoot?.querySelector('cv-menu-item[value="share"]')).not.toBeNull()
    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)

    expect(element.shadowRoot?.querySelector('.info-sheet-content [data-action]')).toBeNull()
  })

  it('shows pending share state in the mobile overflow menu', async () => {
    const element = await mountGallery({sharePending: true})

    const menuShare = element.shadowRoot?.querySelector<HTMLElementTagNameMap['cv-menu-item']>(
      'cv-menu-item[value="share"]',
    )
    expect(menuShare).not.toBeNull()
    expect(menuShare?.disabled).toBe(true)
    expect(menuShare?.querySelector('cv-spinner')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.share-pending-overlay')).not.toBeNull()

    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)

    expect(element.shadowRoot?.textContent).toContain('Preparing file...')
  })

  it('renders thumbnail previews for small galleries without side peeks or dots', async () => {
    const element = await mountGallery()
    const stripHost = getThumbnailStripHost(element)

    expect(stripHost.shadowRoot?.querySelector('.thumbnail-strip')).not.toBeNull()
    expect(stripHost.shadowRoot?.querySelectorAll('.thumb-button')).toHaveLength(IMAGES.length)
    expect(element.shadowRoot?.querySelector('.peek')).toBeNull()
    expect(element.shadowRoot?.querySelector('.dots')).toBeNull()
    expect(element.shadowRoot?.querySelector('.scrubber')).toBeNull()
  })

  it('renders no track panels when no mobile model is provided', async () => {
    ImageGalleryMobileTrack.define()

    const track = document.createElement('image-gallery-mobile-track') as ImageGalleryMobileTrack
    track.images = IMAGES

    document.body.append(track)
    await track.updateComplete

    expect(track.shadowRoot?.querySelectorAll('.panel')).toHaveLength(0)
  })

  it('logs mobile loader visibility transitions without duplicate visible spam', async () => {
    ImageGalleryMobileTrack.define()
    localStorage.setItem('chromvoid:image-gallery-debug', '1')

    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    let slots: Partial<MobileGalleryTrackSlot>[] = [
      {
        slotId: 'center',
        role: 'current',
        imageIndex: 0,
        imageId: 1,
        src: null,
        loading: true,
        loaderVisible: true,
        error: null,
        locked: false,
      },
    ]
    const track = document.createElement('image-gallery-mobile-track') as ImageGalleryMobileTrack
    track.images = IMAGES
    track.mobileModel = {
      computed: {
        trackSlots: () => slots,
      },
    }

    try {
      document.body.append(track)
      await track.updateComplete

      track.requestUpdate()
      await track.updateComplete

      slots = [
        {
          ...slots[0],
          src: 'panel:0',
          loading: false,
          loaderVisible: false,
        },
      ]
      track.requestUpdate()
      await track.updateComplete

      const visibleMessages = info.mock.calls.filter(([message]) =>
        String(message).includes('loader.visible'),
      )
      const hiddenMessages = info.mock.calls.filter(([message]) => String(message).includes('loader.hidden'))

      expect(visibleMessages).toHaveLength(1)
      expect(hiddenMessages).toHaveLength(1)
      expect(visibleMessages[0]?.[1]).toMatchObject({
        slotId: 'center',
        role: 'current',
        imageIndex: 0,
        imageId: 1,
      })
      expect(visibleMessages[0]?.[1]).not.toHaveProperty('hadThumbnailPlaceholder')
      expect(hiddenMessages[0]?.[1]).toMatchObject({
        slotId: 'center',
        role: 'current',
        imageIndex: 0,
        imageId: 1,
        reason: 'src',
        loadingAgeMs: expect.any(Number),
      })
      expect(hiddenMessages[0]?.[1]).not.toHaveProperty('hadThumbnailPlaceholder')
    } finally {
      localStorage.removeItem('chromvoid:image-gallery-debug')
      info.mockRestore()
    }
  })

  it('does not expose loaders for adjacent preloaded track slots', async () => {
    ImageGalleryMobileTrack.define()
    localStorage.setItem('chromvoid:image-gallery-debug', '1')

    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const track = document.createElement('image-gallery-mobile-track') as ImageGalleryMobileTrack
    track.images = IMAGES
    track.mobileModel = {
      computed: {
        trackSlots: () => [
          {
            slotId: 'right',
            role: 'next',
            imageIndex: 2,
            imageId: 3,
            src: null,
            loading: true,
            loaderVisible: false,
            error: null,
            locked: false,
          },
        ],
      },
    }

    try {
      document.body.append(track)
      await track.updateComplete

      expect(track.shadowRoot?.querySelector('.panel.next .loading-spinner')?.hasAttribute('hidden')).toBe(
        true,
      )
      expect(info.mock.calls.some(([message]) => String(message).includes('loader.visible'))).toBe(false)
    } finally {
      localStorage.removeItem('chromvoid:image-gallery-debug')
      info.mockRestore()
    }
  })

  it('does not refresh track slots from synchronous panel snapshots before setup', async () => {
    const element = document.createElement('image-gallery-mobile') as MobileGalleryHarness
    element.images = IMAGES
    element.currentIndex = 0
    element.open = false

    const fillSlots = vi.spyOn(element.mobileModel, 'fillEmptyTrackSlotsIfIdle')

    document.body.append(element)
    await flush(element)

    expect(fillSlots).not.toHaveBeenCalled()
  })

  it('refreshes track slots after applying external image updates to the gallery session', () => {
    const element = document.createElement('image-gallery-mobile') as MobileGalleryHarness
    element.images = IMAGES
    element.currentIndex = 1

    const syncFromProps = vi.spyOn(element.mobileModel, 'syncFromProps').mockReturnValue('external-sync')
    const syncImages = vi.spyOn(element.model, 'syncImages').mockImplementation(() => {})
    const fillSlots = vi.spyOn(element.mobileModel, 'fillEmptyTrackSlotsIfIdle')
    vi.spyOn(element.model, 'loadCurrentImage').mockResolvedValue(undefined)

    element.onImagesUpdated()

    expect(syncFromProps).toHaveBeenCalled()
    expect(syncImages).toHaveBeenCalledWith(IMAGES, 1)
    expect(fillSlots).toHaveBeenCalled()
    expect(fillSlots.mock.invocationCallOrder[0]).toBeGreaterThan(
      syncImages.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('keeps a consistent image shell structure when the next image becomes active', async () => {
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'panel'),
        )
        vi.spyOn(gallery.model, 'peekThumbnailStripUrl').mockImplementation(
          (index: number) => `thumb:${index}`,
        )
      },
    })

    const trackHost = getTrackHost(element)
    expect(trackHost.shadowRoot?.querySelectorAll('.panel .image-shell')).toHaveLength(3)
    expect(trackHost.shadowRoot?.querySelector('.panel.current .image-shell.active')).not.toBeNull()

    swipeLeft(element)
    settle(element)
    await flush(element)

    expect(trackHost.shadowRoot?.querySelectorAll('.panel .image-shell')).toHaveLength(3)
    expect(trackHost.shadowRoot?.querySelector('.panel.current .image-shell.active')).not.toBeNull()
  })

  it('uses preview-first urls for swipe panels while the thumbnail strip keeps its own thumbnail lookup', async () => {
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'panel'),
        )
        vi.spyOn(gallery.model, 'peekThumbnailStripUrl').mockImplementation(
          (index: number) => `thumb:${index}`,
        )
      },
    })

    const trackHost = getTrackHost(element)
    const stripHost = getThumbnailStripHost(element)
    const panelSources = [
      ...(trackHost.shadowRoot?.querySelectorAll('.track .panel .gallery-image') ?? []),
    ].map((image) => image.getAttribute('src'))
    const thumbnailSources = [...(stripHost.shadowRoot?.querySelectorAll('.thumbnail-strip img') ?? [])].map(
      (image) => image.getAttribute('src'),
    )

    expect(panelSources).toEqual(['panel:0', 'panel:1', 'panel:2'])
    expect(thumbnailSources).toEqual(['thumb:0', 'thumb:1', 'thumb:2', 'thumb:3'])
  })

  it('routes mobile track image render failures to the shared gallery model', async () => {
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'panel'),
        )
        vi.spyOn(gallery.model, 'handleImageRenderError').mockImplementation(() => {})
      },
    })

    const trackHost = getTrackHost(element)
    const image = trackHost.shadowRoot?.querySelector<HTMLImageElement>('.panel.current .gallery-image')
    expect(image).not.toBeNull()

    image?.dispatchEvent(new Event('error'))

    expect(element.model.handleImageRenderError).toHaveBeenCalledWith(2, 'panel:1')
  })

  it('renders a bounded virtual thumbnail strip for large galleries', async () => {
    const largeImages = Array.from({length: 1000}, (_, index) => ({
      id: index + 1,
      name: `${index + 1}.jpg`,
      mimeType: 'image/jpeg',
    }))
    const element = await mountGallery({
      currentIndex: 500,
      images: largeImages,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'peekThumbnailStripUrl').mockImplementation(
          (index: number) => `thumb:${index}`,
        )
      },
    })

    const stripHost = getThumbnailStripHost(element)
    let buttons = [...(stripHost.shadowRoot?.querySelectorAll<HTMLButtonElement>('.thumb-button') ?? [])]
    let activeThumb = stripHost.shadowRoot?.querySelector<HTMLButtonElement>('.thumb-button.active')

    expect(buttons.length).toBeLessThanOrEqual(32)
    expect(activeThumb?.dataset.index).toBe('500')

    element.currentIndex = 900
    await flush(element)

    buttons = [...(stripHost.shadowRoot?.querySelectorAll<HTMLButtonElement>('.thumb-button') ?? [])]
    activeThumb = stripHost.shadowRoot?.querySelector<HTMLButtonElement>('.thumb-button.active')

    expect(buttons.length).toBeLessThanOrEqual(32)
    expect(activeThumb?.dataset.index).toBe('900')
  })

  it('reports thumbnail strip scroll center intent to the gallery model', async () => {
    const element = await mountGallery({currentIndex: 500, images: STRIP_IMAGES})
    const stripHost = getThumbnailStripHost(element)
    const strip = stripHost.shadowRoot?.querySelector<HTMLElement>('.thumbnail-strip')
    const reportCenter = vi.spyOn(element.model, 'setThumbnailScrollCenterIndex')

    expect(strip).not.toBeNull()
    Object.defineProperty(strip, 'clientWidth', {
      configurable: true,
      value: 128,
    })
    Object.defineProperty(strip, 'scrollLeft', {
      configurable: true,
      value: 640,
    })

    strip?.dispatchEvent(new Event('scroll'))

    expect(reportCenter).toHaveBeenCalledWith(11)
  })

  it('animates thumbnail follow scroll and commits the model center after the final frame', () => {
    const strip = document.createElement('div')
    Object.defineProperty(strip, 'clientWidth', {
      configurable: true,
      value: 128,
    })
    Object.defineProperty(strip, 'scrollWidth', {
      configurable: true,
      value: STRIP_IMAGES.length * 64,
    })
    const complete = vi.fn()
    let frame: FrameRequestCallback | null = null
    const controller = new MobileThumbnailStripFollowController({
      thumbnailStepPx: 64,
      getImageCount: () => STRIP_IMAGES.length,
      onComplete: complete,
      prefersReducedMotion: () => false,
      requestAnimationFrame: (callback) => {
        frame = callback
        return 1
      },
      cancelAnimationFrame: vi.fn(),
    })

    expect(controller.start({strip, index: 9, behavior: 'smooth'})).toBe(true)
    expect(strip.scrollLeft).toBe(0)

    frame?.(0)
    expect(strip.scrollLeft).toBe(0)

    frame?.(320)
    expect(strip.scrollLeft).toBeGreaterThan(0)
    expect(complete).toHaveBeenCalledWith(9)
  })

  it('cancels thumbnail follow animation when user scrolling interrupts it', () => {
    const strip = document.createElement('div')
    Object.defineProperty(strip, 'clientWidth', {
      configurable: true,
      value: 128,
    })
    Object.defineProperty(strip, 'scrollWidth', {
      configurable: true,
      value: STRIP_IMAGES.length * 64,
    })
    const complete = vi.fn()
    const cancelFrame = vi.fn()
    let frame: FrameRequestCallback | null = null
    const controller = new MobileThumbnailStripFollowController({
      thumbnailStepPx: 64,
      getImageCount: () => STRIP_IMAGES.length,
      onComplete: complete,
      prefersReducedMotion: () => false,
      requestAnimationFrame: (callback) => {
        frame = callback
        return 7
      },
      cancelAnimationFrame: cancelFrame,
    })

    controller.start({strip, index: 9, behavior: 'smooth'})
    controller.cancel()
    frame?.(320)

    expect(cancelFrame).toHaveBeenCalledWith(7)
    expect(strip.scrollLeft).toBe(0)
    expect(complete).not.toHaveBeenCalled()
  })

  it('reuses the incoming image node when the swipe target becomes current', async () => {
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'preview'),
        )
        vi.spyOn(gallery.model, 'peekThumbnailStripUrl').mockImplementation(
          (index: number) => `thumb:${index}`,
        )
      },
    })

    const trackHost = getTrackHost(element)
    const incomingBeforeSettle = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel:last-child .gallery-image',
    )
    expect(incomingBeforeSettle?.getAttribute('src')).toBe('preview:2')

    swipeLeft(element)
    settle(element)
    await flush(element)

    const currentAfterSettle = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel.current .gallery-image',
    )
    expect(currentAfterSettle?.getAttribute('src')).toBe('preview:2')
    expect(currentAfterSettle).toBe(incomingBeforeSettle)
  })

  it('keeps the current image visible while the new asset is still loading', async () => {
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'preview', [2]),
        )
      },
    })

    const trackHost = getTrackHost(element)
    expect(trackHost.shadowRoot?.querySelector('.panel.current .gallery-image')).not.toBeNull()
    expect(
      trackHost.shadowRoot?.querySelector('.panel.current .loading-spinner')?.hasAttribute('hidden'),
    ).toBe(true)
  })

  it('only recycles the far-edge slot after commit while preserving visible img nodes and src', async () => {
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'slot'),
        )
      },
    })

    const trackHost = getTrackHost(element)
    const panelsBefore = [...(trackHost.shadowRoot?.querySelectorAll<HTMLElement>('.panel') ?? [])]
    const imagesBefore = panelsBefore.map((panel) => panel.querySelector<HTMLImageElement>('.gallery-image'))
    const slotIdsBefore = panelsBefore.map((panel) => panel.dataset['slotId'])
    const srcBefore = imagesBefore.map((image) => image?.getAttribute('src'))

    swipeLeft(element)

    const imagesDuringSettle = [
      ...(trackHost.shadowRoot?.querySelectorAll<HTMLImageElement>('.panel .gallery-image') ?? []),
    ]
    expect(imagesDuringSettle.map((image) => image.getAttribute('src'))).toEqual(srcBefore)
    expect(imagesDuringSettle[1]).toBe(imagesBefore[1])
    expect(imagesDuringSettle[2]).toBe(imagesBefore[2])

    settle(element)
    await flush(element)

    const panelsAfter = [...(trackHost.shadowRoot?.querySelectorAll<HTMLElement>('.panel') ?? [])]
    const imagesAfter = panelsAfter.map((panel) => panel.querySelector<HTMLImageElement>('.gallery-image'))
    const slotIdsAfter = panelsAfter.map((panel) => panel.dataset['slotId'])

    expect(slotIdsAfter[0]).toBe(slotIdsBefore[1])
    expect(slotIdsAfter[1]).toBe(slotIdsBefore[2])
    expect(slotIdsAfter[2]).toBe(slotIdsBefore[0])
    expect(imagesAfter[0]).toBe(imagesBefore[1])
    expect(imagesAfter[1]).toBe(imagesBefore[2])
    expect(imagesAfter[0]?.getAttribute('src')).toBe('slot:1')
    expect(imagesAfter[1]?.getAttribute('src')).toBe('slot:2')
    expect(imagesAfter[2]?.getAttribute('src')).toBe('slot:3')
  })

  it('keeps exactly three panel containers after repeated route navigations', async () => {
    const element = await mountGallery({
      currentIndex: 1,
      images: STRIP_IMAGES,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'panel'),
        )
      },
    })

    const trackHost = getTrackHost(element)

    for (let index = 0; index < 20; index += 1) {
      element.currentIndex = index % STRIP_IMAGES.length
      await flush(element)
      expect(trackHost.shadowRoot?.querySelectorAll('.panel')).toHaveLength(3)
    }
  })

  it('locks panel src for the same image and rebinds only recycled edge panels', async () => {
    let srcPrefix = 'slot'
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, srcPrefix),
        )
      },
    })

    const trackHost = getTrackHost(element)
    const panelsBefore = [...(trackHost.shadowRoot?.querySelectorAll<HTMLElement>('.panel') ?? [])]
    const imagesBefore = panelsBefore.map((panel) => panel.querySelector<HTMLImageElement>('.gallery-image'))

    srcPrefix = 'raw'
    element.requestUpdate()
    await flush(element)

    expect(imagesBefore[1]?.getAttribute('src')).toBe('slot:1')
    expect(imagesBefore[2]?.getAttribute('src')).toBe('slot:2')

    swipeLeft(element)
    settle(element)
    await flush(element)

    const panelsAfter = [...(trackHost.shadowRoot?.querySelectorAll<HTMLElement>('.panel') ?? [])]
    const imagesAfter = panelsAfter.map((panel) => panel.querySelector<HTMLImageElement>('.gallery-image'))

    expect(imagesAfter[0]).toBe(imagesBefore[1])
    expect(imagesAfter[1]).toBe(imagesBefore[2])
    expect(imagesAfter[0]?.getAttribute('src')).toBe('slot:1')
    expect(imagesAfter[1]?.getAttribute('src')).toBe('slot:2')
    expect(imagesAfter[2]).toBe(imagesBefore[0])
    expect(imagesAfter[2]?.getAttribute('src')).toBe('raw:3')
  })

  it('does not swap the current img src when a better asset arrives after settle', async () => {
    let upgradedSrc: string | null = null
    const element = await mountGallery({
      currentIndex: 1,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) => {
          const snapshot = createTrackSnapshot(gallery.images, index, 'slot')
          if (!snapshot || index !== 2 || !upgradedSrc) {
            return snapshot
          }

          return {
            ...snapshot,
            src: upgradedSrc,
          }
        })
      },
    })

    const trackHost = getTrackHost(element)

    swipeLeft(element)
    settle(element)
    await flush(element)

    const currentBeforeUpgrade = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel.current .gallery-image',
    )
    expect(currentBeforeUpgrade?.getAttribute('src')).toBe('slot:2')

    upgradedSrc = 'raw:2'
    element.requestUpdate()
    await flush(element)

    const currentAfterUpgrade = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel.current .gallery-image',
    )
    expect(currentAfterUpgrade).toBe(currentBeforeUpgrade)
    expect(currentAfterUpgrade?.getAttribute('src')).toBe('slot:2')
  })

  it('emits current-image actions after mobile navigation settles', async () => {
    const element = await mountGallery()
    const actions: Array<{action: string; fileId: number}> = []
    element.addEventListener('action', ((event: CustomEvent<{action: string; fileId: number}>) => {
      actions.push(event.detail)
    }) as EventListener)

    swipeLeft(element)
    settle(element)
    await flush(element)
    await clickHeaderMenuAction(element, 'save-to-gallery')
    await clickHeaderMenuAction(element, 'share')

    expect(actions).toEqual([
      {action: 'save-to-gallery', fileId: 2},
      {action: 'share', fileId: 2},
    ])
  })

  it('opens the info sheet and emits overflow actions for the current image', async () => {
    const element = await mountGallery({currentIndex: 1})
    const actions: Array<{action: string; fileId: number}> = []
    element.addEventListener('action', ((event: CustomEvent<{action: string; fileId: number}>) => {
      actions.push(event.detail)
    }) as EventListener)
    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)
    expect(element.infoSheetOpen).toBe(true)
    expect(element.infoSheetDetent).toBe('middle')
    await clickHeaderMenuAction(element, 'download')
    expect(actions).toEqual([{action: 'download', fileId: 2}])
    expect(element.infoSheetOpen).toBe(false)
    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)
    await clickHeaderMenuAction(element, 'open-external')
    expect(element.infoSheetOpen).toBe(false)
    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)
    await clickHeaderMenuAction(element, 'delete')

    expect(actions).toEqual([
      {action: 'download', fileId: 2},
      {action: 'open-external', fileId: 2},
      {action: 'delete', fileId: 2},
    ])
    expect(element.infoSheetOpen).toBe(false)
  })

  it('closes the info sheet on Android system back before gallery navigation', async () => {
    const element = await mountGallery()
    const goBackFromUi = vi.spyOn(navigationModel, 'goBackFromUi').mockReturnValue(true)
    const close = vi.fn()
    element.addEventListener('close', close)

    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)
    expect(element.infoSheetOpen).toBe(true)

    expect(androidSystemBackModel.handleBack()).toBe(true)
    await flush(element)

    expect(element.infoSheetOpen).toBe(false)
    expect(element.open).toBe(true)
    expect(close).not.toHaveBeenCalled()
    expect(goBackFromUi).not.toHaveBeenCalled()
  })

  it('closes the open gallery on Android system back before route navigation', async () => {
    const element = await mountGallery()
    const goBackFromUi = vi.spyOn(navigationModel, 'goBackFromUi').mockReturnValue(true)
    const close = vi.fn()
    element.addEventListener('close', close)

    expect(element.infoSheetOpen).toBe(false)

    expect(androidSystemBackModel.handleBack()).toBe(true)
    await flush(element)

    expect(close).toHaveBeenCalledTimes(1)
    expect(goBackFromUi).not.toHaveBeenCalled()
  })

  it('closes the info sheet only when the sheet surface reports open=false', async () => {
    const element = await mountGallery()
    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)
    expect(element.infoSheetDetent).toBe('middle')

    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as HTMLElement | null
    expect(sheet).not.toBeNull()

    sheet?.dispatchEvent(new CustomEvent('cv-change', {detail: {value: 'metadata'}, bubbles: true, composed: true}))
    await flush(element)
    expect(element.infoSheetOpen).toBe(true)
    expect(element.infoSheetDetent).toBe('middle')

    sheet?.dispatchEvent(
      new CustomEvent('cv-change', {detail: {open: true, detent: 'expanded'}, bubbles: true, composed: true}),
    )
    await flush(element)
    expect(element.infoSheetOpen).toBe(true)
    expect(element.infoSheetDetent).toBe('expanded')

    sheet?.dispatchEvent(new CustomEvent('cv-change', {detail: {open: false}, bubbles: true, composed: true}))
    await flush(element)
    expect(element.infoSheetOpen).toBe(false)
    expect(element.infoSheetDetent).toBe('collapsed')
  })

  it('renders translated system metadata and mocked photo metadata in the info sheet', async () => {
    const element = await mountGallery({
      images: [
        {
          id: 10,
          name: 'capture.jpg',
          mimeType: 'image/jpeg',
          path: '/Photos/Trips/2026/capture.jpg',
          size: 174_909,
          createdAt: Date.UTC(2026, 3, 21, 7, 42),
          lastModified: Date.UTC(2026, 3, 21, 7, 44),
        },
      ],
    })

    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)
    element.mobileModel.state.photoMetadata.set({
      width: 4000,
      height: 3000,
      dateTaken: '2026-04-21T09:42:33',
      cameraMake: 'Canon',
      cameraModel: 'EOS R6',
      lensModel: 'RF 24-70mm',
      exposureTime: '1/125 s',
      aperture: 'f/2.8',
      iso: 400,
      focalLength: '50 mm',
      orientation: 'Normal',
      gps: {
        latitude: 55.755833,
        longitude: 37.617222,
        altitudeMeters: 156.4,
      },
    })
    element.requestUpdate()
    await flush(element)

    const text = element.shadowRoot?.querySelector('.info-sheet-content')?.textContent ?? ''

    expect(text).toContain('System metadata')
    expect(text).toContain('Type')
    expect(text).toContain('image/jpeg')
    expect(text).toContain('/Photos/Trips/2026/capture.jpg')
    expect(text).toContain('170.81 KB (174,909 B)')
    expect(text).toContain('Created')
    expect(text).toContain('Modified')
    expect(text).toContain('Photo metadata')
    expect(text).toContain('4,000 × 3,000')
    expect(text).toContain('Canon EOS R6')
    expect(text).toContain('RF 24-70mm')
    expect(text).toContain('1/125 s')
    expect(text).toContain('f/2.8')
    expect(text).toContain('400')
    expect(text).toContain('50 mm')
    expect(text).toContain('GPS')
    expect(text).toContain('55.755833')
    expect(text).toContain('37.617222')
    expect(text).not.toContain('Latitude')
    expect(text).not.toContain('Longitude')
    expect(text).toContain('156.4 m')

    const gpsLink = element.shadowRoot?.querySelector<HTMLAnchorElement>('.gps-row .detail-link')
    expect(gpsLink).not.toBeNull()
    expect(gpsLink?.getAttribute('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=55.755833%2C37.617222',
    )
    expect(gpsLink?.getAttribute('target')).toBe('_blank')
    expect(gpsLink?.getAttribute('rel')).toBe('noopener noreferrer')

    const openExternalBrowserUrl = vi
      .spyOn(element.mobileModel, 'openExternalBrowserUrl')
      .mockImplementation(() => {})
    const click = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})
    gpsLink?.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(openExternalBrowserUrl).toHaveBeenCalledWith(gpsLink?.href)
  })

  it('renders GPS coordinates loaded through the app transport without manual rerendering', async () => {
    const imageMetadata = vi.fn(async () => ({
      width: 4000,
      height: 3000,
      gps: {
        latitude: 55.755833,
        longitude: 37.617222,
        altitudeMeters: 156.4,
      },
      gpsDiagnostic: {
        status: 'available',
      },
    }))
    initAppContext(
      createMockAppContext({
        ws: {
          imageMetadata,
        },
      }),
    )
    const element = await mountGallery({
      images: [
        {
          id: 10,
          name: 'capture.jpg',
          mimeType: 'image/jpeg',
          path: '/Photos/Trips/2026/capture.jpg',
          size: 174_909,
          createdAt: Date.UTC(2026, 3, 21, 7, 42),
          lastModified: Date.UTC(2026, 3, 21, 7, 44),
        },
      ],
    })

    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()

    await vi.waitFor(() => {
      expect(imageMetadata).toHaveBeenCalledWith(10, {
        fileName: 'capture.jpg',
        mimeType: 'image/jpeg',
        lastModified: Date.UTC(2026, 3, 21, 7, 44),
      })
    })
    await vi.waitFor(async () => {
      await flush(element)
      const gpsLink = element.shadowRoot?.querySelector<HTMLAnchorElement>('.gps-row .detail-link')

      expect(gpsLink).not.toBeNull()
      expect(gpsLink?.textContent).toContain('55.755833')
      expect(gpsLink?.textContent).toContain('37.617222')
      expect(gpsLink?.getAttribute('href')).toBe(
        'https://www.google.com/maps/search/?api=1&query=55.755833%2C37.617222',
      )
    })

    const text = element.shadowRoot?.querySelector('.info-sheet-content')?.textContent ?? ''

    expect(text).toContain('GPS')
    expect(text).not.toContain('Location may have been removed during import')
    expect(text).not.toContain('Stored GPS metadata is invalid')
    expect(text).not.toContain('Photo is too large for metadata extraction')
  })

  it('renders a GPS import-risk warning when photo metadata has no coordinates', async () => {
    const element = await mountGallery({
      images: [
        {
          id: 12,
          name: 'redacted.jpg',
          mimeType: 'image/jpeg',
          size: 40_000,
          lastModified: Date.UTC(2026, 3, 21, 7, 44),
        },
      ],
    })

    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)
    element.mobileModel.state.photoMetadata.set({
      gpsDiagnostic: {
        status: 'not_found',
        importProvenanceStatus: 'at_risk',
      },
      importProvenance: {
        sourceRevision: 1,
        platform: 'android',
        imageCandidate: true,
        permissionStatus: 'denied',
        requireOriginalStatus: 'not_attempted_permission_missing',
        originalStreamUsed: false,
        regularStreamFallback: true,
      },
    })
    element.requestUpdate()
    await flush(element)

    const text = element.shadowRoot?.querySelector('.info-sheet-content')?.textContent ?? ''

    expect(text).toContain('GPS')
    expect(text).toContain('Location may have been removed during import')
    expect(text).not.toContain('Photo metadata is unavailable')
    expect(element.shadowRoot?.querySelector('.gps-row .detail-link')).toBeNull()
  })

  it('renders photo metadata loading and empty states without a toast-style error', async () => {
    const element = await mountGallery()

    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)

    element.mobileModel.state.photoMetadata.set(null)
    element.mobileModel.state.photoMetadataError.set(null)
    element.mobileModel.state.photoMetadataLoading.set(true)
    element.requestUpdate()
    await flush(element)

    expect(element.shadowRoot?.querySelector('.info-sheet-content')?.textContent).toContain('Loading photo metadata...')

    element.mobileModel.state.photoMetadataLoading.set(false)
    element.mobileModel.state.photoMetadataError.set('Unsupported image')
    element.requestUpdate()
    await flush(element)

    const text = element.shadowRoot?.querySelector('.info-sheet-content')?.textContent ?? ''
    expect(text).toContain('Photo metadata is unavailable')
    expect(text).not.toContain('Unsupported image')
  })

  it('advances one image for a single swipe while idle', async () => {
    const element = await mountGallery()
    const navigated: number[] = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number}>) => {
      navigated.push(event.detail.index)
    }) as EventListener)

    swipeLeft(element)
    expect(element.gestureState).toBe('settling')

    settle(element)
    await flush(element)

    expect(navigated).toEqual([1])
    expect(element.displayIndex).toBe(1)
    expect(element.gestureState).toBe('idle')
  })

  it('re-centers the track only after the committed slide render updates', async () => {
    const element = await mountGallery({currentIndex: 1})

    swipeLeft(element)

    settle(element)

    await flush(element)

    expect(element.displayIndex).toBe(2)
  })

  it('resists edge swipes at the first image without emitting navigation', async () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    const element = await mountGallery()
    const navigated: number[] = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number}>) => {
      navigated.push(event.detail.index)
    }) as EventListener)

    element.handleTouchStart(touchEvent(24))
    element.handleTouchMove(touchEvent(120))

    element.handleTouchEnd(touchEndEvent(120))
    expect(element.activeSettleDirection).toBe(0)
    expect(element.gestureState).toBe('settling')

    settle(element)
    await flush(element)

    expect(navigated).toEqual([])
    expect(element.displayIndex).toBe(0)
    expect(element.gestureState).toBe('idle')
  })

  it('prevents default for cancelable touchmove gestures when requested by the model', async () => {
    const element = await mountGallery()
    const moveEvent = touchEvent(24, 24, true)

    element.handleTouchStart(touchEvent(120))
    element.handleTouchMove(moveEvent)

    expect(moveEvent.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('does not prevent default for non-cancelable touchmove gestures', async () => {
    const element = await mountGallery()
    const moveEvent = touchEvent(24, 24, false)

    element.handleTouchStart(touchEvent(120))
    element.handleTouchMove(moveEvent)

    expect(moveEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('keeps chrome visible after inactivity and still allows explicit center-tap hide/show', async () => {
    vi.useFakeTimers()

    const element = await mountGallery()
    mockMainRect(element)

    expect(element.chromeVisible).toBe(true)

    vi.advanceTimersByTime(2300)
    await flush(element)
    expect(element.chromeVisible).toBe(true)

    element.handleTouchStart(touchEvent(120, 80))
    element.handleTouchEnd(touchEndEvent(120, 80))
    vi.advanceTimersByTime(300)
    await flush(element)

    expect(element.chromeVisible).toBe(false)

    element.handleTouchStart(touchEvent(120, 80))
    element.handleTouchEnd(touchEndEvent(120, 80))
    vi.advanceTimersByTime(300)
    await flush(element)

    expect(element.chromeVisible).toBe(true)
  })

  it('opens the quick action sheet on long press', async () => {
    vi.useFakeTimers()

    const element = await mountGallery()

    element.handleTouchStart(touchEvent(120, 60))
    vi.advanceTimersByTime(450)
    await flush(element)

    expect(element.infoSheetOpen).toBe(true)
    expect(element.infoSheetDetent).toBe('middle')
  })

  it('closes the viewer on a downward swipe while not zoomed', async () => {
    const element = await mountGallery()
    const closed = vi.fn()
    element.addEventListener('close', closed as EventListener)

    const startEvent = touchEvent(120, 48)
    const moveEvent = touchEvent(132, 220)
    const endEvent = touchEndEvent(132, 220)

    element.handleTouchStart(startEvent)
    element.handleTouchMove(moveEvent)
    element.handleTouchEnd(endEvent)
    await flush(element)

    expect(closed).toHaveBeenCalledTimes(1)
    expect(startEvent.stopPropagation).toHaveBeenCalledTimes(1)
    expect(moveEvent.stopPropagation).toHaveBeenCalledTimes(1)
    expect(endEvent.stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('double tap toggles zoom instead of navigating', async () => {
    vi.useFakeTimers()

    const element = await mountGallery()
    mockMainRect(element)

    element.handleTouchStart(touchEvent(120, 80))
    element.handleTouchEnd(touchEndEvent(120, 80))
    vi.advanceTimersByTime(80)
    element.handleTouchStart(touchEvent(124, 82))
    element.handleTouchEnd(touchEndEvent(124, 82))
    await flush(element)

    expect(element.displayIndex).toBe(0)
    expect(element.mobileModel.state.zoomScale()).toBeGreaterThan(1)

    element.handleTouchStart(touchEvent(120, 80))
    element.handleTouchEnd(touchEndEvent(120, 80))
    vi.advanceTimersByTime(80)
    element.handleTouchStart(touchEvent(124, 82))
    element.handleTouchEnd(touchEndEvent(124, 82))
    await flush(element)

    expect(element.mobileModel.state.zoomScale()).toBe(1)
  })

  it('resets dismiss state on touch cancel', async () => {
    vi.useFakeTimers()

    const element = await mountGallery()

    element.handleTouchStart(touchEvent(120, 48))
    element.handleTouchMove(touchEvent(132, 220))
    expect(element.mobileModel.state.dismissOffsetY()).toBeGreaterThan(0)

    element.handleTouchCancel()
    vi.advanceTimersByTime(2300)
    await flush(element)

    expect(element.gestureState).toBe('idle')
    expect(element.mobileModel.state.dismissOffsetY()).toBe(0)
    expect(element.chromeVisible).toBe(true)
  })

  it('queues a second same-direction swipe during settling', async () => {
    const element = await mountGallery({
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'slot'),
        )
      },
    })
    const navigated: number[] = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number}>) => {
      navigated.push(event.detail.index)
    }) as EventListener)

    const trackHost = getTrackHost(element)
    const firstIncomingBefore = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel:last-child .gallery-image',
    )
    expect(firstIncomingBefore?.getAttribute('src')).toBe('slot:1')

    swipeLeft(element)
    swipeLeft(element)

    expect(element.queuedDelta).toBe(1)

    settle(element)
    await flush(element)

    const firstCurrentAfterSettle = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel.current .gallery-image',
    )
    const secondIncomingBefore = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel:last-child .gallery-image',
    )
    expect(firstCurrentAfterSettle).toBe(firstIncomingBefore)
    expect(firstCurrentAfterSettle?.getAttribute('src')).toBe('slot:1')
    expect(secondIncomingBefore?.getAttribute('src')).toBe('slot:2')
    expect(navigated).toEqual([1])
    expect(element.gestureState).toBe('settling')
    expect(element.activeSettleDirection).toBe(1)

    settle(element)
    await flush(element)

    const secondCurrentAfterSettle = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel.current .gallery-image',
    )
    expect(secondCurrentAfterSettle).toBe(secondIncomingBefore)
    expect(secondCurrentAfterSettle?.getAttribute('src')).toBe('slot:2')
    expect(navigated).toEqual([1, 2])
    expect(element.displayIndex).toBe(2)
    expect(element.gestureState).toBe('idle')
  })

  it('adjusts the queued future target when the buffered swipe reverses direction', async () => {
    const element = await mountGallery({currentIndex: 1})
    const navigated: number[] = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number}>) => {
      navigated.push(event.detail.index)
    }) as EventListener)

    swipeLeft(element)
    swipeRight(element)

    expect(element.queuedDelta).toBe(-1)

    settle(element)
    await flush(element)

    expect(navigated).toEqual([2])
    expect(element.gestureState).toBe('settling')
    expect(element.activeSettleDirection).toBe(-1)

    settle(element)
    await flush(element)

    expect(navigated).toEqual([2, 1])
    expect(element.displayIndex).toBe(1)
    expect(element.gestureState).toBe('idle')
  })

  it('clamps queued swipes at the gallery edge', async () => {
    const element = await mountGallery({currentIndex: 1, images: IMAGES.slice(0, 3)})
    const navigated: number[] = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number}>) => {
      navigated.push(event.detail.index)
    }) as EventListener)

    swipeLeft(element)
    swipeLeft(element)
    swipeLeft(element)

    expect(element.queuedDelta).toBe(0)

    settle(element)
    await flush(element)

    expect(navigated).toEqual([2])
    expect(element.displayIndex).toBe(2)
    expect(element.gestureState).toBe('idle')
  })

  it('ignores stale local route sync props after queued navigation commits', async () => {
    const element = await mountGallery()
    const navigated: number[] = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number}>) => {
      navigated.push(event.detail.index)
    }) as EventListener)

    swipeLeft(element)
    swipeLeft(element)

    settle(element)
    await flush(element)
    settle(element)
    await flush(element)

    expect(navigated).toEqual([1, 2])
    expect(element.displayIndex).toBe(2)

    element.currentIndex = 1
    await flush(element)
    expect(element.displayIndex).toBe(2)

    element.currentIndex = 2
    await flush(element)
    expect(element.displayIndex).toBe(2)
    expect(element.pendingRouteSyncIndices).toEqual([])
  })

  it('clears pending settle listeners and timers on teardown', async () => {
    vi.useFakeTimers()

    const element = await mountGallery()
    const navigated: number[] = []
    element.addEventListener('navigate', ((event: CustomEvent<{index: number}>) => {
      navigated.push(event.detail.index)
    }) as EventListener)

    swipeLeft(element)
    swipeLeft(element)

    const track = getTrack(element)

    element.remove()

    track?.dispatchEvent(new Event('transitionend'))
    vi.advanceTimersByTime(500)

    expect(navigated).toEqual([])
    expect(element.gestureState).toBe('idle')
    expect(element.activeSettleDirection).toBe(0)
    expect(element.queuedDelta).toBe(0)
  })

  it('scrolls the active thumbnail into view on initial open in thumbnail-strip mode', async () => {
    const scrollIntoViewSpy = installScrollIntoViewSpy()

    const element = await mountGallery({currentIndex: 8, images: STRIP_IMAGES})
    const stripHost = getThumbnailStripHost(element)
    const activeThumb = stripHost.shadowRoot?.querySelector<HTMLElement>('.thumb-button.active') ?? null
    const strip = stripHost.shadowRoot?.querySelector<HTMLElement>('.thumbnail-strip') ?? null

    expect(activeThumb).not.toBeNull()
    expect(strip?.scrollLeft).toBeGreaterThan(0)
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
    expect(element.mobileModel.getPendingThumbnailStripFollow()).toBeNull()
  })

  it('scrolls the active thumbnail into view on external route sync in thumbnail-strip mode', async () => {
    const scrollIntoViewSpy = installScrollIntoViewSpy()

    const element = await mountGallery({currentIndex: 2, images: STRIP_IMAGES})
    scrollIntoViewSpy.mockClear()

    element.currentIndex = 9
    await flush(element)

    const activeThumb =
      getThumbnailStripHost(element).shadowRoot?.querySelector<HTMLElement>('.thumb-button.active') ?? null
    expect(activeThumb?.dataset.index).toBe('9')
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('rebuilds the track queue on external route sync without changing thumbnail lookup behavior', async () => {
    const element = await mountGallery({
      currentIndex: 2,
      images: STRIP_IMAGES,
      setupModel: (gallery) => {
        vi.spyOn(gallery.model, 'captureVisibleTrackSlot').mockImplementation((index: number) =>
          createTrackSnapshot(gallery.images, index, 'panel'),
        )
        vi.spyOn(gallery.model, 'peekThumbnailStripUrl').mockImplementation(
          (index: number) => `thumb:${index}`,
        )
      },
    })

    const trackHost = getTrackHost(element)
    const currentBefore = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel.current .gallery-image',
    )
    expect(currentBefore?.getAttribute('src')).toBe('panel:2')

    element.currentIndex = 9
    await flush(element)

    const currentAfter = trackHost.shadowRoot?.querySelector<HTMLImageElement>(
      '.panel.current .gallery-image',
    )
    const activeThumb =
      getThumbnailStripHost(element).shadowRoot?.querySelector<HTMLButtonElement>('.thumb-button.active')
    const activeThumbImage = activeThumb?.querySelector<HTMLImageElement>('img')

    expect(currentAfter).toBe(currentBefore)
    expect(currentAfter?.getAttribute('src')).toBe('panel:9')
    expect(activeThumb?.dataset.index).toBe('9')
    expect(activeThumbImage?.getAttribute('src')).toBe('thumb:9')
  })

  it('scrolls the active thumbnail into view after swipe settle in thumbnail-strip mode', async () => {
    const scrollIntoViewSpy = installScrollIntoViewSpy()
    const requestAnimationFrameSpy = installRequestAnimationFrameSpy()

    const element = await mountGallery({currentIndex: 4, images: STRIP_IMAGES})
    scrollIntoViewSpy.mockClear()
    requestAnimationFrameSpy.mockClear()

    swipeLeft(element)
    requestAnimationFrameSpy.mockClear()
    settle(element)
    expect(requestAnimationFrameSpy).toHaveBeenCalled()
    await flush(element)

    const activeThumb =
      getThumbnailStripHost(element).shadowRoot?.querySelector<HTMLElement>('.thumb-button.active') ?? null
    expect(activeThumb?.dataset.index).toBe('5')
    expect(requestAnimationFrameSpy).toHaveBeenCalled()
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('scrolls the active thumbnail into view after direct thumbnail navigation in thumbnail-strip mode', async () => {
    const scrollIntoViewSpy = installScrollIntoViewSpy()
    const requestAnimationFrameSpy = installRequestAnimationFrameSpy()

    const element = await mountGallery({currentIndex: 4, images: STRIP_IMAGES})
    scrollIntoViewSpy.mockClear()
    requestAnimationFrameSpy.mockClear()

    const stripHost = getThumbnailStripHost(element)
    const targetThumb = stripHost.shadowRoot?.querySelector<HTMLElement>('.thumb-button[data-index="9"]')
    expect(targetThumb).not.toBeNull()
    targetThumb?.click()
    expect(requestAnimationFrameSpy).toHaveBeenCalled()
    await flush(element)

    const activeThumb = stripHost.shadowRoot?.querySelector<HTMLElement>('.thumb-button.active')
    expect(activeThumb?.dataset.index).toBe('9')
    expect(requestAnimationFrameSpy).toHaveBeenCalled()
    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('keeps the track host stable across parent overlay rerenders', async () => {
    const element = await mountGallery({currentIndex: 1})
    const trackHost = getTrackHost(element)

    ;(element.shadowRoot?.querySelector('[data-action="info"]') as HTMLButtonElement | null)?.click()
    await flush(element)

    expect(getTrackHost(element)).toBe(trackHost)
  })
})
