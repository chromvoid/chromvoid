import {describe, expect, it} from 'vitest'

import data from '../../src/i18n/data.json'

const MEDIA_PLAYER_KEYS = [
  'media:audio-player',
  'media:now-playing',
  'media:audio-queue',
  'media:signal-visualizer',
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
    const translations = data as Record<string, {en?: string; ru?: string}>

    for (const key of MEDIA_PLAYER_KEYS) {
      expect(translations).toHaveProperty(key)
      expect(translations[key]?.en?.trim()).not.toBe('')
      expect(translations[key]?.ru?.trim()).not.toBe('')
    }
  })
})
