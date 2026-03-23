import {describe, expect, it} from 'vitest'

import {buildGroupTreeNodes} from '../../src/features/passmanager/models/group-tree-builder'

describe('group-tree-builder', () => {
  it('builds nested tree + totals from flat paths', () => {
    const expanded = new Set<string>(['Work'])

    const tree = buildGroupTreeNodes(
      [
        {path: 'Work', entryCount: 2},
        {path: 'Work/Jira', entryCount: 1},
        {path: 'Personal', entryCount: 0},
        {path: 'Personal/Jira', entryCount: 3},
      ],
      expanded,
    )

    expect(tree.map((n) => n.path)).toEqual(['Personal', 'Work'])

    const work = tree.find((n) => n.path === 'Work')!
    expect(work.name).toBe('Work')
    expect(work.entryCount).toBe(2)
    expect(work.totalEntryCount).toBe(3)
    expect(work.expanded).toBe(true)
    expect(work.children.map((c) => c.path)).toEqual(['Work/Jira'])

    const jira = work.children[0]!
    expect(jira.name).toBe('Jira')
    expect(jira.entryCount).toBe(1)
    expect(jira.totalEntryCount).toBe(1)
    expect(jira.expanded).toBe(false)

    const personal = tree.find((n) => n.path === 'Personal')!
    expect(personal.totalEntryCount).toBe(3)
    expect(personal.children.map((c) => c.name)).toEqual(['Jira'])
  })

  it('creates placeholder parents when only leaf path is present', () => {
    const tree = buildGroupTreeNodes([{path: 'Work/Jira', entryCount: 1}], new Set())
    expect(tree.map((n) => n.path)).toEqual(['Work'])
    expect(tree[0]!.entryCount).toBe(0)
    expect(tree[0]!.totalEntryCount).toBe(1)
    expect(tree[0]!.children.map((c) => c.path)).toEqual(['Work/Jira'])
  })
})
