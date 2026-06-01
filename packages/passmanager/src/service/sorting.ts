import type {GroupBy, SortDirection, SortField} from './types'
import type {Entry} from './entry'

/**Utilities for sorting and grouping password manager records
*/

export interface GroupedEntries {
  groupName: string
  entries: Entry[]
  count: number
  icon?: string
}

function getPrimaryUrlValue(entry: Entry): string {
  // Take the first non-never URL as the primary URL.
  const rule = entry.urls.find((r) => r.match !== 'never')
  return (rule?.value ?? '').trim()
}

/*** Sorts an array of records by specified field and direction
*/
export function sortEntries(entries: Entry[], field: SortField, direction: SortDirection): Entry[] {
  const sorted = [...entries].sort((a, b) => {
    let aValue: string | number
    let bValue: string | number

    switch (field) {
      case 'name':
        aValue = a.title.toLowerCase()
        bValue = b.title.toLowerCase()
        break

      case 'username':
        aValue = a.username.toLowerCase()
        bValue = b.username.toLowerCase()
        break

      case 'modified':
        aValue = a.updatedTs
        bValue = b.updatedTs
        break

      case 'created':
        aValue = a.createdTs
        bValue = b.createdTs
        break

      case 'website':
        aValue = getPrimaryUrlValue(a).toLowerCase()
        bValue = getPrimaryUrlValue(b).toLowerCase()
        break

      default:
        return 0
    }

    // Processing empty values
    if (!aValue && !bValue) return 0
    if (!aValue) return direction === 'asc' ? 1 : -1
    if (!bValue) return direction === 'asc' ? -1 : 1

    // Comparison of values
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const result = aValue.localeCompare(bValue, 'ru-RU', {
        numeric: true,
        sensitivity: 'base',
      })
      return direction === 'asc' ? result : -result
    } else {
      const aNum = Number(aValue)
      const bNum = Number(bValue)
      const result = aNum < bNum ? -1 : aNum > bNum ? 1 : 0
      return direction === 'asc' ? result : -result
    }
  })

  return sorted
}

/*** Groups records according to this criterion
*/
export function groupEntries(
  entries: Entry[],
  groupBy: GroupBy,
  sortField: SortField = 'name',
  sortDirection: SortDirection = 'asc',
): GroupedEntries[] {
  if (groupBy === 'none') {
    return [
      {
        groupName: '',
        entries: sortEntries(entries, sortField, sortDirection),
        count: entries.length,
      },
    ]
  }

  const groups = new Map<string, Entry[]>()

  for (const entry of entries) {
    const groupKey = getGroupKey(entry, groupBy)
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(entry)
  }

  // Create grouped results
  const result: GroupedEntries[] = []

  for (const [groupName, groupEntries] of groups.entries()) {
    result.push({
      groupName: getGroupDisplayName(groupName, groupBy),
      entries: sortEntries(groupEntries, sortField, sortDirection),
      count: groupEntries.length,
      icon: getGroupIcon(groupName, groupBy),
    })
  }

  // Sorting groups.
  return sortGroups(result, groupBy)
}

/*** Receives the group key for recording
*/
function getGroupKey(entry: Entry, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'website': {
      const website = getPrimaryUrlValue(entry)
      if (!website) return 'No website'

      try {
        const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname
        return domain.replace('www.', '')
      } catch {
        return website
      }
    }

    case 'modified': {
      const now = new Date()
      const entryDate = new Date(entry.updatedTs)
      const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff === 0) return 'Today'
      if (daysDiff === 1) return 'Yesterday'
      if (daysDiff < 7) return 'This week'
      if (daysDiff < 30) return 'This month'
      if (daysDiff < 365) return 'This year'
      return 'More than a year ago'
    }

    case 'security': {
      const hasOtp = entry.otps().length > 0

      // Here you can add a weak password check when you have access to the decrypted password.

      if (hasOtp) return 'With two-factor authentication'
      return 'Basic protection'
    }

    default:
      return 'Other'
  }
}

/*** Receives the displayed group name
*/
function getGroupDisplayName(groupKey: string, _groupBy: GroupBy): string {
  // In most cases, the key and the displayed name are the same.
  return groupKey
}

/*** Gets an icon for the band
*/
function getGroupIcon(groupKey: string, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'website': {
      if (groupKey === 'No website') return 'question-circle'
      return 'globe'
    }

    case 'modified':
      return 'clock'

    case 'security': {
      switch (groupKey) {
        case 'Maximum protection':
          return 'shield-check'
        case 'With two-factor authentication':
          return 'shield'
        case 'With files':
          return 'paperclip'
        default:
          return 'key'
      }
    }

    default:
      return 'list'
  }
}

/*** Sorts groups in logical order
*/
function sortGroups(groups: GroupedEntries[], groupBy: GroupBy): GroupedEntries[] {
  const sorted = [...groups]

  switch (groupBy) {
    case 'website':
      // Sort domains by alphabet, "No site" at the end
      sorted.sort((a, b) => {
        if (a.groupName === 'No website') return 1
        if (b.groupName === 'No website') return -1
        return a.groupName.localeCompare(b.groupName, 'ru-RU')
      })
      break

    case 'modified': {
      // Sort by time of modification (new from above)
      const timeOrder = [
        'Today',
        'Yesterday',
        'This week',
        'This month',
        'This year',
        'More than a year ago',
      ]
      sorted.sort((a, b) => {
        const aIndex = timeOrder.indexOf(a.groupName)
        const bIndex = timeOrder.indexOf(b.groupName)
        return aIndex - bIndex
      })
      break
    }

    case 'security': {
      // Sort by security level (maximum protection on top)
      const securityOrder = [
        'Maximum protection',
        'With two-factor authentication',
        'With files',
        'Basic protection',
      ]
      sorted.sort((a, b) => {
        const aIndex = securityOrder.indexOf(a.groupName)
        const bIndex = securityOrder.indexOf(b.groupName)
        return aIndex - bIndex
      })
      break
    }

    default:
      // By default, sort by number of records (more on top)
      sorted.sort((a, b) => b.count - a.count)
      break
  }

  return sorted
}

/*** Filters entries on the search query, taking into account the grouping
*/
export function filterAndGroupEntries(
  entries: Entry[],
  searchQuery: string,
  groupBy: GroupBy,
  sortField: SortField,
  sortDirection: SortDirection,
): GroupedEntries[] {
  // First we filter the records.
  let filtered = entries

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase()
    filtered = entries.filter((entry) => {
      return (
        entry.title?.toLowerCase().includes(query) ||
        entry.username?.toLowerCase().includes(query) ||
        entry.urls.some((rule) => rule.value.toLowerCase().includes(query))
      )
    })
  }

  // Then group together.
  return groupEntries(filtered, groupBy, sortField, sortDirection)
}
