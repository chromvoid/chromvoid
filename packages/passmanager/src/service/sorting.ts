import type {GroupBy, SortDirection, SortField} from './types'
import type {Entry} from './entry'

/**
 * Утилиты для сортировки и группировки записей менеджера паролей
 */

export interface GroupedEntries {
  groupName: string
  entries: Entry[]
  count: number
  icon?: string
}

function getPrimaryUrlValue(entry: Entry): string {
  // Берём первый не-"never" URL как основной.
  const rule = entry.urls.find((r) => r.match !== 'never')
  return (rule?.value ?? '').trim()
}

/**
 * Сортирует массив записей по указанному полю и направлению
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

    // Обработка пустых значений
    if (!aValue && !bValue) return 0
    if (!aValue) return direction === 'asc' ? 1 : -1
    if (!bValue) return direction === 'asc' ? -1 : 1

    // Сравнение значений
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

/**
 * Группирует записи по указанному критерию
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

  // Создаем сгруппированные результаты
  const result: GroupedEntries[] = []

  for (const [groupName, groupEntries] of groups.entries()) {
    result.push({
      groupName: getGroupDisplayName(groupName, groupBy),
      entries: sortEntries(groupEntries, sortField, sortDirection),
      count: groupEntries.length,
      icon: getGroupIcon(groupName, groupBy),
    })
  }

  // Сортируем группы
  return sortGroups(result, groupBy)
}

/**
 * Получает ключ группы для записи
 */
function getGroupKey(entry: Entry, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'folder': {
      // Получаем имя группы из parent, если есть
      const groupName = entry.parent?.name || 'Без папки'
      return groupName
    }

    case 'website': {
      const website = getPrimaryUrlValue(entry)
      if (!website) return 'Без сайта'

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

      if (daysDiff === 0) return 'Сегодня'
      if (daysDiff === 1) return 'Вчера'
      if (daysDiff < 7) return 'На этой неделе'
      if (daysDiff < 30) return 'В этом месяце'
      if (daysDiff < 365) return 'В этом году'
      return 'Более года назад'
    }

    case 'security': {
      const hasOtp = entry.otps().length > 0

      // Здесь можно добавить проверку слабых паролей, когда будет доступ к расшифрованному паролю

      if (hasOtp) return 'С двухфакторной аутентификацией'
      return 'Базовая защита'
    }

    default:
      return 'Другое'
  }
}

/**
 * Получает отображаемое имя группы
 */
function getGroupDisplayName(groupKey: string, _groupBy: GroupBy): string {
  // В большинстве случаев ключ и отображаемое имя совпадают
  return groupKey
}

/**
 * Получает иконку для группы
 */
function getGroupIcon(groupKey: string, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'folder':
      return 'folder'

    case 'website': {
      if (groupKey === 'Без сайта') return 'question-circle'
      return 'globe'
    }

    case 'modified':
      return 'clock'

    case 'security': {
      switch (groupKey) {
        case 'Максимальная защита':
          return 'shield-check'
        case 'С двухфакторной аутентификацией':
          return 'shield'
        case 'С файлами':
          return 'paperclip'
        default:
          return 'key'
      }
    }

    default:
      return 'list'
  }
}

/**
 * Сортирует группы по логическому порядку
 */
function sortGroups(groups: GroupedEntries[], groupBy: GroupBy): GroupedEntries[] {
  const sorted = [...groups]

  switch (groupBy) {
    case 'folder':
      // Сортируем папки по имени, "Без папки" в конец
      sorted.sort((a, b) => {
        if (a.groupName === 'Без папки') return 1
        if (b.groupName === 'Без папки') return -1
        return a.groupName.localeCompare(b.groupName, 'ru-RU')
      })
      break

    case 'website':
      // Сортируем домены по алфавиту, "Без сайта" в конец
      sorted.sort((a, b) => {
        if (a.groupName === 'Без сайта') return 1
        if (b.groupName === 'Без сайта') return -1
        return a.groupName.localeCompare(b.groupName, 'ru-RU')
      })
      break

    case 'modified': {
      // Сортируем по времени модификации (новые сверху)
      const timeOrder = [
        'Сегодня',
        'Вчера',
        'На этой неделе',
        'В этом месяце',
        'В этом году',
        'Более года назад',
      ]
      sorted.sort((a, b) => {
        const aIndex = timeOrder.indexOf(a.groupName)
        const bIndex = timeOrder.indexOf(b.groupName)
        return aIndex - bIndex
      })
      break
    }

    case 'security': {
      // Сортируем по уровню безопасности (максимальная защита сверху)
      const securityOrder = [
        'Максимальная защита',
        'С двухфакторной аутентификацией',
        'С файлами',
        'Базовая защита',
      ]
      sorted.sort((a, b) => {
        const aIndex = securityOrder.indexOf(a.groupName)
        const bIndex = securityOrder.indexOf(b.groupName)
        return aIndex - bIndex
      })
      break
    }

    default:
      // По умолчанию сортируем по количеству записей (больше сверху)
      sorted.sort((a, b) => b.count - a.count)
      break
  }

  return sorted
}

/**
 * Фильтрует записи по поисковому запросу с учетом группировки
 */
export function filterAndGroupEntries(
  entries: Entry[],
  searchQuery: string,
  groupBy: GroupBy,
  sortField: SortField,
  sortDirection: SortDirection,
): GroupedEntries[] {
  // Сначала фильтруем записи
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

  // Затем группируем
  return groupEntries(filtered, groupBy, sortField, sortDirection)
}
