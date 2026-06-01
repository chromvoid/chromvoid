import {i18n} from '@project/passmanager/i18n'

import type {GroupBy, SortField} from './sort-controls'

export type SortFieldOption = {
  value: SortField
  label: () => string
}

export type GroupByOption = {
  value: GroupBy
  label: () => string
}

export const SORT_FIELD_OPTIONS: readonly SortFieldOption[] = [
  {value: 'name', label: () => i18n('sort:name')},
  {value: 'username', label: () => i18n('sort:username')},
  {value: 'modified', label: () => i18n('sort:modified')},
  {value: 'created', label: () => i18n('sort:created')},
  {value: 'website', label: () => i18n('sort:website')},
]

export const GROUP_BY_OPTIONS: readonly GroupByOption[] = [
  {value: 'none', label: () => i18n('group:none')},
  {value: 'website', label: () => i18n('group:website')},
  {value: 'modified', label: () => i18n('group:modified')},
  {value: 'security', label: () => i18n('group:security')},
]

export function getSortFieldLabel(field: SortField): string {
  return SORT_FIELD_OPTIONS.find((item) => item.value === field)?.label() ?? field
}

export function getGroupByLabel(value: GroupBy): string {
  return GROUP_BY_OPTIONS.find((item) => item.value === value)?.label() ?? value
}
