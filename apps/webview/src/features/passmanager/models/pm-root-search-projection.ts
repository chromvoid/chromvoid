import {computed} from '@reatom/core'

import {Entry, Group} from '@project/passmanager/core'
import {
  createEntryFilterMatcher,
  createGroupFilterMatcher,
  filterValue,
  getEffectiveSelectedCredentialTagFilters,
  quickFilters,
} from '@project/passmanager/select'
import {groupEntries} from '@project/passmanager/sorting'
import {pmModel} from '../password-manager.model'
import {groupBy, sortDirection, sortField, type GroupBy, type SortDirection, type SortField} from '../components/list/sort-controls'

export type PMGroupHeaderRow = {
  kind: 'header'
  id: string
  label: string
  count: number
  icon?: string
}

export type PMGroupEntryRow = {
  kind: 'entry'
  id: string
  item: Entry
}

export type PMGroupFolderRow = {
  kind: 'group'
  id: string
  item: Group
}

export type PMGroupRow = PMGroupHeaderRow | PMGroupEntryRow | PMGroupFolderRow

export type PMRootSearchProjectionSnapshot = {
  rootEntries: Entry[]
  topLevelGroups: Group[]
  groupMatchCounts: ReadonlyMap<string, number>
  resultCount: number
  rows: PMGroupRow[]
}

type SortState = {
  groupBy: GroupBy
  sortField: SortField
  sortDirection: SortDirection
}

type PMRootSearchSource = {
  allEntries?: unknown
  entriesList?: () => unknown
  credentialTags?: () => readonly string[]
}

const EMPTY_PROJECTION: PMRootSearchProjectionSnapshot = {
  rootEntries: [],
  topLevelGroups: [],
  groupMatchCounts: new Map(),
  resultCount: 0,
  rows: [],
}

export function getPMRootEntriesForSearch(root: PMRootSearchSource | undefined): Entry[] {
  if (!root) return []

  if (Array.isArray(root.allEntries)) {
    return root.allEntries.filter((item): item is Entry => item instanceof Entry)
  }

  const entries = root.entriesList?.()
  if (!Array.isArray(entries)) return []

  return entries.flatMap((item) => {
    if (item instanceof Entry) return [item]
    if (item instanceof Group) return item.entries()
    return []
  })
}

export function getPMRootCredentialTagsForSearch(root: PMRootSearchSource | undefined): readonly string[] {
  const tags = root?.credentialTags?.()
  return Array.isArray(tags) ? tags : []
}

export function composePMGroupRows(
  childGroups: Group[],
  entries: Entry[],
  currentSort: SortState,
): PMGroupRow[] {
  const folderRows = [...childGroups]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({kind: 'group', id: item.id, item}) satisfies PMGroupFolderRow)

  const groupedRows = groupEntries(
    entries,
    currentSort.groupBy,
    currentSort.sortField,
    currentSort.sortDirection,
  ).flatMap((group, index) => {
    const rows: PMGroupRow[] = []

    if (currentSort.groupBy !== 'none' && group.entries.length > 0) {
      rows.push({
        kind: 'header',
        id: `group-header:${currentSort.groupBy}:${index}:${group.groupName}`,
        label: group.groupName,
        count: group.count,
        icon: group.icon,
      })
    }

    rows.push(
      ...group.entries.map(
        (item) =>
          ({
            kind: 'entry',
            id: item.id,
            item,
          }) satisfies PMGroupEntryRow,
      ),
    )

    return rows
  })

  return [...folderRows, ...groupedRows]
}

class PMRootSearchProjectionModel {
  readonly snapshot = computed(
    (): PMRootSearchProjectionSnapshot => {
      const root = pmModel.root()
      if (!root) {
        return EMPTY_PROJECTION
      }

      const query = filterValue()
      const activeFilters = quickFilters()
      const selectedTags = getEffectiveSelectedCredentialTagFilters(
        getPMRootEntriesForSearch(root),
        getPMRootCredentialTagsForSearch(root),
      )
      const currentSort = {
        groupBy: groupBy(),
        sortField: sortField(),
        sortDirection: sortDirection(),
      } satisfies SortState
      const isFiltered = query.length > 0 || activeFilters.length > 0 || selectedTags.length > 0
      const matchesEntry = createEntryFilterMatcher(query, activeFilters, Date.now(), selectedTags)
      const matchesGroup = createGroupFilterMatcher(query)

      const rootEntries: Entry[] = []
      const topLevelGroups: Group[] = []
      const groupMatchCounts = new Map<string, number>()

      let matchingGroupCount = 0
      let totalGroupCount = 0

      for (const item of root.entriesList()) {
        if (item instanceof Entry) {
          if (matchesEntry(item)) {
            rootEntries.push(item)
          }
          continue
        }

        if (!(item instanceof Group)) {
          continue
        }

        totalGroupCount += 1

        let directMatchCount = 0
        for (const entry of item.entriesList()) {
          if (matchesEntry(entry)) {
            directMatchCount += 1
          }
        }

        groupMatchCounts.set(item.id, directMatchCount)

        const groupMatchesQuery = query.length > 0 && matchesGroup(item)
        const groupMatchesFilter = directMatchCount > 0 || groupMatchesQuery

        if (groupMatchesFilter) {
          matchingGroupCount += 1
        }

        if (!item.name.includes('/') && (!isFiltered || groupMatchesFilter)) {
          topLevelGroups.push(item)
        }
      }

      return {
        rootEntries,
        topLevelGroups,
        groupMatchCounts,
        resultCount: rootEntries.length + (isFiltered ? matchingGroupCount : totalGroupCount),
        rows: composePMGroupRows(topLevelGroups, rootEntries, currentSort),
      }
    },
    'pm_root_search_projection',
  )

  getSnapshot(): PMRootSearchProjectionSnapshot {
    return this.snapshot()
  }

  getDirectEntryCount(group: Group): number {
    return this.snapshot().groupMatchCounts.get(group.id) ?? 0
  }

  getRootResultCount(): number {
    return this.snapshot().resultCount
  }
}

export const pmRootSearchProjectionModel = new PMRootSearchProjectionModel()
