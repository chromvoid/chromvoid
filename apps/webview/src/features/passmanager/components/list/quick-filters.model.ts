import {type QuickFilter, quickFilters} from '@project/passmanager/select'
import {pmCredentialTagsModel} from '../../models/pm-credential-tags.model'

export type PMToolbarQuickFilter = Extract<QuickFilter, 'recent' | 'otp' | 'ssh' | 'card'>

export class PMQuickFiltersModel {
  readonly selectedQuickFilters = quickFilters

  getAvailableTagOptions() {
    return pmCredentialTagsModel.availableTags()
  }

  getSelectedTagComboboxValue(): string {
    return pmCredentialTagsModel.selectedComboboxValue()
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
    pmCredentialTagsModel.openManageSheet()
  }
}

export const pmQuickFiltersModel = new PMQuickFiltersModel()
