import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {MediaMiniPlayer} from '../../src/features/media/components/media-mini-player'
import type {AudioArtworkPreview} from '../../src/features/media/components/audio-artwork-preview'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'
import {i18n} from '../../src/i18n'

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object)
        ? String((value as {cssText: string}).cssText)
        : String(value)
    })
    .join('\n')
}

function seedAudioSession() {
  mediaPlaybackModel.sessionKind.set('audio')
  mediaPlaybackModel.tracks.set([{id: 1, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
  mediaPlaybackModel.currentIndex.set(0)
  mediaPlaybackModel.currentTime.set(4)
  mediaPlaybackModel.duration.set(65)
  mediaPlaybackModel.loadingState.set('loaded')
  mediaPlaybackModel.playbackIntent.set('pause')
  mediaPlaybackModel.playbackState.set('paused')
  mediaPlaybackModel.fullPlayerOpen.set(false)
}

describe('media-mini-player', () => {
  beforeEach(() => {
    MediaMiniPlayer.define()
  })

  afterEach(async () => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    await mediaPlaybackModel.stopSession()
  })

  it('renders nothing without an active audio session', async () => {
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    document.body.append(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.media-mini')).toBeNull()
  })

  it('renders compact playback state from the media playback model', async () => {
    seedAudioSession()
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    element.variant = 'mobile'
    document.body.append(element)
    await element.updateComplete

    const artwork = element.shadowRoot?.querySelector('audio-artwork-preview.media-mini-artwork') as AudioArtworkPreview | null
    expect(artwork?.getAttribute('slot')).toBe('prefix')
    expect(artwork?.getAttribute('variant')).toBe('thumbnail-image')
    expect(artwork?.loadEnabled).toBe(true)
    expect(artwork?.querySelector('.media-mini-fallback-tile')?.getAttribute('slot')).toBe('fallback')
    expect(element.shadowRoot?.querySelector('.media-mini-progress')?.getAttribute('aria-label')).toBe(
      i18n('media:playback-position' as any),
    )
    expect(element.shadowRoot?.querySelector('.media-mini-menu')?.getAttribute('aria-label')).toBe(
      i18n('media:current-track-actions' as any),
    )
    expect(element.shadowRoot?.querySelector('.media-mini-open')?.getAttribute('aria-label')).toBe(
      i18n('media:open-player' as any),
    )
    expect(element.shadowRoot?.querySelector('.media-mini-title')?.textContent).toContain('track.mp3')
    expect(element.shadowRoot?.querySelector('.media-mini-time')?.textContent).toContain('0:04 / 1:05')
  })

  it('opens the full player from the host and non-control mini-player surface', async () => {
    seedAudioSession()
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    document.body.append(element)
    await element.updateComplete
    element.click()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(true)
    mediaPlaybackModel.fullPlayerOpen.set(false)
    ;(element.shadowRoot?.querySelector('.media-mini-title') as HTMLElement | null)?.click()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(true)
    mediaPlaybackModel.fullPlayerOpen.set(false)
    ;(element.shadowRoot?.querySelector('.media-mini') as HTMLElement | null)?.click()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(true)
    mediaPlaybackModel.fullPlayerOpen.set(false)
    ;(element.shadowRoot?.querySelector('.media-mini-open') as HTMLElement | null)?.click()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(true)
    mediaPlaybackModel.fullPlayerOpen.set(false)
    ;(element.shadowRoot?.querySelector('audio-artwork-preview.media-mini-artwork') as HTMLElement | null)?.click()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(true)
    mediaPlaybackModel.fullPlayerOpen.set(false)
    ;(element.shadowRoot?.querySelector('.media-mini-fallback-tile') as HTMLElement | null)?.click()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(true)
  })

  it('keeps play, pause, menu, and overflow stop controls from opening the full player', async () => {
    seedAudioSession()
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    document.body.append(element)
    await element.updateComplete
    const openSpy = vi.spyOn(mediaPlaybackModel, 'openFullPlayer')

    const playButton = element.shadowRoot?.querySelector('.media-mini-button.primary') as HTMLButtonElement | null
    expect(playButton?.getAttribute('aria-label')).toBe(i18n('media:play' as any))
    playButton?.click()
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()

    await Promise.resolve()
    await element.updateComplete
    const pauseButton = element.shadowRoot?.querySelector('.media-mini-button.primary') as HTMLButtonElement | null
    expect(pauseButton?.getAttribute('aria-label')).toBe(i18n('media:pause' as any))
    pauseButton?.click()
    expect(mediaPlaybackModel.playbackIntent()).toBe('pause')
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()

    const menu = element.shadowRoot?.querySelector('.media-mini-menu') as HTMLElementTagNameMap['cv-menu-button'] | null
    expect(menu).not.toBeNull()
    const menuTrigger = menu?.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
    menuTrigger?.click()
    await menu?.updateComplete
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()

    const stopItem = document.body.querySelector('[data-cv-menu-button-portal] cv-menu-item[value="stop"]') as
      | HTMLElement
      | null
    expect(stopItem).not.toBeNull()
    stopItem?.click()

    await vi.waitFor(() => {
      expect(mediaPlaybackModel.sessionKind()).toBe('none')
    })
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('seeks from the compact progress control without opening the full player', async () => {
    seedAudioSession()
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    document.body.append(element)
    await element.updateComplete

    const slider = element.shadowRoot?.querySelector('.media-mini-progress') as HTMLElement | null
    expect(slider).not.toBeNull()

    slider?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 25, percentage: 25 / 65},
        bubbles: true,
        composed: true,
      }),
    )
    expect(mediaPlaybackModel.seekPreviewTime()).toBe(25)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)

    slider?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {value: 30, percentage: 30 / 65},
        bubbles: true,
        composed: true,
      }),
    )
    expect(mediaPlaybackModel.seekRequest()).toMatchObject({time: 30})
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
  })

  it('renders loading metadata without an unknown duration placeholder', async () => {
    seedAudioSession()
    mediaPlaybackModel.duration.set(null)
    mediaPlaybackModel.loadingState.set('loading')
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    document.body.append(element)
    await element.updateComplete

    const time = element.shadowRoot?.querySelector('.media-mini-time')?.textContent ?? ''
    expect(time).toContain('0:04')
    expect(time).not.toContain('--:--')
  })

  it('renders playback errors as compact status text', async () => {
    seedAudioSession()
    mediaPlaybackModel.loadingState.set('error')
    mediaPlaybackModel.playbackState.set('error')
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    document.body.append(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.media-mini-time')?.textContent).toContain(
      i18n('media:playback-failed' as any),
    )
    expect(element.shadowRoot?.querySelector('.media-mini')?.getAttribute('data-error')).toBe('true')
  })

  it('defers mini artwork loading until native audio is ready', async () => {
    seedAudioSession()
    mediaPlaybackModel.loadingState.set('loading')
    const element = document.createElement('media-mini-player') as MediaMiniPlayer
    document.body.append(element)
    await element.updateComplete

    const artwork = element.shadowRoot?.querySelector('audio-artwork-preview.media-mini-artwork') as AudioArtworkPreview | null
    expect(artwork?.loadEnabled).toBe(false)
  })

  it('keeps premium dock style contracts explicit', () => {
    const cssText = stylesToText(MediaMiniPlayer.styles)

    expect(cssText).toContain('.media-mini-progress')
    expect(cssText).toContain('.media-mini-artwork')
    expect(cssText).toContain('.media-mini-accent')
    expect(cssText).toContain('.media-mini-fallback-tile')
    expect(cssText).toContain('.media-mini-menu')
    expect(cssText).not.toContain('.media-mini-signal')
    expect(cssText).toMatch(/\.media-mini-artwork\s*\{[^}]*pointer-events: none;/)
    expect(cssText).toMatch(/\.media-mini-fallback-tile\s*\{[^}]*pointer-events: none;/)
    expect(cssText).toContain('.media-mini-open::part(base)')
    expect(cssText).toContain('.media-mini-open::part(prefix)')
    expect(cssText).toContain('.media-mini-open::part(label)')
    expect(cssText).toContain('.media-mini-progress::part(thumb)')
    expect(cssText).toContain('inline-size: 100%')
    expect(cssText).toContain('prefers-reduced-motion')
  })
})
