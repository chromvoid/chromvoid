import {describe, expect, it} from 'vitest'

import en from '../../src/i18n/locales/en.json'
import ru from '../../src/i18n/locales/ru.json'

const MEDIA_PLAYER_KEYS = [
  'media:audio-player',
  'media:now-playing',
  'media:audio-queue',
  'media:previous-track',
  'media:next-track',
  'media:play',
  'media:pause',
  'media:stop',
  'media:seek',
  'media:open-player',
  'media:current-track-actions',
  'media:playback-position',
  'media:audio-preparing-short',
  'media:playback-failed',
] as const

describe('media player i18n coverage', () => {
  it('contains non-empty English and Russian labels for audio player controls', () => {
    for (const key of MEDIA_PLAYER_KEYS) {
      expect(en).toHaveProperty(key)
      expect(ru).toHaveProperty(key)
      expect(en[key].trim()).not.toBe('')
      expect(ru[key].trim()).not.toBe('')
    }
  })
})
