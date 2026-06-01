import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {atom} from '@reatom/core'

import {Store} from '../../src/app/state/store'
import {ChromVoidState} from '../../src/core/state/app-state'
import {clearAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {MediaMiniPlayer} from '../../src/features/media/components/media-mini-player'
import {StatusBar} from '../../src/features/shell/components/status-bar'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'
import {i18n} from '../../src/i18n'

describe('status-bar media mini controls', () => {
  beforeEach(() => {
    StatusBar.define()

    const ws = {
      kind: 'ws' as const,
      connected: atom(true),
      connecting: atom(false),
      lastError: atom<string | undefined>(undefined),
      connect() {},
      disconnect() {},
      on() {},
      off() {},
      sendCatalog: async () => undefined,
      sendPassmanager: async () => undefined,
      uploadFile: async () => undefined,
      downloadFile: async function* () {},
      readSecret: async function* () {},
      writeSecret: async () => undefined,
      eraseSecret: async () => undefined,
      generateOTP: async () => '',
      setOTPSecret: async () => undefined,
      removeOTPSecret: async () => undefined,
    }

    const catalog = {
      syncing: atom(false),
      lastError: atom<string | null>(null),
    }

    const state = new ChromVoidState()
    const store = new Store(ws as any, state, catalog as any)
    initAppContext({store, ws: ws as any, catalog: catalog as any, state})

    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 1, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.currentTime.set(4)
    mediaPlaybackModel.duration.set(65)
    mediaPlaybackModel.playbackIntent.set('pause')
    mediaPlaybackModel.fullPlayerOpen.set(false)
  })

  afterEach(async () => {
    document.body.innerHTML = ''
    await mediaPlaybackModel.stopSession()
    clearAppContext()
  })

  it('renders compact playback controls and keeps session state in the model', async () => {
    const element = document.createElement('status-bar') as StatusBar
    document.body.append(element)
    await element.updateComplete
    const mini = element.shadowRoot?.querySelector('media-mini-player') as MediaMiniPlayer | null
    await mini?.updateComplete

    expect(mini?.variant).toBe('statusbar')
    expect(mini?.shadowRoot?.querySelector('.media-mini-title')?.textContent).toContain('track.mp3')
    expect(mini?.shadowRoot?.querySelector('.media-mini-time')?.textContent).toContain('0:04 / 1:05')
    expect(mini?.shadowRoot?.querySelector('.media-mini-progress')).not.toBeNull()
    ;(mini?.shadowRoot?.querySelector('.media-mini-button.primary') as HTMLButtonElement | null)?.click()
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    ;(mini?.shadowRoot?.querySelector('.media-mini-open') as HTMLButtonElement | null)?.click()
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(true)

    const stopItem = mini?.shadowRoot?.querySelector('cv-menu-item[value="stop"]') as HTMLElement | null
    expect(stopItem?.textContent).toContain(i18n('media:stop' as any))
    stopItem?.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(mediaPlaybackModel.sessionKind()).toBe('none')
  })
})
