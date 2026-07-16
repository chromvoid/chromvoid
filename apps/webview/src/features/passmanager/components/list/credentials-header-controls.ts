import type {
  WorkspaceDashboardHeaderControlsModel,
  WorkspaceDashboardHeaderFilterChip,
  WorkspaceDashboardHeaderSummaryItem,
  WorkspaceDashboardHeaderViewModeOption,
} from 'root/features/file-manager/components/workspace-dashboard-header'

import {i18n} from '@project/passmanager/i18n'
import {filterValue} from '@project/passmanager/select'

import {pmCredentialTagsModel} from '../../models/pm-credential-tags.model'
import {pmMobileChromeModel} from '../../models/pm-mobile-chrome.model'
import {groupBy, sortField, type GroupBy, type SortField} from './sort-controls'

type CredentialsSortOption = {
  value: SortField
  label: () => string
}

type CredentialsGroupOption = {
  value: GroupBy
  icon: string
  label: () => string
}

type CredentialsHeaderSummary = {
  visibleLabel: string
  folderCount: number
  entryCount: number
}

const SORT_FIELD_OPTIONS: readonly CredentialsSortOption[] = [
  {value: 'name', label: () => i18n('sort:name')},
  {value: 'username', label: () => i18n('sort:username-short')},
  {value: 'modified', label: () => i18n('sort:modified')},
  {value: 'created', label: () => i18n('sort:created')},
  {value: 'website', label: () => i18n('sort:website')},
]

const GROUP_BY_OPTIONS: readonly CredentialsGroupOption[] = [
  {value: 'none', icon: 'circle-minus', label: () => i18n('group:none-short')},
  {value: 'website', icon: 'globe', label: () => i18n('group:website-short')},
  {value: 'modified', icon: 'calendar-clock', label: () => i18n('group:modified-short')},
  {value: 'security', icon: 'shield-check', label: () => i18n('group:security-short')},
]

function isGroupByValue(value: string): value is GroupBy {
  return GROUP_BY_OPTIONS.some((option) => option.value === value)
}

function getCredentialsSortLabel(value: SortField): string {
  return SORT_FIELD_OPTIONS.find((option) => option.value === value)?.label() ?? value
}

function getCredentialsGroupOptions(): WorkspaceDashboardHeaderViewModeOption[] {
  return GROUP_BY_OPTIONS.map((option) => ({
    value: option.value,
    icon: option.icon,
    label: option.label(),
  }))
}

function getCredentialTagFilterChips(): WorkspaceDashboardHeaderFilterChip[] {
  const selectedKeys = new Set(pmCredentialTagsModel.effectiveSelectedTagKeys())
  const hasSelectedTags = selectedKeys.size > 0

  return [
    {
      key: pmCredentialTagsModel.allFilterChipValue(),
      label: i18n('tags:all' as never),
      active: !hasSelectedTags,
    },
    ...pmCredentialTagsModel.availableTags().map((option) => ({
      key: option.key,
      label: option.label,
      count: option.count,
      active: selectedKeys.has(option.key),
    })),
  ]
}

function cycleCredentialsSortField(): void {
  const current = sortField()
  const index = SORT_FIELD_OPTIONS.findIndex((option) => option.value === current)
  const nextIndex = index < 0 ? 0 : (index + 1) % SORT_FIELD_OPTIONS.length
  pmMobileChromeModel.setSortField(SORT_FIELD_OPTIONS[nextIndex]?.value ?? 'name')
}

function getCredentialsSummaryItems(summary: CredentialsHeaderSummary): WorkspaceDashboardHeaderSummaryItem[] {
  return [
    {id: 'groups', icon: 'folder', label: i18n('group:groups'), value: summary.folderCount},
    {id: 'entries', icon: 'key', label: i18n('group:entries'), value: summary.entryCount},
  ]
}

export function createCredentialsHeaderControlsModel(
  summary: () => CredentialsHeaderSummary,
): WorkspaceDashboardHeaderControlsModel {
  return {
    search: {
      value: filterValue,
      placeholder: () => i18n('entry:mobile_search' as never),
      ariaLabel: () => i18n('entry:mobile_search' as never),
      setValue(value: string): void {
        filterValue.set(value)
      },
      clear(): void {
        filterValue.set('')
      },
    },
    summary: {
      label: () => summary().visibleLabel,
      items: () => getCredentialsSummaryItems(summary()),
    },
    filters: {
      chips: getCredentialTagFilterChips,
      value: () => pmCredentialTagsModel.selectedFilterChipGroupValue(),
      selectionMode: () => 'multiple',
      ariaLabel: () => i18n('tags:title'),
      leadingAction: {
        id: 'tags-manage',
        icon: 'sliders',
        label: () => i18n('tags:manage_short' as never),
        showLabel: false,
        ariaLabel: () => i18n('tags:manage_open' as never),
        title: () => i18n('tags:manage_open' as never),
        activate(): void {
          pmCredentialTagsModel.openManageSheet()
        },
      },
      setValue(value, detail): void {
        pmCredentialTagsModel.setSelectedFromFilterChipGroupDetail(detail ?? {value})
      },
    },
    sort: {
      label: () => getCredentialsSortLabel(sortField()),
      ariaLabel: () => i18n('sort-by'),
      title: () => `${i18n('sort-by')}: ${getCredentialsSortLabel(sortField())}`,
      mode: sortField,
      activate: cycleCredentialsSortField,
    },
    viewMode: {
      value: groupBy,
      ariaLabel: () => i18n('group-by'),
      options: getCredentialsGroupOptions,
      setValue(value: string): void {
        if (isGroupByValue(value)) {
          pmMobileChromeModel.setGroupBy(value)
        }
      },
    },
  }
}
