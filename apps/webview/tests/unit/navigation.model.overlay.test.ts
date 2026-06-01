import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'

type CatalogNode = {
  nodeId: number
  name: string
  isDir: boolean
  path?: string
  size?: number
  lastModified?: number
  modtime?: number
  sourceRevision?: number
  source_revision?: number
  mimeType?: string
  mediaInfo?: {
    kind: 'audio' | 'video'
    audioTracks: number
    videoTracks: number
    playbackMimeType?: string
  } | null
}

const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function createCatalogMock() {
  const syncing = atom(false)
  const listeners = new Set<() => void>()
  const nodesByPath = new Map<string, CatalogNode[]>()
  const nodesById = new Map<number, CatalogNode>()
  const knownPaths = new Set<string>()

  return {
    syncing,
    catalog: {
      getChildren(path: string) {
        return nodesByPath.get(path) ?? []
      },
      getNode(id: number) {
        return nodesById.get(id)
      },
      findByPath(path: string) {
        return knownPaths.has(path) ? {path} : undefined
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    setPath(path: string, nodes: CatalogNode[]) {
      knownPaths.add(path)
      const normalizedNodes = nodes.map((node) => ({
        ...node,
        path: node.path ?? `${path === '/' ? '' : path.replace(/\/$/, '')}/${node.name}`,
      }))
      nodesByPath.set(path, normalizedNodes)
      for (const node of normalizedNodes) {
        nodesById.set(node.nodeId, node)
      }
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

function setupContext(catalog: ReturnType<typeof createCatalogMock>) {
  const detailsPanelFileId = atom<number | null>(null)
  const currentPath = atom('/')
  const showRemoteStoragePage = atom(false)
  const showRemotePage = atom(false)
  const showGatewayPage = atom(false)
  const showSettingsPage = atom(false)
  const isShowPasswordManager = atom(false)
  const searchFilters = atom<SearchFilters>({...DEFAULT_SEARCH_FILTERS})

  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId,
        currentPath,
        showRemoteStoragePage,
        showRemotePage,
        showGatewayPage,
        showSettingsPage,
        isShowPasswordManager,
        searchFilters,
      } as any,
      catalog: {
        syncing: catalog.syncing,
        lastError: () => null,
        catalog: catalog.catalog,
      } as any,
    }),
  )

  return {searchFilters}
}

describe('NavigationModel overlay resolution', () => {
  let catalog: ReturnType<typeof createCatalogMock>
  let searchFilters: ReturnType<typeof setupContext>['searchFilters']

  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    catalog = createCatalogMock()
    searchFilters = setupContext(catalog).searchFilters
    navigationModel.connect()
  })

  afterEach(async () => {
    await mediaPlaybackModel.stopSession()
    navigationModel.disconnect()
    clearAppContext()
  })

  it('keeps gallery deep links pending until the catalog becomes available', async () => {
    catalog.syncing.set(true)

    navigationModel.openGallery(2)
    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'pending',
      requestedKind: 'gallery',
      fileId: 2,
    })

    catalog.setPath('/', [{nodeId: 2, name: 'photo.png', isDir: false}])
    catalog.syncing.set(false)
    await Promise.resolve()

    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'gallery',
      fileId: 2,
      images: [{id: 2, name: 'photo.png', path: '/photo.png'}],
      index: 0,
    })
  })

  it('resolves HEIC files into the shared gallery overlay list', async () => {
    catalog.setPath('/', [
      {
        nodeId: 1,
        name: 'photo.jpg',
        isDir: false,
        path: '/photo.jpg',
        size: 64,
        lastModified: 101,
        mimeType: 'image/jpeg',
      },
      {
        nodeId: 2,
        name: 'scan.heic',
        isDir: false,
        path: '/scan.heic',
        size: 512,
        lastModified: 202,
        mimeType: 'image/heic',
      },
      {nodeId: 3, name: 'report.pdf', isDir: false, mimeType: 'application/pdf'},
      {
        nodeId: 4,
        name: 'diagram.png',
        isDir: false,
        path: '/diagram.png',
        size: 128,
        modtime: 303,
        mimeType: 'image/png',
      },
    ])

    navigationModel.openGallery(2)
    await Promise.resolve()

    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'gallery',
      fileId: 2,
      images: [
        {
          id: 4,
          name: 'diagram.png',
          path: '/diagram.png',
          size: 128,
          lastModified: 303,
          mimeType: 'image/png',
        },
        {
          id: 1,
          name: 'photo.jpg',
          path: '/photo.jpg',
          size: 64,
          lastModified: 101,
          mimeType: 'image/jpeg',
        },
        {
          id: 2,
          name: 'scan.heic',
          path: '/scan.heic',
          size: 512,
          lastModified: 202,
          mimeType: 'image/heic',
        },
      ],
      index: 2,
    })
    expect(window.location.search).toContain('overlay=gallery')
  })

  it('orders gallery images by the visible file list date sort', async () => {
    searchFilters.set({
      ...DEFAULT_SEARCH_FILTERS,
      sortBy: 'date',
      sortDirection: 'desc',
    })
    catalog.setPath('/', [
      {nodeId: 1, name: 'old.jpg', isDir: false, path: '/old.jpg', modtime: 100},
      {nodeId: 2, name: 'target.jpg', isDir: false, path: '/target.jpg', modtime: 200},
      {nodeId: 3, name: 'new.jpg', isDir: false, path: '/new.jpg', modtime: 300},
      {nodeId: 4, name: 'fallback.jpg', isDir: false, path: '/fallback.jpg', lastModified: 250},
    ])

    navigationModel.openGallery(2)
    await Promise.resolve()

    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'gallery',
      fileId: 2,
      images: [
        {id: 3, name: 'new.jpg', path: '/new.jpg', lastModified: 300},
        {id: 4, name: 'fallback.jpg', path: '/fallback.jpg', lastModified: 250},
        {id: 2, name: 'target.jpg', path: '/target.jpg', lastModified: 200},
        {id: 1, name: 'old.jpg', path: '/old.jpg', lastModified: 100},
      ],
      index: 2,
    })
  })

  it('limits gallery images to the visible file list query result', async () => {
    searchFilters.set({
      ...DEFAULT_SEARCH_FILTERS,
      query: 'trip',
    })
    catalog.setPath('/', [
      {nodeId: 1, name: 'z-trip.jpg', isDir: false, path: '/z-trip.jpg'},
      {nodeId: 2, name: 'a-other.jpg', isDir: false, path: '/a-other.jpg'},
      {nodeId: 3, name: 'a-trip.png', isDir: false, path: '/a-trip.png'},
      {nodeId: 4, name: 'trip-note.pdf', isDir: false, path: '/trip-note.pdf', mimeType: 'application/pdf'},
    ])

    navigationModel.openGallery(1)
    await Promise.resolve()

    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'gallery',
      fileId: 1,
      images: [
        {id: 3, name: 'a-trip.png', path: '/a-trip.png'},
        {id: 1, name: 'z-trip.jpg', path: '/z-trip.jpg'},
      ],
      index: 1,
    })
  })

  it('resolves non-Markdown preview deep links once the catalog becomes available', async () => {
    catalog.syncing.set(true)

    navigationModel.openPreview(5)
    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'pending',
      requestedKind: 'preview',
      fileId: 5,
    })

    catalog.setPath('/', [
      {nodeId: 5, name: 'notes.txt', isDir: false, mimeType: 'text/plain', sourceRevision: 42},
    ])
    catalog.syncing.set(false)
    await Promise.resolve()

    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'preview',
      fileId: 5,
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      sourceRevision: 42,
      mode: 'text',
    })
    expect(window.location.search).toContain('overlay=preview')
  })

  it('canonicalizes legacy Markdown preview deep links to document routes', async () => {
    catalog.syncing.set(true)

    navigationModel.openPreview(5)
    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'pending',
      requestedKind: 'preview',
      fileId: 5,
    })

    catalog.setPath('/', [
      {nodeId: 5, name: 'notes.md', isDir: false, mimeType: 'text/markdown', sourceRevision: 42},
    ])
    catalog.syncing.set(false)
    await Promise.resolve()

    expect(navigationModel.snapshot()).toEqual({
      surface: 'files',
      files: {path: '/', document: {kind: 'markdown', fileId: 5}},
      overlay: {kind: 'none'},
    })
    expect(navigationModel.resolvedOverlay()).toEqual({kind: 'closed'})
    expect(navigationModel.resolvedDocument()).toEqual({
      kind: 'markdown',
      fileId: 5,
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      sourceRevision: 42,
      mode: 'markdown',
    })
    expect(window.location.search).toContain('document=markdown')
    expect(window.location.search).not.toContain('overlay=preview')
  })

  it('resolves Markdown document routes once the catalog becomes available', async () => {
    catalog.syncing.set(true)

    navigationModel.openMarkdownDocument(5)
    expect(navigationModel.resolvedDocument()).toEqual({
      kind: 'pending',
      requestedKind: 'markdown',
      fileId: 5,
    })

    catalog.setPath('/', [
      {nodeId: 5, name: 'notes.markdown', isDir: false, mimeType: 'text/markdown', sourceRevision: 42},
    ])
    catalog.syncing.set(false)
    await Promise.resolve()

    expect(navigationModel.resolvedDocument()).toEqual({
      kind: 'markdown',
      fileId: 5,
      fileName: 'notes.markdown',
      mimeType: 'text/markdown',
      sourceRevision: 42,
      mode: 'markdown',
    })
    expect(window.location.search).toContain('document=markdown')
    expect(window.location.search).not.toContain('overlay=')
  })

  it('resolves Markdown document routes from source metadata without changing the files path', () => {
    catalog.setPath('/', [])
    navigationModel.navigateToSurface('notes')

    navigationModel.openMarkdownDocument(21, 'push', {
      source: {
        path: '/Projects/Retro.md',
        fileName: 'Retro.md',
        size: 512,
        mimeType: 'text/markdown',
        lastModified: 1_717_171_717,
        sourceRevision: 9,
      },
    })

    expect(navigationModel.snapshot()).toEqual({
      surface: 'files',
      files: {
        path: '/',
        document: {
          kind: 'markdown',
          fileId: 21,
          originSurface: 'notes',
          source: {
            path: '/Projects/Retro.md',
            fileName: 'Retro.md',
            size: 512,
            mimeType: 'text/markdown',
            lastModified: 1_717_171_717,
            sourceRevision: 9,
          },
        },
      },
      overlay: {kind: 'none'},
    })
    expect(navigationModel.resolvedDocument()).toEqual({
      kind: 'markdown',
      fileId: 21,
      fileName: 'Retro.md',
      size: 512,
      mimeType: 'text/markdown',
      lastModified: 1_717_171_717,
      sourceRevision: 9,
      mode: 'markdown',
    })
  })

  it('prefers catalog node metadata over stale Markdown document source metadata', () => {
    catalog.setPath('/', [])
    catalog.setPath('/Projects/', [
      {
        nodeId: 21,
        name: 'Renamed.md',
        isDir: false,
        mimeType: 'text/markdown',
        sourceRevision: 12,
      },
    ])
    navigationModel.navigateToSurface('notes')

    navigationModel.openMarkdownDocument(21, 'push', {
      source: {
        path: '/Projects/Retro.md',
        fileName: 'Retro.md',
        mimeType: 'text/markdown',
        sourceRevision: 9,
      },
    })

    expect(navigationModel.resolvedDocument()).toEqual({
      kind: 'markdown',
      fileId: 21,
      fileName: 'Renamed.md',
      mimeType: 'text/markdown',
      sourceRevision: 12,
      mode: 'markdown',
    })
  })

  it('canonicalizes invalid Markdown document source metadata', async () => {
    catalog.setPath('/', [])
    navigationModel.navigateToSurface('notes')

    navigationModel.openMarkdownDocument(22, 'push', {
      source: {
        path: '/Projects/Retro.txt',
        fileName: 'Retro.txt',
        mimeType: 'text/plain',
      },
    })
    await Promise.resolve()

    expect(navigationModel.snapshot()).toEqual({
      surface: 'files',
      files: {path: '/'},
      overlay: {kind: 'none'},
    })
    expect(navigationModel.resolvedDocument()).toEqual({kind: 'closed'})
    expect(window.location.search).not.toContain('document=markdown')
  })

  it('resolves audio deep links once the catalog becomes available', async () => {
    catalog.syncing.set(true)

    navigationModel.openAudio(6)
    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'pending',
      requestedKind: 'audio',
      fileId: 6,
    })

    catalog.setPath('/', [{nodeId: 6, name: 'track.mp3', isDir: false, mimeType: 'audio/mpeg'}])
    catalog.syncing.set(false)
    await Promise.resolve()

    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'audio',
      fileId: 6,
      tracks: [
        {
          id: 6,
          name: 'track.mp3',
          path: '/track.mp3',
          mimeType: 'audio/mpeg',
        },
      ],
      index: 0,
    })
    expect(window.location.search).toContain('overlay=audio')
  })

  it('resolves video deep links with source metadata for playback fallback decisions', async () => {
    catalog.setPath('/', [
      {
        nodeId: 7,
        name: 'movie.mp4',
        isDir: false,
        path: '/movie.mp4',
        size: 67_108_865,
        modtime: 707,
        mimeType: 'video/mp4',
      },
    ])

    navigationModel.openVideo(7)
    await Promise.resolve()

    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'video',
      fileId: 7,
      fileName: 'movie.mp4',
      size: 67_108_865,
      lastModified: 707,
      mimeType: 'video/mp4',
    })
  })

  it('canonicalizes audio-only MP4 video deep links to the audio overlay', async () => {
    const mediaInfo = {
      kind: 'audio' as const,
      audioTracks: 1,
      videoTracks: 0,
      playbackMimeType: 'audio/mp4',
    }
    catalog.setPath('/', [
      {
        nodeId: 8,
        name: 'podcast.mp4',
        isDir: false,
        path: '/podcast.mp4',
        mimeType: 'video/mp4',
        mediaInfo,
      },
    ])

    navigationModel.openVideo(8)
    await Promise.resolve()

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'audio', fileId: 8})
    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'audio',
      fileId: 8,
      tracks: [
        {
          id: 8,
          name: 'podcast.mp4',
          path: '/podcast.mp4',
          mimeType: 'video/mp4',
          mediaInfo,
        },
      ],
      index: 0,
    })
  })

  it('canonicalizes impossible gallery deep links back to a closed overlay', async () => {
    catalog.setPath('/', [])

    navigationModel.openGallery(42)
    await Promise.resolve()

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
    expect(navigationModel.resolvedOverlay()).toEqual({kind: 'closed'})
    expect(window.location.search).not.toContain('overlay=gallery')
  })

  it('canonicalizes impossible preview deep links back to a closed overlay', async () => {
    catalog.setPath('/', [{nodeId: 9, name: 'movie.mp4', isDir: false, mimeType: 'video/mp4'}])

    navigationModel.openPreview(9)
    await Promise.resolve()

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
    expect(navigationModel.resolvedOverlay()).toEqual({kind: 'closed'})
    expect(window.location.search).not.toContain('overlay=preview')
  })

  it('canonicalizes impossible Markdown document routes back to files', async () => {
    catalog.setPath('/', [{nodeId: 9, name: 'notes.txt', isDir: false, mimeType: 'text/plain'}])

    navigationModel.openMarkdownDocument(9)
    await Promise.resolve()

    expect(navigationModel.snapshot()).toEqual({
      surface: 'files',
      files: {path: '/'},
      overlay: {kind: 'none'},
    })
    expect(navigationModel.resolvedDocument()).toEqual({kind: 'closed'})
    expect(window.location.search).not.toContain('document=markdown')
  })

  it('keeps video deep links pending until the catalog settles and then canonicalizes stale overlays', async () => {
    catalog.syncing.set(true)

    navigationModel.openVideo(12)
    expect(navigationModel.resolvedOverlay()).toEqual({
      kind: 'pending',
      requestedKind: 'video',
      fileId: 12,
    })

    catalog.setPath('/', [{nodeId: 99, name: 'other.mp4', isDir: false, mimeType: 'video/mp4'}])
    catalog.syncing.set(false)
    await Promise.resolve()

    expect(navigationModel.snapshot().overlay).toEqual({kind: 'none'})
    expect(navigationModel.resolvedOverlay()).toEqual({kind: 'closed'})
    expect(window.location.search).not.toContain('overlay=video')
  })
})
