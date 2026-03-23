import {Entry, Group, filterValue, quickFilters} from '@project/passmanager'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroupModel} from '../../src/features/passmanager/components/group/group'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

type RootLike = {
  id: string
  name: string
  isRoot: true
  createdFormatted: string
  updatedFormatted: string
  searched: () => Array<Entry | Group>
}

function createGroup(name: string, entries: Entry[] = []) {
  return new Group({
    id: `group-${name}`,
    name,
    entries,
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(
  parent: unknown,
  input: {id: string; title: string; username?: string; website?: string},
): Entry {
  return new Entry(parent as any, {
    id: input.id,
    title: input.title,
    username: input.username ?? '',
    urls: input.website ? [{value: input.website, match: 'host'}] : [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
  } as any)
}

function createRootMock(items: Array<Entry | Group>): RootLike {
  return {
    id: 'root-id',
    name: 'Passwords',
    isRoot: true,
    createdFormatted: '2026-03-01',
    updatedFormatted: '2026-03-02',
    searched: () => items,
  }
}

function rowSnapshot(model: PMGroupModel, target: Group | RootLike) {
  return model.getVisibleRows(target as any).map((row) => {
    switch (row.kind) {
      case 'group':
        return `group:${row.item.name}`
      case 'entry':
        return `entry:${row.item.title}`
      case 'header':
        return `header:${row.label}:${row.count}`
    }
  })
}

describe('PMGroupModel sorting and grouping', () => {
  afterEach(() => {
    filterValue.set('')
    quickFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    vi.restoreAllMocks()
    ;(window as any).passmanager = undefined
  })

  it('keeps child folders above sorted entries in the current group', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Parent')
    const alpha = createEntry(currentGroup, {id: 'entry-alpha', title: 'Alpha', website: 'https://zeta.test'})
    const zulu = createEntry(currentGroup, {id: 'entry-zulu', title: 'Zulu', website: 'https://alpha.test'})
    currentGroup.entries.set([zulu, alpha])

    const childGroup = createGroup('Parent/Child')
    ;(window as any).passmanager = {
      entriesList: () => [currentGroup, childGroup],
    }

    expect(rowSnapshot(model, currentGroup)).toEqual(['group:Parent/Child', 'entry:Alpha', 'entry:Zulu'])

    sortField.set('website')

    expect(rowSnapshot(model, currentGroup)).toEqual(['group:Parent/Child', 'entry:Zulu', 'entry:Alpha'])
  })

  it('builds folder grouping rows in root context', () => {
    const model = new PMGroupModel()
    const folderA = createGroup('Alpha')
    const folderB = createGroup('Beta')
    const bank = createEntry(folderB, {id: 'entry-bank', title: 'Bank'})
    const email = createEntry(folderA, {id: 'entry-email', title: 'Email'})
    const root = createRootMock([folderA, folderB, bank, email])
    ;(window as any).passmanager = {
      entriesList: () => [folderA, folderB, bank, email],
    }

    groupBy.set('folder')

    expect(rowSnapshot(model, root)).toEqual([
      'group:Alpha',
      'group:Beta',
      'header:Alpha:1',
      'entry:Email',
      'header:Beta:1',
      'entry:Bank',
    ])
  })

  it('builds website grouping rows for current group entries', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Vault')
    const alpha = createEntry(currentGroup, {id: 'entry-alpha', title: 'Alpha', website: 'https://zeta.test'})
    const zulu = createEntry(currentGroup, {id: 'entry-zulu', title: 'Zulu', website: 'https://alpha.test'})
    currentGroup.entries.set([alpha, zulu])

    ;(window as any).passmanager = {
      entriesList: () => [currentGroup],
    }

    groupBy.set('website')

    expect(rowSnapshot(model, currentGroup)).toEqual([
      'header:alpha.test:1',
      'entry:Zulu',
      'header:zeta.test:1',
      'entry:Alpha',
    ])
  })
})

describe('PMGroupModel keyboard navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips header rows and opens the active actionable row', () => {
    const model = new PMGroupModel()
    const group = createGroup('Keyboard Group')
    const alpha = createEntry(group, {id: 'entry-alpha', title: 'Alpha'})
    const beta = createEntry(group, {id: 'entry-beta', title: 'Beta'})
    const rows = [
      {kind: 'header', id: 'header-a', label: 'A', count: 1},
      {kind: 'entry', id: alpha.id, item: alpha},
      {kind: 'header', id: 'header-b', label: 'B', count: 1},
      {kind: 'entry', id: beta.id, item: beta},
    ] as const

    const openSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})

    model.syncKeyboardState([...rows], 'keyboard-context', group)
    expect(model.getActiveItemId()).toBe(alpha.id)

    expect(model.moveKeyboardFocus(1)).toBe(3)
    expect(model.getActiveItemId()).toBe(beta.id)

    expect(model.openActiveItem()).toBe(true)
    expect(openSpy).toHaveBeenCalledWith(beta)
  })
})
