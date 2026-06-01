import {describe, expect, it, vi} from 'vitest'

import {
  subscribeAfterInitial,
  subscribeCallbackAfterInitial,
  subscribeToSignalChanges,
  type SubscribedSignal,
} from '../../src/shared/services/subscribed-signal'

type TestSignal<T> = SubscribedSignal<T> & {
  set(value: T): void
  emit(): void
}

function createSignal<T>(initialValue: T, options: {emitOnSubscribe?: boolean} = {}): TestSignal<T> {
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
      emit() {
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

describe('subscribeAfterInitial', () => {
  it('suppresses the synchronous callback fired during subscribe', () => {
    const signal = createSignal('alpha', {emitOnSubscribe: true})
    const onChange = vi.fn()

    const unsubscribe = subscribeAfterInitial(signal, onChange)

    expect(onChange).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('does not suppress the first real emission for sources without subscribe-time callbacks', () => {
    const signal = createSignal('alpha')
    const onChange = vi.fn()

    const unsubscribe = subscribeAfterInitial(signal, onChange)
    signal.set('beta')

    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('supports callback subscriptions and teardown', () => {
    let listener: (() => void) | undefined
    const teardown = vi.fn()
    const onChange = vi.fn()

    const unsubscribe = subscribeCallbackAfterInitial((nextListener) => {
      listener = nextListener
      return teardown
    }, onChange)

    listener?.()
    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(teardown).toHaveBeenCalledTimes(1)
  })

  it('suppresses callback subscriptions that emit during subscribe', () => {
    const onChange = vi.fn()

    const unsubscribe = subscribeCallbackAfterInitial((listener) => {
      listener()
      return vi.fn()
    }, onChange)

    expect(onChange).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('subscribeToSignalChanges', () => {
  it('suppresses the synchronous callback fired during subscribe', () => {
    const signal = createSignal('alpha', {emitOnSubscribe: true})
    const onChange = vi.fn()

    const unsubscribe = subscribeToSignalChanges(signal, onChange)

    expect(onChange).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('notifies only when the snapshot changes', () => {
    const signal = createSignal('alpha', {emitOnSubscribe: true})
    const onChange = vi.fn()

    const unsubscribe = subscribeToSignalChanges(signal, onChange)

    signal.emit()
    signal.set('beta')
    signal.emit()
    signal.set('beta')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('beta', 'alpha')
    unsubscribe()
  })

  it('does not suppress the first real emission for sources without subscribe-time callbacks', () => {
    const signal = createSignal('alpha')
    const onChange = vi.fn()

    const unsubscribe = subscribeToSignalChanges(signal, onChange)
    signal.set('beta')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('beta', 'alpha')
    unsubscribe()
  })

  it('uses a custom snapshot reader and comparator', () => {
    const signal = createSignal(' alpha ', {emitOnSubscribe: true})
    const onChange = vi.fn()

    const unsubscribe = subscribeToSignalChanges(signal, onChange, {
      readSnapshot: () => signal().trim(),
    })

    signal.set('alpha')
    signal.set(' beta ')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('beta', 'alpha')
    unsubscribe()
  })

  it('stops notifying after teardown', () => {
    const signal = createSignal('alpha')
    const onChange = vi.fn()

    const unsubscribe = subscribeToSignalChanges(signal, onChange)
    unsubscribe()
    signal.set('beta')

    expect(onChange).not.toHaveBeenCalled()
  })
})
