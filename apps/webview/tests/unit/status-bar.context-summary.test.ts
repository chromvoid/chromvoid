import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import type {CredentialAuditEntrySummary} from '@project/passmanager/security-audit'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {Store} from '../../src/app/state/store'
import {ChromVoidState} from '../../src/core/state/app-state'
import type {CatalogNotesListItem} from '../../src/core/catalog/local-catalog/types'
import {notesQuickViewModel} from '../../src/features/file-manager/components/notes-quick-view'
import {sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls.model'
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

function setupContext(
  options: {
    files?: CatalogNode[]
    notes?: CatalogNotesListItem[]
    layout?: 'desktop' | 'mobile'
  } = {},
) {
  const ws = createWs()
  const catalogMirror = new FakeCatalogSubscription() as FakeCatalogSubscription & {
    getChildren: (path: string) => CatalogNode[]
    getEntryMeta: () => undefined
  }
  catalogMirror.getChildren = (path: string) => (path === '/' ? (options.files ?? []) : [])
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

function setAuditEntries(
  entries: Array<[Entry, Partial<Omit<CredentialAuditEntrySummary, 'entryId'>>]>,
  status: 'ready' | 'degraded' = 'ready',
) {
  pmCredentialSecurityAuditModel.entries.set(
    new Map(
      entries.map(([entry, state]) => [
        entry.id,
        {
          entryId: entry.id,
          weakPassword: false,
          reusedPassword: false,
          hasTwoFactor: false,
          strengthScore: null,
          ...state,
        },
      ]),
    ),
  )
  pmCredentialSecurityAuditModel.status.set(status)
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
}

function getSummary(element: StatusBar) {
  return element.shadowRoot?.querySelector<HTMLElement>('.status-context-summary') ?? null
}

function getItem(element: StatusBar, id: string) {
  return element.shadowRoot?.querySelector<HTMLElement>(`[data-summary-id="${id}"]`) ?? null
}

describe('status-bar contextual summary', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    notesQuickViewModel.disconnect()
    notesQuickViewModel.actions.clearFilters()
    notesQuickViewModel.actions.setSortMode('name')
    notesQuickViewModel.actions.setDisplayMode('list')
    pmOtpQuickViewModel.actions.clearFilters()
    pmCredentialSecurityAuditModel.dispose()
    sortField.set('name')
    sortDirection.set('asc')
    setPassmanagerRoot(undefined)
    window.passmanager = originalPassmanager
    navigationModel.navigateToSurface('files', 'replace')
    clearAppContext()
  })

  it('does not reserve the shell status strip for Files without global status', async () => {
    setupContext({
      files: [
        {nodeId: 1, name: 'A.txt', path: '/A.txt', isDir: false, size: 10, modtime: 1, sourceRevision: 1},
        {nodeId: 2, name: 'B.txt', path: '/B.txt', isDir: false, size: 20, modtime: 1, sourceRevision: 1},
      ],
    })

    const element = await renderStatusBar()

    expect(element.shadowRoot?.querySelector('.status-bar')).toBeNull()
  })

  it('renders localized Notes count, sort, view, and filtered count from model state', async () => {
    setupContext({notes: [note(1, 'Root.md', '/Root.md'), note(2, 'Plan.md', '/Plan.md')]})
    navigationModel.navigateToSurface('notes', 'replace')
    notesQuickViewModel.connect()

    const element = await renderStatusBar()

    expect(getSummary(element)?.getAttribute('data-summary-context')).toBe('notes')
    expect(getSummary(element)?.getAttribute('role')).toBe('group')
    expect(getSummary(element)?.getAttribute('aria-label')).toBe('Notes summary')
    expect(getItem(element, 'count')?.textContent).toContain('2 notes')
    expect(getItem(element, 'sort')?.textContent).toContain('Sorted by Name')
    expect(getItem(element, 'view')?.textContent).toContain('List view')
    expect(element.shadowRoot?.querySelector('nav')).toBeNull()

    notesQuickViewModel.actions.setQuery('Root')
    await settleStatusBar(element)

    expect(getItem(element, 'count')?.textContent).toContain('1 of 2 notes')
  })

  it('renders an empty Notes count without duplicated Total or Visible metrics', async () => {
    setupContext({notes: []})
    navigationModel.navigateToSurface('notes', 'replace')
    notesQuickViewModel.connect()

    const element = await renderStatusBar()

    expect(getItem(element, 'count')?.textContent).toContain('0 notes')
    expect(getItem(element, 'total')).toBeNull()
    expect(getItem(element, 'visible')).toBeNull()
  })

  it('uses the singular Notes count phrase', async () => {
    setupContext({notes: [note(1, 'Root.md', '/Root.md')]})
    navigationModel.navigateToSurface('notes', 'replace')
    notesQuickViewModel.connect()

    const element = await renderStatusBar()

    expect(getItem(element, 'count')?.textContent).toContain('1 note')
  })

  it('omits the OTP Visible metric until filtering changes the count', async () => {
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

    expect(getSummary(element)?.getAttribute('data-summary-context')).toBe('passwords-otp')
    expect(getItem(element, 'total')?.textContent).toContain('2')
    expect(getItem(element, 'visible')).toBeNull()
    expect(getItem(element, 'totp')?.textContent).toContain('1')
    expect(getItem(element, 'hotp')?.textContent).toContain('1')

    pmOtpQuickViewModel.actions.setQuery('GitHub')
    await settleStatusBar(element)

    expect(getItem(element, 'visible')?.textContent).toContain('1')
  })

  it('shows loading, ready, positive-risk, and degraded credential security states', async () => {
    setupContext()
    navigationModel.navigateToSurface('passwords', 'replace')
    const root = new ManagerRoot({} as any)
    const group = createGroup('operations', 'Operations')
    const first = createEntry(group, 'pagerduty', 'PagerDuty', [{id: 'otp-pagerduty', label: 'PagerDuty'}])
    const second = createEntry(group, 'vpn', 'VPN')
    group.entries.set([first, second])
    root.entries.set([group])
    root.showElement.set(group)
    setPassmanagerRoot(root)
    window.passmanager = root as typeof window.passmanager

    const element = await renderStatusBar()

    expect(getSummary(element)?.getAttribute('data-summary-context')).toBe('passwords-group')
    expect(getSummary(element)?.getAttribute('aria-busy')).toBe('true')
    expect(getItem(element, 'entries')?.textContent).toContain('2')
    expect(getItem(element, 'sort')?.textContent).toContain('Sort by Name')
    expect(getItem(element, 'security-loading')?.getAttribute('role')).toBe('status')
    expect(getItem(element, 'security-loading')?.textContent).toContain('Loading')
    expect(getItem(element, 'reused_passwords')).toBeNull()

    setAuditEntries([
      [first, {}],
      [second, {}],
    ])
    await settleStatusBar(element)

    expect(getSummary(element)?.getAttribute('aria-busy')).toBeNull()
    expect(getItem(element, 'reused_passwords')?.dataset['tone']).toBe('neutral')
    expect(getItem(element, 'reused_passwords')?.dataset['priority']).toBe('optional')
    expect(getItem(element, 'weak_passwords')?.dataset['tone']).toBe('neutral')
    expect(getItem(element, 'two_factor')?.dataset['tone']).toBe('accent')
    expect(getItem(element, 'two_factor')?.dataset['priority']).toBe('supporting')

    setAuditEntries([
      [first, {hasTwoFactor: true, reusedPassword: true}],
      [second, {reusedPassword: true, weakPassword: true, strengthScore: 1}],
    ])
    await settleStatusBar(element)

    expect(getItem(element, 'reused_passwords')?.dataset['tone']).toBe('warning')
    expect(getItem(element, 'reused_passwords')?.dataset['priority']).toBe('essential')
    expect(getItem(element, 'weak_passwords')?.dataset['tone']).toBe('danger')
    expect(getItem(element, 'weak_passwords')?.dataset['priority']).toBe('essential')

    setAuditEntries([[first, {hasTwoFactor: true}]], 'degraded')
    pmCredentialSecurityAuditModel.failedEntryIds.set(new Set([second.id]))
    await settleStatusBar(element)

    expect(getSummary(element)?.dataset['securityStatus']).toBe('degraded')
    expect(getItem(element, 'security-degraded')?.getAttribute('role')).toBe('status')
    expect(getItem(element, 'security-degraded')?.textContent).toContain(
      'Some secure values could not be checked',
    )
  })

  it('does not render contextual summaries on mobile or unsupported surfaces', async () => {
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
