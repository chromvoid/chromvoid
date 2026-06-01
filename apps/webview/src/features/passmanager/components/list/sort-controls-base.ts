import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {sortStorage} from '@project/passmanager/sort-storage'

import {
  sortField,
  sortDirection,
  groupBy,
  viewMode,
  type SortField,
  type GroupBy,
  type ViewMode,
} from './sort-controls'

export abstract class SortControlsBase extends ReatomLitElement {
  connectedCallback() {
    super.connectedCallback()
    this.loadSavedSettings()
  }

  protected loadSavedSettings() {
    const settings = sortStorage.loadSettings()
    sortField.set(settings.sortField)
    sortDirection.set(settings.sortDirection)
    groupBy.set(settings.groupBy as GroupBy)
    viewMode.set(settings.viewMode)
  }

  protected saveCurrentSettings() {
    sortStorage.saveSettings({
      sortField: sortField(),
      sortDirection: sortDirection(),
      groupBy: groupBy(),
      viewMode: viewMode(),
    })
  }

  protected setSortField(field: SortField) {
    sortField.set(field)
    this.saveCurrentSettings()
  }

  protected toggleDirection() {
    sortDirection.set(sortDirection() === 'asc' ? 'desc' : 'asc')
    this.saveCurrentSettings()
  }

  protected setGroupBy(value: GroupBy) {
    groupBy.set(value)
    this.saveCurrentSettings()
  }

  protected setViewMode(value: ViewMode) {
    viewMode.set(value)
    this.saveCurrentSettings()
  }
}
