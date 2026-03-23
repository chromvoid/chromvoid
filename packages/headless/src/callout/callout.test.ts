import {describe, expect, it} from 'vitest'
import {createCallout} from './index'

describe('createCallout', () => {
  describe('default state', () => {
    it('defaults to variant=info, closable=false, open=true', () => {
      const callout = createCallout()
      expect(callout.state.variant()).toBe('info')
      expect(callout.state.closable()).toBe(false)
      expect(callout.state.open()).toBe(true)
    })
  })

  describe('getCalloutProps()', () => {
    it('returns role=note and data-variant matching current variant', () => {
      const callout = createCallout()
      const props = callout.contracts.getCalloutProps()
      expect(props.role).toBe('note')
      expect(props['data-variant']).toBe('info')
      expect(props.id).toBe('callout-root')
    })

    it('never includes aria-live or aria-atomic', () => {
      const callout = createCallout()
      const props = callout.contracts.getCalloutProps()
      expect('aria-live' in props).toBe(false)
      expect('aria-atomic' in props).toBe(false)
    })

    it('never produces tabindex on root element', () => {
      const callout = createCallout()
      const props = callout.contracts.getCalloutProps()
      expect('tabindex' in props).toBe(false)
    })

    it('uses custom idBase for id', () => {
      const callout = createCallout({idBase: 'my-callout'})
      const props = callout.contracts.getCalloutProps()
      expect(props.id).toBe('my-callout-root')
    })

    it('updates data-variant when variant changes', () => {
      const callout = createCallout()
      callout.actions.setVariant('danger')
      expect(callout.contracts.getCalloutProps()['data-variant']).toBe('danger')
    })
  })

  describe('setVariant', () => {
    it('updates variant signal for all valid values', () => {
      const callout = createCallout()

      callout.actions.setVariant('info')
      expect(callout.state.variant()).toBe('info')

      callout.actions.setVariant('success')
      expect(callout.state.variant()).toBe('success')

      callout.actions.setVariant('warning')
      expect(callout.state.variant()).toBe('warning')

      callout.actions.setVariant('danger')
      expect(callout.state.variant()).toBe('danger')

      callout.actions.setVariant('neutral')
      expect(callout.state.variant()).toBe('neutral')
    })

    it('rejects invalid variant values', () => {
      const callout = createCallout({variant: 'success'})
      callout.actions.setVariant('invalid' as any)
      expect(callout.state.variant()).toBe('success')
    })

    it('defaults invalid initial variant to info', () => {
      const callout = createCallout({variant: 'invalid' as any})
      expect(callout.state.variant()).toBe('info')
    })
  })

  describe('close action', () => {
    it('sets open to false when closable is true', () => {
      const callout = createCallout({closable: true})
      expect(callout.state.open()).toBe(true)
      callout.actions.close()
      expect(callout.state.open()).toBe(false)
    })

    it('is a no-op when closable is false', () => {
      const callout = createCallout({closable: false})
      expect(callout.state.open()).toBe(true)
      callout.actions.close()
      expect(callout.state.open()).toBe(true)
    })

    it('is a no-op when already closed', () => {
      const callout = createCallout({closable: true, open: false})
      callout.actions.close()
      expect(callout.state.open()).toBe(false)
    })
  })

  describe('show action', () => {
    it('sets open to true', () => {
      const callout = createCallout({closable: true, open: false})
      callout.actions.show()
      expect(callout.state.open()).toBe(true)
    })

    it('is a no-op when already open', () => {
      const callout = createCallout()
      callout.actions.show()
      expect(callout.state.open()).toBe(true)
    })
  })

  describe('setClosable', () => {
    it('toggles closable state', () => {
      const callout = createCallout()
      expect(callout.state.closable()).toBe(false)

      callout.actions.setClosable(true)
      expect(callout.state.closable()).toBe(true)

      callout.actions.setClosable(false)
      expect(callout.state.closable()).toBe(false)
    })
  })

  describe('getCloseButtonProps()', () => {
    it('returns role=button, tabindex=0, aria-label=Dismiss, and onClick', () => {
      const callout = createCallout({closable: true})
      const props = callout.contracts.getCloseButtonProps()
      expect(props.role).toBe('button')
      expect(props.tabindex).toBe('0')
      expect(props['aria-label']).toBe('Dismiss')
      expect(typeof props.onClick).toBe('function')
    })

    it('returns close button props with correct id', () => {
      const callout = createCallout({idBase: 'test'})
      const props = callout.contracts.getCloseButtonProps()
      expect(props.id).toBe('test-close-btn')
    })

    it('onClick triggers close action', () => {
      const callout = createCallout({closable: true})
      expect(callout.state.open()).toBe(true)
      callout.contracts.getCloseButtonProps().onClick()
      expect(callout.state.open()).toBe(false)
    })

    it('onClick is a no-op when closable is false', () => {
      const callout = createCallout({closable: false})
      expect(callout.state.open()).toBe(true)
      callout.contracts.getCloseButtonProps().onClick()
      expect(callout.state.open()).toBe(true)
    })
  })

  describe('options initialization', () => {
    it('respects all initial options', () => {
      const callout = createCallout({
        idBase: 'custom',
        variant: 'danger',
        closable: true,
        open: false,
      })
      expect(callout.state.variant()).toBe('danger')
      expect(callout.state.closable()).toBe(true)
      expect(callout.state.open()).toBe(false)
    })
  })

  describe('invariants', () => {
    it('role is always note regardless of variant', () => {
      const variants = ['info', 'success', 'warning', 'danger', 'neutral'] as const
      for (const v of variants) {
        const callout = createCallout({variant: v})
        expect(callout.contracts.getCalloutProps().role).toBe('note')
      }
    })

    it('never produces aria-live or aria-atomic in any state', () => {
      const callout = createCallout({closable: true, variant: 'danger'})
      const props = callout.contracts.getCalloutProps()
      expect('aria-live' in props).toBe(false)
      expect('aria-atomic' in props).toBe(false)
    })

    it('never produces tabindex on root in any state', () => {
      const closable = createCallout({closable: true})
      expect('tabindex' in closable.contracts.getCalloutProps()).toBe(false)

      const closed = createCallout({open: false})
      expect('tabindex' in closed.contracts.getCalloutProps()).toBe(false)
    })
  })
})
