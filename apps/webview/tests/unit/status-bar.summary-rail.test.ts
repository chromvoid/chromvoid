import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {Store} from '../../src/app/state/store'
import {ChromVoidState} from '../../src/core/state/app-state'
import type {CatalogNotesListItem} from '../../src/core/catalog/local-catalog/types'
import {notesQuickViewModel} from '../../src/features/file-manager/components/notes-quick-view'
import {pmOtpQuickViewModel} from '../../src/features/passmanager/components/otp-quick-view'
import {pmCredentialSecurityAuditModel} from '../../src/features/passmanager/models/pm-credential-security-audit.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {StatusBar} from '../../src/features/shell/components/status-bar'
import {clearAppContext, initAppContext} from '../../src/shared/services/app-context'

class FakeCatalogSubscription {
  readonly listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    listener()
    return () => this.listeners.delete(listener)
  }
}

type CatalogNode = {
  nodeId: number
  name: string
  path: string
  isDir: boolean
  size: number
  modtime: number
  sourceRevision: number
}

function createWs() {
  return {
    kind: 'ws' as const,
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
    connect() {},
    disconnect() {},
    on() {},
    off() {},
    sendCatalog: async () => undefined,
    sendPassmanager: async () => undefined,
    uploadFile: async () => undefined,
    downloadFile: async function* () {},
    readSecret: async function* () {},
    writeSecret: async () => undefined,
    eraseSecret: async () => undefined,
    generateOTP: async () => '',
    setOTPSecret: async () => undefined,
    removeOTPSecret: async () => undefined,
  }
}

function note(nodeId: number, name: string, path: string): CatalogNotesListItem {
  return {
    node_id: nodeId,
    name,
    path,
    size: 128,
    parent_path: '/',
    mime_type: 'text/markdown',
    source_revision: 1,
    created_at: 1,
    updated_at: 1,
  }
}

function setupContext(options: {
  files?: CatalogNode[]
  notes?: CatalogNotesListItem[]
  layout?: 'desktop' | 'mobile'
} = {}) {
  const ws = createWs()
  const catalogMirror = new FakeCatalogSubscription() as FakeCatalogSubscription & {
    getChildren: (path: string) => CatalogNode[]
    getEntryMeta: () => undefined
  }
  catalogMirror.getChildren = (path: string) => (path === '/' ? options.files ?? [] : [])
  catalogMirror.getEntryMeta = () => undefined
  const catalog = {
    catalog: catalogMirror,
    syncing: atom(false),
    lastError: atom<string | null>(null),
    listNotes: async () => ({version: 1, items: options.notes ?? []}),
  }
  const state = new ChromVoidState()
  const store = new Store(ws as any, state, catalog as any)
  store.setLayoutQueryParam(options.layout ?? 'desktop')

  initAppContext({store, ws: ws as any, catalog: catalog as any, state})
  navigationModel.navigateToSurface('files', 'replace')
  return {store}
}

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group | ManagerRoot, id: string, title: string, otps: unknown[] = []) {
  return new Entry(parent, {
    id,
    title,
    username: `${id}@example.test`,
    urls: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps,
  } as any)
}

async function renderStatusBar() {
  StatusBar.define()
  const element = document.createElement('status-bar') as StatusBar
  document.body.append(element)
  await settleStatusBar(element)
  return element
}

async function settleStatusBar(element: StatusBar) {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await element.updateComplete
  }

  const summary = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-summary-rail.status-context-summary',
  )
  await summary?.updateComplete
}

function getSummary(element: StatusBar) {
  return element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-summary-rail.status-context-summary',
  )
}

describe('status-bar contextual summary rail', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    notesQuickViewModel.disconnect()
    notesQuickViewModel.actions.clearFilters()
    pmOtpQuickViewModel.actions.clearFilters()
    pmCredentialSecurityAuditModel.dispose()
    setPassmanagerRoot(undefined)
    window.passmanager = originalPassmanager
    navigationModel.navigateToSurface('files', 'replace')
    clearAppContext()
  })

  it('renders the file manager summary from desktop shell state', async () => {
    const {store} = setupContext({
      files: [
        {nodeId: 1, name: 'A.txt', path: '/A.txt', isDir: false, size: 10, modtime: 1, sourceRevision: 1},
        {nodeId: 2, name: 'B.txt', path: '/B.txt', isDir: false, size: 20, modtime: 1, sourceRevision: 1},
      ],
    })
    store.setSelectedItems([1])

    const element = await renderStatusBar()
    const summary = getSummary(element)

    expect(summary?.getAttribute('data-summary-context')).toBe('files')
    expect(summary?.parentElement?.classList.contains('status-summary-slot')).toBe(true)
    expect(element.shadowRoot?.querySelector('.status-indicators pm-summary-rail.status-context-summary')).toBeNull()
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="items"]')?.textContent).toContain('2')
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="selected"]')?.textContent).toContain('1')
  })

  it('renders the notes summary from the notes quick-view model', async () => {
    setupContext({notes: [note(1, 'Root.md', '/Root.md'), note(2, 'Plan.md', '/Plan.md')]})
    navigationModel.navigateToSurface('notes', 'replace')
    notesQuickViewModel.connect()

    const element = await renderStatusBar()
    await settleStatusBar(element)
    const summary = getSummary(element)

    expect(summary?.getAttribute('data-summary-context')).toBe('notes')
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="total"]')?.textContent).toContain('2')
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="visible"]')?.textContent).toContain('2')
  })

  it('renders the OTP quick-view summary from the passmanager model', async () => {
    setupContext()
    navigationModel.navigateToSurface('passwords', 'replace')
    const root = new ManagerRoot({} as any)
    root.entries.set([
      createEntry(root, 'github', 'GitHub', [{id: 'otp-github', label: 'GitHub', type: 'TOTP'}]),
      createEntry(root, 'vpn', 'VPN', [{id: 'otp-vpn', label: 'VPN', type: 'HOTP', counter: 1}]),
    ])
    root.showElement.set('otpView' as any)
    setPassmanagerRoot(root)
    window.passmanager = root as typeof window.passmanager

    const element = await renderStatusBar()
    const summary = getSummary(element)

    expect(summary?.getAttribute('data-summary-context')).toBe('passwords-otp')
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="total"]')?.textContent).toContain('2')
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="totp"]')?.textContent).toContain('1')
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="hotp"]')?.textContent).toContain('1')
  })

  it('renders group metrics from the current passmanager group presentation', async () => {
    setupContext()
    navigationModel.navigateToSurface('passwords', 'replace')
    const root = new ManagerRoot({} as any)
    const group = createGroup('operations', 'Operations')
    group.entries.set([
      createEntry(group, 'pagerduty', 'PagerDuty', [{id: 'otp-pagerduty', label: 'PagerDuty'}]),
    ])
    root.entries.set([group])
    root.showElement.set(group)
    setPassmanagerRoot(root)
    window.passmanager = root as typeof window.passmanager

    const element = await renderStatusBar()
    const summary = getSummary(element)

    expect(summary?.getAttribute('data-summary-context')).toBe('passwords-group')
    expect(summary?.shadowRoot?.textContent).toContain('records')
    expect(summary?.shadowRoot?.textContent).toContain('2FA')
    expect(summary?.shadowRoot?.querySelector('[data-summary-id="entries"]')?.textContent).toContain('1')
  })

  it('does not render contextual rails on mobile or unsupported surfaces', async () => {
    setupContext({layout: 'mobile'})

    const mobileElement = await renderStatusBar()
    expect(getSummary(mobileElement)).toBeNull()

    document.body.innerHTML = ''
    clearAppContext()
    setupContext()
    navigationModel.navigateToSurface('settings', 'replace')

    const settingsElement = await renderStatusBar()
    expect(getSummary(settingsElement)).toBeNull()
  })
})
