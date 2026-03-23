export type SelectionMode = 'single' | 'multiple'

export const normalizeSelection = (
  ids: readonly string[],
  allowedIds: ReadonlySet<string>,
  mode: SelectionMode,
) => {
  const filtered = ids.filter((id) => allowedIds.has(id))
  if (mode === 'single') {
    return filtered.slice(0, 1)
  }
  return [...new Set(filtered)]
}

export const toggleSelection = (
  selectedIds: readonly string[],
  id: string,
  mode: SelectionMode,
  allowedIds: ReadonlySet<string>,
) => {
  if (!allowedIds.has(id)) {
    return [...selectedIds]
  }

  if (mode === 'single') {
    return [id]
  }

  const selected = new Set(selectedIds)
  if (selected.has(id)) {
    selected.delete(id)
  } else {
    selected.add(id)
  }

  return [...selected]
}

export const selectOnly = (id: string, allowedIds: ReadonlySet<string>) => {
  if (!allowedIds.has(id)) {
    return []
  }
  return [id]
}

export const selectRangeByOrder = (orderedIds: readonly string[], fromId: string, toId: string) => {
  const fromIndex = orderedIds.indexOf(fromId)
  const toIndex = orderedIds.indexOf(toId)

  if (fromIndex < 0 || toIndex < 0) {
    return []
  }

  const start = Math.min(fromIndex, toIndex)
  const end = Math.max(fromIndex, toIndex)
  return orderedIds.slice(start, end + 1)
}
