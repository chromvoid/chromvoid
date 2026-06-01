export type Unsubscribe = () => void

export type SubscribeCallback = (listener: () => void) => Unsubscribe

export type SubscribedSignal<T> = (() => T) & {
  subscribe?: SubscribeCallback
}

export type SubscribeToSignalChangesOptions<TSnapshot> = {
  readSnapshot?: () => TSnapshot
  isEqual?: (prev: TSnapshot, next: TSnapshot) => boolean
}

const noop: Unsubscribe = () => {}

export function subscribeCallbackAfterInitial(
  subscribe: SubscribeCallback | undefined,
  listener: () => void,
): Unsubscribe {
  if (typeof subscribe !== 'function') {
    return noop
  }

  let isSubscribing = true
  const unsubscribe = subscribe(() => {
    if (isSubscribing) return
    listener()
  })
  isSubscribing = false

  return unsubscribe
}

export function subscribeAfterInitial<TValue>(
  signal: SubscribedSignal<TValue> | undefined,
  listener: () => void,
): Unsubscribe {
  if (!signal || typeof signal.subscribe !== 'function') {
    return noop
  }

  return subscribeCallbackAfterInitial((callback) => signal.subscribe?.(callback) ?? noop, listener)
}

export function subscribeToSignalChanges<TValue, TSnapshot = TValue>(
  signal: SubscribedSignal<TValue> | undefined,
  onChange: (next: TSnapshot, prev: TSnapshot) => void,
  options: SubscribeToSignalChangesOptions<TSnapshot> = {},
): Unsubscribe {
  if (!signal || typeof signal.subscribe !== 'function') {
    return noop
  }

  const readSnapshot = options.readSnapshot ?? (() => signal() as unknown as TSnapshot)
  const isEqual = options.isEqual ?? Object.is

  let previous = readSnapshot()
  let isSubscribing = true

  const unsubscribe = signal.subscribe(() => {
    const next = readSnapshot()

    if (isSubscribing) {
      previous = next
      return
    }

    if (isEqual(previous, next)) {
      return
    }

    const current = previous
    previous = next
    onChange(next, current)
  })

  isSubscribing = false
  return unsubscribe
}
