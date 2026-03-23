import {afterEach, describe, expect, it, vi} from 'vitest'
import {expectRoleAndAria} from '../testing/apg-contract-harness'
import {createToast} from './index'

describe('createToast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pushes and dismisses toast items', () => {
    const toast = createToast({idBase: 'toast-basic', defaultDurationMs: 0})

    const id = toast.actions.push({message: 'Saved', level: 'success'})
    expect(toast.state.items()).toHaveLength(1)

    toast.actions.dismiss(id)
    expect(toast.state.items()).toHaveLength(0)
  })

  it('auto-dismisses after duration and exposes region role contract', () => {
    vi.useFakeTimers()
    const toast = createToast({idBase: 'toast-auto', defaultDurationMs: 100})

    const id = toast.actions.push({message: 'Saved'})
    expect(toast.state.items()).toHaveLength(1)
    expectRoleAndAria(toast.contracts.getRegionProps(), 'region', {'aria-live': 'polite'})

    vi.advanceTimersByTime(100)
    expect(toast.state.items().some((item) => item.id === id)).toBe(false)
  })

  it('pauses and resumes auto-dismiss with remaining duration', () => {
    vi.useFakeTimers()
    const toast = createToast({idBase: 'toast-pause-resume', defaultDurationMs: 100})

    toast.actions.push({message: 'Saved'})
    vi.advanceTimersByTime(40)

    toast.actions.pause()
    vi.advanceTimersByTime(500)
    expect(toast.state.items()).toHaveLength(1)

    toast.actions.resume()
    vi.advanceTimersByTime(59)
    expect(toast.state.items()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toast.state.items()).toHaveLength(0)
  })

  it('applies maxVisible queue slicing and level role mapping', () => {
    const toast = createToast({idBase: 'toast-queue', defaultDurationMs: 0, maxVisible: 2})

    const id1 = toast.actions.push({message: 'One', level: 'info'})
    const id2 = toast.actions.push({message: 'Two', level: 'warning'})
    toast.actions.push({message: 'Three', level: 'error'})

    expect(toast.state.visibleItems()).toHaveLength(2)
    expect(toast.state.visibleItems().map((item) => item.message)).toEqual(['Three', 'Two'])

    expectRoleAndAria(toast.contracts.getToastProps(id1), 'status')
    expectRoleAndAria(toast.contracts.getToastProps(id2), 'alert')
  })

  it('maps role="status" for success level and role="alert" for error level', () => {
    const toast = createToast({idBase: 'toast-roles', defaultDurationMs: 0})

    const idSuccess = toast.actions.push({message: 'Done', level: 'success'})
    const idError = toast.actions.push({message: 'Fail', level: 'error'})

    expectRoleAndAria(toast.contracts.getToastProps(idSuccess), 'status')
    expectRoleAndAria(toast.contracts.getToastProps(idError), 'alert')
  })

  it('getDismissButtonProps onClick calls dismiss', () => {
    const toast = createToast({idBase: 'toast-dismiss-btn', defaultDurationMs: 0})

    const id = toast.actions.push({message: 'Hello'})
    expect(toast.state.items()).toHaveLength(1)

    const props = toast.contracts.getDismissButtonProps(id)
    expect(props.role).toBe('button')
    expect(props.tabindex).toBe('0')
    expect(props['aria-label']).toBe('Dismiss notification')
    expect(props.id).toBe('toast-dismiss-btn-dismiss-' + id)

    props.onClick()
    expect(toast.state.items()).toHaveLength(0)
  })

  it('getToastProps throws for unknown id', () => {
    const toast = createToast({idBase: 'toast-throw', defaultDurationMs: 0})

    expect(() => toast.contracts.getToastProps('nonexistent')).toThrow('Unknown toast id: nonexistent')
  })

  it('getToastProps returns correct data-level attribute', () => {
    const toast = createToast({idBase: 'toast-data', defaultDurationMs: 0})

    const id = toast.actions.push({message: 'Warning', level: 'warning'})
    const props = toast.contracts.getToastProps(id)

    expect(props['data-level']).toBe('warning')
    expect(props.id).toBe('toast-data-item-' + id)
  })

  it('clear removes all items and timer tracking', () => {
    vi.useFakeTimers()
    const toast = createToast({idBase: 'toast-clear', defaultDurationMs: 200})

    toast.actions.push({message: 'One'})
    toast.actions.push({message: 'Two'})
    expect(toast.state.items()).toHaveLength(2)

    toast.actions.clear()
    expect(toast.state.items()).toHaveLength(0)

    // Advancing timers should not cause errors (timers were cleaned up)
    vi.advanceTimersByTime(300)
    expect(toast.state.items()).toHaveLength(0)
  })

  it('push while paused stores duration without starting timer', () => {
    vi.useFakeTimers()
    const toast = createToast({idBase: 'toast-paused-push', defaultDurationMs: 100})

    toast.actions.pause()
    expect(toast.state.isPaused()).toBe(true)

    toast.actions.push({message: 'Paused toast'})
    expect(toast.state.items()).toHaveLength(1)

    // Advancing timers should not dismiss while paused
    vi.advanceTimersByTime(500)
    expect(toast.state.items()).toHaveLength(1)

    // Resume should schedule the remaining duration
    toast.actions.resume()
    vi.advanceTimersByTime(99)
    expect(toast.state.items()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toast.state.items()).toHaveLength(0)
  })

  it('pause is idempotent when already paused', () => {
    vi.useFakeTimers()
    const toast = createToast({idBase: 'toast-pause-idem', defaultDurationMs: 100})

    toast.actions.push({message: 'Test'})
    vi.advanceTimersByTime(40)

    toast.actions.pause()
    toast.actions.pause() // second call should be no-op
    expect(toast.state.isPaused()).toBe(true)

    toast.actions.resume()
    vi.advanceTimersByTime(59)
    expect(toast.state.items()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toast.state.items()).toHaveLength(0)
  })

  it('resume is idempotent when not paused', () => {
    vi.useFakeTimers()
    const toast = createToast({idBase: 'toast-resume-idem', defaultDurationMs: 100})

    toast.actions.push({message: 'Test'})
    toast.actions.resume() // should be no-op when not paused
    expect(toast.state.isPaused()).toBe(false)

    vi.advanceTimersByTime(100)
    expect(toast.state.items()).toHaveLength(0)
  })

  it('does not auto-dismiss when duration is <= 0', () => {
    vi.useFakeTimers()
    const toast = createToast({idBase: 'toast-no-dismiss', defaultDurationMs: 0})

    toast.actions.push({message: 'Sticky'})
    vi.advanceTimersByTime(10000)

    expect(toast.state.items()).toHaveLength(1)
  })

  it('supports assertive ariaLive option in region props', () => {
    const toast = createToast({idBase: 'toast-assertive', ariaLive: 'assertive', defaultDurationMs: 0})

    const props = toast.contracts.getRegionProps()
    expect(props['aria-live']).toBe('assertive')
    expect(props['aria-atomic']).toBe('false')
    expect(props.role).toBe('region')
    expect(props.id).toBe('toast-assertive-region')
  })

  it('schedules auto-dismiss for initialItems', () => {
    vi.useFakeTimers()
    const toast = createToast({
      idBase: 'toast-init',
      defaultDurationMs: 100,
      initialItems: [{id: 'pre-1', message: 'Preloaded'}],
    })

    expect(toast.state.items()).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(toast.state.items()).toHaveLength(0)
  })

  it('clamps maxVisible to at least 1', () => {
    const toast = createToast({idBase: 'toast-clamp', defaultDurationMs: 0, maxVisible: 0})

    toast.actions.push({message: 'One'})
    toast.actions.push({message: 'Two'})

    expect(toast.state.visibleItems()).toHaveLength(1)
  })

  it('push returns generated id and prepends newest-first', () => {
    const toast = createToast({idBase: 'toast-order', defaultDurationMs: 0})

    const id1 = toast.actions.push({message: 'First'})
    const id2 = toast.actions.push({message: 'Second'})

    expect(typeof id1).toBe('string')
    expect(typeof id2).toBe('string')
    expect(id1).not.toBe(id2)
    expect(toast.state.items()[0].message).toBe('Second')
    expect(toast.state.items()[1].message).toBe('First')
  })
})
