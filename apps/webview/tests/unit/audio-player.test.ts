import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'
import type {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import type {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {CVSlider} from '@chromvoid/uikit/components/cv-slider'
import {AudioPlayer} from '../../src/features/media/components/audio-player'
import {
  ANDROID_NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS,
  MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT,
  mediaPlaybackModel,
} from '../../src/features/media/models/media-playback.model'
import {i18n} from '../../src/i18n'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function createPointerEvent(
  type: string,
  options: {clientY: number; pointerId?: number; button?: number},
): PointerEvent {
  const event = new Event(type, {bubbles: true, composed: true, cancelable: true}) as PointerEvent
  Object.defineProperties(event, {
    button: {value: options.button ?? 0},
    clientY: {value: options.clientY},
    pointerId: {value: options.pointerId ?? 1},
  })
  return event
}

let layoutMode: ReturnType<typeof atom<'mobile' | 'desktop'>>

async function settleAudioPlayer(element: AudioPlayer): Promise<void> {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition not met')
}

async function getMobileSheet(element: AudioPlayer): Promise<CVBottomSheet> {
  await settleAudioPlayer(element)
  const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as CVBottomSheet | null
  expect(sheet).not.toBeNull()
  await sheet!.updateComplete
  await Promise.resolve()
  await sheet!.updateComplete
  return sheet!
}

async function getSheetDialog(element: AudioPlayer): Promise<CVDialog> {
  const sheet = await getMobileSheet(element)
  const dialog = sheet.shadowRoot?.querySelector('cv-dialog') as CVDialog | null
  expect(dialog).not.toBeNull()
  await dialog!.updateComplete
  await Promise.resolve()
  await dialog!.updateComplete
  return dialog!
}

beforeEach(() => {
  layoutMode = atom<'mobile' | 'desktop'>('mobile')
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode,
      } as any,
    }),
  )
  CVSlider.define()
  AudioPlayer.define()
  mediaPlaybackModel.sessionKind.set('audio')
  mediaPlaybackModel.tracks.set([
    {id: 1, name: 'one.mp3', path: '/one.mp3', mimeType: 'audio/mpeg'},
    {id: 2, name: 'two.mp3', path: '/two.mp3', mimeType: 'audio/mpeg'},
  ])
  mediaPlaybackModel.currentIndex.set(0)
  mediaPlaybackModel.currentTime.set(12)
  mediaPlaybackModel.duration.set(75)
  mediaPlaybackModel.loadingState.set('loaded')
  mediaPlaybackModel.playbackIssue.set(null)
  mediaPlaybackModel.playbackIntent.set('pause')
  mediaPlaybackModel.playbackState.set('paused')
  mediaPlaybackModel.fullPlayerOpen.set(true)
})

afterEach(async () => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  await mediaPlaybackModel.stopSession()
  clearAppContext()
  vi.clearAllMocks()
})

describe('audio-player', () => {
  it('renders current track controls and forwards user intent to the model', async () => {
    const element = document.createElement('audio-player') as AudioPlayer
    const close = vi.fn()
    element.addEventListener('close', close)
    document.body.append(element)
    await element.updateComplete

    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as CVBottomSheet | null
    expect(sheet).not.toBeNull()
    expect(sheet?.querySelector('[slot="title"]')?.textContent).toBe(i18n('media:audio-player' as any))
    expect(sheet?.open).toBe(true)
    expect(element.shadowRoot?.querySelector('.player-sheet')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.overlay')).toBeNull()
    expect(element.shadowRoot?.querySelector('.drag-handle')).toBeNull()
    expect(element.shadowRoot?.querySelector('.signal-panel')).toBeNull()
    expect(element.shadowRoot?.querySelector('.player-visuals')).toBeNull()
    expect(element.shadowRoot?.querySelector('audio-artwork-preview.track-artwork')).toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-seek')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-seek')?.hasAttribute('data-active')).toBe(false)
    expect(element.shadowRoot?.querySelectorAll('.waveform-column')).toHaveLength(
      MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT,
    )
    expect(element.shadowRoot?.querySelectorAll('.waveform-bar')).toHaveLength(
      MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT,
    )
    expect(element.shadowRoot?.querySelector('.waveform-column[data-band="low"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-column[data-band="mid"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-column[data-band="high"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-column[data-level="12"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-column[data-emphasis="peak"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-column[data-playhead-near="true"]')).not.toBeNull()
    const firstRenderLevels = Array.from(element.shadowRoot?.querySelectorAll('.waveform-column') ?? []).map(
      (bar) => bar.getAttribute('data-level'),
    )
    expect(element.shadowRoot?.querySelector('.signal-progress')).toBeNull()
    expect(element.shadowRoot?.querySelector('.queue')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.track-title')?.textContent).toBe('one')
    expect(element.shadowRoot?.querySelector('.track-file')?.textContent).toContain('one.mp3')
    expect(element.shadowRoot?.querySelector('.track-subtitle')).toBeNull()
    expect(element.shadowRoot?.querySelector('.seek-labels')?.textContent).toContain('0:12')
    expect(element.shadowRoot?.querySelector('.seek-labels')?.textContent).toContain('1:15')
    const slider = element.shadowRoot?.querySelector('.seek-slider') as CVSlider | null
    expect(slider?.tagName.toLowerCase()).toBe('cv-slider')
    expect(slider?.max).toBe(75)
    expect(slider?.value).toBe(12)
    expect(slider?.getAttribute('aria-label')).toBe(i18n('media:seek' as any))
    mediaPlaybackModel.playbackState.set('playing')
    await Promise.resolve()
    await element.updateComplete
    expect(element.shadowRoot?.querySelector('.waveform-seek')?.hasAttribute('data-active')).toBe(false)
    expect(
      Array.from(element.shadowRoot?.querySelectorAll('.waveform-column') ?? []).map((bar) =>
        bar.getAttribute('data-level'),
      ),
    ).toEqual(firstRenderLevels)
    mediaPlaybackModel.currentTime.set(90)
    await Promise.resolve()
    await element.updateComplete
    expect(element.shadowRoot?.querySelector('.signal-progress')).toBeNull()
    const activeQueueRow = element.shadowRoot?.querySelector('.queue-row.active')
    expect(activeQueueRow?.getAttribute('aria-current')).toBe('true')
    expect(activeQueueRow?.querySelector('.queue-prefix')?.getAttribute('slot')).toBe('prefix')
    expect(activeQueueRow?.querySelector('.queue-name')?.hasAttribute('slot')).toBe(false)
    expect(activeQueueRow?.querySelector('.queue-name')?.textContent).toBe('one')
    expect(activeQueueRow?.querySelector('.queue-duration')?.getAttribute('slot')).toBe('suffix')
    expect(activeQueueRow?.querySelector('.queue-duration')?.textContent).toBe('1:15')
    ;(element.shadowRoot?.querySelector('.icon-button.primary') as HTMLButtonElement | null)?.click()
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(element.shadowRoot?.querySelector('.icon-button.primary')?.getAttribute('aria-label')).toBe(
      i18n('media:play' as any),
    )
    ;(
      element.shadowRoot?.querySelector(
        `cv-button[aria-label="${i18n('media:next-track' as any)}"]`,
      ) as HTMLButtonElement | null
    )?.click()
    await Promise.resolve()
    await element.updateComplete
    expect(mediaPlaybackModel.currentIndex()).toBe(1)
    ;(
      element.shadowRoot?.querySelector(
        `cv-button[aria-label="${i18n('media:previous-track' as any)}"]`,
      ) as HTMLButtonElement | null
    )?.click()
    await Promise.resolve()
    await element.updateComplete
    expect(mediaPlaybackModel.currentIndex()).toBe(0)
    ;(element.shadowRoot?.querySelector('.queue-row[data-index="1"]') as HTMLButtonElement | null)?.click()
    await Promise.resolve()
    await element.updateComplete
    expect(mediaPlaybackModel.currentIndex()).toBe(1)
    ;(
      element.shadowRoot?.querySelector(
        `cv-button[aria-label="${i18n('button:close' as any)}"]`,
      ) as HTMLButtonElement | null
    )?.click()
    expect(close).toHaveBeenCalledTimes(1)
    ;(
      element.shadowRoot?.querySelector(
        `cv-button[aria-label="${i18n('media:stop' as any)}"]`,
      ) as HTMLButtonElement | null
    )?.click()
    await waitFor(() => mediaPlaybackModel.sessionKind() === 'none')
    expect(mediaPlaybackModel.sessionKind()).toBe('none')
  })

  it('previews seek slider input and commits after release', async () => {
    const element = document.createElement('audio-player') as AudioPlayer
    const close = vi.fn()
    element.addEventListener('close', close)
    document.body.append(element)
    await element.updateComplete

    const slider = element.shadowRoot?.querySelector('.seek-slider') as CVSlider | null
    expect(slider).not.toBeNull()

    slider!.dispatchEvent(new CustomEvent('cv-input', {detail: {value: 45}, bubbles: true, composed: true}))

    expect(mediaPlaybackModel.currentTime()).toBe(12)
    expect(mediaPlaybackModel.seekPreviewTime()).toBe(45)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()
    await Promise.resolve()
    await slider!.updateComplete
    expect(slider!.value).toBe(45)

    slider!.dispatchEvent(new CustomEvent('cv-change', {detail: {value: 45}, bubbles: true, composed: true}))

    expect(mediaPlaybackModel.seekPreviewTime()).toBe(45)
    expect(mediaPlaybackModel.currentTime()).toBe(45)
    expect(mediaPlaybackModel.seekRequest()).toMatchObject({time: 45})
    expect(close).not.toHaveBeenCalled()
  })

  it('closes the bottom sheet and contains the click when stopping playback', async () => {
    const wrapper = document.createElement('div')
    const parentClick = vi.fn()
    const close = vi.fn()
    const element = document.createElement('audio-player') as AudioPlayer
    wrapper.addEventListener('click', parentClick)
    element.addEventListener('close', close)
    wrapper.append(element)
    document.body.append(wrapper)
    await element.updateComplete
    ;(
      element.shadowRoot?.querySelector(
        `cv-button[aria-label="${i18n('media:stop' as any)}"]`,
      ) as HTMLButtonElement | null
    )?.click()
    await waitFor(() => mediaPlaybackModel.sessionKind() === 'none')

    expect(close).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()
    expect(mediaPlaybackModel.sessionKind()).toBe('none')
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
  })

  it('disables the seek slider when duration is unavailable', async () => {
    mediaPlaybackModel.duration.set(null)
    const element = document.createElement('audio-player') as AudioPlayer
    document.body.append(element)
    await element.updateComplete

    const slider = element.shadowRoot?.querySelector('.seek-slider') as CVSlider | null

    expect(slider?.disabled).toBe(true)
  })

  it('does not render an artwork avatar in the full player header', async () => {
    mediaPlaybackModel.loadingState.set('loading')
    const element = document.createElement('audio-player') as AudioPlayer
    document.body.append(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('audio-artwork-preview.track-artwork')).toBeNull()
    expect(element.shadowRoot?.querySelector('.track-headline')).not.toBeNull()
  })

  it('delays native audio preparation status while Android playback is starting', async () => {
    vi.useFakeTimers()
    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.sourceKind.set('android-media3')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')
    mediaPlaybackModel.playbackIntent.set('play')
    const element = document.createElement('audio-player') as AudioPlayer
    document.body.append(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.native-preparing-status')).toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-seek')?.getAttribute('data-preparing')).toBe('true')

    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(ANDROID_NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS)
    await element.updateComplete

    const status = element.shadowRoot?.querySelector('.native-preparing-status')
    expect(status).not.toBeNull()
    expect(status?.getAttribute('role')).toBe('status')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(element.shadowRoot?.querySelector('.native-preparing-title')?.textContent).toBe(
      i18n('media:android-audio-preparing-title' as any),
    )
    expect(element.shadowRoot?.querySelector('.native-preparing-detail')?.textContent).toBe(
      i18n('media:android-audio-preparing-copy' as any),
    )
    expect(element.shadowRoot?.querySelector('.native-preparing-icon cv-icon')?.getAttribute('name')).toBe(
      'loader',
    )
    expect(element.shadowRoot?.querySelector('.waveform-seek')?.getAttribute('data-preparing')).toBe('true')
    expect(element.shadowRoot?.querySelector('.seek-slider')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.controls')).not.toBeNull()
  })

  it('does not show native preparation status for short track switches after Android is ready', async () => {
    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.sourceKind.set('android-media3')
    mediaPlaybackModel.playbackIntent.set('play')
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId: 'native-1',
      trackId: 1,
      index: 0,
      loadingState: 'loaded',
      playbackState: 'playing',
      playbackIntent: 'play',
      positionMs: 1_000,
      durationMs: 75_000,
    })
    mediaPlaybackModel.currentIndex.set(1)
    mediaPlaybackModel.playbackState.set('buffering')
    const element = document.createElement('audio-player') as AudioPlayer
    document.body.append(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.native-preparing-status')).toBeNull()
    expect(element.shadowRoot?.querySelector('.waveform-seek')?.getAttribute('data-preparing')).toBe('false')
    expect(element.shadowRoot?.querySelector('.seek-slider')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.controls')).not.toBeNull()
  })

  it('renders fallback-limited alternatives and emits file actions', async () => {
    mediaPlaybackModel.loadingState.set('fallback-limited')
    mediaPlaybackModel.playbackIssue.set({
      kind: 'android-native-not-ready',
      trackId: 1,
      sourceRevision: 77,
      sourceSize: 9 * 1024 * 1024,
      fallbackLimitBytes: 8 * 1024 * 1024,
      nativeReason: 'native_playback_not_ready',
    })
    const actions: Array<{action: string; fileId: number}> = []
    const element = document.createElement('audio-player') as AudioPlayer
    element.addEventListener('action', ((event: CustomEvent<{action: string; fileId: number}>) => {
      actions.push(event.detail)
    }) as EventListener)

    document.body.append(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.fallback-limited')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.fallback-title')?.textContent).toBe(
      i18n('media:native-playback-unavailable-title' as any),
    )
    expect(element.shadowRoot?.querySelector('.fallback-copy')?.textContent).toBe(
      i18n('media:android-native-not-ready-fallback-copy' as any),
    )
    expect(element.shadowRoot?.querySelector('.seek-slider')).toBeNull()
    expect(element.shadowRoot?.querySelector('.controls')).toBeNull()
    ;(element.shadowRoot?.querySelector('[data-action="open-external"]') as HTMLButtonElement | null)?.click()
    ;(element.shadowRoot?.querySelector('[data-action="download"]') as HTMLButtonElement | null)?.click()

    expect(actions).toEqual([
      {action: 'open-external', fileId: 1},
      {action: 'download', fileId: 1},
    ])
  })

  it('closes from a backdrop tap without closing when the sheet itself is tapped', async () => {
    const close = vi.fn()
    const element = document.createElement('audio-player') as AudioPlayer
    element.addEventListener('close', close)
    document.body.append(element)
    await settleAudioPlayer(element)

    element.shadowRoot
      ?.querySelector('.player-sheet')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    expect(close).not.toHaveBeenCalled()

    const dialog = await getSheetDialog(element)
    dialog.shadowRoot
      ?.querySelector('[part="overlay"]')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settleAudioPlayer(element)

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('delegates mobile drag dismissal to the bottom sheet', async () => {
    const close = vi.fn()
    const element = document.createElement('audio-player') as AudioPlayer
    element.addEventListener('close', close)
    document.body.append(element)
    await settleAudioPlayer(element)

    const sheet = await getMobileSheet(element)
    const handle = sheet.shadowRoot?.querySelector('[part="handle"]') as HTMLElement | null
    expect(handle).not.toBeNull()

    handle!.dispatchEvent(createPointerEvent('pointerdown', {clientY: 0}))
    handle!.dispatchEvent(createPointerEvent('pointermove', {clientY: 120}))

    handle!.dispatchEvent(createPointerEvent('pointerup', {clientY: 120}))
    await settleAudioPlayer(element)

    expect(sheet.open).toBe(false)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('renders a dialog directly on desktop layout', async () => {
    layoutMode.set('desktop')
    const element = document.createElement('audio-player') as AudioPlayer
    document.body.append(element)
    await settleAudioPlayer(element)

    const dialog = element.shadowRoot?.querySelector('cv-dialog') as CVDialog | null

    expect(dialog).not.toBeNull()
    expect(element.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
  })
})
