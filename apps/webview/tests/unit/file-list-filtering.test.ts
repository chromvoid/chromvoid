import {describe, expect, it} from 'vitest'

import {filterAndSortFileItems} from '../../src/shared/services/file-list-filtering'
import type {FileListItem, SearchFilters} from '../../src/shared/contracts/file-manager'

const BASE_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

describe('file list filtering', () => {
  it('uses catalog mediaInfo when filtering ISO-BMFF files by media type', () => {
    const items: FileListItem[] = [
      {
        id: 1,
        name: 'podcast.mp4',
        path: '/podcast.mp4',
        isDir: false,
        mimeType: 'video/mp4',
        mediaInfo: {
          kind: 'audio',
          audioTracks: 1,
          videoTracks: 0,
          playbackMimeType: 'audio/mp4',
        },
      },
      {
        id: 2,
        name: 'movie.mp4',
        path: '/movie.mp4',
        isDir: false,
        mimeType: 'video/mp4',
        mediaInfo: {
          kind: 'video',
          audioTracks: 1,
          videoTracks: 1,
          playbackMimeType: 'video/mp4',
        },
      },
    ]

    expect(filterAndSortFileItems(items, {...BASE_FILTERS, fileTypes: ['audio']}).map((item) => item.id)).toEqual([1])
    expect(filterAndSortFileItems(items, {...BASE_FILTERS, fileTypes: ['videos']}).map((item) => item.id)).toEqual([2])
  })

  it('filters Markdown notes without dropping directories or broad document behavior', () => {
    const items: FileListItem[] = [
      {id: 1, name: 'Notes', path: '/Notes', isDir: true},
      {id: 2, name: 'daily.md', path: '/daily.md', isDir: false, mimeType: 'text/markdown'},
      {id: 3, name: 'plan.markdown', path: '/plan.markdown', isDir: false},
      {id: 4, name: 'readme.txt', path: '/readme.txt', isDir: false, mimeType: 'text/plain'},
      {id: 5, name: 'photo.jpg', path: '/photo.jpg', isDir: false, mimeType: 'image/jpeg'},
    ]

    expect(filterAndSortFileItems(items, {...BASE_FILTERS, fileTypes: ['markdown']}).map((item) => item.id)).toEqual([
      1,
      2,
      3,
    ])
    expect(filterAndSortFileItems(items, {...BASE_FILTERS, fileTypes: ['documents']}).map((item) => item.id)).toEqual([
      1,
      2,
      3,
      4,
    ])
  })
})
