import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {selectedCredentialTagFilters} from '@project/passmanager/select'
import {
  fallbackCredentialTagColorId,
  normalizeCredentialTagCatalog,
  normalizeCredentialTagCatalogMeta,
  normalizeCredentialTags,
  type CredentialTagCatalogMeta,
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
  tagMeta = {},
  entries = [],
  readOnly = false,
}: {
  catalog?: readonly string[]
  tagMeta?: CredentialTagCatalogMeta
  entries?: FakeEntry[]
  readOnly?: boolean
} = {}) {
  const credentialTags = atom(normalizeCredentialTagCatalog(catalog))
  const credentialTagMeta = atom(normalizeCredentialTagCatalogMeta(tagMeta, credentialTags()))
  const isReadOnly = atom(readOnly)
  const saveCredentialTagCatalog = vi.fn(async (tags: unknown, meta?: unknown) => {
    const nextTags = normalizeCredentialTagCatalog(tags)
    credentialTags.set(nextTags)
    credentialTagMeta.set(
      meta === undefined
        ? normalizeCredentialTagCatalogMeta(credentialTagMeta(), nextTags)
        : normalizeCredentialTagCatalogMeta(meta, nextTags),
    )
    return true
  })

  const root = {
    allEntries: entries,
    credentialTags,
    credentialTagMeta,
    isReadOnly,
    saveCredentialTagCatalog,
  }

  setPassmanagerRoot(root as never)
  return {root, entries, credentialTags, credentialTagMeta, saveCredentialTagCatalog}
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
      {key: 'work', label: 'Work', colorId: fallbackCredentialTagColorId('work'), count: 2},
      {key: 'zero-use', label: 'Zero Use', colorId: fallbackCredentialTagColorId('zero-use'), count: 0},
    ])
  })

  it('reads stored colors from catalog metadata', () => {
    setupRoot({
      catalog: ['Work'],
      tagMeta: {work: {colorId: 'orange'}},
    })

    expect(pmCredentialTagsModel.availableTags()).toEqual([
      {key: 'work', label: 'Work', colorId: 'orange', count: 0},
    ])
  })

  it('adapts header chip group details without storing the all-filter sentinel', () => {
    setupRoot({
      entries: [createFakeEntry('entry-1', ['Work'])],
    })
    const allValue = pmCredentialTagsModel.allFilterChipValue()

    expect(pmCredentialTagsModel.selectedFilterChipGroupValue()).toBe(allValue)

    pmCredentialTagsModel.setSelectedFromFilterChipGroupDetail({
      value: [allValue, 'work'],
      changedValue: 'work',
    })

    expect(selectedCredentialTagFilters()).toEqual(['work'])
    expect(pmCredentialTagsModel.selectedFilterChipGroupValue()).toBe('work')

    pmCredentialTagsModel.setSelectedFromFilterChipGroupDetail({
      value: [allValue],
      changedValue: allValue,
    })

    expect(selectedCredentialTagFilters()).toEqual([])
    expect(pmCredentialTagsModel.selectedFilterChipGroupValue()).toBe(allValue)
  })

  it('opens the sheet in management mode and switches between CRUD modes', () => {
    setupRoot()

    pmCredentialTagsModel.openManageSheet()
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(true)
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
    expect(pmCredentialTagsModel.sheetEditMode()).toBe(false)

    pmCredentialTagsModel.openCreateTag()
    expect(pmCredentialTagsModel.sheetMode()).toBe('create')
    expect(pmCredentialTagsModel.tagDraftColorId()).toBe('violet')

    pmCredentialTagsModel.cancelTagMutation()
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
  })

  it('uses chip taps for selection until edit mode is enabled', () => {
    setupRoot({catalog: ['Work']})

    pmCredentialTagsModel.openManageSheet()
    pmCredentialTagsModel.activateTagChip('work')
    expect(selectedCredentialTagFilters()).toEqual(['work'])

    pmCredentialTagsModel.toggleSheetEditMode()
    expect(pmCredentialTagsModel.sheetEditMode()).toBe(true)

    pmCredentialTagsModel.activateTagChip('work')
    expect(selectedCredentialTagFilters()).toEqual(['work'])
    expect(pmCredentialTagsModel.sheetMode()).toBe('rename')
    expect(pmCredentialTagsModel.activeTagKey()).toBe('work')
    expect(pmCredentialTagsModel.tagDraft()).toBe('Work')
    expect(pmCredentialTagsModel.tagDraftColorId()).toBe(fallbackCredentialTagColorId('work'))

    pmCredentialTagsModel.openManageSheet()
    expect(pmCredentialTagsModel.sheetEditMode()).toBe(false)
    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
  })

  it('uses an isolated entry selection session and selects newly created tags', async () => {
    setupRoot({catalog: ['Work', 'Rotate']})
    selectedCredentialTagFilters.set(['rotate'])
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    pmCredentialTagsModel.openEntryTagSelection(['Work'], {onConfirm, onCancel})

    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('entry')
    expect(pmCredentialTagsModel.effectiveSheetSelectedTagKeys()).toEqual(['work'])
    expect(selectedCredentialTagFilters()).toEqual(['rotate'])

    pmCredentialTagsModel.activateTagChip('rotate')
    pmCredentialTagsModel.openCreateTag()
    await expect(pmCredentialTagsModel.createTag('Client A')).resolves.toBe(true)

    expect(pmCredentialTagsModel.effectiveSheetSelectedTagKeys()).toEqual(['work', 'rotate', 'client-a'])
    expect(selectedCredentialTagFilters()).toEqual(['rotate'])

    await pmCredentialTagsModel.confirmSheetSelection()

    expect(onConfirm).toHaveBeenCalledWith(['Work', 'Rotate', 'Client A'])
    expect(onCancel).not.toHaveBeenCalled()
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('filter')
  })

  it('keeps embedded entry selection and catalog mutation modes out of the standalone sheet', async () => {
    const {credentialTagMeta} = setupRoot({catalog: ['Work', 'Rotate']})
    const onConfirm = vi.fn()

    pmCredentialTagsModel.openEntryTagSelection(
      ['Work'],
      {onConfirm, onCancel: vi.fn()},
      {presentation: 'embedded'},
    )

    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('entry')

    pmCredentialTagsModel.openCreateTag()
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    pmCredentialTagsModel.setTagDraftColorId('pink')
    await expect(pmCredentialTagsModel.createTag('Client A')).resolves.toBe(true)
    expect(pmCredentialTagsModel.effectiveSheetSelectedTagKeys()).toEqual(['work', 'client-a'])
    expect(credentialTagMeta()).toMatchObject({'client-a': {colorId: 'pink'}})

    pmCredentialTagsModel.openRenameTag('work')
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    pmCredentialTagsModel.cancelTagMutation()
    pmCredentialTagsModel.openDeleteTag('rotate')
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    pmCredentialTagsModel.cancelTagMutation()

    await expect(pmCredentialTagsModel.confirmEntryTagSelection()).resolves.toBe(true)
    expect(onConfirm).toHaveBeenCalledWith(['Work', 'Client A'])
    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('filter')
  })

  it('does not let a replaced async confirmation reset the new entry selection session', async () => {
    setupRoot({catalog: ['Work', 'Rotate']})
    let resolveFirstConfirm!: () => void
    const firstConfirm = new Promise<void>((resolve) => {
      resolveFirstConfirm = resolve
    })
    const firstOnCancel = vi.fn()
    const secondOnConfirm = vi.fn()

    pmCredentialTagsModel.openEntryTagSelection(['Work'], {
      onConfirm: () => firstConfirm,
      onCancel: firstOnCancel,
    })
    const pendingConfirmation = pmCredentialTagsModel.confirmEntryTagSelection()

    pmCredentialTagsModel.openEntryTagSelection(
      ['Rotate'],
      {onConfirm: secondOnConfirm, onCancel: vi.fn()},
      {presentation: 'embedded'},
    )
    resolveFirstConfirm()

    await expect(pendingConfirmation).resolves.toBe(false)
    expect(firstOnCancel).toHaveBeenCalledOnce()
    expect(pmCredentialTagsModel.sheetSelectionScope()).toBe('entry')
    expect(pmCredentialTagsModel.entrySelectionTagKeys()).toEqual(['rotate'])
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)

    await expect(pmCredentialTagsModel.confirmEntryTagSelection()).resolves.toBe(true)
    expect(secondOnConfirm).toHaveBeenCalledWith(['Rotate'])
  })

  it('cancels an entry selection session when the sheet closes', () => {
    setupRoot({catalog: ['Work']})
    const onCancel = vi.fn()

    pmCredentialTagsModel.openEntryTagSelection(['Work'], {onConfirm: vi.fn(), onCancel})
    pmCredentialTagsModel.closeSheet()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(pmCredentialTagsModel.filterSheetOpen()).toBe(false)
    expect(pmCredentialTagsModel.entrySelectionTagKeys()).toEqual([])
  })

  it('creates catalog tags and blocks duplicate normalized keys', async () => {
    const {credentialTags, credentialTagMeta, saveCredentialTagCatalog} = setupRoot({catalog: ['Work']})

    pmCredentialTagsModel.openCreateTag()
    pmCredentialTagsModel.setTagDraftColorId('pink')
    await expect(pmCredentialTagsModel.createTag('Client A')).resolves.toBe(true)
    expect(credentialTags()).toEqual(['Work', 'Client A'])
    expect(credentialTagMeta()).toEqual({'client-a': {colorId: 'pink'}})
    expect(selectedCredentialTagFilters()).toEqual(['client-a'])

    await expect(pmCredentialTagsModel.createTag('client a')).resolves.toBe(false)
    expect(saveCredentialTagCatalog).toHaveBeenCalledTimes(1)
    expect(pmCredentialTagsModel.tagError()).toContain('already')
  })

  it('renames catalog and assigned entry tags', async () => {
    const entry = createFakeEntry('entry-1', ['Work', 'Rotate'])
    const {credentialTags, credentialTagMeta} = setupRoot({
      catalog: ['Work', 'Zero Use'],
      tagMeta: {work: {colorId: 'green'}, 'zero-use': {colorId: 'cyan'}},
      entries: [entry],
    })

    pmCredentialTagsModel.openRenameTag('work')
    expect(pmCredentialTagsModel.tagDraftColorId()).toBe('green')
    pmCredentialTagsModel.setTagDraftColorId('amber')
    await expect(pmCredentialTagsModel.renameTag('work', 'Client A')).resolves.toBe(true)

    expect(credentialTags()).toEqual(['Client A', 'Zero Use'])
    expect(credentialTagMeta()).toEqual({
      'client-a': {colorId: 'amber'},
      'zero-use': {colorId: 'cyan'},
    })
    expect(entry.tags).toEqual(['Client A', 'Rotate'])
  })

  it('deletes tags from the catalog and affected entries without deleting entries', async () => {
    const entry = createFakeEntry('entry-1', ['Client A', 'Rotate'])
    const {credentialTags, credentialTagMeta, entries} = setupRoot({
      catalog: ['Client A', 'Zero Use'],
      tagMeta: {'client-a': {colorId: 'pink'}, 'zero-use': {colorId: 'cyan'}},
      entries: [entry],
    })
    selectedCredentialTagFilters.set(['client-a', 'rotate'])

    pmCredentialTagsModel.openDeleteTag('client-a')
    expect(pmCredentialTagsModel.deletePlan()?.affectedEntryIds).toEqual(['entry-1'])

    await expect(pmCredentialTagsModel.deleteTag()).resolves.toBe(true)

    expect(entries).toHaveLength(1)
    expect(credentialTags()).toEqual(['Zero Use'])
    expect(credentialTagMeta()).toEqual({'zero-use': {colorId: 'cyan'}})
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
