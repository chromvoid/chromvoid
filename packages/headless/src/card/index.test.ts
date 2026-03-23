import {describe, expect, it, vi} from 'vitest'
import {createCard} from './index'

describe('createCard', () => {
  // --- Default state ---

  describe('default state', () => {
    it('defaults to isExpandable=false, isExpanded=false, isDisabled=false', () => {
      const card = createCard()
      expect(card.state.isExpandable()).toBe(false)
      expect(card.state.isExpanded()).toBe(false)
      expect(card.state.isDisabled()).toBe(false)
    })
  })

  // --- Static card (not expandable) ---

  describe('static card', () => {
    it('getCardProps() returns empty object (no interactive attributes)', () => {
      const card = createCard()
      const props = card.contracts.getCardProps()
      expect(props).toEqual({})
      expect('role' in props).toBe(false)
      expect('tabindex' in props).toBe(false)
      expect('aria-expanded' in props).toBe(false)
      expect('onClick' in props).toBe(false)
      expect('onKeyDown' in props).toBe(false)
    })

    it('getTriggerProps() returns empty object', () => {
      const card = createCard()
      const props = card.contracts.getTriggerProps()
      expect(props).toEqual({})
    })

    it('getContentProps() returns empty object', () => {
      const card = createCard()
      const props = card.contracts.getContentProps()
      expect(props).toEqual({})
    })

    it('toggle() is a no-op — isExpanded does not change', () => {
      const onExpandedChange = vi.fn()
      const card = createCard({onExpandedChange})
      card.actions.toggle()
      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
    })

    it('expand() is a no-op — isExpanded does not change', () => {
      const onExpandedChange = vi.fn()
      const card = createCard({onExpandedChange})
      card.actions.expand()
      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
    })

    it('collapse() is a no-op — isExpanded does not change', () => {
      const onExpandedChange = vi.fn()
      const card = createCard({onExpandedChange})
      card.actions.collapse()
      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
    })

    it('handleClick() is a no-op when not expandable', () => {
      const onExpandedChange = vi.fn()
      const card = createCard({onExpandedChange})
      card.actions.handleClick()
      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
    })

    it('handleKeyDown(Enter) is a no-op when not expandable', () => {
      const preventDefault = vi.fn()
      const card = createCard()
      card.actions.handleKeyDown({key: 'Enter', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('handleKeyDown(Space) is a no-op when not expandable', () => {
      const preventDefault = vi.fn()
      const card = createCard()
      card.actions.handleKeyDown({key: ' ', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(preventDefault).not.toHaveBeenCalled()
    })
  })

  // --- Expandable card: toggle/expand/collapse actions ---

  describe('expandable card — actions', () => {
    it('toggle() toggles isExpanded between true and false', () => {
      const card = createCard({isExpandable: true, isExpanded: false})
      card.actions.toggle()
      expect(card.state.isExpanded()).toBe(true)
      card.actions.toggle()
      expect(card.state.isExpanded()).toBe(false)
    })

    it('expand() sets isExpanded to true', () => {
      const card = createCard({isExpandable: true, isExpanded: false})
      card.actions.expand()
      expect(card.state.isExpanded()).toBe(true)
    })

    it('expand() is a no-op if already expanded', () => {
      const onExpandedChange = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: true, onExpandedChange})
      card.actions.expand()
      expect(card.state.isExpanded()).toBe(true)
      expect(onExpandedChange).not.toHaveBeenCalled()
    })

    it('collapse() sets isExpanded to false', () => {
      const card = createCard({isExpandable: true, isExpanded: true})
      card.actions.collapse()
      expect(card.state.isExpanded()).toBe(false)
    })

    it('collapse() is a no-op if already collapsed', () => {
      const onExpandedChange = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false, onExpandedChange})
      card.actions.collapse()
      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
    })

    it('handleClick() delegates to toggle()', () => {
      const card = createCard({isExpandable: true, isExpanded: false})
      card.actions.handleClick()
      expect(card.state.isExpanded()).toBe(true)
      card.actions.handleClick()
      expect(card.state.isExpanded()).toBe(false)
    })
  })

  // --- Expandable card: keyboard ---

  describe('expandable card — keyboard', () => {
    it('Enter toggles expanded state and calls preventDefault', () => {
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false})

      card.actions.handleKeyDown({key: 'Enter', preventDefault})
      expect(card.state.isExpanded()).toBe(true)
      expect(preventDefault).toHaveBeenCalledTimes(1)

      card.actions.handleKeyDown({key: 'Enter', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(preventDefault).toHaveBeenCalledTimes(2)
    })

    it('Space toggles expanded state and calls preventDefault', () => {
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false})

      card.actions.handleKeyDown({key: ' ', preventDefault})
      expect(card.state.isExpanded()).toBe(true)
      expect(preventDefault).toHaveBeenCalledTimes(1)

      card.actions.handleKeyDown({key: ' ', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(preventDefault).toHaveBeenCalledTimes(2)
    })

    it('ArrowDown expands a collapsed card', () => {
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false})

      card.actions.handleKeyDown({key: 'ArrowDown', preventDefault})
      expect(card.state.isExpanded()).toBe(true)
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('ArrowRight expands a collapsed card', () => {
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false})

      card.actions.handleKeyDown({key: 'ArrowRight', preventDefault})
      expect(card.state.isExpanded()).toBe(true)
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('ArrowDown is a no-op on already expanded card (still calls preventDefault)', () => {
      const onExpandedChange = vi.fn()
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: true, onExpandedChange})

      card.actions.handleKeyDown({key: 'ArrowDown', preventDefault})
      expect(card.state.isExpanded()).toBe(true)
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('ArrowRight is a no-op on already expanded card (still calls preventDefault)', () => {
      const onExpandedChange = vi.fn()
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: true, onExpandedChange})

      card.actions.handleKeyDown({key: 'ArrowRight', preventDefault})
      expect(card.state.isExpanded()).toBe(true)
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('ArrowUp collapses an expanded card', () => {
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: true})

      card.actions.handleKeyDown({key: 'ArrowUp', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('ArrowLeft collapses an expanded card', () => {
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: true})

      card.actions.handleKeyDown({key: 'ArrowLeft', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('ArrowUp is a no-op on already collapsed card (still calls preventDefault)', () => {
      const onExpandedChange = vi.fn()
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false, onExpandedChange})

      card.actions.handleKeyDown({key: 'ArrowUp', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('ArrowLeft is a no-op on already collapsed card (still calls preventDefault)', () => {
      const onExpandedChange = vi.fn()
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false, onExpandedChange})

      card.actions.handleKeyDown({key: 'ArrowLeft', preventDefault})
      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('non-activation keys do not toggle and do not call preventDefault', () => {
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false})

      card.actions.handleKeyDown({key: 'Tab', preventDefault})
      card.actions.handleKeyDown({key: 'Escape', preventDefault})
      card.actions.handleKeyDown({key: 'a', preventDefault})

      expect(card.state.isExpanded()).toBe(false)
      expect(preventDefault).not.toHaveBeenCalled()
    })
  })

  // --- Disabled expandable card ---

  describe('expandable card — disabled', () => {
    it('all keyboard/click interactions are no-ops when disabled', () => {
      const onExpandedChange = vi.fn()
      const preventDefault = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false, isDisabled: true, onExpandedChange})

      card.actions.toggle()
      card.actions.expand()
      card.actions.collapse()
      card.actions.handleClick()
      card.actions.handleKeyDown({key: 'Enter', preventDefault})
      card.actions.handleKeyDown({key: ' ', preventDefault})
      card.actions.handleKeyDown({key: 'ArrowDown', preventDefault})
      card.actions.handleKeyDown({key: 'ArrowUp', preventDefault})

      expect(card.state.isExpanded()).toBe(false)
      expect(onExpandedChange).not.toHaveBeenCalled()
      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('disabled trigger has tabindex=-1 and aria-disabled=true', () => {
      const card = createCard({isExpandable: true, isDisabled: true})
      const triggerProps = card.contracts.getTriggerProps()

      expect(triggerProps.tabindex).toBe('-1')
      expect(triggerProps['aria-disabled']).toBe('true')
    })
  })

  // --- ARIA contract linkage ---

  describe('expandable card — ARIA contracts', () => {
    it('getCardProps() returns empty object even when expandable (no interactive attributes)', () => {
      const card = createCard({isExpandable: true})
      const props = card.contracts.getCardProps()
      expect(props).toEqual({})
      expect('role' in props).toBe(false)
      expect('tabindex' in props).toBe(false)
      expect('aria-expanded' in props).toBe(false)
    })

    it('trigger has role=button, tabindex=0, and aria-expanded reflecting isExpanded', () => {
      const card = createCard({isExpandable: true, isExpanded: false})
      const triggerCollapsed = card.contracts.getTriggerProps()

      expect(triggerCollapsed.role).toBe('button')
      expect(triggerCollapsed.tabindex).toBe('0')
      expect(triggerCollapsed['aria-expanded']).toBe('false')

      card.actions.toggle()
      const triggerExpanded = card.contracts.getTriggerProps()
      expect(triggerExpanded['aria-expanded']).toBe('true')
    })

    it('aria-controls on trigger matches content region id', () => {
      const card = createCard({isExpandable: true, idBase: 'mycard'})
      const triggerProps = card.contracts.getTriggerProps()
      const contentProps = card.contracts.getContentProps()

      expect(triggerProps['aria-controls']).toBe(contentProps.id)
      expect(contentProps.id).toBe('mycard-content')
    })

    it('aria-labelledby on content matches trigger id', () => {
      const card = createCard({isExpandable: true, idBase: 'mycard'})
      const triggerProps = card.contracts.getTriggerProps()
      const contentProps = card.contracts.getContentProps()

      expect(contentProps['aria-labelledby']).toBe(triggerProps.id)
      expect(triggerProps.id).toBe('mycard-trigger')
    })

    it('content region has role=region', () => {
      const card = createCard({isExpandable: true})
      const contentProps = card.contracts.getContentProps()
      expect(contentProps.role).toBe('region')
    })

    it('content region has hidden=true when collapsed', () => {
      const card = createCard({isExpandable: true, isExpanded: false})
      expect(card.contracts.getContentProps().hidden).toBe(true)

      card.actions.expand()
      expect(card.contracts.getContentProps().hidden).toBe(false)

      card.actions.collapse()
      expect(card.contracts.getContentProps().hidden).toBe(true)
    })

    it('trigger props include onClick and onKeyDown handlers', () => {
      const card = createCard({isExpandable: true})
      const triggerProps = card.contracts.getTriggerProps()
      expect(typeof triggerProps.onClick).toBe('function')
      expect(typeof triggerProps.onKeyDown).toBe('function')
    })
  })

  // --- onExpandedChange callback ---

  describe('onExpandedChange callback', () => {
    it('fires on actual state transitions, not on no-ops', () => {
      const onExpandedChange = vi.fn()
      const card = createCard({isExpandable: true, isExpanded: false, onExpandedChange})

      card.actions.toggle()
      expect(onExpandedChange).toHaveBeenCalledWith(true)
      expect(onExpandedChange).toHaveBeenCalledTimes(1)

      card.actions.toggle()
      expect(onExpandedChange).toHaveBeenCalledWith(false)
      expect(onExpandedChange).toHaveBeenCalledTimes(2)

      // no-op: already collapsed
      card.actions.collapse()
      expect(onExpandedChange).toHaveBeenCalledTimes(2)

      // no-op: already collapsed
      card.actions.expand()
      expect(onExpandedChange).toHaveBeenCalledTimes(3)

      // no-op: already expanded
      card.actions.expand()
      expect(onExpandedChange).toHaveBeenCalledTimes(3)
    })
  })

  // --- setDisabled ---

  describe('setDisabled', () => {
    it('updates disabled state regardless of expandable mode', () => {
      const staticCard = createCard()
      staticCard.actions.setDisabled(true)
      expect(staticCard.state.isDisabled()).toBe(true)
      staticCard.actions.setDisabled(false)
      expect(staticCard.state.isDisabled()).toBe(false)

      const expandableCard = createCard({isExpandable: true})
      expandableCard.actions.setDisabled(true)
      expect(expandableCard.state.isDisabled()).toBe(true)
      expandableCard.actions.setDisabled(false)
      expect(expandableCard.state.isDisabled()).toBe(false)
    })
  })

  // --- Options initialization ---

  describe('options initialization', () => {
    it('respects isExpandable option', () => {
      const card = createCard({isExpandable: true})
      expect(card.state.isExpandable()).toBe(true)
    })

    it('respects isExpanded option', () => {
      const card = createCard({isExpandable: true, isExpanded: true})
      expect(card.state.isExpanded()).toBe(true)
    })

    it('respects isDisabled option', () => {
      const card = createCard({isDisabled: true})
      expect(card.state.isDisabled()).toBe(true)
    })

    it('uses custom idBase for generated ids', () => {
      const card = createCard({isExpandable: true, idBase: 'custom'})
      const trigger = card.contracts.getTriggerProps()
      const content = card.contracts.getContentProps()
      expect(trigger.id).toBe('custom-trigger')
      expect(content.id).toBe('custom-content')
    })

    it('defaults idBase to card', () => {
      const card = createCard({isExpandable: true})
      const trigger = card.contracts.getTriggerProps()
      const content = card.contracts.getContentProps()
      expect(trigger.id).toBe('card-trigger')
      expect(content.id).toBe('card-content')
    })
  })
})
