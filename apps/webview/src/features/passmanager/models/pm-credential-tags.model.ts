import {atom, computed, wrap} from '@reatom/core'

import {
  buildCredentialTagOptions,
  CREDENTIAL_TAG_COLOR_IDS,
  CREDENTIAL_TAG_DEFAULT_COLOR_ID,
  credentialTagKey,
  fallbackCredentialTagColorId,
  normalizeCredentialTagCatalog,
  normalizeCredentialTagCatalogMeta,
  normalizeCredentialTagColorId,
  normalizeCredentialTagLabel,
  normalizeCredentialTags,
  planCredentialTagDelete,
  planCredentialTagRename,
  pruneCredentialTagKeys,
  pruneCredentialTagCatalogMeta,
  removeCredentialTagCatalogMeta,
  removeCredentialTagLabel,
  replaceCredentialTagLabel,
  renameCredentialTagCatalogMeta,
  type CredentialTagCatalogMeta,
  type CredentialTagColorId,
  type CredentialTagKey,
  type CredentialTagMutationEntry,
  type CredentialTagOption,
} from '@project/passmanager/tags'
import type {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {selectedCredentialTagFilters} from '@project/passmanager/select'
import {isPassmanagerReadOnlyOrMissing, passmanagerRoot} from './pm-root.adapter'

export type PMCredentialTagSheetMode = 'manage' | 'create' | 'rename' | 'delete-confirm'
export type PMCredentialTagSheetSelectionScope = 'filter' | 'entry'
export type PMCredentialTagEntrySelectionPresentation = 'sheet' | 'embedded'

type PMCredentialTagEntrySelectionSession = {
  initialTags: string[]
  onConfirm(tags: readonly string[]): Promise<void> | void
  onCancel(): void
}

const ALL_FILTER_CHIP_VALUE = '__all-tags'

type PMCredentialTagFilterChipGroupDetail = {
  value?: unknown
  changedValue?: unknown
}

export type PMCredentialTagColorOption = {
  colorId: CredentialTagColorId
  label: string
}

function parseChipGroupValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  if (typeof value !== 'string') return []

  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

class PMCredentialTagsModel {
  private entrySelectionSession: PMCredentialTagEntrySelectionSession | undefined
  private entrySelectionPresentation: PMCredentialTagEntrySelectionPresentation = 'sheet'

  readonly filterSheetOpen = atom(false, 'pm_credential_tags.filter_sheet_open')
  readonly sheetSelectionScope = atom<PMCredentialTagSheetSelectionScope>(
    'filter',
    'pm_credential_tags.sheet_selection_scope',
  )
  readonly entrySelectionTagKeys = atom<CredentialTagKey[]>([], 'pm_credential_tags.entry_selection_tag_keys')
  readonly entrySelectionSaving = atom(false, 'pm_credential_tags.entry_selection_saving')
  readonly entrySelectionError = atom('', 'pm_credential_tags.entry_selection_error')
  readonly filterSheetQuery = atom('', 'pm_credential_tags.filter_sheet_query')
  readonly sheetMode = atom<PMCredentialTagSheetMode>('manage', 'pm_credential_tags.sheet_mode')
  readonly sheetEditMode = atom(false, 'pm_credential_tags.sheet_edit_mode')
  readonly activeTagKey = atom<CredentialTagKey | null>(null, 'pm_credential_tags.active_tag_key')
  readonly tagDraft = atom('', 'pm_credential_tags.tag_draft')
  readonly tagDraftColorId = atom<CredentialTagColorId>(
    CREDENTIAL_TAG_DEFAULT_COLOR_ID,
    'pm_credential_tags.tag_draft_color_id',
  )
  readonly tagError = atom('', 'pm_credential_tags.tag_error')
  readonly tagSaving = atom(false, 'pm_credential_tags.tag_saving')

  readonly availableTags = computed((): CredentialTagOption[] => {
    const root = passmanagerRoot()
    if (!root) return []
    const catalogTags = this.getCatalogTags()
    return buildCredentialTagOptions(this.getEntries(), catalogTags, this.getCatalogMeta(catalogTags))
  }, 'pm_credential_tags.available_tags')

  readonly availableTagsByKey = computed(
    (): ReadonlyMap<CredentialTagKey, CredentialTagOption> =>
      new Map(this.availableTags().map((option) => [option.key, option])),
    'pm_credential_tags.available_tags_by_key',
  )

  readonly tagColorOptions = computed(
    (): PMCredentialTagColorOption[] =>
      CREDENTIAL_TAG_COLOR_IDS.map((colorId) => ({
        colorId,
        label: i18n(`tags:color_${colorId}` as never),
      })),
    'pm_credential_tags.tag_color_options',
  )

  readonly selectedTagKeys = computed(
    (): CredentialTagKey[] => selectedCredentialTagFilters(),
    'pm_credential_tags.selected_tag_keys',
  )

  readonly effectiveSelectedTagKeys = computed(
    (): CredentialTagKey[] => pruneCredentialTagKeys(this.selectedTagKeys(), this.availableTags()),
    'pm_credential_tags.effective_selected_tag_keys',
  )

  readonly sheetSelectedTagKeys = computed(
    (): CredentialTagKey[] =>
      this.sheetSelectionScope() === 'entry' ? this.entrySelectionTagKeys() : this.selectedTagKeys(),
    'pm_credential_tags.sheet_selected_tag_keys',
  )

  readonly effectiveSheetSelectedTagKeys = computed(
    (): CredentialTagKey[] => pruneCredentialTagKeys(this.sheetSelectedTagKeys(), this.availableTags()),
    'pm_credential_tags.effective_sheet_selected_tag_keys',
  )

  readonly selectedTagOptions = computed((): CredentialTagOption[] => {
    const optionByKey = this.availableTagsByKey()
    return this.effectiveSelectedTagKeys()
      .map((key) => optionByKey.get(key))
      .filter((option): option is CredentialTagOption => option !== undefined)
  }, 'pm_credential_tags.selected_tag_options')

  readonly filteredAvailableTags = computed((): CredentialTagOption[] => {
    const query = this.filterSheetQuery().trim().toLowerCase()
    const options = this.availableTags()
    if (!query) return options

    return options.filter((option) => {
      return option.label.toLowerCase().includes(query) || option.key.includes(query)
    })
  }, 'pm_credential_tags.filtered_available_tags')

  readonly activeTagOption = computed((): CredentialTagOption | undefined => {
    const key = this.activeTagKey()
    if (!key) return undefined
    return this.availableTags().find((option) => option.key === key)
  }, 'pm_credential_tags.active_tag_option')

  readonly deletePlan = computed(() => {
    const key = this.activeTagKey()
    const root = passmanagerRoot()
    if (!key || !root) return undefined
    return planCredentialTagDelete(this.getCatalogTags(), this.getMutationEntries(), key)
  }, 'pm_credential_tags.delete_plan')

  readonly canMutateTags = computed(
    (): boolean => !isPassmanagerReadOnlyOrMissing(),
    'pm_credential_tags.can_mutate_tags',
  )

  resolveTagColorId(label: string): CredentialTagColorId {
    const key = credentialTagKey(label)
    return this.availableTagsByKey().get(key)?.colorId ?? fallbackCredentialTagColorId(key)
  }

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
    this.cancelEntryTagSelection()
  }

  openManageSheet(): void {
    this.cancelEntrySelectionSession()
    this.entrySelectionPresentation = 'sheet'
    this.sheetSelectionScope.set('filter')
    this.filterSheetOpen.set(true)
    this.sheetMode.set('manage')
    this.sheetEditMode.set(false)
    this.filterSheetQuery.set('')
    this.clearMutationState()
  }

  openEntryTagSelection(
    tags: readonly string[],
    session: Omit<PMCredentialTagEntrySelectionSession, 'initialTags'>,
    options: {presentation?: PMCredentialTagEntrySelectionPresentation} = {},
  ): void {
    this.cancelEntrySelectionSession()
    const initialTags = normalizeCredentialTags(tags)
    this.entrySelectionPresentation = options.presentation ?? 'sheet'
    this.entrySelectionSession = {...session, initialTags}
    this.sheetSelectionScope.set('entry')
    this.entrySelectionTagKeys.set(initialTags.map(credentialTagKey).filter(Boolean))
    this.entrySelectionSaving.set(false)
    this.entrySelectionError.set('')
    this.filterSheetOpen.set(this.entrySelectionPresentation === 'sheet')
    this.sheetMode.set('manage')
    this.sheetEditMode.set(false)
    this.filterSheetQuery.set('')
    this.clearMutationState()
  }

  async confirmSheetSelection(): Promise<void> {
    if (this.sheetSelectionScope() !== 'entry') {
      this.closeSheet()
      return
    }

    await this.confirmEntryTagSelection()
  }

  async confirmEntryTagSelection(): Promise<boolean> {
    const session = this.entrySelectionSession
    if (!session || this.entrySelectionSaving()) return false

    this.entrySelectionSaving.set(true)
    this.entrySelectionError.set('')

    try {
      const tags = this.resolveLabelsFromTagKeys(this.effectiveSheetSelectedTagKeys(), session.initialTags)
      await session.onConfirm(tags)
      if (this.entrySelectionSession !== session) return false

      this.entrySelectionSession = undefined
      this.resetSheetState()
      return true
    } catch (error) {
      if (this.entrySelectionSession !== session) return false

      this.entrySelectionError.set((error as Error).message || i18n('error:save'))
      this.entrySelectionSaving.set(false)
      return false
    }
  }

  cancelEntryTagSelection(): void {
    const session = this.takeEntrySelectionSession()
    this.resetSheetState()
    session?.onCancel()
  }

  cancelTagMutation(): void {
    this.sheetMode.set('manage')
    this.clearMutationState()
  }

  toggleSheetEditMode(): void {
    const nextMode = !this.sheetEditMode()
    this.sheetEditMode.set(nextMode)
    this.sheetMode.set('manage')
    this.clearMutationState()
  }

  openCreateTag(): void {
    this.ensureActivePresentationVisible()
    this.sheetMode.set('create')
    this.activeTagKey.set(null)
    this.tagDraft.set('')
    this.tagDraftColorId.set(CREDENTIAL_TAG_DEFAULT_COLOR_ID)
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  openRenameTag(key: string): void {
    const normalizedKey = credentialTagKey(key)
    if (!normalizedKey) return

    const option = this.availableTags().find((item) => item.key === normalizedKey)
    this.ensureActivePresentationVisible()
    this.sheetMode.set('rename')
    this.activeTagKey.set(normalizedKey)
    this.tagDraft.set(option?.label ?? '')
    this.tagDraftColorId.set(option?.colorId ?? fallbackCredentialTagColorId(normalizedKey))
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  openDeleteTag(key: string): void {
    const normalizedKey = credentialTagKey(key)
    if (!normalizedKey) return

    this.ensureActivePresentationVisible()
    this.sheetMode.set('delete-confirm')
    this.activeTagKey.set(normalizedKey)
    this.tagDraft.set('')
    this.tagDraftColorId.set(CREDENTIAL_TAG_DEFAULT_COLOR_ID)
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  activateTagChip(key: string): void {
    if (this.sheetEditMode()) {
      this.openRenameTag(key)
      return
    }

    this.toggleSheetTagKey(key)
  }

  setFilterSheetQuery(value: string): void {
    this.filterSheetQuery.set(value)
  }

  setTagDraft(value: string): void {
    this.tagDraft.set(value)
    this.tagError.set('')
  }

  setTagDraftColorId(value: unknown): void {
    const colorId = normalizeCredentialTagColorId(value)
    if (!colorId) return
    this.tagDraftColorId.set(colorId)
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
      const catalogTags = normalizeCredentialTagCatalog([...this.getCatalogTags(), normalizedLabel])
      const tagMeta = pruneCredentialTagCatalogMeta(
        {
          ...this.getCatalogMeta(),
          [key]: {colorId: this.tagDraftColorId()},
        },
        catalogTags,
      )
      const saved = await wrap(root.saveCredentialTagCatalog(catalogTags, tagMeta))
      if (!saved) throw new Error(i18n('error:save'))
      this.setSheetSelectedTagKeys([...this.effectiveSheetSelectedTagKeys(), key])
      this.returnToTagGrid()
      return true
    } catch (error) {
      this.tagError.set((error as Error).message || i18n('error:save'))
      this.tagSaving.set(false)
      return false
    }
  }

  async renameTag(
    key: string | null = this.activeTagKey(),
    label: unknown = this.tagDraft(),
  ): Promise<boolean> {
    if (!this.ensureWritable()) return false

    const root = passmanagerRoot()
    if (!root || !key || this.tagSaving()) return false

    const normalizedLabel = this.validateTagLabel(label)
    if (!normalizedLabel) return false

    const plan = planCredentialTagRename(
      this.getCatalogTags(),
      this.getMutationEntries(),
      key,
      normalizedLabel,
    )
    if (!plan.ok) {
      this.tagError.set(
        plan.reason === 'target_exists' ? i18n('tags:error_exists' as never) : i18n('tags:too_long'),
      )
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

      const tagMeta = renameCredentialTagCatalogMeta(
        this.getCatalogMeta(),
        plan.catalogTags,
        plan.sourceKey,
        plan.nextKey,
        this.tagDraftColorId(),
      )
      const saved = await wrap(root.saveCredentialTagCatalog(plan.catalogTags, tagMeta))
      if (!saved) throw new Error(i18n('error:save'))
      selectedCredentialTagFilters.set(
        selectedCredentialTagFilters().map((item) =>
          credentialTagKey(item) === plan.sourceKey ? plan.nextKey : item,
        ),
      )
      this.entrySelectionTagKeys.set(
        this.entrySelectionTagKeys().map((item) => (item === plan.sourceKey ? plan.nextKey : item)),
      )
      this.returnToTagGrid()
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

      const tagMeta = removeCredentialTagCatalogMeta(this.getCatalogMeta(), plan.catalogTags, plan.key)
      const saved = await wrap(root.saveCredentialTagCatalog(plan.catalogTags, tagMeta))
      if (!saved) throw new Error(i18n('error:save'))
      selectedCredentialTagFilters.set(
        selectedCredentialTagFilters().filter((item) => credentialTagKey(item) !== plan.key),
      )
      this.entrySelectionTagKeys.set(this.entrySelectionTagKeys().filter((item) => item !== plan.key))
      this.returnToTagGrid()
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

    const saved = await wrap(
      root.saveCredentialTagCatalog(next, pruneCredentialTagCatalogMeta(this.getCatalogMeta(), next)),
    )
    if (!saved) throw new Error(i18n('error:save'))
  }

  selectedFilterValue(): string {
    return this.effectiveSelectedTagKeys().join(' ')
  }

  selectedFilterChipGroupValue(): string {
    const selected = this.selectedFilterValue()
    return selected || ALL_FILTER_CHIP_VALUE
  }

  allFilterChipValue(): string {
    return ALL_FILTER_CHIP_VALUE
  }

  setSelectedFromFilterChipGroupDetail(detail: PMCredentialTagFilterChipGroupDetail | undefined): void {
    if (detail?.changedValue === ALL_FILTER_CHIP_VALUE) {
      this.clearSelectedTags()
      return
    }

    this.setSelectedTagKeys(parseChipGroupValue(detail?.value).filter((key) => key !== ALL_FILTER_CHIP_VALUE))
  }

  selectedComboboxValue(): string {
    return this.selectedFilterValue()
  }

  setSelectedFromComboboxIds(ids: readonly string[]): void {
    this.setSelectedTagKeys(normalizeCredentialTags(ids).map(credentialTagKey))
  }

  private setSheetSelectedTagKeys(keys: readonly string[]): void {
    const selectedKeys = pruneCredentialTagKeys(keys, this.availableTags())
    if (this.sheetSelectionScope() === 'entry') {
      this.entrySelectionTagKeys.set(selectedKeys)
      return
    }

    selectedCredentialTagFilters.set(selectedKeys)
  }

  private toggleSheetTagKey(key: string): void {
    const normalizedKey = credentialTagKey(key)
    if (!normalizedKey) return

    const current = this.effectiveSheetSelectedTagKeys()
    this.setSheetSelectedTagKeys(
      current.includes(normalizedKey)
        ? current.filter((item) => item !== normalizedKey)
        : [...current, normalizedKey],
    )
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
    return normalizeCredentialTagCatalog(
      typeof root?.credentialTags === 'function' ? root.credentialTags() : [],
    )
  }

  private getCatalogMeta(catalogTags: readonly string[] = this.getCatalogTags()): CredentialTagCatalogMeta {
    const root = passmanagerRoot() as {credentialTagMeta?: () => unknown} | undefined
    return normalizeCredentialTagCatalogMeta(
      typeof root?.credentialTagMeta === 'function' ? root.credentialTagMeta() : {},
      catalogTags,
    )
  }

  private clearMutationState(): void {
    this.activeTagKey.set(null)
    this.tagDraft.set('')
    this.tagDraftColorId.set(CREDENTIAL_TAG_DEFAULT_COLOR_ID)
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  private takeEntrySelectionSession(): PMCredentialTagEntrySelectionSession | undefined {
    const session = this.entrySelectionSession
    this.entrySelectionSession = undefined
    return session
  }

  private cancelEntrySelectionSession(): void {
    const session = this.takeEntrySelectionSession()
    if (!session) return

    this.entrySelectionTagKeys.set([])
    this.entrySelectionSaving.set(false)
    this.entrySelectionError.set('')
    session.onCancel()
  }

  private resetSheetState(): void {
    this.entrySelectionPresentation = 'sheet'
    this.filterSheetOpen.set(false)
    this.sheetSelectionScope.set('filter')
    this.entrySelectionTagKeys.set([])
    this.entrySelectionSaving.set(false)
    this.entrySelectionError.set('')
    this.filterSheetQuery.set('')
    this.sheetMode.set('manage')
    this.sheetEditMode.set(false)
    this.clearMutationState()
  }

  private returnToTagGrid(): void {
    this.sheetMode.set('manage')
    this.clearMutationState()
  }

  private ensureActivePresentationVisible(): void {
    if (
      this.sheetSelectionScope() !== 'entry' ||
      this.entrySelectionPresentation === 'sheet'
    ) {
      this.filterSheetOpen.set(true)
    }
  }

  private ensureWritable(): boolean {
    if (!isPassmanagerReadOnlyOrMissing()) return true
    this.tagError.set(i18n('tags:error_readonly' as never))
    return false
  }

  private validateTagLabel(label: unknown): string | undefined {
    const normalizedLabel = normalizeCredentialTagLabel(label)
    if (normalizedLabel) return normalizedLabel

    this.tagError.set(
      String(label ?? '').trim() ? i18n('tags:too_long') : i18n('tags:error_required' as never),
    )
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
