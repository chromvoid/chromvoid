import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import * as fileLoader from '../../src/features/media/components/file-loader'
import {FilePreview} from '../../src/features/file-manager/components/file-preview'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const originalNavigatorShare = navigator.share
const originalNavigatorCanShare = navigator.canShare
const originalTauriInternals = (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__

function ensureDefined() {
  FilePreview.define()
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await Promise.resolve()
  await element.updateComplete
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return {promise, resolve, reject}
}

describe('file-preview component', () => {
  beforeEach(() => {
    ensureDefined()
    setRuntimeCapabilities({desktop: true, supports_open_external: true})
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    document.body.innerHTML = ''
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
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
      configurable: true,
      writable: true,
      value: originalTauriInternals,
    })
    vi.restoreAllMocks()
  })

  it('does not mount Markdown editor content inside the generic preview shell', async () => {
    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 12, fileName: 'notes.md', mode: 'markdown'} as any
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('markdown-preview')).toBeNull()
    expect(element.shadowRoot?.querySelector('.fallback-card')).not.toBeNull()
  })

  it('renders text preview content', async () => {
    vi.spyOn(fileLoader, 'loadTextFileById').mockResolvedValue({
      text: 'hello from preview',
      size: 18,
      mimeType: 'text/plain',
    })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 1, fileName: 'notes.txt', mode: 'text'}
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.text-preview')?.textContent).toContain('hello from preview')
  })

  it('renders audio preview player', async () => {
    vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'http://asset.localhost/audio-preview',
      size: 5,
      mimeType: 'audio/mpeg',
      release: vi.fn(),
    })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 2, fileName: 'track.mp3', mode: 'audio'}
    document.body.appendChild(element)
    await settle(element)

    const audio = element.shadowRoot?.querySelector<HTMLAudioElement>('audio.audio-preview')
    expect(audio).not.toBeNull()
    expect(audio?.getAttribute('src')).toBe('http://asset.localhost/audio-preview')
  })

  it('renders converted HEIC image previews through the preview-image variant', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'http://asset.localhost/converted-preview',
      size: 4,
      mimeType: 'image/webp',
      release: vi.fn(),
    })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 5, fileName: 'scan.heic', mimeType: 'image/heic', mode: 'image'}
    document.body.appendChild(element)
    await settle(element)

    const image = element.shadowRoot?.querySelector<HTMLImageElement>('img.image-preview')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toBe('http://asset.localhost/converted-preview')
    expect(loadSpy).toHaveBeenCalledWith(
      5,
      'scan.heic',
      expect.objectContaining({
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    )
  })

  it('falls back when text preview exceeds the byte limit', async () => {
    vi.spyOn(fileLoader, 'loadTextFileById').mockRejectedValue(
      new fileLoader.FileLoadError('TEXT_TOO_LARGE', 'TEXT_TOO_LARGE:1048576'),
    )

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 3, fileName: 'big.log', mode: 'text'}
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.fallback-card')).not.toBeNull()
    expect(element.shadowRoot?.textContent).toContain('Text preview is limited')
  })

  it('ignores stale text load results after preview data switches', async () => {
    const firstLoad = deferred<Awaited<ReturnType<typeof fileLoader.loadTextFileById>>>()
    vi.spyOn(fileLoader, 'loadTextFileById')
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce({
        text: 'fresh preview',
        size: 13,
        mimeType: 'text/plain',
      })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 10, fileName: 'old.txt', mode: 'text'}
    document.body.appendChild(element)
    await Promise.resolve()

    element.data = {fileId: 11, fileName: 'fresh.txt', mode: 'text'}
    await settle(element)

    firstLoad.resolve({
      text: 'stale preview',
      size: 13,
      mimeType: 'text/plain',
    })
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('fresh preview')
    expect(element.shadowRoot?.textContent).not.toContain('stale preview')
  })

  it('releases stale media load results after preview data switches', async () => {
    const firstLoad = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    const staleRelease = vi.fn()
    vi.spyOn(fileLoader, 'loadFileSourceById')
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce({
        kind: 'asset-file',
        url: 'http://asset.localhost/fresh-audio',
        size: 5,
        mimeType: 'audio/mpeg',
        release: vi.fn(),
      })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 12, fileName: 'old.mp3', mode: 'audio'}
    document.body.appendChild(element)
    await Promise.resolve()

    element.data = {fileId: 13, fileName: 'fresh.mp3', mode: 'audio'}
    await settle(element)

    firstLoad.resolve({
      kind: 'asset-file',
      url: 'http://asset.localhost/stale-audio',
      size: 5,
      mimeType: 'audio/mpeg',
      release: staleRelease,
    })
    await settle(element)

    expect(element.shadowRoot?.querySelector('audio.audio-preview')?.getAttribute('src')).toBe(
      'http://asset.localhost/fresh-audio',
    )
    expect(staleRelease).toHaveBeenCalledTimes(1)
  })

  it('falls back when image decoding fails inside the browser', async () => {
    const release = vi.fn()
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'http://asset.localhost/image-preview',
      size: 5,
      mimeType: 'image/webp',
      release,
    })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 4, fileName: 'scan.heic', mode: 'image'}
    document.body.appendChild(element)
    await settle(element)

    const image = element.shadowRoot?.querySelector<HTMLImageElement>('img.image-preview')
    expect(image).not.toBeNull()

    image?.dispatchEvent(new Event('error'))
    await settle(element)

    expect(element.shadowRoot?.querySelector('.fallback-card')).not.toBeNull()
    expect(element.shadowRoot?.textContent).toContain('could not be decoded')
    expect(release).toHaveBeenCalledTimes(1)
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('releases media source on disconnect', async () => {
    const release = vi.fn()
    vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'http://asset.localhost/audio-preview',
      size: 5,
      mimeType: 'audio/mpeg',
      release,
    })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 6, fileName: 'track.mp3', mode: 'audio'}
    document.body.appendChild(element)
    await settle(element)

    element.remove()

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('disables the system open fallback action while the file is being prepared', async () => {
    const element = document.createElement('file-preview') as FilePreview
    element.externalOpenPending = true
    element.data = {fileId: 8, fileName: 'report.pdf', mimeType: 'application/pdf', mode: 'fallback'}
    document.body.appendChild(element)
    await settle(element)

    const primaryButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.fallback-actions .action-btn',
    )
    expect(primaryButton?.disabled).toBe(true)
    expect(primaryButton?.textContent).toContain('Preparing file...')
    expect(primaryButton?.querySelector('cv-spinner')).not.toBeNull()
  })

  it('dims the preview and disables the native share action while share is preparing', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true, supports_native_share: true})
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
    vi.spyOn(fileLoader, 'loadTextFileById').mockResolvedValue({
      text: 'hello from preview',
      size: 18,
      mimeType: 'text/plain',
    })

    const element = document.createElement('file-preview') as FilePreview
    element.sharePending = true
    element.data = {fileId: 9, fileName: 'notes.txt', mode: 'text'}
    document.body.appendChild(element)
    await settle(element)

    const shareButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.header-actions [data-action="share"], .header-actions .action-btn[aria-label="Preparing file..."]',
    )
    expect(shareButton).not.toBeNull()
    expect(shareButton?.disabled).toBe(true)
    expect(shareButton?.querySelector('cv-spinner')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.share-pending-overlay')).not.toBeNull()
    expect(element.shadowRoot?.textContent).toContain('Preparing file...')
  })

  it('shows a native header share action for normal preview modes and emits share action events', async () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true, supports_native_share: true})
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
    vi.spyOn(fileLoader, 'loadTextFileById').mockResolvedValue({
      text: 'hello from preview',
      size: 18,
      mimeType: 'text/plain',
    })

    const actions: Array<{action: string; fileId: number}> = []
    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 9, fileName: 'notes.txt', mode: 'text'}
    element.addEventListener('action', ((event: CustomEvent<{action: string; fileId: number}>) => {
      actions.push(event.detail)
    }) as EventListener)

    document.body.appendChild(element)
    await settle(element)

    const shareButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.header-actions [aria-label="Share"]',
    )
    expect(shareButton).not.toBeNull()

    shareButton?.click()

    expect(actions).toEqual([{action: 'share', fileId: 9}])
  })

  it('shows a native header share action inside Tauri even without Web Share API', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true, supports_native_share: true})
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
    vi.spyOn(fileLoader, 'loadTextFileById').mockResolvedValue({
      text: 'hello from preview',
      size: 18,
      mimeType: 'text/plain',
    })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 11, fileName: 'notes.txt', mode: 'text'}
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.header-actions [aria-label="Share"]')).not.toBeNull()
  })

  it('does not show the preview header share action without native share support', async () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true})
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
    vi.spyOn(fileLoader, 'loadTextFileById').mockResolvedValue({
      text: 'hello from preview',
      size: 18,
      mimeType: 'text/plain',
    })

    const element = document.createElement('file-preview') as FilePreview
    element.data = {fileId: 10, fileName: 'notes.txt', mode: 'text'}
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.header-actions [aria-label="Share"]')).toBeNull()
  })
})
