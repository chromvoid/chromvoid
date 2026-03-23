import {afterEach, describe, expect, it} from 'vitest'

import {CVTreeItem} from './cv-treeitem'
import {CVTreeview} from './cv-treeview'

CVTreeItem.define()
CVTreeview.define()

const settle = async (element: CVTreeview) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const createItem = (
  value: string,
  label: string,
  params: {disabled?: boolean; children?: CVTreeItem[]} = {},
): CVTreeItem => {
  const item = document.createElement('cv-treeitem') as CVTreeItem
  item.value = value
  item.label = label

  if (params.disabled) {
    item.disabled = true
  }

  for (const child of params.children ?? []) {
    item.append(child)
  }

  return item
}

const createTree = async (
  items: CVTreeItem[],
  options: {selectionMode?: 'single' | 'multiple'; ariaLabel?: string} = {},
): Promise<CVTreeview> => {
  const tree = document.createElement('cv-treeview') as CVTreeview
  if (options.selectionMode) {
    tree.selectionMode = options.selectionMode
  }
  if (options.ariaLabel) {
    tree.setAttribute('aria-label', options.ariaLabel)
  }
  tree.append(...items)
  document.body.append(tree)
  await settle(tree)
  return tree
}

const getBase = (tree: CVTreeview): HTMLElement =>
  tree.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const dispatchKey = (target: HTMLElement, key: string, extras: Partial<KeyboardEventInit> = {}) => {
  target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, ...extras}))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-treeview', () => {
  // --- shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] with role="tree"', async () => {
      const tree = await createTree([createItem('a', 'A')])
      const base = getBase(tree)
      expect(base).not.toBeNull()
      expect(base.getAttribute('role')).toBe('tree')
    })

    it('renders a default slot inside [part="base"]', async () => {
      const tree = await createTree([createItem('a', 'A')])
      const slot = getBase(tree).querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })
  })

  // --- default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const tree = await createTree([])
      expect(tree.selectionMode).toBe('single')
      expect(tree.value).toBe('')
      expect(tree.values).toEqual([])
      expect(tree.expandedValues).toEqual([])
    })
  })

  // --- attribute reflection ---

  describe('attribute reflection', () => {
    it('value attribute reflects property', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B')])
      const base = getBase(tree)
      dispatchKey(base, 'ArrowDown')
      await settle(tree)
      // After ArrowDown in single-select, value should update; test reflection
      expect(tree.getAttribute('value')).toBe(tree.value)
    })

    it('selection-mode attribute reflects property', async () => {
      const tree = await createTree([], {selectionMode: 'multiple'})
      expect(tree.getAttribute('selection-mode')).toBe('multiple')
    })

    it('selection-mode defaults to "single" in attribute', async () => {
      const tree = await createTree([])
      expect(tree.getAttribute('selection-mode')).toBe('single')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="tree" on [part="base"]', async () => {
      const tree = await createTree([createItem('a', 'A')])
      expect(getBase(tree).getAttribute('role')).toBe('tree')
    })

    it('aria-multiselectable is absent in single-select mode', async () => {
      const tree = await createTree([createItem('a', 'A')])
      expect(getBase(tree).hasAttribute('aria-multiselectable')).toBe(false)
    })

    it('aria-multiselectable="true" in multiple-select mode', async () => {
      const tree = await createTree([createItem('a', 'A')], {selectionMode: 'multiple'})
      expect(getBase(tree).getAttribute('aria-multiselectable')).toBe('true')
    })

    it('aria-label applied to [part="base"] when set', async () => {
      const tree = await createTree([createItem('a', 'A')], {ariaLabel: 'File tree'})
      expect(getBase(tree).getAttribute('aria-label')).toBe('File tree')
    })

    it('cv-treeitem has role="treeitem"', async () => {
      const tree = await createTree([createItem('a', 'A')])
      const item = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(item.getAttribute('role')).toBe('treeitem')
    })

    it('root cv-treeitem has aria-level="1"', async () => {
      const tree = await createTree([createItem('a', 'A')])
      const item = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(item.getAttribute('aria-level')).toBe('1')
    })

    it('child cv-treeitem has aria-level="2"', async () => {
      const child = createItem('a1', 'A1')
      const tree = await createTree([createItem('a', 'A', {children: [child]})])
      // Expand branch so child is visible
      const base = getBase(tree)
      dispatchKey(base, 'ArrowRight')
      await settle(tree)
      const item = tree.querySelector('cv-treeitem[value="a1"]') as CVTreeItem
      expect(item.getAttribute('aria-level')).toBe('2')
    })
  })

  // --- events ---

  describe('events', () => {
    it('click on item fires input and change with correct detail shape', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B')])
      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []
      tree.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      tree.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      itemB.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tree)

      expect(inputDetails.length).toBeGreaterThanOrEqual(1)
      const detail = inputDetails[inputDetails.length - 1] as Record<string, unknown>
      expect(typeof detail.value).toBe('string')
      expect(Array.isArray(detail.values)).toBe(true)
      expect('activeId' in detail).toBe(true)
      expect(Array.isArray(detail.expandedValues)).toBe(true)

      expect(changeDetails.length).toBeGreaterThanOrEqual(1)
    })

    it('expansion change fires both input and change', async () => {
      const tree = await createTree([createItem('a', 'A', {children: [createItem('a1', 'A1')]})])
      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []
      tree.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      tree.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      const base = getBase(tree)
      dispatchKey(base, 'ArrowRight')
      await settle(tree)

      expect(inputDetails.length).toBeGreaterThanOrEqual(1)
      expect(changeDetails.length).toBeGreaterThanOrEqual(1)

      const detail = changeDetails[changeDetails.length - 1] as Record<string, unknown>
      expect(Array.isArray(detail.expandedValues)).toBe(true)
      expect((detail.expandedValues as string[]).includes('a')).toBe(true)
    })

    it('programmatic value change does NOT fire input or change', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B')])
      let inputCount = 0
      let changeCount = 0
      tree.addEventListener('cv-input', () => inputCount++)
      tree.addEventListener('cv-change', () => changeCount++)

      tree.value = 'b'
      await settle(tree)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  // --- selection follows focus (single-select) ---

  describe('selection follows focus (single-select)', () => {
    it('ArrowDown moves active AND value to next item in single-select', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B'), createItem('c', 'C')])
      const base = getBase(tree)

      // Initially focus first item
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      itemA.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      dispatchKey(base, 'ArrowDown')
      await settle(tree)

      expect(tree.value).toBe('b')
      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      expect(itemB.active).toBe(true)
      expect(itemB.selected).toBe(true)
    })

    it('ArrowUp moves active AND value to previous item in single-select', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B'), createItem('c', 'C')])
      const base = getBase(tree)

      const itemC = tree.querySelector('cv-treeitem[value="c"]') as CVTreeItem
      itemC.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      dispatchKey(base, 'ArrowUp')
      await settle(tree)

      expect(tree.value).toBe('b')
      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      expect(itemB.active).toBe(true)
      expect(itemB.selected).toBe(true)
    })

    it('Home moves active AND value to first item in single-select', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B'), createItem('c', 'C')])
      const base = getBase(tree)

      const itemC = tree.querySelector('cv-treeitem[value="c"]') as CVTreeItem
      itemC.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      dispatchKey(base, 'Home')
      await settle(tree)

      expect(tree.value).toBe('a')
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemA.selected).toBe(true)
    })

    it('End moves active AND value to last visible item in single-select', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B'), createItem('c', 'C')])
      const base = getBase(tree)

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      itemA.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      dispatchKey(base, 'End')
      await settle(tree)

      expect(tree.value).toBe('c')
      const itemC = tree.querySelector('cv-treeitem[value="c"]') as CVTreeItem
      expect(itemC.selected).toBe(true)
    })

    it('multiple-select: ArrowDown moves focus but does NOT change selection', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B'), createItem('c', 'C')], {
        selectionMode: 'multiple',
      })
      const base = getBase(tree)

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      itemA.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tree)

      const selectedBefore = [...tree.values]

      dispatchKey(base, 'ArrowDown')
      await settle(tree)

      // Selection should NOT have changed; only focus moved
      expect(tree.values).toEqual(selectedBefore)
      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      expect(itemB.active).toBe(true)
      expect(itemB.selected).toBe(false)
    })

    it('multiple-select: ArrowUp moves focus but does NOT change selection', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B'), createItem('c', 'C')], {
        selectionMode: 'multiple',
      })
      const base = getBase(tree)

      const itemC = tree.querySelector('cv-treeitem[value="c"]') as CVTreeItem
      itemC.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tree)

      const selectedBefore = [...tree.values]

      dispatchKey(base, 'ArrowUp')
      await settle(tree)

      expect(tree.values).toEqual(selectedBefore)
      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      expect(itemB.active).toBe(true)
      expect(itemB.selected).toBe(false)
    })
  })

  // --- keyboard navigation ---

  describe('keyboard navigation', () => {
    it('supports ArrowRight expand and child navigation', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1'), createItem('a2', 'A2')]}),
        createItem('b', 'B'),
      ])

      const root = getBase(tree)

      dispatchKey(root, 'ArrowRight')
      await settle(tree)
      expect(tree.expandedValues).toContain('a')

      dispatchKey(root, 'ArrowRight')
      await settle(tree)
      expect(tree.value).toBe('')

      dispatchKey(root, 'Enter')
      await settle(tree)
      expect(tree.value).toBe('a1')

      const a1 = tree.querySelector('cv-treeitem[value="a1"]') as CVTreeItem
      expect(a1.active).toBe(true)
      expect(a1.selected).toBe(true)
    })

    it('ArrowLeft on expanded branch collapses it and keeps focus on branch', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
      ])
      const base = getBase(tree)

      // Expand
      dispatchKey(base, 'ArrowRight')
      await settle(tree)
      expect(tree.expandedValues).toContain('a')

      // Move into child
      dispatchKey(base, 'ArrowRight')
      await settle(tree)

      // Now ArrowLeft from child should move focus back to parent
      dispatchKey(base, 'ArrowLeft')
      await settle(tree)

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemA.active).toBe(true)
    })

    it('ArrowLeft on expanded branch collapses it', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
      ])
      const base = getBase(tree)

      dispatchKey(base, 'ArrowRight')
      await settle(tree)
      expect(tree.expandedValues).toContain('a')

      dispatchKey(base, 'ArrowLeft')
      await settle(tree)

      expect(tree.expandedValues).not.toContain('a')
    })

    it('collapses branch from toggle button and keeps focus on parent', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1'), createItem('a2', 'A2')]}),
      ])
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem

      const root = getBase(tree)
      dispatchKey(root, 'ArrowRight')
      dispatchKey(root, 'ArrowRight')
      await settle(tree)

      const a1 = tree.querySelector('cv-treeitem[value="a1"]') as CVTreeItem
      a1.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      const toggle = itemA.shadowRoot?.querySelector('[part="toggle"]') as HTMLButtonElement
      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tree)

      expect(tree.expandedValues).toEqual([])
      expect(itemA.active).toBe(true)
      expect(a1.hidden).toBe(true)
    })
  })

  // --- multi-select Ctrl+A ---

  describe('multi-select Ctrl+A', () => {
    it('Ctrl+A selects all enabled visible nodes', async () => {
      const tree = await createTree(
        [
          createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
          createItem('b', 'B'),
        ],
        {selectionMode: 'multiple'},
      )

      const base = getBase(tree)
      // Expand 'a' so children are visible
      dispatchKey(base, 'ArrowRight')
      dispatchKey(base, 'a', {ctrlKey: true})
      await settle(tree)

      expect(tree.values).toEqual(['a', 'a1', 'b'])
    })

    it('Meta+A also selects all in multiple mode', async () => {
      const tree = await createTree(
        [createItem('a', 'A'), createItem('b', 'B'), createItem('c', 'C')],
        {selectionMode: 'multiple'},
      )

      const base = getBase(tree)
      dispatchKey(base, 'a', {metaKey: true})
      await settle(tree)

      expect(tree.values.sort()).toEqual(['a', 'b', 'c'])
    })

    it('Ctrl+A does nothing in single-select mode', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B')])
      const base = getBase(tree)
      dispatchKey(base, 'a', {ctrlKey: true})
      await settle(tree)

      // Single-select: values can have at most one entry
      expect(tree.values.length).toBeLessThanOrEqual(1)
    })
  })

  // --- disabled nodes ---

  describe('disabled nodes', () => {
    it('disabled nodes are skipped in ArrowDown navigation', async () => {
      const tree = await createTree([
        createItem('a', 'A'),
        createItem('b', 'B', {disabled: true}),
        createItem('c', 'C'),
      ])
      const base = getBase(tree)

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      itemA.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      dispatchKey(base, 'ArrowDown')
      await settle(tree)

      // Disabled item 'b' should be skipped; 'c' becomes active
      const itemC = tree.querySelector('cv-treeitem[value="c"]') as CVTreeItem
      expect(itemC.active).toBe(true)
    })

    it('disabled nodes are skipped in ArrowUp navigation', async () => {
      const tree = await createTree([
        createItem('a', 'A'),
        createItem('b', 'B', {disabled: true}),
        createItem('c', 'C'),
      ])
      const base = getBase(tree)

      const itemC = tree.querySelector('cv-treeitem[value="c"]') as CVTreeItem
      itemC.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      dispatchKey(base, 'ArrowUp')
      await settle(tree)

      // Disabled item 'b' should be skipped; 'a' becomes active
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemA.active).toBe(true)
    })

    it('disabled nodes carry aria-disabled attribute', async () => {
      const tree = await createTree([createItem('a', 'A', {disabled: true})])
      const item = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(item.getAttribute('aria-disabled')).toBe('true')
    })
  })

  // --- headless contract delegation ---

  describe('headless contract delegation', () => {
    it('aria-selected on item matches selection state', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B')])

      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      itemB.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tree)

      expect(itemB.getAttribute('aria-selected')).toBe('true')
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemA.getAttribute('aria-selected')).toBe('false')
    })

    it('aria-expanded on branch item matches expanded state', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
      ])

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemA.hasAttribute('aria-expanded')).toBe(true)
      expect(itemA.getAttribute('aria-expanded')).toBe('false')

      const base = getBase(tree)
      dispatchKey(base, 'ArrowRight')
      await settle(tree)

      expect(itemA.getAttribute('aria-expanded')).toBe('true')
    })

    it('aria-expanded is absent on leaf items', async () => {
      const tree = await createTree([createItem('a', 'A')])
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemA.hasAttribute('aria-expanded')).toBe(false)
    })

    it('aria-level reflects nesting depth', async () => {
      const grandchild = createItem('a1a', 'A1A')
      const child = createItem('a1', 'A1', {children: [grandchild]})
      const tree = await createTree([createItem('a', 'A', {children: [child]})])

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemA.getAttribute('aria-level')).toBe('1')

      // Expand to make child accessible
      const base = getBase(tree)
      dispatchKey(base, 'ArrowRight')
      await settle(tree)

      const itemA1 = tree.querySelector('cv-treeitem[value="a1"]') as CVTreeItem
      expect(itemA1.getAttribute('aria-level')).toBe('2')
    })

    it('getItemProps tabindex="0" on active item, "-1" on others', async () => {
      const tree = await createTree([createItem('a', 'A'), createItem('b', 'B')])

      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      itemB.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(tree)

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      expect(itemB.getAttribute('tabindex')).toBe('0')
      expect(itemA.getAttribute('tabindex')).toBe('-1')
    })
  })

  // --- cv-treeitem structure ---

  describe('cv-treeitem structure', () => {
    it('has [part="row"] in shadow DOM', async () => {
      const item = document.createElement('cv-treeitem') as CVTreeItem
      document.body.append(item)
      await item.updateComplete
      const row = item.shadowRoot!.querySelector('[part="row"]')
      expect(row).not.toBeNull()
    })

    it('has [part="toggle"] in shadow DOM', async () => {
      const item = document.createElement('cv-treeitem') as CVTreeItem
      document.body.append(item)
      await item.updateComplete
      const toggle = item.shadowRoot!.querySelector('[part="toggle"]')
      expect(toggle).not.toBeNull()
    })

    it('has [part="label"] in shadow DOM', async () => {
      const item = document.createElement('cv-treeitem') as CVTreeItem
      document.body.append(item)
      await item.updateComplete
      const label = item.shadowRoot!.querySelector('[part="label"]')
      expect(label).not.toBeNull()
    })

    it('has slot[name="children"] in shadow DOM', async () => {
      const item = document.createElement('cv-treeitem') as CVTreeItem
      document.body.append(item)
      await item.updateComplete
      const slot = item.shadowRoot!.querySelector('slot[name="children"]')
      expect(slot).not.toBeNull()
    })

    it('toggle button is hidden (visibility) when item is not a branch', async () => {
      const item = document.createElement('cv-treeitem') as CVTreeItem
      document.body.append(item)
      await item.updateComplete
      const toggle = item.shadowRoot!.querySelector('[part="toggle"]') as HTMLButtonElement
      // Non-branch: toggle has [hidden] attribute
      expect(toggle.hasAttribute('hidden')).toBe(true)
    })

    it('toggle button is visible when item is a branch', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
      ])
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      const toggle = itemA.shadowRoot!.querySelector('[part="toggle"]') as HTMLButtonElement
      expect(toggle.hasAttribute('hidden')).toBe(false)
    })

    it('[part="children"] is hidden when not expanded', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
      ])
      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      const children = itemA.shadowRoot!.querySelector('[part="children"]') as HTMLElement
      expect(children.hasAttribute('hidden')).toBe(true)
    })

    it('[part="children"] is visible when expanded', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
      ])
      const base = getBase(tree)
      dispatchKey(base, 'ArrowRight')
      await settle(tree)

      const itemA = tree.querySelector('cv-treeitem[value="a"]') as CVTreeItem
      const children = itemA.shadowRoot!.querySelector('[part="children"]') as HTMLElement
      expect(children.hasAttribute('hidden')).toBe(false)
    })
  })

  // --- slot rebuild state preservation ---

  describe('slot rebuild state preservation', () => {
    it('preserves valid selected and expanded state on slot rebuild', async () => {
      const tree = await createTree([
        createItem('a', 'A', {children: [createItem('a1', 'A1')]}),
        createItem('b', 'B'),
      ])

      const base = getBase(tree)
      dispatchKey(base, 'ArrowRight')
      await settle(tree)

      const itemB = tree.querySelector('cv-treeitem[value="b"]') as CVTreeItem
      itemB.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tree)

      expect(tree.value).toBe('b')
      expect(tree.expandedValues).toContain('a')

      const itemA1 = tree.querySelector('cv-treeitem[value="a1"]') as CVTreeItem
      itemA1.remove()
      await settle(tree)

      expect(tree.value).toBe('b')
      expect(tree.expandedValues).toContain('a')
    })
  })
})
