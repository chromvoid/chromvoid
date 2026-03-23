import {describe, expect, it, vi} from 'vitest'
import {createLink} from './index'

describe('createLink', () => {
  // --- Spec: Activation ---

  it('triggers onPress on click', () => {
    const onPress = vi.fn()
    const link = createLink({idBase: 'link-click', onPress})

    link.actions.handleClick()

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('triggers onPress on Enter keydown', () => {
    const onPress = vi.fn()
    const link = createLink({idBase: 'link-enter', onPress})

    link.actions.handleKeyDown({key: 'Enter'})

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('triggers onPress via direct press() action', () => {
    const onPress = vi.fn()
    const link = createLink({idBase: 'link-press', onPress})

    link.actions.press()

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // --- Spec: Keyboard - non-activation keys ignored ---

  it('ignores non-Enter keys in handleKeyDown', () => {
    const onPress = vi.fn()
    const link = createLink({idBase: 'link-keys', onPress})

    link.actions.handleKeyDown({key: ' '})
    link.actions.handleKeyDown({key: 'Tab'})
    link.actions.handleKeyDown({key: 'Escape'})
    link.actions.handleKeyDown({key: 'ArrowDown'})

    expect(onPress).not.toHaveBeenCalled()
  })

  // --- Spec: getLinkProps for non-semantic host ---

  it('returns role="link" and tabindex="0" for non-semantic host', () => {
    const link = createLink({idBase: 'link-nonsemantic', href: '/docs'})

    expect(link.contracts.getLinkProps()).toMatchObject({
      role: 'link',
      tabindex: '0',
      href: '/docs',
    })
  })

  // --- Spec: getLinkProps for semantic host ---

  it('omits role and tabindex for semantic host', () => {
    const link = createLink({idBase: 'link-semantic', href: '/home', isSemanticHost: true})

    const props = link.contracts.getLinkProps()
    expect(props.role).toBeUndefined()
    expect(props.tabindex).toBeUndefined()
    expect(props.href).toBe('/home')
  })

  // --- Spec: href passthrough ---

  it('includes href from options', () => {
    const link = createLink({idBase: 'link-href', href: '/about'})

    expect(link.contracts.getLinkProps().href).toBe('/about')
  })

  it('returns undefined href when not provided', () => {
    const link = createLink({idBase: 'link-no-href'})

    expect(link.contracts.getLinkProps().href).toBeUndefined()
  })

  // --- Spec: ID contract ---

  it('returns deterministic id based on idBase', () => {
    const link = createLink({idBase: 'my-link'})

    expect(link.contracts.getLinkProps().id).toBe('my-link-root')
  })

  it('uses default idBase when not provided', () => {
    const link = createLink()

    expect(link.contracts.getLinkProps().id).toBe('link-root')
  })

  // --- Spec: getLinkProps wires handlers ---

  it('getLinkProps onClick and onKeyDown are bound to actions', () => {
    const onPress = vi.fn()
    const link = createLink({idBase: 'link-props-handler', onPress})

    const props = link.contracts.getLinkProps()
    props.onClick()
    expect(onPress).toHaveBeenCalledTimes(1)

    props.onKeyDown({key: 'Enter'})
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  // --- Spec: no onPress callback is safe ---

  it('does not throw when onPress is not provided', () => {
    const link = createLink({idBase: 'link-no-cb'})

    expect(() => link.actions.handleClick()).not.toThrow()
    expect(() => link.actions.handleKeyDown({key: 'Enter'})).not.toThrow()
    expect(() => link.actions.press()).not.toThrow()
  })

  // --- Spec: No disabled state ---

  it('does not expose isDisabled state or setDisabled action', () => {
    const link = createLink({idBase: 'link-no-disabled'})
    const stateRecord = link.state as unknown as Record<string, unknown>
    const actionsRecord = link.actions as unknown as Record<string, unknown>

    // The link model should have no disabled-related API
    expect(stateRecord['isDisabled']).toBeUndefined()
    expect(actionsRecord['setDisabled']).toBeUndefined()
  })

  it('getLinkProps does not include aria-disabled', () => {
    const link = createLink({idBase: 'link-no-aria-disabled'})

    const props = link.contracts.getLinkProps()
    const propsRecord = props as unknown as Record<string, unknown>
    expect(propsRecord['aria-disabled']).toBeUndefined()
  })

  // --- Spec: handleClick works without event argument ---

  it('handleClick works without event argument', () => {
    const onPress = vi.fn()
    const link = createLink({idBase: 'link-no-event', onPress})

    expect(() => link.actions.handleClick()).not.toThrow()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
