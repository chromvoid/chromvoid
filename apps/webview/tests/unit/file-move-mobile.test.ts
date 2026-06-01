import {atom} from '@reatom/core'
import {afterEach, describe, expect, it} from 'vitest'

import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {FileMoveMobile} from '../../src/features/file-manager/components/file-move'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import {clearAppContext, initAppContext, type AppContext} from '../../src/shared/services/app-context'
import {applyManifestFixture, catalogDir} from './helpers/catalog-manifest'

function setupContext() {
  const mirror = new CatalogMirror()
  applyManifestFixture(mirror, [
    catalogDir({id: 1, name: 'Docs', children: []}),
    catalogDir({id: 2, name: 'Archive', children: []}),
  ])

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
    },
    ws: {connected: atom(true), connecting: atom(false)},
    state: {data: atom({})},
    router: {route: atom('dashboard'), isLoading: atom(false)},
  } as unknown as AppContext)
}

async function flush(element: HTMLElement) {
  await (element as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete
  await Promise.resolve()
}

function stylesText(element: HTMLElement): string {
  return ((element.constructor as typeof FileMoveMobile).styles as Array<{cssText?: string}>)
    .map((style) => style.cssText ?? '')
    .join('\n')
}

describe('file-move-mobile', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('renders localized root and disabled destination rows with compact mobile styles', async () => {
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
    const styleText = stylesText(element)
    expect(styleText).toContain('min-block-size: 56px')
    expect(styleText).toContain('grid-template-rows: auto auto minmax(0, 1fr);')
    expect(styleText).toContain('grid-row: 3;')
    expect(styleText).toContain('max-block-size: none;')
    expect(styleText).toContain('.tree .row:last-child')
    expect(styleText).toContain('border-end-start-radius: var(--cv-radius-2);')
    expect(styleText).toContain('box-shadow: inset 0 0 0 2px var(--cv-color-primary-ring);')
    expect(styleText).toMatch(/\.tree\s*\{[\s\S]*?border: 0;/)
    expect(styleText).toMatch(/\.row\s*\{[\s\S]*?border: 0;/)
    expect(styleText).toContain('.tree:focus-within .row.active')
    expect(styleText).not.toContain('box-shadow: inset 3px 0 0 var(--cv-color-primary);')
  })
})
