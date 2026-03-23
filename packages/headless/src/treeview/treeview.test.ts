import {describe, expect, it} from 'vitest'
import {createTreeview} from './index'

const sampleNodes = [
  {
    id: 'a',
    children: [{id: 'a1'}, {id: 'a2'}],
  },
  {
    id: 'b',
    children: [{id: 'b1'}],
  },
] as const

describe('createTreeview', () => {
  it('builds deterministic visible order from expansion state', () => {
    const tree = createTreeview({
      nodes: sampleNodes,
      initialExpandedIds: ['a'],
    })

    expect(tree.contracts.getVisibleNodeIds()).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('navigates through visible enabled nodes with ArrowDown and ArrowUp', () => {
    const tree = createTreeview({
      nodes: sampleNodes,
      initialExpandedIds: ['a', 'b'],
      initialActiveId: 'a',
    })

    tree.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(tree.state.activeId()).toBe('a1')

    tree.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(tree.state.activeId()).toBe('a2')

    tree.actions.handleKeyDown({
      key: 'ArrowUp',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(tree.state.activeId()).toBe('a1')
  })

  it('expands with ArrowRight and moves into child on second ArrowRight', () => {
    const tree = createTreeview({
      nodes: sampleNodes,
      initialActiveId: 'a',
    })

    tree.actions.handleKeyDown({
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tree.state.expandedIds()).toContain('a')
    expect(tree.state.activeId()).toBe('a')

    tree.actions.handleKeyDown({
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(tree.state.activeId()).toBe('a1')
  })

  it('ArrowLeft moves to parent and then collapses parent', () => {
    const tree = createTreeview({
      nodes: sampleNodes,
      initialExpandedIds: ['a'],
      initialActiveId: 'a1',
    })

    tree.actions.handleKeyDown({
      key: 'ArrowLeft',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(tree.state.activeId()).toBe('a')

    tree.actions.handleKeyDown({
      key: 'ArrowLeft',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(tree.state.expandedIds()).not.toContain('a')
    expect(tree.state.activeId()).toBe('a')
  })

  it('keeps focus invariant by moving active to collapsed parent', () => {
    const tree = createTreeview({
      nodes: sampleNodes,
      initialExpandedIds: ['a'],
      initialActiveId: 'a2',
    })

    tree.actions.collapse('a')

    expect(tree.state.activeId()).toBe('a')
    expect(tree.contracts.getVisibleNodeIds()).toEqual(['a', 'b'])
  })

  it('provides structural aria metadata (level, posinset, setsize)', () => {
    const tree = createTreeview({
      nodes: sampleNodes,
      initialExpandedIds: ['a'],
      idBase: 'nav',
    })

    const rootA = tree.contracts.getItemProps('a')
    const childA1 = tree.contracts.getItemProps('a1')
    const rootB = tree.contracts.getItemProps('b')

    expect(rootA['aria-level']).toBe(1)
    expect(rootA['aria-posinset']).toBe(1)
    expect(rootA['aria-setsize']).toBe(2)

    expect(childA1['aria-level']).toBe(2)
    expect(childA1['aria-posinset']).toBe(1)
    expect(childA1['aria-setsize']).toBe(2)

    expect(rootB['aria-level']).toBe(1)
    expect(rootB['aria-posinset']).toBe(2)
    expect(rootB['aria-setsize']).toBe(2)
    expect(rootB.id).toBe('nav-item-b')
  })

  it('supports Ctrl/Cmd+A for multi-select and skips disabled nodes', () => {
    const tree = createTreeview({
      nodes: [
        {
          id: 'a',
          children: [{id: 'a1'}, {id: 'a2', disabled: true}],
        },
        {id: 'b'},
      ],
      selectionMode: 'multiple',
      initialExpandedIds: ['a'],
    })

    tree.actions.handleKeyDown({
      key: 'a',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
    })

    expect(tree.state.selectedIds()).toEqual(['a', 'a1', 'b'])
  })

  it('keeps selection invariant when collapsing selected descendants', () => {
    const tree = createTreeview({
      nodes: sampleNodes,
      selectionMode: 'multiple',
      initialExpandedIds: ['a'],
      initialActiveId: 'a1',
    })

    tree.actions.toggleSelected('a1')
    tree.actions.toggleSelected('a2')
    tree.actions.collapse('a')

    expect(tree.state.selectedIds()).toEqual(['a1', 'a2'])
    expect(tree.state.activeId()).toBe('a')
  })

  describe('selection-follows-focus (single-select mode)', () => {
    it('ArrowDown moves focus AND selection to the next enabled node in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a', 'b'],
        initialActiveId: 'a',
      })

      tree.actions.handleKeyDown({
        key: 'ArrowDown',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })

      expect(tree.state.activeId()).toBe('a1')
      expect(tree.state.selectedIds()).toEqual(['a1'])
    })

    it('ArrowUp moves focus AND selection to the previous enabled node in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a', 'b'],
        initialActiveId: 'a1',
      })

      tree.actions.handleKeyDown({
        key: 'ArrowUp',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })

      expect(tree.state.activeId()).toBe('a')
      expect(tree.state.selectedIds()).toEqual(['a'])
    })

    it('Home moves focus AND selection to the first node in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a', 'b'],
        initialActiveId: 'b1',
      })

      tree.actions.handleKeyDown({
        key: 'Home',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })

      expect(tree.state.activeId()).toBe('a')
      expect(tree.state.selectedIds()).toEqual(['a'])
    })

    it('End moves focus AND selection to the last visible node in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a', 'b'],
        initialActiveId: 'a',
      })

      tree.actions.handleKeyDown({
        key: 'End',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })

      expect(tree.state.activeId()).toBe('b1')
      expect(tree.state.selectedIds()).toEqual(['b1'])
    })

    it('direct moveNext action moves focus AND selection in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a'],
        initialActiveId: 'a',
      })

      tree.actions.moveNext()

      expect(tree.state.activeId()).toBe('a1')
      expect(tree.state.selectedIds()).toEqual(['a1'])
    })

    it('direct movePrev action moves focus AND selection in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a'],
        initialActiveId: 'a1',
      })

      tree.actions.movePrev()

      expect(tree.state.activeId()).toBe('a')
      expect(tree.state.selectedIds()).toEqual(['a'])
    })

    it('direct moveFirst action moves focus AND selection in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a'],
        initialActiveId: 'a2',
      })

      tree.actions.moveFirst()

      expect(tree.state.activeId()).toBe('a')
      expect(tree.state.selectedIds()).toEqual(['a'])
    })

    it('direct moveLast action moves focus AND selection in single-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'single',
        initialExpandedIds: ['a'],
        initialActiveId: 'a',
      })

      tree.actions.moveLast()

      expect(tree.state.activeId()).toBe('b')
      expect(tree.state.selectedIds()).toEqual(['b'])
    })
  })

  describe('selection-follows-focus (multiple-select mode)', () => {
    it('ArrowDown moves focus but does NOT change selection in multiple-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'multiple',
        initialExpandedIds: ['a', 'b'],
        initialActiveId: 'a',
        initialSelectedIds: ['b1'],
      })

      tree.actions.handleKeyDown({
        key: 'ArrowDown',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })

      expect(tree.state.activeId()).toBe('a1')
      expect(tree.state.selectedIds()).toEqual(['b1'])
    })

    it('ArrowUp moves focus but does NOT change selection in multiple-select mode', () => {
      const tree = createTreeview({
        nodes: sampleNodes,
        selectionMode: 'multiple',
        initialExpandedIds: ['a', 'b'],
        initialActiveId: 'a1',
        initialSelectedIds: ['b1'],
      })

      tree.actions.handleKeyDown({
        key: 'ArrowUp',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })

      expect(tree.state.activeId()).toBe('a')
      expect(tree.state.selectedIds()).toEqual(['b1'])
    })
  })
})
