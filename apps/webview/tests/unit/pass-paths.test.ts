import {describe, expect, it} from 'vitest'

import {
  buildEntryDirName,
  buildEntryPath,
  buildGroupDirPath,
  extractGroupPathFromEntryPath,
  normalizeGroupPath,
} from '../../src/core/pass-paths'

describe('pass-paths', () => {
  describe('normalizeGroupPath', () => {
    it.each([
      [undefined, undefined],
      ['', undefined],
      ['   ', undefined],
      ['Banking', 'Banking'],
      ['Work/Jira', 'Work/Jira'],
      ['Work\\Jira', 'Work/Jira'],
      ['/Work/Jira/', 'Work/Jira'],
      ['Work//Jira', 'Work/Jira'],
      ['  Spaced  /  Path  ', 'Spaced/Path'],
    ])('normalizeGroupPath(%j) === %j', (input, expected) => {
      expect(normalizeGroupPath(input)).toBe(expected)
    })

    it.each(['..', '../etc/passwd', './a', 'a/..', 'a/.', 'a/../b'])('rejects traversal: %j', (input) => {
      expect(() => normalizeGroupPath(input)).toThrow()
    })
  })

  it('builds group dir path (root vs nested)', () => {
    expect(buildGroupDirPath(undefined)).toBe('.passmanager')
    expect(buildGroupDirPath('Work/Jira')).toBe('.passmanager/Work/Jira')
  })

  it('builds entry dir name without id suffix', () => {
    expect(buildEntryDirName('Title', 'abcdef012345')).toBe('Title')
  })

  describe('buildEntryPath', () => {
    it.each([
      [undefined, 'Title', 'id123', '.passmanager/Title'],
      ['Banking', 'Title', 'id123', '.passmanager/Banking/Title'],
      ['Work/Jira', 'Title', 'id123', '.passmanager/Work/Jira/Title'],
    ])('buildEntryPath(%j, %j, %j) === %j', (groupPath, title, id, expected) => {
      expect(buildEntryPath(groupPath, title, id)).toBe(expected)
    })
  })

  describe('extractGroupPathFromEntryPath', () => {
    it.each([
      ['/.passmanager/Title', undefined],
      ['.passmanager/Title', undefined],
      ['/.passmanager/Banking/Title', 'Banking'],
      ['/.passmanager/Work/Jira/Title', 'Work/Jira'],
      ['/.passmanager/a/b/c/entry', 'a/b/c'],
    ])('extractGroupPathFromEntryPath(%j) === %j', (path, expected) => {
      expect(extractGroupPathFromEntryPath(path)).toBe(expected)
    })
  })
})
