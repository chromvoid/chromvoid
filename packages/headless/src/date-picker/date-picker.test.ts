import {describe, expect, it, vi} from 'vitest'

import {createDatePicker} from './index'

describe('createDatePicker', () => {
  it('opens as combobox+dialog and exposes aria-expanded/controls', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))

    const dp = createDatePicker({
      idBase: 'dp',
      value: '2026-01-02T03:04',
      timeZone: 'utc',
    })

    expect(dp.contracts.getInputProps()['aria-expanded']).toBe('false')
    expect(dp.contracts.getInputProps()['aria-controls']).toBe('dp-dialog')

    dp.actions.open()
    expect(dp.state.isOpen()).toBe(true)
    expect(dp.contracts.getInputProps()['aria-expanded']).toBe('true')
    expect(dp.contracts.getInputProps()['aria-activedescendant']).toBe('dp-day-2026-01-02')
    expect(dp.contracts.getDialogProps().hidden).toBe(false)
  })

  it('keeps draft separate and commits only via commitDraft / commitInput', () => {
    const onCommit = vi.fn()
    const dp = createDatePicker({
      value: '2026-01-02T03:04',
      onCommit,
    })

    dp.actions.open()
    dp.actions.selectDraftDate('2026-01-10')
    dp.actions.setDraftTime('09:30')

    expect(dp.state.draftValue()).toBe('2026-01-10T09:30')
    expect(dp.state.committedValue()).toBe('2026-01-02T03:04')
    expect(onCommit).not.toHaveBeenCalled()

    dp.actions.commitDraft()
    expect(dp.state.committedValue()).toBe('2026-01-10T09:30')
    expect(onCommit).toHaveBeenCalledWith('2026-01-10T09:30')
    expect(dp.state.isOpen()).toBe(false)
  })

  it('cancels draft without committing', () => {
    const dp = createDatePicker({
      value: '2026-01-02T03:04',
    })

    dp.actions.open()
    dp.actions.selectDraftDate('2026-01-10')
    dp.actions.setDraftTime('09:30')
    dp.actions.cancelDraft()

    expect(dp.state.draftValue()).toBe('2026-01-02T03:04')
    expect(dp.state.committedValue()).toBe('2026-01-02T03:04')
    expect(dp.state.isOpen()).toBe(true)
  })

  it('commits typed input when valid and within bounds; marks invalid otherwise', () => {
    const onCommit = vi.fn()
    const dp = createDatePicker({
      min: '2026-01-10T00:00',
      max: '2026-01-20T23:59',
      onCommit,
    })

    dp.actions.setInputValue('2026-01-05T12:00')
    expect(dp.state.inputInvalid()).toBe(true)
    dp.actions.commitInput()
    expect(dp.state.committedValue()).toBe(null)
    expect(onCommit).not.toHaveBeenCalled()

    dp.actions.setInputValue('2026-01-10T12:00')
    expect(dp.state.inputInvalid()).toBe(false)
    dp.actions.commitInput()
    expect(dp.state.committedValue()).toBe('2026-01-10T12:00')
    expect(onCommit).toHaveBeenCalledWith('2026-01-10T12:00')
  })

  it('provides 42 visible calendar days and disables out-of-range dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'))

    const dp = createDatePicker({
      timeZone: 'utc',
      min: '2026-01-10T00:00',
      max: '2026-01-20T23:59',
    })

    dp.actions.open()
    const days = dp.state.visibleDays()
    expect(days).toHaveLength(42)

    const outOfRange = days.find((day) => day.date === '2026-01-05')
    const inRange = days.find((day) => day.date === '2026-01-10')
    expect(outOfRange?.inRange).toBe(false)
    expect(outOfRange?.disabled).toBe(true)
    expect(inRange?.inRange).toBe(true)
    expect(inRange?.disabled).toBe(false)
  })

  it('snaps draft time to minuteStep when updating segments', () => {
    const dp = createDatePicker({
      minuteStep: 15,
    })

    dp.actions.open()
    dp.actions.setDraftTime('12:08')
    expect(dp.state.draftTime()).toBe('12:15')

    dp.actions.setDraftTime('12:59')
    expect(dp.state.draftTime()).toBe('13:00')
  })

  it('closes on outside pointer handler from dialog props', () => {
    const dp = createDatePicker()
    dp.actions.open()
    expect(dp.state.isOpen()).toBe(true)

    dp.contracts.getDialogProps().onPointerDownOutside()
    expect(dp.state.isOpen()).toBe(false)
  })

  it('does not expose non-dual commit API surface', () => {
    const dp = createDatePicker()
    expect('setCommitMode' in (dp.actions as unknown as Record<string, unknown>)).toBe(false)
    expect('commitMode' in (dp.state as unknown as Record<string, unknown>)).toBe(false)
  })
})
