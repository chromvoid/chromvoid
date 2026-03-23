import {describe, expect, it, vi} from 'vitest'

import {PasswordManagerDesktopLayout} from '../../src/features/passmanager/components/password-manager-desktop-layout'

type KeyboardGroup = {
  moveKeyboardFocus: (step: number) => boolean
  openActiveItem: () => boolean
}

type LayoutUnderTest = {
  handleExtraKeys: (e: KeyboardEvent, inputActive: boolean) => boolean
  getKeyboardNavigableGroup: () => KeyboardGroup | null
}

let desktopLayoutDefined = false

function ensureDesktopLayoutDefined() {
  if (desktopLayoutDefined) return
  PasswordManagerDesktopLayout.define()
  desktopLayoutDefined = true
}

function createLayout(group: KeyboardGroup | null): LayoutUnderTest {
  ensureDesktopLayoutDefined()
  const layout = document.createElement(
    PasswordManagerDesktopLayout.elementName,
  ) as unknown as LayoutUnderTest
  layout.getKeyboardNavigableGroup = () => group
  return layout
}

function createKeyboardEvent(key: string) {
  const preventDefault = vi.fn()
  const event = {key, preventDefault} as unknown as KeyboardEvent
  return {event, preventDefault}
}

describe('PasswordManagerDesktopLayout keyboard navigation', () => {
  it('does not handle keys when input is active', () => {
    const group: KeyboardGroup = {
      moveKeyboardFocus: vi.fn(() => true),
      openActiveItem: vi.fn(() => true),
    }
    const layout = createLayout(group)
    const {event, preventDefault} = createKeyboardEvent('ArrowDown')

    const handled = layout.handleExtraKeys(event, true)

    expect(handled).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(group.moveKeyboardFocus).not.toHaveBeenCalled()
  })

  it('routes arrow keys to group state navigation', () => {
    const group: KeyboardGroup = {
      moveKeyboardFocus: vi.fn(() => true),
      openActiveItem: vi.fn(() => true),
    }
    const layout = createLayout(group)

    const down = createKeyboardEvent('ArrowDown')
    const up = createKeyboardEvent('ArrowUp')

    expect(layout.handleExtraKeys(down.event, false)).toBe(true)
    expect(down.preventDefault).toHaveBeenCalledTimes(1)
    expect(group.moveKeyboardFocus).toHaveBeenNthCalledWith(1, 1)

    expect(layout.handleExtraKeys(up.event, false)).toBe(true)
    expect(up.preventDefault).toHaveBeenCalledTimes(1)
    expect(group.moveKeyboardFocus).toHaveBeenNthCalledWith(2, -1)
  })

  it('opens active item on Enter only when group handles it', () => {
    const group: KeyboardGroup = {
      moveKeyboardFocus: vi.fn(() => true),
      openActiveItem: vi.fn(() => true),
    }
    const layout = createLayout(group)
    const {event, preventDefault} = createKeyboardEvent('Enter')

    const handled = layout.handleExtraKeys(event, false)

    expect(handled).toBe(true)
    expect(group.openActiveItem).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('falls through Enter when there is no active item to open', () => {
    const group: KeyboardGroup = {
      moveKeyboardFocus: vi.fn(() => true),
      openActiveItem: vi.fn(() => false),
    }
    const layout = createLayout(group)
    const {event, preventDefault} = createKeyboardEvent('Enter')

    const handled = layout.handleExtraKeys(event, false)

    expect(handled).toBe(false)
    expect(group.openActiveItem).toHaveBeenCalledTimes(1)
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
