import {afterEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {
  clearPassmanagerRoot,
  getPassmanagerRoot,
  getPassmanagerShowElement,
  getPassmanagerShowElementSignal,
  setPassmanagerRoot,
} from '../../src/features/passmanager/models/pm-root.adapter'

function createShowElementSignal<T>(initialValue: T, options: {emitOnSubscribe?: boolean} = {}) {
  let value = initialValue
  const listeners = new Set<() => void>()

  return Object.assign(
    () => value,
    {
      set(nextValue: T) {
        value = nextValue
        for (const listener of listeners) {
          listener()
        }
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        if (options.emitOnSubscribe) {
          listener()
        }
        return () => {
          listeners.delete(listener)
        }
      },
    },
  )
}

describe('pm-root.adapter', () => {
  afterEach(() => {
    clearPassmanagerRoot()
  })

  it('stores and clears the passmanager root', () => {
    const root = {showElement: atom(null)} as never

    setPassmanagerRoot(root)
    expect(getPassmanagerRoot()).toBe(root)

    clearPassmanagerRoot()
    expect(getPassmanagerRoot()).toBeUndefined()
    expect(getPassmanagerShowElement()).toBeUndefined()
    expect(getPassmanagerShowElementSignal()).toBeUndefined()
  })

  it('returns the showElement signal for immediate subscriptions', () => {
    const listener = vi.fn()
    const showElement = createShowElementSignal('createEntry', {emitOnSubscribe: true})

    setPassmanagerRoot({showElement} as never)

    const signal = getPassmanagerShowElementSignal()
    expect(signal).toBe(showElement)
    expect(getPassmanagerShowElement()).toBe('createEntry')

    const unsubscribe = signal?.subscribe(listener)
    expect(listener).toHaveBeenCalledTimes(1)

    showElement.set('importDialog')
    expect(getPassmanagerShowElement()).toBe('importDialog')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe?.()
  })
})
