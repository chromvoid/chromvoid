import {describe, expect, it} from 'vitest'

import {
  getOpenActionPresentation,
  isMarkdownFile,
  isPlayableAudioFile,
  isPlayableAudioMediaFile,
  isPlayableVideoFile,
  isPlayableVideoMediaFile,
  isTextPreviewFile,
  resolveFileFormat,
} from '../../src/utils/file-format-registry'

describe('file format registry', () => {
  it.each([
    ['photo.heic', {kind: 'gallery'}, 'file-type:image'],
    ['scan.heif', {kind: 'gallery'}, 'file-type:image'],
    ['track.mp3', {kind: 'audio'}, 'file-type:audio'],
    ['voice.wav', {kind: 'audio'}, 'file-type:audio'],
    ['notes.txt', {kind: 'preview', mode: 'text'}, 'file-type:text'],
    ['readme.md', {kind: 'document', mode: 'markdown'}, 'file-type:text'],
    ['readme.markdown', {kind: 'document', mode: 'markdown'}, 'file-type:text'],
    ['schema.json', {kind: 'preview', mode: 'text'}, 'file-type:code'],
    ['report.pdf', {kind: 'preview', mode: 'fallback'}, 'file-type:document'],
    ['archive.zip', {kind: 'preview', mode: 'fallback'}, 'file-type:archive'],
    ['clip.mov', {kind: 'video'}, 'file-type:video'],
    ['movie.mkv', {kind: 'preview', mode: 'fallback'}, 'file-type:video'],
    ['album.flac', {kind: 'preview', mode: 'fallback'}, 'file-type:audio'],
  ])('classifies %s correctly', (fileName, openBehavior, fileTypeLabelKey) => {
    const format = resolveFileFormat({name: fileName})

    expect(format.openBehavior).toEqual(openBehavior)
    expect(format.fileTypeLabelKey).toBe(fileTypeLabelKey)
  })

  it('routes exact Markdown MIME to the Markdown document route', () => {
    const format = resolveFileFormat({name: 'download.bin', mimeType: 'text/markdown; charset=utf-8'})

    expect(format.openBehavior).toEqual({kind: 'document', mode: 'markdown'})
    expect(format.filterGroups).toEqual(['documents'])
    expect(isMarkdownFile('download.bin', 'text/markdown')).toBe(true)
    expect(isTextPreviewFile('download.bin', 'text/markdown')).toBe(false)
    expect(getOpenActionPresentation(format)).toEqual({icon: 'eye', labelKey: 'button:preview'})
  })

  it('keeps generic text MIME and text extensions in read-only text preview mode', () => {
    expect(resolveFileFormat({name: 'notes.txt'}).openBehavior).toEqual({kind: 'preview', mode: 'text'})
    expect(resolveFileFormat({name: 'app.log'}).openBehavior).toEqual({kind: 'preview', mode: 'text'})
    expect(resolveFileFormat({name: 'data.csv'}).openBehavior).toEqual({kind: 'preview', mode: 'text'})
    expect(resolveFileFormat({name: 'download.bin', mimeType: 'text/plain'}).openBehavior).toEqual({
      kind: 'preview',
      mode: 'text',
    })
    expect(isTextPreviewFile('download.bin', 'text/plain')).toBe(true)
  })

  it.each([
    ['track.mp3', undefined],
    ['voice.wav', undefined],
    ['podcast.ogg', undefined],
    ['song.m4a', undefined],
    ['clip.aac', undefined],
    ['download.bin', 'audio/mpeg'],
    ['download.bin', 'audio/wav'],
    ['download.bin', 'audio/ogg'],
    ['download.bin', 'audio/mp4'],
    ['download.bin', 'audio/aac'],
  ])('marks playable audio %s %s', (fileName, mimeType) => {
    const format = resolveFileFormat({name: fileName, mimeType})

    expect(isPlayableAudioFile(fileName, mimeType)).toBe(true)
    expect(format.openBehavior).toEqual({kind: 'audio'})
    expect(getOpenActionPresentation(format)).toEqual({icon: 'play-circle', labelKey: 'button:play'})
  })

  it.each([
    ['album.flac', undefined, 'file-type:audio', ['audio']],
    ['album.flac', 'audio/mpeg', 'file-type:audio', ['audio']],
    ['legacy.wma', undefined, 'file-type:audio', ['audio']],
    ['download.bin', 'audio/flac', 'file-type:audio', ['audio']],
    ['movie.mkv', undefined, 'file-type:video', ['videos']],
    ['movie.mkv', 'video/mp4', 'file-type:video', ['videos']],
    ['download.bin', 'video/x-matroska', 'file-type:video', ['videos']],
  ])(
    'keeps recognized non-playable media %s %s labeled and filterable',
    (fileName, mimeType, fileTypeLabelKey, filterGroups) => {
      const format = resolveFileFormat({name: fileName, mimeType})

      expect(format.fileTypeLabelKey).toBe(fileTypeLabelKey)
      expect(format.filterGroups).toEqual(filterGroups)
      expect(format.openBehavior).toEqual({kind: 'preview', mode: 'fallback'})
      expect(format.openBehavior.kind).not.toBe('audio')
      expect(format.openBehavior.kind).not.toBe('video')
      expect(isPlayableAudioFile(fileName, mimeType)).toBe(false)
      expect(isPlayableVideoFile(fileName, mimeType)).toBe(false)
    },
  )

  it.each([
    ['movie.mp4', undefined],
    ['clip.webm', undefined],
    ['camera.mov', undefined],
    ['download.bin', 'video/mp4'],
    ['download.bin', 'video/webm'],
    ['download.bin', 'video/quicktime'],
  ])('marks playable video %s %s', (fileName, mimeType) => {
    expect(isPlayableVideoFile(fileName, mimeType)).toBe(true)
    expect(resolveFileFormat({name: fileName, mimeType}).openBehavior).toEqual({kind: 'video'})
  })

  it('lets catalog mediaInfo override extension and MIME for ISO-BMFF playback', () => {
    const audioOnlyMp4 = {
      kind: 'audio' as const,
      audioTracks: 1,
      videoTracks: 0,
      playbackMimeType: 'audio/mp4',
    }
    const videoM4a = {
      kind: 'video' as const,
      audioTracks: 1,
      videoTracks: 1,
      playbackMimeType: 'video/mp4',
    }

    expect(
      resolveFileFormat({
        name: 'podcast.mp4',
        mimeType: 'video/mp4',
        mediaInfo: audioOnlyMp4,
      }),
    ).toMatchObject({
      mimeType: 'audio/mp4',
      fileTypeLabelKey: 'file-type:audio',
      filterGroups: ['audio'],
      openBehavior: {kind: 'audio'},
    })
    expect(isPlayableAudioMediaFile({name: 'podcast.mp4', mimeType: 'video/mp4', mediaInfo: audioOnlyMp4})).toBe(true)
    expect(isPlayableVideoMediaFile({name: 'podcast.mp4', mimeType: 'video/mp4', mediaInfo: audioOnlyMp4})).toBe(false)

    expect(
      resolveFileFormat({
        name: 'clip.m4a',
        mimeType: 'audio/mp4',
        mediaInfo: videoM4a,
      }),
    ).toMatchObject({
      mimeType: 'video/mp4',
      fileTypeLabelKey: 'file-type:video',
      filterGroups: ['videos'],
      openBehavior: {kind: 'video'},
    })
  })
})
