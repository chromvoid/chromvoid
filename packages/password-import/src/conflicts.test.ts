import { describe, it, expect } from 'vitest'
import { detectConflicts, generateUniqueName, resolveConflictsAutoRename } from './conflicts.js'
import type { ImportedEntry } from './types.js'

function makeEntry(name: string, overrides: Partial<ImportedEntry> = {}): ImportedEntry {
  return {
    id: crypto.randomUUID(),
    type: 'login',
    name,
    username: 'user@test.com',
    password: 'pass123',
    ...overrides,
  }
}

describe('conflict detection', () => {
  describe('detectConflicts', () => {
    it('should detect name collisions', () => {
      const entries = [makeEntry('GitHub'), makeEntry('Gmail')]
      const existing = new Set(['GitHub'])

      const conflicts = detectConflicts(entries, existing)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]!.type).toBe('name_collision')
      expect(conflicts[0]!.newEntry.name).toBe('GitHub')
      expect(conflicts[0]!.resolution).toBe('rename')
    })

    it('should return empty array when no conflicts', () => {
      const entries = [makeEntry('GitHub')]
      const existing = new Set(['Gmail'])

      const conflicts = detectConflicts(entries, existing)
      expect(conflicts).toHaveLength(0)
    })

    it('should detect possible duplicates by URL + username', () => {
      const entries = [
        makeEntry('GitHub', {
          urls: [{ value: 'https://github.com', match: 'base_domain' }],
          username: 'user@test.com',
        }),
      ]
      const existing = new Set<string>()
      const existingEntries = [
        {
          name: 'My GitHub',
          username: 'user@test.com',
          urls: [{ value: 'https://github.com' }],
        },
      ]

      const conflicts = detectConflicts(entries, existing, existingEntries)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]!.type).toBe('possible_duplicate')
    })

    it('should not flag duplicate if username differs', () => {
      const entries = [
        makeEntry('GitHub', {
          urls: [{ value: 'https://github.com', match: 'base_domain' }],
          username: 'user@test.com',
        }),
      ]
      const existingEntries = [
        {
          name: 'GitHub',
          username: 'other@test.com',
          urls: [{ value: 'https://github.com' }],
        },
      ]

      const conflicts = detectConflicts(entries, new Set(), existingEntries)
      expect(conflicts).toHaveLength(0)
    })

    it('should detect both collision and duplicate for same entry', () => {
      const entries = [
        makeEntry('GitHub', {
          urls: [{ value: 'https://github.com', match: 'base_domain' }],
          username: 'user@test.com',
        }),
      ]
      const existing = new Set(['GitHub'])
      const existingEntries = [
        {
          name: 'GitHub',
          username: 'user@test.com',
          urls: [{ value: 'https://github.com' }],
        },
      ]

      const conflicts = detectConflicts(entries, existing, existingEntries)
      expect(conflicts).toHaveLength(2) // name_collision + possible_duplicate
    })
  })

  describe('generateUniqueName', () => {
    it('should return base name if not taken', () => {
      const result = generateUniqueName('GitHub', new Set())
      expect(result).toBe('GitHub')
    })

    it('should append (2) for first collision', () => {
      const result = generateUniqueName('GitHub', new Set(['GitHub']))
      expect(result).toBe('GitHub (2)')
    })

    it('should append (3) if (2) is also taken', () => {
      const result = generateUniqueName('GitHub', new Set(['GitHub', 'GitHub (2)']))
      expect(result).toBe('GitHub (3)')
    })

    it('should handle many collisions', () => {
      const existing = new Set<string>()
      existing.add('Test')
      for (let i = 2; i <= 10; i++) existing.add(`Test (${i})`)

      const result = generateUniqueName('Test', existing)
      expect(result).toBe('Test (11)')
    })
  })

  describe('resolveConflictsAutoRename', () => {
    it('should rename conflicting entries in-place', () => {
      const entries = [makeEntry('GitHub'), makeEntry('Gmail')]
      const existing = new Set(['GitHub'])

      const result = resolveConflictsAutoRename(entries, existing)

      expect(result.resolved).toBe(1)
      expect(entries[0]!.name).toBe('GitHub (2)')
      expect(entries[1]!.name).toBe('Gmail') // no rename needed
      expect(result.renamedEntries).toEqual([{ original: 'GitHub', renamed: 'GitHub (2)' }])
    })

    it('should handle multiple entries with same name', () => {
      const entries = [makeEntry('Login'), makeEntry('Login'), makeEntry('Login')]
      const existing = new Set<string>()

      const result = resolveConflictsAutoRename(entries, existing)

      // First "Login" keeps its name, second → "Login (2)", third → "Login (3)"
      expect(entries[0]!.name).toBe('Login')
      expect(entries[1]!.name).toBe('Login (2)')
      expect(entries[2]!.name).toBe('Login (3)')
      expect(result.resolved).toBe(2)
    })

    it('should handle no conflicts', () => {
      const entries = [makeEntry('A'), makeEntry('B')]
      const existing = new Set<string>()

      const result = resolveConflictsAutoRename(entries, existing)

      expect(result.resolved).toBe(0)
      expect(result.renamedEntries).toEqual([])
    })
  })
})
