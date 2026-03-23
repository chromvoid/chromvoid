import {describe, expect, it} from 'vitest'
import {createSpinner} from './index'

describe('createSpinner', () => {
  describe('default state', () => {
    it('returns expected model structure', () => {
      const spinner = createSpinner()
      expect(spinner.state).toBeDefined()
      expect(spinner.actions).toBeDefined()
      expect(spinner.contracts).toBeDefined()
    })

    it('defaults label to "Loading"', () => {
      const spinner = createSpinner()
      expect(spinner.state.label()).toBe('Loading')
    })
  })

  describe('getSpinnerProps() — defaults', () => {
    it('returns role=progressbar and aria-label=Loading', () => {
      const spinner = createSpinner()
      const props = spinner.contracts.getSpinnerProps()
      expect(props).toEqual({
        role: 'progressbar',
        'aria-label': 'Loading',
      })
    })

    it('never includes aria-valuenow, aria-valuemin, aria-valuemax, or aria-valuetext', () => {
      const spinner = createSpinner()
      const props = spinner.contracts.getSpinnerProps()
      expect('aria-valuenow' in props).toBe(false)
      expect('aria-valuemin' in props).toBe(false)
      expect('aria-valuemax' in props).toBe(false)
      expect('aria-valuetext' in props).toBe(false)
    })
  })

  describe('custom label option', () => {
    it('reflects custom label in initial getSpinnerProps()', () => {
      const spinner = createSpinner({label: 'Saving'})
      const props = spinner.contracts.getSpinnerProps()
      expect(props['aria-label']).toBe('Saving')
    })
  })

  describe('setLabel action', () => {
    it('updates label state', () => {
      const spinner = createSpinner()
      spinner.actions.setLabel('Uploading')
      expect(spinner.state.label()).toBe('Uploading')
    })

    it('updates aria-label in contract output', () => {
      const spinner = createSpinner()
      spinner.actions.setLabel('Processing')
      const props = spinner.contracts.getSpinnerProps()
      expect(props['aria-label']).toBe('Processing')
    })
  })

  describe('non-interactive behavior', () => {
    it('never produces tabindex attribute', () => {
      const spinner = createSpinner()
      const props = spinner.contracts.getSpinnerProps()
      expect('tabindex' in props).toBe(false)
    })

    it('never produces keyboard handler attributes', () => {
      const spinner = createSpinner()
      const props = spinner.contracts.getSpinnerProps()
      expect('onkeydown' in props).toBe(false)
      expect('onkeyup' in props).toBe(false)
      expect('onkeypress' in props).toBe(false)
    })
  })
})
