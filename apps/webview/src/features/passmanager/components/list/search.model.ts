import {atom, computed, withLocalStorage} from '@reatom/core'

import {Group, ManagerRoot} from '@project/passmanager/core'
import {type QuickFilter, filterValue, quickFilters} from '@project/passmanager/select'
import {pmCredentialTagsModel} from '../../models/pm-credential-tags.model'
import {getPassmanagerShowElement} from '../../models/pm-root.adapter'
import {pmRootSearchProjectionModel} from '../../models/pm-root-search-projection'

export type PMSearchRenderState = {
  className: string
  isInvalid: boolean
  isSearched: number
  resultCount: number
}

export const filtersExpanded = atom<boolean>(false, 'pm_filters_expanded').extend(
  withLocalStorage({key: 'pm_filters_expanded'}),
)

export class PMSearchInputModel {
  readonly isFocused = atom(false, 'passmanager.search.isFocused')
  readonly inputValue = atom('', 'passmanager.search.inputValue')
  readonly renderValue = computed(
    () => (this.isFocused() ? this.inputValue() : filterValue()),
    'passmanager.search.renderValue',
  )
  readonly renderState = computed((): PMSearchRenderState => {
    const group = getPassmanagerShowElement()
    const isRoot = group instanceof ManagerRoot
    let resultCount = 0
    const isSearched = filterValue().length

    if (group instanceof Group || isRoot) {
      resultCount = isRoot ? pmRootSearchProjectionModel.getRootResultCount() : group.searched().length
    }

    const className = isSearched ? (resultCount > 0 ? 'success' : 'fail') : ''
    const isInvalid = Boolean(isSearched && resultCount === 0)

    return {className, isInvalid, isSearched, resultCount}
  }, 'passmanager.search.renderState')

  private debounceTimer: number | undefined

  constructor(private readonly debounceMs = 180) {}

  dispose(): void {
    this.clearDebounce()
  }

  clear(): void {
    this.clearDebounce()
    this.inputValue.set('')
    filterValue.set('')
  }

  focus(): void {
    this.inputValue.set(filterValue())
    this.isFocused.set(true)
  }

  blur(): void {
    this.isFocused.set(false)
  }

  input(value: string): void {
    this.inputValue.set(value)
    this.clearDebounce()
    this.debounceTimer = window.setTimeout(() => {
      filterValue.set(value)
      this.debounceTimer = undefined
    }, this.debounceMs)
  }

  submit(value: string): void {
    this.clearDebounce()
    this.inputValue.set(value)
    filterValue.set(value)
  }

  submitCurrent(): void {
    this.submit(this.renderValue())
  }

  toggleQuick(filter: QuickFilter): void {
    const current = quickFilters()
    if (current.includes(filter)) {
      quickFilters.set(current.filter((f) => f !== filter))
      return
    }
    quickFilters.set([...current, filter])
  }

  toggleFiltersPanel(): void {
    filtersExpanded.set(!filtersExpanded())
  }

  isFiltersPanelExpanded(): boolean {
    return filtersExpanded()
  }

  setSelectedTagsFromComboboxEvent(event: Event): void {
    const detail = (event as CustomEvent<{selectedIds?: unknown}>).detail
    const selectedIds = Array.isArray(detail?.selectedIds) ? detail.selectedIds : []
    pmCredentialTagsModel.setSelectedFromComboboxIds(
      selectedIds.filter((id): id is string => typeof id === 'string'),
    )
  }

  getInputValue(): string {
    return this.renderValue()
  }

  getSearchState(): PMSearchRenderState {
    return this.renderState()
  }

  private clearDebounce(): void {
    if (this.debounceTimer === undefined) return
    window.clearTimeout(this.debounceTimer)
    this.debounceTimer = undefined
  }
}
