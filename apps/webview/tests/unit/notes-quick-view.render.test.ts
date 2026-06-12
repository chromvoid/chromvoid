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

function note(nodeId: number, name: string, path: string, mimeType?: string): CatalogNotesListItem {
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

  const nested = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-summary-rail',
  )
  await nested?.updateComplete
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
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBeNull()
    expect(summary).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view > pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__title-row')).toBeNull()
    expect(element.shadowRoot?.textContent).not.toContain('Markdown files across Files')
    expect(element.shadowRoot?.querySelector('input[type="search"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-view-mode="flat"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(element.shadowRoot?.querySelector('[data-view-mode="hierarchy"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)
    expect(element.shadowRoot?.textContent).toContain('Root.md')
    expect(element.shadowRoot?.textContent).toContain('Plan.markdown')
    expect(element.shadowRoot?.textContent).not.toContain('photo.png')
  })

  it('skips the desktop local header when an external toolbar owns controls', async () => {
    setupContext([note(1, 'Root.md', '/Root.md', 'text/markdown')])

    const element = await renderDesktopWithExternalToolbar()

    expect(element.shadowRoot?.querySelector('.quick-view__header')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-summary-rail.quick-view__summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(1)
  })

  it('renders desktop notes controls and delegates interaction to the notes model', async () => {
    setupContext([note(1, 'Root.md', '/Root.md', 'text/markdown')])

    const element = await renderDesktopControls()
    const search = element.shadowRoot?.querySelector('input[type="search"]') as HTMLInputElement | null
    const hierarchyButton = element.shadowRoot?.querySelector(
      '[data-view-mode="hierarchy"]',
    ) as HTMLButtonElement | null

    expect(search).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-view-mode="flat"]')).not.toBeNull()
    expect(hierarchyButton).not.toBeNull()

    search!.value = 'Root'
    search!.dispatchEvent(new InputEvent('input', {bubbles: true}))
    await settle(element)

    expect(notesQuickViewModel.state.query()).toBe('Root')
    const clearFilters = element.shadowRoot?.querySelector('.clear-filters') as HTMLButtonElement | null
    expect(clearFilters).not.toBeNull()

    clearFilters?.click()
    await settle(element)

    expect(notesQuickViewModel.state.query()).toBe('')

    hierarchyButton?.click()
    await settle(element)

    expect(notesQuickViewModel.state.viewMode()).toBe('hierarchy')
  })

  it('renders hierarchy mode with expandable catalog folders', async () => {
    setupContext([
      note(1, 'Root.md', '/Root.md', 'text/markdown'),
      note(4, 'Plan.markdown', '/Docs/Plan.markdown'),
    ])

    const element = await renderDesktop()
    const hierarchyButton = element.shadowRoot?.querySelector(
      '[data-view-mode="hierarchy"]',
    ) as HTMLButtonElement | null

    hierarchyButton?.click()
    await settle(element)

    expect(notesQuickViewModel.state.viewMode()).toBe('hierarchy')
    const tree = element.shadowRoot?.querySelector('.tree')
    const folder = element.shadowRoot?.querySelector('[data-folder-path="/Docs"]')
    const folderToggle = folder?.querySelector('.folder-toggle') as HTMLButtonElement | null

    expect(tree).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-view-mode="hierarchy"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(folder?.textContent).toContain('Docs')
    expect(folder?.textContent).toContain('Plan.markdown')
    expect(element.shadowRoot?.textContent).not.toContain('Empty')

    folderToggle?.click()
    await settle(element)

    const collapsedFolder = element.shadowRoot?.querySelector('[data-folder-path="/Docs"]')
    expect(collapsedFolder?.querySelector('.folder-row')?.getAttribute('aria-expanded')).toBe('false')
    expect(collapsedFolder?.textContent).not.toContain('Plan.markdown')
  })

  it('renders the mobile custom element with the mobile layout marker', async () => {
    setupContext([note(1, 'Root.md', '/Root.md'), note(3, 'Mobile.md', '/Docs/Mobile.md')])

    const element = await renderMobile()
    const layout = element.shadowRoot?.querySelector('mobile-surface-layout[data-layout="mobile"]')
    const summary = element.shadowRoot?.querySelector('pm-summary-rail.quick-view__summary-rail')

    expect(layout).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__title-row')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__content')).not.toBeNull()
    expect(summary).not.toBeNull()
    expect(summary?.getAttribute('slot')).toBe('footer')
    expect(layout?.lastElementChild).toBe(summary)
    expect(element.shadowRoot?.querySelectorAll('.row')).toHaveLength(2)

    const hierarchyButton = element.shadowRoot?.querySelector(
      '[data-view-mode="hierarchy"]',
    ) as HTMLButtonElement | null
    hierarchyButton?.click()
    await settle(element)

    expect(notesQuickViewModel.state.viewMode()).toBe('hierarchy')
    expect(element.shadowRoot?.querySelector('.tree')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-folder-path="/Docs"]')?.textContent).toContain('Mobile.md')
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
    expect(emptyElement.shadowRoot?.querySelector('cv-guidance-anchor[anchor-id="notes.create-note"]')).not.toBeNull()
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
    await waitForText(element, 'Recovered.md')

    expect(element.shadowRoot?.querySelector('cv-empty-state')).toBeNull()
    expect(listNotes).toHaveBeenCalledTimes(2)
  })

  it('desktop note row delegates to model navigation', async () => {
    setupContext([note(7, 'Root.md', '/Root.md')])
    const openMarkdownDocument = vi.spyOn(navigationModel, 'openMarkdownDocument').mockImplementation(() => {})

    const element = await renderDesktop()
    const row = element.shadowRoot?.querySelector('.row') as HTMLElement | null

    expect(element.shadowRoot?.querySelector('.open-note')).toBeNull()
    expect(row?.getAttribute('tabindex')).toBe('0')
    expect(row?.getAttribute('title')).toContain('Root.md')

    row?.click()
    expect(openMarkdownDocument).toHaveBeenCalledWith(7, 'push', {
      source: {
        path: '/Root.md',
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
    const openMarkdownDocument = vi.spyOn(navigationModel, 'openMarkdownDocument').mockImplementation(() => {})

    const element = await renderMobile()
    const row = element.shadowRoot?.querySelector('.row') as HTMLElement | null

    expect(element.shadowRoot?.querySelector('.open-note')).toBeNull()

    row?.click()
    expect(openMarkdownDocument).toHaveBeenCalledWith(11, 'push', {
      source: {
        path: '/Docs/Mobile.md',
        fileName: 'Mobile.md',
        size: 128,
        lastModified: 1_717_171_717,
        sourceRevision: 1,
      },
    })
  })
})
