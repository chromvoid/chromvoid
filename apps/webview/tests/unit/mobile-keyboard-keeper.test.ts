import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  holdMobileKeyboard,
  releaseMobileKeyboardHold,
} from '../../src/app/bootstrap/mobile-keyboard'

function appendInput(): HTMLInputElement {
  const input = document.createElement('input')
  document.body.append(input)
  return input
}

describe('mobile keyboard keeper', () => {
  afterEach(() => {
    releaseMobileKeyboardHold('test-cleanup')
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('parks focus on the hidden opted-out keeper while an editable is focused', () => {
    const input = appendInput()
    input.focus()

    holdMobileKeyboard('test')

    const active = document.activeElement as HTMLElement | null
    expect(active).not.toBe(input)
    expect(active?.localName).toBe('input')
    expect(active?.getAttribute('data-mobile-keyboard-scroll')).toBe('off')
    expect(active?.getAttribute('aria-hidden')).toBe('true')
  })

  it('does nothing when no editable element holds focus', () => {
    appendInput()

    holdMobileKeyboard('test')

    expect(document.activeElement).toBe(document.body)
  })

  it('does nothing for non-text active elements', () => {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    document.body.append(checkbox)
    checkbox.focus()

    holdMobileKeyboard('test')

    expect(document.activeElement).toBe(checkbox)
  })

  it('release blurs a keeper that still holds focus', () => {
    const input = appendInput()
    input.focus()
    holdMobileKeyboard('test')

    releaseMobileKeyboardHold('test')

    expect(document.activeElement).toBe(document.body)
  })

  it('release does not steal focus from the editor that took over', () => {
    const first = appendInput()
    const second = appendInput()
    first.focus()
    holdMobileKeyboard('test')

    second.focus()
    releaseMobileKeyboardHold('test')

    expect(document.activeElement).toBe(second)
  })

  it('times out and blurs the keeper when no editor materializes', () => {
    vi.useFakeTimers()
    const input = appendInput()
    input.focus()
    holdMobileKeyboard('test')

    vi.advanceTimersByTime(700)

    expect(document.activeElement).toBe(document.body)
  })

  it('timeout leaves the editor alone once it took focus from the keeper', () => {
    vi.useFakeTimers()
    const first = appendInput()
    const second = appendInput()
    first.focus()
    holdMobileKeyboard('test')

    second.focus()
    vi.advanceTimersByTime(700)

    expect(document.activeElement).toBe(second)
  })

  it('re-holding extends the fallback window instead of stacking timers', () => {
    vi.useFakeTimers()
    const first = appendInput()
    const second = appendInput()
    first.focus()
    holdMobileKeyboard('test')

    vi.advanceTimersByTime(400)
    second.focus()
    holdMobileKeyboard('test')
    vi.advanceTimersByTime(400)

    const active = document.activeElement as HTMLElement | null
    expect(active?.getAttribute('data-mobile-keyboard-scroll')).toBe('off')

    vi.advanceTimersByTime(300)
    expect(document.activeElement).toBe(document.body)
  })
})
