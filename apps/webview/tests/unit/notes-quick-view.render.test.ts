import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {CatalogNotesListItem} from '../../src/core/catalog/local-catalog/types'
import {
  NotesQuickView,
  NotesQuickViewControls,
  NotesQuickViewMobile,
  notesQuickViewModel,
} from '../../src/features/file-manager/components/notes-quick-view'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

class FakeCatalogSubscription {
  readonly listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    listener()
    return () => this.listeners.delete(listener)
  }
}

let defined = false

function ensureDefined() {
  if (defined) {
    return
  }

  NotesQuickView.define()
  NotesQuickViewControls.define()
  NotesQuickViewMobile.define()
  defined = true
}

function note(
  nodeId: number,
  name: string,
  path: string,
  mimeType?: string,
  overrides: Partial<CatalogNotesListItem> = {},
): CatalogNotesListItem {
  return {
    node_id: nodeId,
    name,
    path,
    size: 128,
    parent_path: parentPath(path),
    mime_type: mimeType ?? null,
    source_revision: 1,
    created_at: 1_717_171_700,
    updated_at: 1_717_171_717,
    ...overrides,
  }
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : `${path.slice(0, index)}/`
}

function setupContext(
  items: CatalogNotesListItem[] | null,
  options: {listNotes?: () => Promise<{version: number; items: CatalogNotesListItem[]}>} = {},
) {
  const connected = atom(true)
  const listNotes = vi.fn(options.listNotes ?? (async () => ({version: 1, items: items ?? []})))
  initAppContext(
    createMockAppContext({
      catalog: items
        ? ({
            catalog: new FakeCatalogSubscription(),
            syncing: atom(false),
            listNotes,
          } as any)
        : undefined,
      ws: {connected} as any,
    }),
  )

  return {listNotes}
}

async function renderDesktop() {
  ensureDefined()
  const element = document.createElement('notes-quick-view') as NotesQuickView
  document.body.appendChild(element)
  await settle(element)
  return element
}

async function renderDesktopWithExternalToolbar() {
  ensureDefined()
  const element = document.createElement('notes-quick-view') as NotesQuickView
  element.externalToolbar = true
  document.body.appendChild(element)
  await settle(element)
  return element
}

async function renderDesktopControls() {
  ensureDefined()
  const element = document.createElement('notes-quick-view-controls') as NotesQuickViewControls
  document.body.appendChild(element)
  await settle(element)
  return element
}

async function renderMobile() {
  ensureDefined()
  const element = document.createElement('notes-quick-view-mobile') as NotesQuickViewMobile
  document.body.appendChild(element)
  await settle(element)
  return element
}

async function settle(element: NotesQuickView | NotesQuickViewMobile | NotesQuickViewControls) {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await element.updateComplete
  }
}

async function getWorkspaceHeader(element: NotesQuickView | NotesQuickViewMobile | NotesQuickViewControls) {
  const header = element.shadowRoot?.querySelector('workspace-dashboard-header') as
    | (HTMLElement & {updateComplete?: Promise<unknown>})
    | null
  await header?.updateComplete
  return header
}

async function getMobileLayoutScroller(element: NotesQuickViewMobile) {
  const layout = element.shadowRoot?.querySelector('mobile-surface-layout[data-layout="mobile"]') as
    | (HTMLElement & {updateComplete?: Promise<unknown>})
    | null
  await layout?.updateComplete
  const scroller = layout?.shadowRoot?.querySelector<HTMLElement>('[part~="scroll"]') ?? null
  expect(scroller).not.toBeNull()
  return scroller!
}

async function waitForText(
  element: NotesQuickView | NotesQuickViewMobile | NotesQuickViewControls,
  text: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await settle(element)
    if (element.shadowRoot?.textContent?.includes(text)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  expect(element.shadowRoot?.textContent).toContain(text)
}

afterEach(() => {
  document
    .querySelectorAll('notes-quick-view-controls, notes-quick-view, notes-quick-view-mobile')
    .forEach((el) => el.remove())
  notesQuickViewModel.actions.clearFilters()
  notesQuickViewModel.actions.setViewMode('flat')
  notesQuickViewModel.actions.expandAllDirectories()
  notesQuickViewModel.clearMobileScrollPosition()
  clearAppContext()
  vi.restoreAllMocks()
})

describe('NotesQuickView render', () => {
  it('defines desktop and mobile elements idempotently', () => {
    ensureDefined()

    expect(() => NotesQuickView.define()).not.toThrow()
    expect(() => NotesQuickViewControls.define()).not.toThrow()
    expect(() => NotesQuickViewMobile.define()).not.toThrow()
    expect(customElements.get('notes-quick-view-controls')).toBe(NotesQuickViewControls)
    expect(customElements.get('notes-quick-view')).toBe(NotesQuickView)
    expect(customElements.get('notes-quick-view-mobile')).toBe(NotesQuickViewMobile)
  })

  it('renders desktop search and rows from visible Markdown notes without a local summary rail', async () => {
    setupContext([
      note(1, 'Root.md', '/Root.md', 'text/markdown'),
      note(4, 'Plan.markdown', '/Docs/Plan.markdown'),
    ])

    const element = await renderDesktop()
    const summary = element.shadowRoot?.querySelector('pm-summary-rail.quick-view__summary-rail')

    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header')).toBeNull()
    expect(summary).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view > pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__title-row')).toBeNull()
    expect(element.shadowRoot?.textContent).not.toContain('Markdown files across Files')
    const header = await getWorkspaceHeader(element)
    expect(header?.hasAttribute('embedded')).toBe(true)
    expect(header?.shadowRoot?.querySelector('cv-input.search-box')).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('[data-display-mode="list"]')?.hasAttribute('checked')).toBe(
      true,
    )
    expect(header?.shadowRoot?.querySelector('[data-display-mode="tree"]')).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('.filter-chips')).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('.sort-control')).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('.view-switch')).not.toBeNull()
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)
    expect(element.shadowRoot?.textContent).toContain('Root')
    expect(element.shadowRoot?.textContent).toContain('Plan')
    expect(element.shadowRoot?.textContent).not.toContain('photo.png')
  })

  it('omits the local notes toolbar when an external workspace header owns controls', async () => {
    setupContext([note(1, 'Root.md', '/Root.md', 'text/markdown')])

    const element = await renderDesktopWithExternalToolbar()

    expect(element.shadowRoot?.querySelector('workspace-dashboard-header')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-summary-rail.quick-view__summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(1)
  })

  it('renders desktop notes toolbar search and delegates interaction to the notes model', async () => {
    setupContext([note(1, 'Root.md', '/Root.md', 'text/markdown')])

    const element = await renderDesktopControls()
    const header = await getWorkspaceHeader(element)
    const search = header?.shadowRoot?.querySelector('cv-input.search-box') as
      | (HTMLElement & {value: string})
      | null

    expect(search).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('.sort-control')).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('.view-switch')).not.toBeNull()

    search!.value = 'Root'
    search!.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'Root'}, bubbles: true, composed: true}),
    )
    await settle(element)

    expect(notesQuickViewModel.state.query()).toBe('Root')

    search!.dispatchEvent(new CustomEvent('cv-clear', {detail: {}, bubbles: true, composed: true}))
    await settle(element)

    expect(notesQuickViewModel.state.query()).toBe('')
  })

  it('renders hierarchy mode with expandable catalog folders', async () => {
    setupContext([
      note(1, 'Root.md', '/Root.md', 'text/markdown'),
      note(4, 'Plan.markdown', '/Docs/Plan.markdown'),
    ])

    const element = await renderDesktop()
    const header = await getWorkspaceHeader(element)
    const hierarchyButton = header?.shadowRoot?.querySelector(
      '[data-display-mode="tree"]',
    ) as HTMLElement | null

    hierarchyButton?.click()
    await settle(element)

    expect(notesQuickViewModel.state.viewMode()).toBe('hierarchy')
    const tree = element.shadowRoot?.querySelector('.tree')
    const folder = element.shadowRoot?.querySelector('[data-folder-path="/Docs"]')
    const folderToggle = folder?.querySelector('.folder-toggle') as HTMLButtonElement | null

    expect(tree).not.toBeNull()
    await header?.updateComplete
    expect(header?.shadowRoot?.querySelector('[data-display-mode="tree"]')?.hasAttribute('checked')).toBe(
      true,
    )
    expect(folder?.textContent).toContain('Docs')
    expect(folder?.textContent).toContain('Plan')
    expect(element.shadowRoot?.textContent).not.toContain('Empty')

    folderToggle?.click()
    await settle(element)

    const collapsedFolder = element.shadowRoot?.querySelector('[data-folder-path="/Docs"]')
    expect(collapsedFolder?.querySelector('.folder-row')?.getAttribute('aria-expanded')).toBe('false')
    expect(collapsedFolder?.textContent).not.toContain('Plan')
  })

  it('renders list notes without path metadata and keeps preview text above compact details', async () => {
    setupContext([
      note(15, 'Encrypted chunks.md', '/Vault/Encrypted chunks.md', 'text/markdown', {
        heading: 'Encrypted chunks',
        excerpt: 'Files are split into fixed-size chunks before they ever touch disk.',
        preview_words: 27,
        size: 242,
      }),
    ])

    const element = await renderDesktop()
    const card = element.shadowRoot?.querySelector('.note-card--list')
    const detailsElement = card?.querySelector('.note-card__details')
    const detailsLabel = detailsElement?.getAttribute('aria-label') ?? ''

    expect(card).not.toBeNull()
    expect(card?.querySelector('.note-card__title')?.textContent).toContain('Encrypted chunks')
    expect(card?.querySelector('.note-card__excerpt')?.textContent).toContain('Files are split')
    expect(detailsLabel).toContain('242 B')
    expect(detailsLabel).toContain('27 words')
    expect(detailsLabel).toContain(' · ')
    expect(detailsLabel).not.toContain('/Vault/')
    expect(card?.textContent).not.toContain('/Vault/')
  })

  it('renders grid notes as content preview cards', async () => {
    setupContext([
      note(17, 'Chunks.md', '/Vault/Chunks.md', 'text/markdown', {
        heading: 'Encrypted chunks',
        excerpt: 'Files are split into fixed-size chunks before they touch disk.',
        size: 242,
      }),
    ])

    const element = await renderDesktop()
    const header = await getWorkspaceHeader(element)
    const gridButton = header?.shadowRoot?.querySelector('[data-display-mode="grid"]') as HTMLElement | null

    gridButton?.click()
    await settle(element)

    const card = element.shadowRoot?.querySelector('.note-card--grid')
    const detailsElement = card?.querySelector('.note-card__details--grid')
    const details = detailsElement?.textContent ?? ''

    expect(card).not.toBeNull()
    expect(card?.querySelector('.note-card__grid-head')).toBeNull()
    expect(card?.querySelector('.note-card__preview-title')?.textContent).toContain('Encrypted chunks')
    expect(card?.querySelector('.note-card__preview-copy')?.textContent).toContain('Files are split')
    expect(card?.querySelector('.note-card__title--grid')?.textContent).toContain('Chunks')
    expect(details).toContain('242 B')
    expect(detailsElement?.getAttribute('aria-label')).toContain('242 B')
    expect(detailsElement?.getAttribute('aria-label')).toContain(' · ')
    expect(details).not.toContain('/Vault/')
  })

  it('isolates mixed-direction note content, paths, and technical metadata at render boundaries', async () => {
    notesQuickViewModel.actions.setDisplayMode('list')
    setupContext([
      note(31, 'دليل API.md', '/مشروع/دليل API.md', 'text/markdown', {
        heading: 'دليل API',
        excerpt: 'شرح API آمن',
        preview_words: 27,
        size: 242,
      }),
      note(32, 'خام.md', '/مشروع/خام.md', 'text/markdown', {
        heading: ' ',
        excerpt: ' ',
      }),
    ])

    const element = await renderDesktop()
    const proseCard = element.shadowRoot?.querySelector('[data-row-id="31"]')
    const pathFallbackCard = element.shadowRoot?.querySelector('[data-row-id="32"]')

    expect(proseCard?.querySelector('.note-card__title > bdi[dir="auto"]')?.textContent).toBe('دليل API')
    expect(proseCard?.querySelector('.note-card__badge > bdi[dir="ltr"]')?.textContent).toBe('MD')
    expect(proseCard?.querySelector('.note-card__excerpt > bdi[dir="auto"]')?.textContent).toBe('شرح API آمن')
    expect(proseCard?.querySelectorAll('.note-card__detail > bdi[dir="ltr"]')).toHaveLength(3)
    expect(proseCard?.getAttribute('aria-label')).toContain('\u2068دليل API.md\u2069')
    expect(pathFallbackCard?.querySelector('.note-card__excerpt > bdi[dir="ltr"]')?.textContent).toBe(
      '/مشروع/',
    )

    notesQuickViewModel.actions.setDisplayMode('tree')
    await settle(element)

    const folder = element.shadowRoot?.querySelector('[data-folder-path="/مشروع"]')
    expect(folder?.querySelector('.folder-name > bdi[dir="auto"]')?.textContent).toBe('مشروع')
    expect(folder?.querySelector('.folder-name')?.getAttribute('title')).toBe('\u2066/مشروع\u2069')
    expect(folder?.querySelector('.folder-toggle')?.getAttribute('aria-label')).toContain('\u2068مشروع\u2069')
  })

  it('renders the mobile custom element with the mobile layout marker', async () => {
    setupContext([note(1, 'Root.md', '/Root.md'), note(3, 'Mobile.md', '/Docs/Mobile.md')])

    const element = await renderMobile()
    const layout = element.shadowRoot?.querySelector('mobile-surface-layout[data-layout="mobile"]')

    expect(layout).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__title-row')).toBeNull()
    const header = await getWorkspaceHeader(element)
    expect(header?.hasAttribute('embedded')).toBe(true)
    expect(header?.shadowRoot?.querySelector('.filter-chips')).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('.sort-control')).not.toBeNull()
    expect(header?.shadowRoot?.querySelector('.view-switch')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__content')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('pm-summary-rail')).toBeNull()
    expect(layout?.querySelector('[slot="footer"]')).toBeNull()
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)

    const hierarchyButton = header?.shadowRoot?.querySelector(
      '[data-display-mode="tree"]',
    ) as HTMLElement | null
    hierarchyButton?.click()
    await settle(element)

    expect(notesQuickViewModel.state.viewMode()).toBe('hierarchy')
    expect(hierarchyButton?.hasAttribute('checked')).toBe(true)
    expect(element.shadowRoot?.querySelector('.tree')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-folder-path="/Docs"]')?.textContent).toContain('Mobile')
  })

  it('restores mobile scroll when returning to the notes page', async () => {
    setupContext([note(1, 'Root.md', '/Root.md'), note(3, 'Mobile.md', '/Docs/Mobile.md')])

    const element = await renderMobile()
    const scroller = await getMobileLayoutScroller(element)
    scroller.scrollTop = 220

    element.remove()

    const restoredElement = await renderMobile()
    const restoredScroller = await getMobileLayoutScroller(restoredElement)

    expect(restoredScroller.scrollTop).toBe(220)
  })

  it('renders unavailable, empty, and filtered empty states', async () => {
    setupContext(null)
    const unavailableElement = await renderDesktop()
    expect(unavailableElement.shadowRoot?.querySelector('cv-empty-state')?.getAttribute('headline')).toBe(
      'Files catalog is unavailable',
    )
    unavailableElement.remove()

    setupContext([])
    const emptyElement = await renderDesktop()
    expect(emptyElement.shadowRoot?.querySelector('cv-empty-state')?.getAttribute('headline')).toBe(
      'No Markdown notes',
    )
    expect(
      emptyElement.shadowRoot?.querySelector('cv-guidance-anchor[anchor-id="notes.create-note"]'),
    ).not.toBeNull()
    emptyElement.remove()

    setupContext([note(1, 'Root.md', '/Root.md')])
    notesQuickViewModel.actions.setQuery('missing')
    const filteredElement = await renderDesktop()
    expect(filteredElement.shadowRoot?.querySelector('cv-empty-state')?.getAttribute('headline')).toBe(
      'No matching notes',
    )
    expect(filteredElement.shadowRoot?.querySelector('.clear-filters')).not.toBeNull()
  })

  it('renders load failure as retryable error instead of an empty notes state', async () => {
    const {listNotes} = setupContext([], {
      listNotes: vi
        .fn()
        .mockRejectedValueOnce(new Error('notes failed'))
        .mockResolvedValueOnce({version: 2, items: [note(9, 'Recovered.md', '/Recovered.md')]}),
    })

    const element = await renderDesktop()

    expect(element.shadowRoot?.querySelector('cv-empty-state')?.getAttribute('headline')).toBe(
      'Could not load notes',
    )
    expect(element.shadowRoot?.querySelector('cv-empty-state')?.getAttribute('headline')).not.toBe(
      'No Markdown notes',
    )

    const retry = element.shadowRoot?.querySelector('.retry-load') as HTMLButtonElement | null
    expect(retry).not.toBeNull()

    retry?.click()
    await waitForText(element, 'Recovered')

    expect(element.shadowRoot?.querySelector('cv-empty-state')).toBeNull()
    expect(listNotes).toHaveBeenCalledTimes(2)
  })

  it('desktop note row delegates to model navigation', async () => {
    setupContext([note(7, 'Root.md', '/Root.md')])
    const openMarkdownDocument = vi
      .spyOn(navigationModel, 'openMarkdownDocument')
      .mockImplementation(() => {})

    const element = await renderDesktop()
    const row = element.shadowRoot?.querySelector('.row') as HTMLElement | null

    expect(element.shadowRoot?.querySelector('.open-note')).toBeNull()
    expect(row?.getAttribute('tabindex')).toBe('0')
    expect(row?.getAttribute('title')).toContain('Root.md')

    row?.click()
    expect(openMarkdownDocument).toHaveBeenCalledWith(7, 'push', {
      source: {
        path: '/Root.md',
        parentPath: '/',
        fileName: 'Root.md',
        size: 128,
        lastModified: 1_717_171_717,
        sourceRevision: 1,
      },
    })

    row?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}))
    expect(openMarkdownDocument).toHaveBeenCalledTimes(2)

    row?.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true}))
    expect(openMarkdownDocument).toHaveBeenCalledTimes(3)
  })

  it('mobile note row delegates tap to model navigation', async () => {
    setupContext([note(11, 'Mobile.md', '/Docs/Mobile.md')])
    const openMarkdownDocument = vi
      .spyOn(navigationModel, 'openMarkdownDocument')
      .mockImplementation(() => {})

    const element = await renderMobile()
    const row = element.shadowRoot?.querySelector('.row') as HTMLElement | null

    expect(element.shadowRoot?.querySelector('.open-note')).toBeNull()

    row?.click()
    expect(openMarkdownDocument).toHaveBeenCalledWith(11, 'push', {
      source: {
        path: '/Docs/Mobile.md',
        parentPath: '/Docs/',
        fileName: 'Mobile.md',
        size: 128,
        lastModified: 1_717_171_717,
        sourceRevision: 1,
      },
    })
  })
})
