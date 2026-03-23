import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVAlert} from './cv-alert'

const settle = async (element: CVAlert) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('cv-alert', () => {
  it('shows and hides messages with input/change events', async () => {
    CVAlert.define()

    const alert = document.createElement('cv-alert') as CVAlert
    const inputValues: boolean[] = []
    const changeValues: boolean[] = []

    alert.addEventListener('cv-input', (event) => {
      inputValues.push((event as unknown as CustomEvent<{visible: boolean}>).detail.visible)
    })
    alert.addEventListener('cv-change', (event) => {
      changeValues.push((event as unknown as CustomEvent<{visible: boolean}>).detail.visible)
    })

    document.body.append(alert)
    await settle(alert)

    alert.show('Connection lost')
    await settle(alert)

    const base = alert.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    const message = alert.shadowRoot?.querySelector('[part="message"]') as HTMLElement

    expect(alert.hasAttribute('visible')).toBe(true)
    expect(base.getAttribute('role')).toBe('alert')
    expect(message.textContent).toContain('Connection lost')
    expect(inputValues).toEqual([true])
    expect(changeValues).toEqual([true])

    alert.hide()
    await settle(alert)

    expect(alert.hasAttribute('visible')).toBe(false)
    expect(inputValues).toEqual([true, false])
    expect(changeValues).toEqual([true, false])
  })

  it('auto-dismisses when durationMs is set', async () => {
    vi.useFakeTimers()
    CVAlert.define()

    const alert = document.createElement('cv-alert') as CVAlert
    alert.durationMs = 50
    document.body.append(alert)
    await settle(alert)

    alert.show('Token expired')
    await settle(alert)
    expect(alert.hasAttribute('visible')).toBe(true)

    vi.advanceTimersByTime(49)
    await settle(alert)
    expect(alert.hasAttribute('visible')).toBe(true)

    vi.advanceTimersByTime(1)
    await settle(alert)
    expect(alert.hasAttribute('visible')).toBe(false)
  })

  it('passes aria-live and aria-atomic overrides to live-region contract', async () => {
    CVAlert.define()

    const alert = document.createElement('cv-alert') as CVAlert
    alert.ariaLive = 'polite'
    alert.atomic = false

    document.body.append(alert)
    await settle(alert)

    alert.show('Saved')
    await settle(alert)

    const base = alert.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    expect(base.getAttribute('aria-live')).toBe('polite')
    expect(base.getAttribute('aria-atomic')).toBe('false')
  })

  it('keeps visible message when reconfiguring model options', async () => {
    CVAlert.define()

    const alert = document.createElement('cv-alert') as CVAlert
    document.body.append(alert)
    await settle(alert)

    alert.show('Persistent warning')
    await settle(alert)

    alert.ariaLive = 'polite'
    await settle(alert)

    const message = alert.shadowRoot?.querySelector('[part="message"]') as HTMLElement
    expect(alert.hasAttribute('visible')).toBe(true)
    expect(message.textContent).toContain('Persistent warning')
  })
})
