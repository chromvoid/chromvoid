import {afterEach, describe, expect, it, vi} from 'vitest'
import {createAlert} from './index'

describe('createAlert', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates visibility and message on show/hide', () => {
    const alert = createAlert({
      idBase: 'alert-basic',
    })

    expect(alert.state.isVisible()).toBe(false)
    expect(alert.state.message()).toBe('')

    alert.actions.show('Connection lost')
    expect(alert.state.isVisible()).toBe(true)
    expect(alert.state.message()).toBe('Connection lost')

    alert.actions.hide()
    expect(alert.state.isVisible()).toBe(false)
    expect(alert.state.message()).toBe('Connection lost')
  })

  it('returns APG alert live-region contract', () => {
    const alert = createAlert({
      idBase: 'alert-a11y',
    })

    // Live region must never use aria-hidden; it stays in the a11y tree
    const props = alert.contracts.getAlertProps()
    expect(props).toEqual({
      id: 'alert-a11y-region',
      role: 'alert',
      'aria-live': 'assertive',
      'aria-atomic': 'true',
    })
    expect('aria-hidden' in props).toBe(false)

    alert.actions.show('Saved')

    const propsAfterShow = alert.contracts.getAlertProps()
    expect(propsAfterShow).toEqual({
      id: 'alert-a11y-region',
      role: 'alert',
      'aria-live': 'assertive',
      'aria-atomic': 'true',
    })
    expect('aria-hidden' in propsAfterShow).toBe(false)
  })

  it('supports configured auto-dismiss duration', () => {
    vi.useFakeTimers()

    const alert = createAlert({
      idBase: 'alert-timeout',
      durationMs: 50,
    })

    alert.actions.show('Token expired')
    expect(alert.state.isVisible()).toBe(true)

    vi.advanceTimersByTime(49)
    expect(alert.state.isVisible()).toBe(true)

    vi.advanceTimersByTime(1)
    expect(alert.state.isVisible()).toBe(false)
  })

  it('resets auto-dismiss timer on consecutive show calls', () => {
    vi.useFakeTimers()

    const alert = createAlert({
      idBase: 'alert-reset',
      durationMs: 100,
    })

    alert.actions.show('First')
    vi.advanceTimersByTime(80)
    expect(alert.state.isVisible()).toBe(true)

    alert.actions.show('Second')
    vi.advanceTimersByTime(80)
    expect(alert.state.isVisible()).toBe(true)
    expect(alert.state.message()).toBe('Second')

    vi.advanceTimersByTime(20)
    expect(alert.state.isVisible()).toBe(false)
  })

  it('cancels auto-dismiss timer on manual hide', () => {
    vi.useFakeTimers()

    const alert = createAlert({
      idBase: 'alert-cancel',
      durationMs: 100,
    })

    alert.actions.show('Notice')
    vi.advanceTimersByTime(50)

    alert.actions.hide()
    expect(alert.state.isVisible()).toBe(false)

    vi.advanceTimersByTime(100)
    expect(alert.state.isVisible()).toBe(false)
  })

  it('respects ariaLive polite override', () => {
    const alert = createAlert({
      idBase: 'alert-polite',
      ariaLive: 'polite',
    })

    const props = alert.contracts.getAlertProps()
    expect(props['aria-live']).toBe('polite')
  })

  it('respects ariaAtomic false override', () => {
    const alert = createAlert({
      idBase: 'alert-nonatomic',
      ariaAtomic: false,
    })

    const props = alert.contracts.getAlertProps()
    expect(props['aria-atomic']).toBe('false')
  })

  it('applies initial message and visibility options', () => {
    const alert = createAlert({
      idBase: 'alert-init',
      initialMessage: 'Preloaded warning',
      initialVisible: true,
    })

    expect(alert.state.isVisible()).toBe(true)
    expect(alert.state.message()).toBe('Preloaded warning')
  })

  it('updates message reactively on consecutive show calls', () => {
    const alert = createAlert({
      idBase: 'alert-reactive',
    })

    alert.actions.show('First')
    expect(alert.state.message()).toBe('First')

    alert.actions.show('Second')
    expect(alert.state.message()).toBe('Second')

    alert.actions.show('Third')
    expect(alert.state.message()).toBe('Third')
    expect(alert.state.isVisible()).toBe(true)
  })

  it('does not manage focus state', () => {
    const alert = createAlert({
      idBase: 'alert-passive',
    })

    alert.actions.show('Passive notice')
    const props = alert.contracts.getAlertProps()

    expect(props.role).toBe('alert')
    expect('tabindex' in props).toBe(false)
  })
})
