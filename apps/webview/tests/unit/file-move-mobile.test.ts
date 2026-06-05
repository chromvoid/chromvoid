import {atom} from '@reatom/core'
import {afterEach, describe, expect, it} from 'vitest'

import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {FileMoveMobile} from '../../src/features/file-manager/components/file-move'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {clearAppContext, initAppContext, type AppContext} from '../../src/shared/services/app-context'
import {applyManifestFixture, catalogDir} from './helpers/catalog-manifest'

function setupContext(
  rootSummaries = [
    catalogDir({id: 1, name: 'Docs', children: []}),
    catalogDir({id: 2, name: 'Archive', children: []}),
  ],
  options: {ensureFolderRangeLoaded?: (request: {path: string}) => Promise<void>} = {},
) {
  const mirror = new CatalogMirror()
  applyManifestFixture(mirror, rootSummaries)

  const searchFilters = atom<SearchFilters>({
    query: '',
    sortBy: 'name',
    sortDirection: 'asc',
    viewMode: 'list',
    showHidden: false,
    fileTypes: [],
  })

  initAppContext({
    store: {
      currentPath: atom('/'),
      searchFilters,
      selectedNodeIds: atom<number[]>([]),
      selectionMode: atom(false),
      layoutMode: atom('mobile'),
      setCurrentPath: () => {},
      setSelectedItems: () => {},
      setSelectionMode: () => {},
      pushNotification: () => {},
    },
    catalog: {
      catalog: mirror,
      api: {move: async () => {}},
      refresh: async () => {},
      syncing: atom(false),
      lastError: atom(null),
      getEntryMeta: () => undefined,
      ...(options.ensureFolderRangeLoaded ? {ensureFolderRangeLoaded: options.ensureFolderRangeLoaded} : {}),
    },
    ws: {connected: atom(true), connecting: atom(false)},
    state: {data: atom({})},
    router: {route: atom('dashboard'), isLoading: atom(false)},
  } as unknown as AppContext)

  return mirror
}

async function flush(element: HTMLElement) {
  await (element as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete
  await Promise.resolve()
}

describe('file-move-mobile', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('renders localized root and disabled destination rows', async () => {
    setupContext()
    FileMoveMobile.define()

    const element = document.createElement('file-move-mobile') as FileMoveMobile
    element.selectedPath = '/'
    element.disabledPaths = ['/Docs']
    document.body.append(element)

    await flush(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('Files root')
    expect(text).toContain('Docs')
    expect(
      element.shadowRoot?.querySelector('[data-option-path="/Docs"]')?.getAttribute('aria-disabled'),
    ).toBe('true')
  })

  it('scrolls options inside the tree container', async () => {
    setupContext()
    FileMoveMobile.define()

    const element = document.createElement('file-move-mobile') as FileMoveMobile
    element.selectedPath = '/'
    document.body.append(element)

    await flush(element)

    const treeWrap = element.shadowRoot?.querySelector('.tree-wrap') as HTMLElement | null
    const docsRow = element.shadowRoot?.querySelector('[data-option-path="/Docs"]') as HTMLElement | null
    const archiveRow = element.shadowRoot?.querySelector('[data-option-path="/Archive"]') as HTMLElement | null
    expect(treeWrap).not.toBeNull()
    expect(docsRow).not.toBeNull()
    expect(archiveRow).not.toBeNull()

    Object.defineProperty(treeWrap, 'clientHeight', {value: 100, configurable: true})
    Object.defineProperty(docsRow, 'offsetTop', {value: 260, configurable: true})
    Object.defineProperty(docsRow, 'offsetHeight', {value: 56, configurable: true})
    Object.defineProperty(archiveRow, 'offsetTop', {value: 260, configurable: true})
    Object.defineProperty(archiveRow, 'offsetHeight', {value: 56, configurable: true})
    treeWrap!.scrollTop = 0

    const picker = element as unknown as {scrollOptionIntoView(key: string): void}
    picker.scrollOptionIntoView('target:/Docs')

    expect(treeWrap!.scrollTop).toBe(216)
  })

  it('renders child rows when a directory is expanded', async () => {
    setupContext([
      catalogDir({
        id: 1,
        name: 'chromvoid',
        children: [catalogDir({id: 2, name: 'android-app', children: []})],
      }),
    ])
    FileMoveMobile.define()

    const element = document.createElement('file-move-mobile') as FileMoveMobile
    document.body.append(element)

    await flush(element)

    expect(element.shadowRoot?.querySelector('[data-option-path="/chromvoid/android-app"]')).toBeNull()

    const toggle = element.shadowRoot?.querySelector(
      '.chevron[data-option-path="/chromvoid"]',
    ) as HTMLElement | null
    expect(toggle).not.toBeNull()

    toggle!.click()
    await flush(element)

    expect(element.shadowRoot?.querySelector('[data-option-path="/chromvoid/android-app"]')).not.toBeNull()
  })

  it('loads deferred children before rendering expanded directory rows', async () => {
    const ensureFolderRangeLoaded = async (request: {path: string}) => {
      expect(request.path).toBe('/chromvoid')
      mirror.applyFolderPage({
        current_path: '/chromvoid',
        version: 1,
        total_count: 1,
        offset: 0,
        limit: 500,
        reload_required: false,
        items: [
          {
            node_id: 2,
            name: 'android-app',
            is_dir: true,
            size: 0,
            media_inspected_revision: 0,
            created_at: 0,
            updated_at: 0,
          },
        ],
      })
    }
    const mirror = setupContext(
      [catalogDir({id: 1, name: 'chromvoid', hasChildren: true})],
      {ensureFolderRangeLoaded},
    )
    FileMoveMobile.define()

    const element = document.createElement('file-move-mobile') as FileMoveMobile
    document.body.append(element)

    await flush(element)

    const toggle = element.shadowRoot?.querySelector(
      '.chevron[data-option-path="/chromvoid"]',
    ) as HTMLElement | null
    expect(toggle).not.toBeNull()

    toggle!.click()
    await flush(element)
    await Promise.resolve()
    await flush(element)

    expect(element.shadowRoot?.querySelector('[data-option-path="/chromvoid/android-app"]')).not.toBeNull()
  })

  it('collapses a deferred directory when loaded children contain no target directories', async () => {
    let mirror!: CatalogMirror
    mirror = setupContext([catalogDir({id: 1, name: 'files-only', hasChildren: true})], {
      ensureFolderRangeLoaded: async () => {
        mirror.applyFolderPage({
          current_path: '/files-only',
          version: 1,
          total_count: 1,
          offset: 0,
          limit: 500,
          reload_required: false,
          items: [
            {
              node_id: 2,
              name: 'readme.txt',
              is_dir: false,
              size: 100,
              media_inspected_revision: 0,
              created_at: 0,
              updated_at: 0,
            },
          ],
        })
      },
    })
    FileMoveMobile.define()

    const element = document.createElement('file-move-mobile') as FileMoveMobile
    document.body.append(element)

    await flush(element)

    const toggle = element.shadowRoot?.querySelector(
      '.chevron[data-option-path="/files-only"]',
    ) as HTMLElement | null
    expect(toggle).not.toBeNull()

    toggle!.click()
    await flush(element)
    await Promise.resolve()
    await flush(element)

    expect(element.shadowRoot?.querySelector('[data-option-path="/files-only/readme.txt"]')).toBeNull()
    expect(toggle?.querySelector('cv-icon')?.getAttribute('name')).toBe('chevron-right')
  })
})
