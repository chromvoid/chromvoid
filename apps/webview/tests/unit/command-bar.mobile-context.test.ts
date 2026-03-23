import {state} from '@statx/core'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {CommandBar} from '../../src/features/file-manager/components/command-bar'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {openCommandPalette} from '../../src/shared/services/command-palette'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

type PasswordContext = {
  kind: 'passwords-list' | 'passwords-entry' | 'none'
  readOnly: boolean
  hasActiveFilters: boolean
  query: string
  quickFilters: string[]
  sortField: 'name' | 'username' | 'modified' | 'created' | 'website'
  sortDirection: 'asc' | 'desc'
  groupBy: 'none' | 'folder' | 'website' | 'modified' | 'security'
}

let defined = false

function ensureDefined() {
  if (defined) return
  CommandBar.define()
  defined = true
}

function setupStore() {
  const filtersState = state<SearchFilters>({...DEFAULT_FILTERS})
  const store = {
    layoutMode: state<'mobile' | 'desktop'>('mobile'),
    showRemoteStoragePage: state(false),
    showGatewayPage: state(false),
    showRemotePage: state(false),
    showSettingsPage: state(false),
    showNetworkPairPage: state(false),
    isShowPasswordManager: state(false),
    searchFilters: filtersState,
    setSearchFilters(next: SearchFilters | ((prev: SearchFilters) => SearchFilters)) {
      if (typeof next === 'function') {
        filtersState.set(next(filtersState()))
      } else {
        filtersState.set(next)
      }
    },
  }

  initAppContext(
    createMockAppContext({
      store: store as any,
    }),
  )

  return store
}

function createPasswordProvider(context: PasswordContext, execute = vi.fn(() => true)) {
  const host = document.createElement('password-manager')
  const shadow = host.attachShadow({mode: 'open'})
  const provider = document.createElement('password-manager-mobile-layout') as HTMLElement & {
    getMobileCommandContext: () => PasswordContext
    executeMobileCommand: (actionId: string, payload?: {query?: string}) => boolean
  }

  provider.getMobileCommandContext = () => context
  provider.executeMobileCommand = execute
  shadow.appendChild(provider)
  document.body.appendChild(host)
  return {host, provider, execute}
}

function getCommandIds(bar: CommandBar): string[] {
  return ((bar as any).getFilteredCommands() as Array<{id: string}>).map((command) => command.id)
}

describe('CommandBar mobile context', () => {
  afterEach(() => {
    document.querySelectorAll('command-bar').forEach((el) => el.remove())
    document.querySelectorAll('password-manager').forEach((el) => el.remove())
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('opens in files context and keeps file actions', async () => {
    ensureDefined()
    setupStore()

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-tab'})
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(true)
    expect(getCommandIds(bar)).toContain('action-new-folder')
    expect(getCommandIds(bar)).toContain('action-upload')
  })

  it('resolves passwords-list context and exposes list/filter command set', async () => {
    ensureDefined()
    const store = setupStore()
    store.isShowPasswordManager.set(true)

    createPasswordProvider({
      kind: 'passwords-list',
      readOnly: false,
      hasActiveFilters: true,
      query: 'mail',
      quickFilters: ['otp'],
      sortField: 'modified',
      sortDirection: 'desc',
      groupBy: 'folder',
    })

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toContain('pm-create-entry')
    expect(ids).toContain('pm-create-group')
    expect(ids).toContain('pm-sort-direction-toggle')
    expect(ids).toContain('pm-group-by-folder')
  })

  it('resolves passwords-entry context and shows entry actions', async () => {
    ensureDefined()
    const store = setupStore()
    store.isShowPasswordManager.set(true)

    createPasswordProvider({
      kind: 'passwords-entry',
      readOnly: false,
      hasActiveFilters: false,
      query: '',
      quickFilters: [],
      sortField: 'name',
      sortDirection: 'asc',
      groupBy: 'none',
    })

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toContain('pm-entry-edit')
    expect(ids).toContain('pm-entry-move')
    expect(ids).toContain('pm-entry-delete')
    expect(ids).not.toContain('pm-create-entry')
  })

  it('filters mode shows only filter commands for passwords-list', async () => {
    ensureDefined()
    const store = setupStore()
    store.isShowPasswordManager.set(true)

    createPasswordProvider({
      kind: 'passwords-list',
      readOnly: false,
      hasActiveFilters: false,
      query: '',
      quickFilters: [],
      sortField: 'name',
      sortDirection: 'asc',
      groupBy: 'none',
    })

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'filters', source: 'fab'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toContain('pm-sort-direction-toggle')
    expect(ids).toContain('pm-group-by-none')
    expect(ids).not.toContain('pm-create-entry')
  })

  it('search mode in passwords-list focuses search command', async () => {
    ensureDefined()
    const store = setupStore()
    store.isShowPasswordManager.set(true)

    createPasswordProvider({
      kind: 'passwords-list',
      readOnly: false,
      hasActiveFilters: false,
      query: '',
      quickFilters: [],
      sortField: 'name',
      sortDirection: 'asc',
      groupBy: 'none',
    })

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'search', source: 'keyboard'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toEqual(['search-passwords'])
    ;(bar as any).query.set('bank')
    await bar.updateComplete
    expect(getCommandIds(bar)).toEqual(['search-passwords'])
  })

  it('does not open from mobile trigger in none context', async () => {
    ensureDefined()
    const store = setupStore()
    store.showSettingsPage.set(true)

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(false)
  })
})
