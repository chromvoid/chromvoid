import {state} from '@statx/core'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type CatalogNode = {
  nodeId: number
  name: string
  isDir: boolean
}

function createCatalogMock() {
  const syncing = state(false)
  const listeners = new Set<() => void>()
  const nodesByPath = new Map<string, CatalogNode[]>()
  const knownPaths = new Set<string>()

  return {
    syncing,
    catalog: {
      getChildren(path: string) {
        return nodesByPath.get(path) ?? []
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
      nodesByPath.set(path, nodes)
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

function setupContext(catalog: ReturnType<typeof createCatalogMock>) {
  const detailsPanelFileId = state<number | null>(null)
  const currentPath = state('/')
  const showRemoteStoragePage = state(false)
  const showRemotePage = state(false)
  const showGatewayPage = state(false)
  const showSettingsPage = state(false)
  const showNetworkPairPage = state(false)
  const isShowPasswordManager = state(false)
  const searchFilters = state({
    query: '',
    sortBy: 'name' as const,
    sortDirection: 'asc' as const,
    viewMode: 'list' as const,
    showHidden: false,
    fileTypes: [] as string[],
  })

  initAppContext(
    createMockAppContext({
      store: {
        detailsPanelFileId,
        currentPath,
        showRemoteStoragePage,
        showRemotePage,
        showGatewayPage,
        showSettingsPage,
        showNetworkPairPage,
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
}

describe('NavigationModel overlay resolution', () => {
  let catalog: ReturnType<typeof createCatalogMock>

  beforeEach(() => {
    clearAppContext()
    navigationModel.disconnect()
    window.history.replaceState({}, '', '/dashboard?layout=mobile&surface=files&path=%2F')
    catalog = createCatalogMock()
    setupContext(catalog)
    navigationModel.connect()
  })

  afterEach(() => {
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
      images: [{id: 2, name: 'photo.png'}],
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
})
