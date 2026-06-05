import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {selectedCredentialTagFilters} from '@project/passmanager/select'
import {
  normalizeCredentialTagCatalog,
  normalizeCredentialTags,
} from '@project/passmanager/tags'
import {pmCredentialTagsModel} from '../../src/features/passmanager/models/pm-credential-tags.model'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

type FakeEntry = {
  id: string
  tags: string[]
  updateTags(tags: unknown): Promise<void>
}

function createFakeEntry(id: string, tags: readonly string[]): FakeEntry {
  return {
    id,
    tags: normalizeCredentialTags(tags),
    async updateTags(nextTags: unknown) {
      this.tags = normalizeCredentialTags(nextTags)
    },
  }
}

function setupRoot({
  catalog = [],
  entries = [],
  readOnly = false,
}: {
  catalog?: readonly string[]
  entries?: FakeEntry[]
  readOnly?: boolean
} = {}) {
  const credentialTags = atom(normalizeCredentialTagCatalog(catalog))
  const isReadOnly = atom(readOnly)
  const saveCredentialTagCatalog = vi.fn(async (tags: unknown) => {
    credentialTags.set(normalizeCredentialTagCatalog(tags))
    return true
  })

  const root = {
    allEntries: entries,
    credentialTags,
    isReadOnly,
    saveCredentialTagCatalog,
  }

  setPassmanagerRoot(root as never)
  return {root, entries, credentialTags, saveCredentialTagCatalog}
}

describe('pmCredentialTagsModel', () => {
  beforeEach(() => {
    selectedCredentialTagFilters.set([])
    pmCredentialTagsModel.closeSheet()
  })

  afterEach(() => {
    clearPassmanagerRoot()
    selectedCredentialTagFilters.set([])
    pmCredentialTagsModel.closeSheet()
  })

  it('builds options from catalog and entries, including zero-use tags', () => {
    setupRoot({
      catalog: ['Zero Use'],
      entries: [createFakeEntry('entry-1', ['Work']), createFakeEntry('entry-2', ['Work'])],
    })

    expect(pmCredentialTagsModel.availableTags()).toEqual([
      {key: 'work', label: 'Work', count: 2},
      {key: 'zero-use', label: 'Zero Use', count: 0},
    ])
  })

  it('opens the sheet in management mode and switches between CRUD modes', () => {
    setupRoot()

    pmCredentialTagsModel.openManageSheet()
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(true)
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')

    pmCredentialTagsModel.openCreateTag()
    expect(pmCredentialTagsModel.sheetMode()).toBe('create')

    pmCredentialTagsModel.openManageSheet()
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
  })

  it('creates catalog tags and blocks duplicate normalized keys', async () => {
    const {credentialTags, saveCredentialTagCatalog} = setupRoot({catalog: ['Work']})

    await expect(pmCredentialTagsModel.createTag('Client A')).resolves.toBe(true)
    expect(credentialTags()).toEqual(['Work', 'Client A'])

    await expect(pmCredentialTagsModel.createTag('client a')).resolves.toBe(false)
    expect(saveCredentialTagCatalog).toHaveBeenCalledTimes(1)
    expect(pmCredentialTagsModel.tagError()).toContain('already')
  })

  it('renames catalog and assigned entry tags', async () => {
    const entry = createFakeEntry('entry-1', ['Work', 'Rotate'])
    const {credentialTags} = setupRoot({catalog: ['Work', 'Zero Use'], entries: [entry]})

    await expect(pmCredentialTagsModel.renameTag('work', 'Client A')).resolves.toBe(true)

    expect(credentialTags()).toEqual(['Client A', 'Zero Use'])
    expect(entry.tags).toEqual(['Client A', 'Rotate'])
  })

  it('deletes tags from the catalog and affected entries without deleting entries', async () => {
    const entry = createFakeEntry('entry-1', ['Client A', 'Rotate'])
    const {credentialTags, entries} = setupRoot({catalog: ['Client A', 'Zero Use'], entries: [entry]})
    selectedCredentialTagFilters.set(['client-a', 'rotate'])

    pmCredentialTagsModel.openDeleteTag('client-a')
    expect(pmCredentialTagsModel.deletePlan()?.affectedEntryIds).toEqual(['entry-1'])

    await expect(pmCredentialTagsModel.deleteTag()).resolves.toBe(true)

    expect(entries).toHaveLength(1)
    expect(credentialTags()).toEqual(['Zero Use'])
    expect(entry.tags).toEqual(['Rotate'])
    expect(selectedCredentialTagFilters()).toEqual(['rotate'])
  })

  it('blocks mutations in read-only mode', async () => {
    const {saveCredentialTagCatalog} = setupRoot({readOnly: true})

    await expect(pmCredentialTagsModel.createTag('Work')).resolves.toBe(false)

    expect(saveCredentialTagCatalog).not.toHaveBeenCalled()
    expect(pmCredentialTagsModel.tagError()).toContain('read-only')
  })
})
