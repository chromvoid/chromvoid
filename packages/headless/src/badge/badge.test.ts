import {describe, expect, it} from 'vitest'
import {createBadge} from './index'

describe('createBadge', () => {
  describe('default state', () => {
    it('defaults to variant=neutral, size=medium, all booleans false', () => {
      const badge = createBadge()
      expect(badge.state.variant()).toBe('neutral')
      expect(badge.state.size()).toBe('medium')
      expect(badge.state.dot()).toBe(false)
      expect(badge.state.pulse()).toBe(false)
      expect(badge.state.pill()).toBe(false)
      expect(badge.state.isDynamic()).toBe(false)
      expect(badge.state.isDecorative()).toBe(false)
      expect(badge.state.isEmpty()).toBe(false)
    })
  })

  describe('getBadgeProps() — static non-decorative badge', () => {
    it('returns no role or live-region attributes', () => {
      const badge = createBadge()
      const props = badge.contracts.getBadgeProps()
      expect(props).toEqual({})
      expect('role' in props).toBe(false)
      expect('aria-live' in props).toBe(false)
      expect('aria-atomic' in props).toBe(false)
      expect('aria-hidden' in props).toBe(false)
    })
  })

  describe('getBadgeProps() — dynamic badge', () => {
    it('returns role=status, aria-live=polite, aria-atomic=true when isDynamic is true', () => {
      const badge = createBadge({isDynamic: true})
      const props = badge.contracts.getBadgeProps()
      expect(props).toEqual({
        role: 'status',
        'aria-live': 'polite',
        'aria-atomic': 'true',
      })
    })
  })

  describe('getBadgeProps() — decorative badge', () => {
    it('returns role=presentation, aria-hidden=true when isDecorative is true', () => {
      const badge = createBadge({isDecorative: true})
      const props = badge.contracts.getBadgeProps()
      expect(props).toEqual({
        role: 'presentation',
        'aria-hidden': 'true',
      })
    })
  })

  describe('isDecorative takes precedence over isDynamic', () => {
    it('returns decorative props when both isDecorative and isDynamic are true', () => {
      const badge = createBadge({isDynamic: true, isDecorative: true})
      const props = badge.contracts.getBadgeProps()
      expect(props).toEqual({
        role: 'presentation',
        'aria-hidden': 'true',
      })
      expect('aria-live' in props).toBe(false)
      expect('aria-atomic' in props).toBe(false)
    })

    it('switches from dynamic to decorative when setDecorative is called', () => {
      const badge = createBadge({isDynamic: true})
      expect(badge.contracts.getBadgeProps().role).toBe('status')

      badge.actions.setDecorative(true)
      const props = badge.contracts.getBadgeProps()
      expect(props.role).toBe('presentation')
      expect(props['aria-hidden']).toBe('true')
      expect('aria-live' in props).toBe(false)
    })
  })

  describe('isEmpty derived from dot', () => {
    it('isEmpty is true when dot is true', () => {
      const badge = createBadge({dot: true})
      expect(badge.state.isEmpty()).toBe(true)
    })

    it('isEmpty is false when dot is false', () => {
      const badge = createBadge({dot: false})
      expect(badge.state.isEmpty()).toBe(false)
    })

    it('setDot(true) makes isEmpty compute to true', () => {
      const badge = createBadge()
      expect(badge.state.isEmpty()).toBe(false)

      badge.actions.setDot(true)
      expect(badge.state.isEmpty()).toBe(true)
    })

    it('setDot(false) makes isEmpty compute to false', () => {
      const badge = createBadge({dot: true})
      expect(badge.state.isEmpty()).toBe(true)

      badge.actions.setDot(false)
      expect(badge.state.isEmpty()).toBe(false)
    })
  })

  describe('variant validation', () => {
    it('setVariant updates variant signal for valid values', () => {
      const badge = createBadge()

      badge.actions.setVariant('primary')
      expect(badge.state.variant()).toBe('primary')

      badge.actions.setVariant('success')
      expect(badge.state.variant()).toBe('success')

      badge.actions.setVariant('warning')
      expect(badge.state.variant()).toBe('warning')

      badge.actions.setVariant('danger')
      expect(badge.state.variant()).toBe('danger')

      badge.actions.setVariant('neutral')
      expect(badge.state.variant()).toBe('neutral')
    })

    it('rejects invalid variant values', () => {
      const badge = createBadge({variant: 'primary'})
      badge.actions.setVariant('invalid' as any)
      expect(badge.state.variant()).toBe('primary')
    })

    it('defaults invalid initial variant to neutral', () => {
      const badge = createBadge({variant: 'invalid' as any})
      expect(badge.state.variant()).toBe('neutral')
    })
  })

  describe('size validation', () => {
    it('setSize updates size signal for valid values', () => {
      const badge = createBadge()

      badge.actions.setSize('small')
      expect(badge.state.size()).toBe('small')

      badge.actions.setSize('large')
      expect(badge.state.size()).toBe('large')

      badge.actions.setSize('medium')
      expect(badge.state.size()).toBe('medium')
    })

    it('rejects invalid size values', () => {
      const badge = createBadge({size: 'large'})
      badge.actions.setSize('xl' as any)
      expect(badge.state.size()).toBe('large')
    })

    it('defaults invalid initial size to medium', () => {
      const badge = createBadge({size: 'xl' as any})
      expect(badge.state.size()).toBe('medium')
    })
  })

  describe('ariaLabel in props', () => {
    it('includes aria-label in static badge props when provided', () => {
      const badge = createBadge({ariaLabel: 'New notifications'})
      const props = badge.contracts.getBadgeProps()
      expect(props['aria-label']).toBe('New notifications')
    })

    it('includes aria-label in dynamic badge props when provided', () => {
      const badge = createBadge({isDynamic: true, ariaLabel: '5 items'})
      const props = badge.contracts.getBadgeProps()
      expect(props['aria-label']).toBe('5 items')
      expect(props.role).toBe('status')
    })

    it('does not include aria-label when not provided', () => {
      const badge = createBadge()
      const props = badge.contracts.getBadgeProps()
      expect('aria-label' in props).toBe(false)
    })

    it('does not include aria-label in decorative mode', () => {
      const badge = createBadge({isDecorative: true, ariaLabel: 'ignored'})
      const props = badge.contracts.getBadgeProps()
      expect('aria-label' in props).toBe(false)
    })
  })

  describe('non-interactive behavior', () => {
    it('never produces tabindex attribute', () => {
      const badge = createBadge()
      const props = badge.contracts.getBadgeProps()
      expect('tabindex' in props).toBe(false)
    })

    it('never produces keyboard handler attributes', () => {
      const badge = createBadge({isDynamic: true})
      const props = badge.contracts.getBadgeProps()
      expect('onkeydown' in props).toBe(false)
      expect('onkeyup' in props).toBe(false)
      expect('onkeypress' in props).toBe(false)
    })

    it('never produces tabindex in any mode', () => {
      const decorative = createBadge({isDecorative: true})
      expect('tabindex' in decorative.contracts.getBadgeProps()).toBe(false)

      const dynamic = createBadge({isDynamic: true})
      expect('tabindex' in dynamic.contracts.getBadgeProps()).toBe(false)
    })
  })

  describe('actions — boolean toggles', () => {
    it('setPulse toggles pulse state', () => {
      const badge = createBadge()
      badge.actions.setPulse(true)
      expect(badge.state.pulse()).toBe(true)

      badge.actions.setPulse(false)
      expect(badge.state.pulse()).toBe(false)
    })

    it('setPill toggles pill state', () => {
      const badge = createBadge()
      badge.actions.setPill(true)
      expect(badge.state.pill()).toBe(true)

      badge.actions.setPill(false)
      expect(badge.state.pill()).toBe(false)
    })

    it('setDynamic toggles isDynamic and affects getBadgeProps', () => {
      const badge = createBadge()
      badge.actions.setDynamic(true)
      expect(badge.state.isDynamic()).toBe(true)
      expect(badge.contracts.getBadgeProps().role).toBe('status')

      badge.actions.setDynamic(false)
      expect(badge.state.isDynamic()).toBe(false)
      expect('role' in badge.contracts.getBadgeProps()).toBe(false)
    })
  })

  describe('options initialization', () => {
    it('respects all initial options', () => {
      const badge = createBadge({
        variant: 'danger',
        size: 'large',
        dot: true,
        pulse: true,
        pill: true,
        isDynamic: true,
        isDecorative: false,
        ariaLabel: 'Alert count',
      })

      expect(badge.state.variant()).toBe('danger')
      expect(badge.state.size()).toBe('large')
      expect(badge.state.dot()).toBe(true)
      expect(badge.state.pulse()).toBe(true)
      expect(badge.state.pill()).toBe(true)
      expect(badge.state.isDynamic()).toBe(true)
      expect(badge.state.isDecorative()).toBe(false)
      expect(badge.state.isEmpty()).toBe(true)
    })
  })
})
