import {atom, computed} from '@reatom/core'

import {
  buildCredentialTagOptions,
  credentialTagKey,
  normalizeCredentialTags,
  pruneCredentialTagKeys,
  type CredentialTagKey,
  type CredentialTagOption,
} from '@project/passmanager/tags'
import {selectedCredentialTagFilters} from '@project/passmanager/select'
import {passmanagerRoot} from './pm-root.adapter'

class PMCredentialTagsModel {
  readonly filterSheetOpen = atom(false, 'pm_credential_tags.filter_sheet_open')
  readonly filterSheetQuery = atom('', 'pm_credential_tags.filter_sheet_query')

  readonly availableTags = computed(
    (): CredentialTagOption[] => {
      const root = passmanagerRoot()
      if (!root) return []
      return buildCredentialTagOptions(Array.isArray(root.allEntries) ? root.allEntries : [])
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

  openFilterSheet(): void {
    this.filterSheetOpen.set(true)
    this.filterSheetQuery.set('')
  }

  closeFilterSheet(): void {
    this.filterSheetOpen.set(false)
    this.filterSheetQuery.set('')
  }

  setFilterSheetQuery(value: string): void {
    this.filterSheetQuery.set(value)
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
}

export const pmCredentialTagsModel = new PMCredentialTagsModel()
