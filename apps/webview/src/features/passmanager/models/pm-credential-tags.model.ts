import {atom, computed, wrap} from '@reatom/core'

import {
  buildCredentialTagOptions,
  credentialTagKey,
  normalizeCredentialTagCatalog,
  normalizeCredentialTagLabel,
  normalizeCredentialTags,
  planCredentialTagDelete,
  planCredentialTagRename,
  pruneCredentialTagKeys,
  removeCredentialTagLabel,
  replaceCredentialTagLabel,
  type CredentialTagKey,
  type CredentialTagMutationEntry,
  type CredentialTagOption,
} from '@project/passmanager/tags'
import type {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {selectedCredentialTagFilters} from '@project/passmanager/select'
import {isPassmanagerReadOnlyOrMissing, passmanagerRoot} from './pm-root.adapter'

export type PMCredentialTagSheetMode = 'manage' | 'create' | 'rename' | 'delete-confirm'

class PMCredentialTagsModel {
  readonly filterSheetOpen = atom(false, 'pm_credential_tags.filter_sheet_open')
  readonly filterSheetQuery = atom('', 'pm_credential_tags.filter_sheet_query')
  readonly sheetMode = atom<PMCredentialTagSheetMode>('manage', 'pm_credential_tags.sheet_mode')
  readonly activeTagKey = atom<CredentialTagKey | null>(null, 'pm_credential_tags.active_tag_key')
  readonly tagDraft = atom('', 'pm_credential_tags.tag_draft')
  readonly tagError = atom('', 'pm_credential_tags.tag_error')
  readonly tagSaving = atom(false, 'pm_credential_tags.tag_saving')

  readonly availableTags = computed(
    (): CredentialTagOption[] => {
      const root = passmanagerRoot()
      if (!root) return []
      return buildCredentialTagOptions(this.getEntries(), this.getCatalogTags())
    },
    'pm_credential_tags.available_tags',
  )

  readonly selectedTagKeys = computed(
    (): CredentialTagKey[] => selectedCredentialTagFilters(),
    'pm_credential_tags.selected_tag_keys',
  )

  readonly effectiveSelectedTagKeys = computed(
    (): CredentialTagKey[] => pruneCredentialTagKeys(this.selectedTagKeys(), this.availableTags()),
    'pm_credential_tags.effective_selected_tag_keys',
  )

  readonly selectedTagOptions = computed(
    (): CredentialTagOption[] => {
      const optionByKey = new Map(this.availableTags().map((option) => [option.key, option]))
      return this.effectiveSelectedTagKeys()
        .map((key) => optionByKey.get(key))
        .filter((option): option is CredentialTagOption => option !== undefined)
    },
    'pm_credential_tags.selected_tag_options',
  )

  readonly filteredAvailableTags = computed(
    (): CredentialTagOption[] => {
      const query = this.filterSheetQuery().trim().toLowerCase()
      const options = this.availableTags()
      if (!query) return options

      return options.filter((option) => {
        return option.label.toLowerCase().includes(query) || option.key.includes(query)
      })
    },
    'pm_credential_tags.filtered_available_tags',
  )

  readonly activeTagOption = computed(
    (): CredentialTagOption | undefined => {
      const key = this.activeTagKey()
      if (!key) return undefined
      return this.availableTags().find((option) => option.key === key)
    },
    'pm_credential_tags.active_tag_option',
  )

  readonly deletePlan = computed(
    () => {
      const key = this.activeTagKey()
      const root = passmanagerRoot()
      if (!key || !root) return undefined
      return planCredentialTagDelete(this.getCatalogTags(), this.getMutationEntries(), key)
    },
    'pm_credential_tags.delete_plan',
  )

  readonly canMutateTags = computed(
    (): boolean => !isPassmanagerReadOnlyOrMissing(),
    'pm_credential_tags.can_mutate_tags',
  )

  setSelectedTagKeys(keys: readonly string[]): void {
    selectedCredentialTagFilters.set(pruneCredentialTagKeys(keys, this.availableTags()))
  }

  toggleTagKey(key: string): void {
    const normalizedKey = credentialTagKey(key)
    if (!normalizedKey) return

    const current = this.effectiveSelectedTagKeys()
    if (current.includes(normalizedKey)) {
      selectedCredentialTagFilters.set(current.filter((item) => item !== normalizedKey))
    } else {
      this.setSelectedTagKeys([...current, normalizedKey])
    }
  }

  clearSelectedTags(): void {
    selectedCredentialTagFilters.set([])
  }

  closeSheet(): void {
    this.filterSheetOpen.set(false)
    this.filterSheetQuery.set('')
    this.sheetMode.set('manage')
    this.clearMutationState()
  }

  openManageSheet(): void {
    this.filterSheetOpen.set(true)
    this.sheetMode.set('manage')
    this.filterSheetQuery.set('')
    this.clearMutationState()
  }

  openCreateTag(): void {
    this.filterSheetOpen.set(true)
    this.sheetMode.set('create')
    this.activeTagKey.set(null)
    this.tagDraft.set('')
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  openRenameTag(key: string): void {
    const normalizedKey = credentialTagKey(key)
    if (!normalizedKey) return

    const option = this.availableTags().find((item) => item.key === normalizedKey)
    this.filterSheetOpen.set(true)
    this.sheetMode.set('rename')
    this.activeTagKey.set(normalizedKey)
    this.tagDraft.set(option?.label ?? '')
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  openDeleteTag(key: string): void {
    const normalizedKey = credentialTagKey(key)
    if (!normalizedKey) return

    this.filterSheetOpen.set(true)
    this.sheetMode.set('delete-confirm')
    this.activeTagKey.set(normalizedKey)
    this.tagDraft.set('')
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  setFilterSheetQuery(value: string): void {
    this.filterSheetQuery.set(value)
  }

  setTagDraft(value: string): void {
    this.tagDraft.set(value)
    this.tagError.set('')
  }

  async createTag(label: unknown = this.tagDraft()): Promise<boolean> {
    if (!this.ensureWritable()) return false

    const normalizedLabel = this.validateTagLabel(label)
    if (!normalizedLabel) return false

    const key = credentialTagKey(normalizedLabel)
    if (this.availableTags().some((option) => option.key === key)) {
      this.tagError.set(i18n('tags:error_exists' as never))
      return false
    }

    const root = passmanagerRoot()
    if (!root || this.tagSaving()) return false

    this.tagSaving.set(true)
    this.tagError.set('')

    try {
      const saved = await wrap(root.saveCredentialTagCatalog([...this.getCatalogTags(), normalizedLabel]))
      if (!saved) throw new Error(i18n('error:save'))
      this.openManageSheet()
      return true
    } catch (error) {
      this.tagError.set((error as Error).message || i18n('error:save'))
      this.tagSaving.set(false)
      return false
    }
  }

  async renameTag(key: string | null = this.activeTagKey(), label: unknown = this.tagDraft()): Promise<boolean> {
    if (!this.ensureWritable()) return false

    const root = passmanagerRoot()
    if (!root || !key || this.tagSaving()) return false

    const normalizedLabel = this.validateTagLabel(label)
    if (!normalizedLabel) return false

    const plan = planCredentialTagRename(this.getCatalogTags(), this.getMutationEntries(), key, normalizedLabel)
    if (!plan.ok) {
      this.tagError.set(plan.reason === 'target_exists' ? i18n('tags:error_exists' as never) : i18n('tags:too_long'))
      return false
    }

    this.tagSaving.set(true)
    this.tagError.set('')

    try {
      const affected = new Set(plan.affectedEntryIds)
      for (const entry of this.getEntries()) {
        if (!affected.has(entry.id)) continue
        await wrap(entry.updateTags(replaceCredentialTagLabel(entry.tags, plan.sourceKey, plan.nextLabel)))
      }

      const saved = await wrap(root.saveCredentialTagCatalog(plan.catalogTags))
      if (!saved) throw new Error(i18n('error:save'))
      selectedCredentialTagFilters.set(
        selectedCredentialTagFilters().map((item) => (credentialTagKey(item) === plan.sourceKey ? plan.nextKey : item)),
      )
      this.openManageSheet()
      return true
    } catch (error) {
      this.tagError.set((error as Error).message || i18n('error:save'))
      this.tagSaving.set(false)
      return false
    }
  }

  async deleteTag(key: string | null = this.activeTagKey()): Promise<boolean> {
    if (!this.ensureWritable()) return false

    const root = passmanagerRoot()
    if (!root || !key || this.tagSaving()) return false

    const plan = planCredentialTagDelete(this.getCatalogTags(), this.getMutationEntries(), key)
    if (!plan.key) return false

    this.tagSaving.set(true)
    this.tagError.set('')

    try {
      const affected = new Set(plan.affectedEntryIds)
      for (const entry of this.getEntries()) {
        if (!affected.has(entry.id)) continue
        await wrap(entry.updateTags(removeCredentialTagLabel(entry.tags, plan.key)))
      }

      const saved = await wrap(root.saveCredentialTagCatalog(plan.catalogTags))
      if (!saved) throw new Error(i18n('error:save'))
      selectedCredentialTagFilters.set(
        selectedCredentialTagFilters().filter((item) => credentialTagKey(item) !== plan.key),
      )
      this.openManageSheet()
      return true
    } catch (error) {
      this.tagError.set((error as Error).message || i18n('error:save'))
      this.tagSaving.set(false)
      return false
    }
  }

  async ensureCatalogTags(tags: unknown): Promise<void> {
    const root = passmanagerRoot()
    if (!root || typeof root.saveCredentialTagCatalog !== 'function') return

    const current = this.getCatalogTags()
    const next = normalizeCredentialTagCatalog([...current, ...normalizeCredentialTags(tags)])
    if (this.sameCatalog(current, next)) return

    const saved = await wrap(root.saveCredentialTagCatalog(next))
    if (!saved) throw new Error(i18n('error:save'))
  }

  selectedComboboxValue(): string {
    return this.effectiveSelectedTagKeys().join(' ')
  }

  setSelectedFromComboboxIds(ids: readonly string[]): void {
    this.setSelectedTagKeys(normalizeCredentialTags(ids).map(credentialTagKey))
  }

  resolveLabelsFromTagKeys(keys: readonly string[], currentTags: readonly string[] = []): string[] {
    const availableLabels = new Map<CredentialTagKey, string>()

    for (const option of this.availableTags()) {
      availableLabels.set(option.key, option.label)
    }

    for (const tag of normalizeCredentialTags(currentTags)) {
      availableLabels.set(credentialTagKey(tag), tag)
    }

    return normalizeCredentialTags(
      keys
        .map(credentialTagKey)
        .map((key) => availableLabels.get(key))
        .filter((label): label is string => typeof label === 'string'),
    )
  }

  private getEntries(): Entry[] {
    const root = passmanagerRoot()
    if (!root) return []
    return Array.isArray(root.allEntries) ? root.allEntries : []
  }

  private getMutationEntries(): CredentialTagMutationEntry[] {
    return this.getEntries().map((entry) => ({id: entry.id, tags: entry.tags}))
  }

  private getCatalogTags(): string[] {
    const root = passmanagerRoot() as {credentialTags?: () => readonly string[]} | undefined
    return normalizeCredentialTagCatalog(typeof root?.credentialTags === 'function' ? root.credentialTags() : [])
  }

  private clearMutationState(): void {
    this.activeTagKey.set(null)
    this.tagDraft.set('')
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  private ensureWritable(): boolean {
    if (!isPassmanagerReadOnlyOrMissing()) return true
    this.tagError.set(i18n('tags:error_readonly' as never))
    return false
  }

  private validateTagLabel(label: unknown): string | undefined {
    const normalizedLabel = normalizeCredentialTagLabel(label)
    if (normalizedLabel) return normalizedLabel

    this.tagError.set(String(label ?? '').trim() ? i18n('tags:too_long') : i18n('tags:error_required' as never))
    return undefined
  }

  private sameCatalog(left: readonly string[], right: readonly string[]): boolean {
    const normalizedLeft = normalizeCredentialTagCatalog(left)
    const normalizedRight = normalizeCredentialTagCatalog(right)
    return (
      normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every((tag, index) => tag === normalizedRight[index])
    )
  }
}

export const pmCredentialTagsModel = new PMCredentialTagsModel()
