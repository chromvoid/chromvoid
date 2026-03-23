import type { Conflict, ImportedEntry } from './types.js'

/**
 * Detects conflicts between imported entries and existing catalog entries.
 * Phase 1: only detects name_collision and possible_duplicate.
 */
export function detectConflicts(
  importedEntries: ImportedEntry[],
  existingNames: Set<string>,
  existingEntries?: Array<{ name: string; username?: string; urls?: Array<{ value: string }> }>,
): Conflict[] {
  const conflicts: Conflict[] = []

  for (const entry of importedEntries) {
    // 1. Name collision — same name exists in target folder
    if (existingNames.has(entry.name)) {
      conflicts.push({
        type: 'name_collision',
        newEntry: entry,
        resolution: 'rename', // Phase 1 default
      })
    }

    // 2. Possible duplicate — same URL + username as existing entry
    if (existingEntries && entry.urls && entry.urls.length > 0 && entry.username) {
      for (const existing of existingEntries) {
        if (
          existing.username === entry.username &&
          existing.urls &&
          existing.urls.some((u) => entry.urls!.some((eu) => eu.value === u.value))
        ) {
          conflicts.push({
            type: 'possible_duplicate',
            newEntry: entry,
            existingEntry: {
              id: '',
              type: 'login',
              name: existing.name,
              username: existing.username,
              urls: existing.urls.map((u) => ({ value: u.value, match: 'base_domain' as const })),
            },
            resolution: 'rename', // Phase 1: just rename, no interactive resolution
          })
          break // Only one duplicate per entry
        }
      }
    }
  }

  return conflicts
}

/**
 * Generates a unique name by appending suffix (2), (3), etc.
 */
export function generateUniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) return baseName

  for (let i = 2; i <= 100; i++) {
    const candidate = `${baseName} (${i})`
    if (!existingNames.has(candidate)) return candidate
  }

  // Fallback: append timestamp
  return `${baseName} (${Date.now()})`
}

/**
 * Applies auto-rename resolution to all conflicting entries.
 * Mutates entry names in-place.
 */
export function resolveConflictsAutoRename(
  entries: ImportedEntry[],
  existingNames: Set<string>,
): { resolved: number; renamedEntries: Array<{ original: string; renamed: string }> } {
  const allNames = new Set(existingNames)
  const renamedEntries: Array<{ original: string; renamed: string }> = []

  for (const entry of entries) {
    const uniqueName = generateUniqueName(entry.name, allNames)
    if (uniqueName !== entry.name) {
      renamedEntries.push({ original: entry.name, renamed: uniqueName })
      entry.name = uniqueName
    }
    allNames.add(entry.name)
  }

  return { resolved: renamedEntries.length, renamedEntries }
}
