import {describe, expect, it} from 'vitest'
import {createListbox} from '../listbox'
import {createMenu} from '../menu'

describe('signal-driven adapter reactivity', () => {
  it('recomputes listbox render snapshot from signal subscriptions', async () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      focusStrategy: 'aria-activedescendant',
      idBase: 'reactive-lb',
    })

    const snapshots: Array<{activeId: string | null; ariaActiveDescendant: string | null}> = []
    const render = () => {
      const rootProps = listbox.contracts.getRootProps()
      snapshots.push({
        activeId: listbox.state.activeId(),
        ariaActiveDescendant: rootProps['aria-activedescendant'] ?? null,
      })
    }

    const unsubscribe = listbox.state.activeId.subscribe(render)

    listbox.actions.setActive('b')
    await Promise.resolve()
    listbox.actions.moveNext()
    await Promise.resolve()

    unsubscribe()

    expect(snapshots.length).toBeGreaterThan(1)
    expect(snapshots.at(0)).toEqual({
      activeId: 'a',
      ariaActiveDescendant: 'reactive-lb-option-a',
    })
    expect(snapshots.at(-1)).toEqual({
      activeId: 'c',
      ariaActiveDescendant: 'reactive-lb-option-c',
    })
  })

  it('updates menu trigger contract reactively from open-state signal', async () => {
    const menu = createMenu({
      items: [{id: 'new'}, {id: 'open'}],
      idBase: 'reactive-menu',
    })

    const expandedValues: string[] = []
    const unsubscribe = menu.state.isOpen.subscribe(() => {
      expandedValues.push(menu.contracts.getTriggerProps()['aria-expanded'])
    })

    menu.actions.open('keyboard')
    await Promise.resolve()
    menu.actions.close()
    await Promise.resolve()

    unsubscribe()

    expect(expandedValues).toEqual(['false', 'true', 'false'])
  })
})
