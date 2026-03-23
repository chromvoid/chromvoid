import {describe, expect, it} from 'vitest'
import {createMeter} from './index'

describe('createMeter', () => {
  describe('value clamping at boundaries', () => {
    it('clamps initial value above max to max', () => {
      const meter = createMeter({min: 0, max: 10, value: 12})
      expect(meter.state.value()).toBe(10)
    })

    it('clamps initial value below min to min', () => {
      const meter = createMeter({min: 5, max: 10, value: 2})
      expect(meter.state.value()).toBe(5)
    })

    it('clamps setValue above max', () => {
      const meter = createMeter({min: 0, max: 10, value: 5})
      meter.actions.setValue(15)
      expect(meter.state.value()).toBe(10)
    })

    it('clamps setValue below min', () => {
      const meter = createMeter({min: 0, max: 10, value: 5})
      meter.actions.setValue(-5)
      expect(meter.state.value()).toBe(0)
    })

    it('preserves fractional values without step-snapping', () => {
      const meter = createMeter({min: 0, max: 100, value: 50.7})
      expect(meter.state.value()).toBe(50.7)
    })

    it('defaults value to min when not provided', () => {
      const meter = createMeter({min: 10, max: 50})
      expect(meter.state.value()).toBe(10)
    })

    it('normalizes inverted min/max', () => {
      const meter = createMeter({min: 100, max: 0, value: 50})
      expect(meter.state.min()).toBe(0)
      expect(meter.state.max()).toBe(100)
      expect(meter.state.value()).toBe(50)
    })
  })

  describe('default values', () => {
    it('defaults to min=0, max=100', () => {
      const meter = createMeter()
      expect(meter.state.min()).toBe(0)
      expect(meter.state.max()).toBe(100)
      expect(meter.state.value()).toBe(0)
    })
  })

  describe('percentage calculation accuracy', () => {
    it('computes 50% for midpoint value', () => {
      const meter = createMeter({min: 20, max: 120, value: 70})
      expect(meter.state.percentage()).toBe(50)
    })

    it('computes 0% at min boundary', () => {
      const meter = createMeter({min: 0, max: 100, value: 0})
      expect(meter.state.percentage()).toBe(0)
    })

    it('computes 100% at max boundary', () => {
      const meter = createMeter({min: 0, max: 100, value: 100})
      expect(meter.state.percentage()).toBe(100)
    })

    it('computes correct percentage for fractional values', () => {
      const meter = createMeter({min: 0, max: 200, value: 33})
      expect(meter.state.percentage()).toBe(16.5)
    })

    it('returns 0 when min equals max', () => {
      const meter = createMeter({min: 50, max: 50, value: 50})
      expect(meter.state.percentage()).toBe(0)
    })

    it('rounds percentage to 4 decimal places', () => {
      const meter = createMeter({min: 0, max: 300, value: 100})
      // 100/300*100 = 33.33333... → should be 33.3333
      expect(meter.state.percentage()).toBe(33.3333)
    })
  })

  describe('status derivation based on thresholds', () => {
    it('returns normal when no thresholds are set', () => {
      const meter = createMeter({min: 0, max: 100, value: 50})
      expect(meter.state.status()).toBe('normal')
    })

    it('returns low when value is below low threshold', () => {
      const meter = createMeter({min: 0, max: 100, low: 20, high: 80, value: 10})
      expect(meter.state.status()).toBe('low')
    })

    it('returns high when value is above high threshold', () => {
      const meter = createMeter({min: 0, max: 100, low: 20, high: 80, value: 90})
      expect(meter.state.status()).toBe('high')
    })

    it('returns normal when value is between low and high', () => {
      const meter = createMeter({min: 0, max: 100, low: 20, high: 80, value: 50})
      expect(meter.state.status()).toBe('normal')
    })

    it('returns normal at exactly low threshold', () => {
      const meter = createMeter({min: 0, max: 100, low: 20, high: 80, value: 20})
      expect(meter.state.status()).toBe('normal')
    })

    it('returns normal at exactly high threshold', () => {
      const meter = createMeter({min: 0, max: 100, low: 20, high: 80, value: 80})
      expect(meter.state.status()).toBe('normal')
    })

    it('works with only low threshold', () => {
      const meter = createMeter({min: 0, max: 100, low: 30, value: 10})
      expect(meter.state.status()).toBe('low')

      meter.actions.setValue(50)
      expect(meter.state.status()).toBe('normal')
    })

    it('works with only high threshold', () => {
      const meter = createMeter({min: 0, max: 100, high: 70, value: 90})
      expect(meter.state.status()).toBe('high')

      meter.actions.setValue(50)
      expect(meter.state.status()).toBe('normal')
    })
  })

  describe('optimum status derivation', () => {
    it('returns optimum when optimum is in normal range and value is in normal range', () => {
      const meter = createMeter({
        min: 0, max: 100, low: 20, high: 80, optimum: 50, value: 55,
      })
      expect(meter.state.status()).toBe('optimum')
    })

    it('returns optimum when optimum is in low region and value is in low region', () => {
      const meter = createMeter({
        min: 0, max: 100, low: 20, high: 80, optimum: 10, value: 5,
      })
      expect(meter.state.status()).toBe('optimum')
    })

    it('returns optimum when optimum is in high region and value is in high region', () => {
      const meter = createMeter({
        min: 0, max: 100, low: 20, high: 80, optimum: 90, value: 85,
      })
      expect(meter.state.status()).toBe('optimum')
    })

    it('returns low when optimum is in normal range but value is in low region', () => {
      const meter = createMeter({
        min: 0, max: 100, low: 20, high: 80, optimum: 50, value: 10,
      })
      expect(meter.state.status()).toBe('low')
    })

    it('returns high when optimum is in normal range but value is in high region', () => {
      const meter = createMeter({
        min: 0, max: 100, low: 20, high: 80, optimum: 50, value: 90,
      })
      expect(meter.state.status()).toBe('high')
    })
  })

  describe('threshold invariant enforcement', () => {
    it('clamps low threshold below min to min', () => {
      const meter = createMeter({min: 10, max: 100, low: 5, high: 80, value: 10})
      expect(meter.state.status()).toBe('normal')
    })

    it('clamps high threshold above max to max', () => {
      const meter = createMeter({min: 0, max: 100, low: 20, high: 120, value: 100})
      expect(meter.state.status()).toBe('normal')
    })

    it('enforces low <= high when low > high by clamping high to low', () => {
      const meter = createMeter({min: 0, max: 100, low: 80, high: 20, value: 50})
      expect(meter.state.status()).toBe('normal')

      meter.actions.setValue(10)
      expect(meter.state.status()).toBe('low')
    })

    it('ignores NaN thresholds', () => {
      const meter = createMeter({min: 0, max: 100, low: NaN, high: 80, value: 10})
      expect(meter.state.status()).toBe('normal')
    })

    it('ignores Infinity thresholds', () => {
      const meter = createMeter({min: 0, max: 100, low: Infinity, high: 80, value: 10})
      expect(meter.state.status()).toBe('normal')
    })
  })

  describe('correct aria-valuenow/min/max mapping', () => {
    it('returns complete APG meter props', () => {
      const meter = createMeter({
        idBase: 'cpu',
        min: 0,
        max: 100,
        value: 40,
        ariaLabel: 'CPU usage',
        ariaDescribedBy: 'cpu-help',
        formatValueText: (v) => `${v}% used`,
      })

      expect(meter.contracts.getMeterProps()).toEqual({
        id: 'cpu-root',
        role: 'meter',
        'aria-valuenow': '40',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuetext': '40% used',
        'aria-label': 'CPU usage',
        'aria-labelledby': undefined,
        'aria-describedby': 'cpu-help',
      })
    })

    it('supports aria-labelledby', () => {
      const meter = createMeter({
        idBase: 'disk',
        ariaLabelledBy: 'disk-label',
        value: 75,
      })

      const props = meter.contracts.getMeterProps()
      expect(props['aria-labelledby']).toBe('disk-label')
    })

    it('omits aria-valuetext when formatValueText is not provided', () => {
      const meter = createMeter({value: 50})
      const props = meter.contracts.getMeterProps()
      expect(props['aria-valuetext']).toBeUndefined()
    })

    it('reflects updated value in aria props after setValue', () => {
      const meter = createMeter({min: 0, max: 100, value: 20})
      meter.actions.setValue(80)
      expect(meter.contracts.getMeterProps()['aria-valuenow']).toBe('80')
    })
  })

  describe('reactive updates when value changes', () => {
    it('updates percentage reactively after setValue', () => {
      const meter = createMeter({min: 0, max: 100, value: 0})
      expect(meter.state.percentage()).toBe(0)

      meter.actions.setValue(50)
      expect(meter.state.percentage()).toBe(50)

      meter.actions.setValue(100)
      expect(meter.state.percentage()).toBe(100)
    })

    it('updates status reactively after setValue', () => {
      const meter = createMeter({
        min: 0, max: 100, low: 20, high: 80, value: 10,
      })
      expect(meter.state.status()).toBe('low')

      meter.actions.setValue(50)
      expect(meter.state.status()).toBe('normal')

      meter.actions.setValue(90)
      expect(meter.state.status()).toBe('high')
    })

    it('formatValueText reflects current value on each getMeterProps call', () => {
      const meter = createMeter({
        min: 0, max: 100, value: 25,
        formatValueText: (v) => `${v}%`,
      })

      expect(meter.contracts.getMeterProps()['aria-valuetext']).toBe('25%')

      meter.actions.setValue(75)
      expect(meter.contracts.getMeterProps()['aria-valuetext']).toBe('75%')
    })
  })

  describe('non-interactive behavior', () => {
    it('does not expose interactive actions beyond setValue', () => {
      const meter = createMeter()
      const actionKeys = Object.keys(meter.actions)
      expect(actionKeys).toEqual(['setValue'])
    })

    it('does not expose step in state', () => {
      const meter = createMeter()
      const stateKeys = Object.keys(meter.state)
      expect(stateKeys).toEqual(['value', 'min', 'max', 'percentage', 'status'])
    })
  })
})
