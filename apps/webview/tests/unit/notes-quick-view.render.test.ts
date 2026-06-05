import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {CatalogNotesListItem} from '../../src/core/catalog/local-catalog/types'
import {
  NotesQuickView,
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

function setupContext(items: CatalogNotesListItem[] | null) {
  const connected = atom(true)
  initAppContext(
    createMockAppContext({
      catalog: items
        ? ({
            catalog: new FakeCatalogSubscription(),
            syncing: atom(false),
            listNotes: async () => ({version: 1, items}),
          } as any)
        : undefined,
      ws: {connected} as any,
    }),
  )
}

async function renderDesktop() {
  ensureDefined()
  const element = document.createElement('notes-quick-view') as NotesQuickView
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

async function settle(element: NotesQuickView | NotesQuickViewMobile) {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await element.updateComplete
  }

  const nested = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-summary-rail',
  )
  await nested?.updateComplete
}

afterEach(() => {
  document.querySelectorAll('notes-quick-view, notes-quick-view-mobile').forEach((el) => el.remove())
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
    expect(() => NotesQuickViewMobile.define()).not.toThrow()
    expect(customElements.get('notes-quick-view')).toBe(NotesQuickView)
    expect(customElements.get('notes-quick-view-mobile')).toBe(NotesQuickViewMobile)
  })

  it('renders desktop summary, search, and rows from visible Markdown notes', async () => {
    setupContext([
      note(1, 'Root.md', '/Root.md', 'text/markdown'),
      note(4, 'Plan.markdown', '/Docs/Plan.markdown'),
    ])

    const element = await renderDesktop()
    const summary = element.shadowRoot?.querySelector('pm-summary-rail.quick-view__summary-rail')

    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBe(summary)
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
    const layout = element.shadowRoot?.querySelector('[data-layout="mobile"]')
    const summary = element.shadowRoot?.querySelector('pm-summary-rail.quick-view__summary-rail')

    expect(element.shadowRoot?.querySelector('[data-layout="mobile"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[data-layout="desktop"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__header pm-summary-rail')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__title-row')).toBeNull()
    expect(element.shadowRoot?.querySelector('.quick-view__content')).not.toBeNull()
    expect(summary).not.toBeNull()
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
