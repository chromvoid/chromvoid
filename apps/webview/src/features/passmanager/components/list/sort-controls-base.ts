import {XLitElement} from '@statx/lit'

import {sortStorage} from '@project/passmanager'

import {
  sortField,
  sortDirection,
  groupBy,
  type SortField,
  type SortDirection,
  type GroupBy,
} from './sort-controls'

export abstract class SortControlsBase extends XLitElement {
  connectedCallback() {
    super.connectedCallback()
    this.loadSavedSettings()
  }

  protected loadSavedSettings() {
    const settings = sortStorage.loadSettings()
    sortField.set(settings.sortField)
    sortDirection.set(settings.sortDirection)
    groupBy.set(settings.groupBy)
  }

  protected saveCurrentSettings() {
    sortStorage.saveSettings({
      sortField: sortField(),
      sortDirection: sortDirection(),
      groupBy: groupBy(),
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
}
