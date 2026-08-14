import {atom, computed} from '@reatom/core'
import {type QuickFilter, quickFilters} from '@project/passmanager/select'
import {pmCredentialTagsModel} from '../../models/pm-credential-tags.model'

export type PMToolbarQuickFilter = Extract<QuickFilter, 'recent' | 'otp' | 'ssh' | 'card'>

export class PMQuickFiltersModel {
  readonly popoverOpen = atom(false, 'pm_quick_filters.popover_open')
  readonly selectedQuickFilters = quickFilters
  readonly activeFilterCount = computed(
    () => quickFilters().length + pmCredentialTagsModel.effectiveSelectedTagKeys().length,
    'pm_quick_filters.active_filter_count',
  )

  getAvailableTagOptions() {
    return pmCredentialTagsModel.availableTags()
  }

  getSelectedTagComboboxValue(): string {
    return pmCredentialTagsModel.selectedComboboxValue()
  }

  canManageTags(): boolean {
    return pmCredentialTagsModel.canMutateTags()
  }

  toggleQuickFilter(filter: PMToolbarQuickFilter): void {
    const current = quickFilters()
    if (current.includes(filter)) {
      quickFilters.set(current.filter((item) => item !== filter))
      return
    }

    quickFilters.set([...current, filter])
  }

  setSelectedTagsFromComboboxEvent(event: Event): void {
    const detail = (event as CustomEvent<{selectedIds?: unknown}>).detail
    const selectedIds = Array.isArray(detail?.selectedIds) ? detail.selectedIds : []
    pmCredentialTagsModel.setSelectedFromComboboxIds(
      selectedIds.filter((id): id is string => typeof id === 'string'),
    )
  }

  openTagManage(): void {
    this.popoverOpen.set(false)
    pmCredentialTagsModel.openCatalogManager()
  }

  setPopoverOpen(open: boolean): void {
    this.popoverOpen.set(open)
  }

  clearFilters(): void {
    quickFilters.set([])
    pmCredentialTagsModel.clearSelectedTags()
  }
}

export const pmQuickFiltersModel = new PMQuickFiltersModel()
