import {
  KEYBOARD_FALLBACK_SETTLE_MS,
  MIN_SCROLL_ADJUSTMENT_PX,
} from './constants'
import {
  getVisualViewportKeyboardInset,
  isLikelyVisualViewportKeyboardInset,
  readRootCssPx,
} from './geometry'
import {nowMs} from './text-field-targets'
import {
  ANDROID_KEYBOARD_INSETS_EVENT,
  ANDROID_NATIVE_KEYBOARD_INSETS_ATTR,
  IOS_KEYBOARD_INSETS_EVENT,
  IOS_NATIVE_KEYBOARD_INSETS_ATTR,
  MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
  NATIVE_KEYBOARD_INSETS_ATTR,
  type MobileKeyboardInsetsPhase,
  type MobileKeyboardInsetsSource,
  type MobileKeyboardViewportMode,
} from '../mobile-keyboard-insets'

export type MobileKeyboardStatus = 'closed' | 'opening' | 'open'
export type MobileKeyboardStateSource =
  | 'android-native'
  | 'ios-native'
  | 'tauri-visibility'
  | 'visual-viewport'
  | 'root'

export type MobileKeyboardStateSnapshot = {
  readonly status: MobileKeyboardStatus
  readonly source: MobileKeyboardStateSource
  readonly phase: MobileKeyboardInsetsPhase | null
  readonly viewportMode: MobileKeyboardViewportMode
  readonly bottomInset: number
  readonly since: number
}

export type MobileKeyboardStateController = {
  getState(): MobileKeyboardStateSnapshot
  refresh(reason: string): MobileKeyboardStateSnapshot
  subscribe(listener: (state: MobileKeyboardStateSnapshot) => void): () => void
  cleanup(): void
}

type WindowWithNativeKeyboardInsets = Window & {
  __chromvoidAndroidKeyboardInsets?: unknown
  __chromvoidIosKeyboardInsets?: unknown
}

type NormalizedKeyboardPayload = {
  readonly visible: boolean
  readonly bottomInset: number
  readonly phase: MobileKeyboardInsetsPhase
  readonly source: MobileKeyboardInsetsSource
  readonly viewportMode: MobileKeyboardViewportMode
}

const normalizeKeyboardPayload = (detail: unknown): NormalizedKeyboardPayload | null => {
  if (!detail || typeof detail !== 'object') return null

  const record = detail as Record<string, unknown>
  if (typeof record['visible'] !== 'boolean') return null

  const source =
    record['source'] === 'android-native' ||
    record['source'] === 'ios-native' ||
    record['source'] === 'tauri-visibility'
      ? record['source']
      : 'tauri-visibility'
  const phase = record['phase'] === 'progress' || record['phase'] === 'settled'
    ? record['phase']
    : 'settled'
  const viewportMode = record['viewportMode'] === 'native-resize' ? 'native-resize' : 'overlay'
  const bottomInset = typeof record['bottomInset'] === 'number' && Number.isFinite(record['bottomInset'])
    ? Math.max(0, Math.round(record['bottomInset']))
    : 0

  return {
    visible: record['visible'],
    bottomInset,
    phase,
    source,
    viewportMode,
  }
}

const snapshotFromPayload = (
  payload: NormalizedKeyboardPayload,
  previous: MobileKeyboardStateSnapshot | null,
): MobileKeyboardStateSnapshot => {
  const visible = payload.visible || payload.bottomInset > 0
  // 'progress' on an already open keyboard is an in-place resize (IME suggestion
  // bar toggling while typing), not a new open transition — stay 'open' so the
  // typing preserve protection does not drop out mid-episode.
  const status: MobileKeyboardStatus = !visible
    ? 'closed'
    : payload.phase === 'progress' && previous?.status !== 'open'
      ? 'opening'
      : 'open'
  return withStableSince(
    {
      status,
      source: payload.source,
      phase: payload.phase,
      viewportMode: payload.viewportMode,
      bottomInset: payload.bottomInset,
      since: nowMs(),
    },
    previous,
  )
}

const withStableSince = (
  next: MobileKeyboardStateSnapshot,
  previous: MobileKeyboardStateSnapshot | null,
): MobileKeyboardStateSnapshot => {
  // `since` tracks how long the current status has been held; inset/phase changes
  // within the same status (an open keyboard resizing) must not reset the episode clock.
  if (previous && previous.status === next.status) {
    return {...next, since: previous.since}
  }

  return next
}

const getRootKeyboardBottomInset = (): number =>
  Math.max(
    readRootCssPx('--mobile-keyboard-scroll-clearance'),
    readRootCssPx('--mobile-keyboard-overlay-offset'),
    readRootCssPx('--visual-viewport-bottom-inset'),
    readRootCssPx('--native-keyboard-bottom-inset'),
  )

const sourceFromRoot = (root: HTMLElement): MobileKeyboardStateSource => {
  if (root.hasAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)) return 'android-native'
  if (root.hasAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR)) return 'ios-native'
  if (root.hasAttribute(NATIVE_KEYBOARD_INSETS_ATTR)) return 'tauri-visibility'
  return 'root'
}

const snapshotFromRoot = (
  previous: MobileKeyboardStateSnapshot | null,
): MobileKeyboardStateSnapshot | null => {
  const root = document.documentElement
  const bottomInset = getRootKeyboardBottomInset()
  const visible = root.hasAttribute('data-mobile-keyboard-expanded') || bottomInset > 0
  if (!visible) return null

  const since = previous?.status === 'opening' || previous?.status === 'open' ? previous.since : nowMs()
  const elapsedMs = nowMs() - since
  return {
    status: elapsedMs >= KEYBOARD_FALLBACK_SETTLE_MS ? 'open' : 'opening',
    source: sourceFromRoot(root),
    phase: null,
    viewportMode: root.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR) ? 'native-resize' : 'overlay',
    bottomInset,
    since,
  }
}

const snapshotFromVisualViewport = (
  previous: MobileKeyboardStateSnapshot | null,
): MobileKeyboardStateSnapshot | null => {
  const viewport = window.visualViewport
  if (!viewport || viewport.scale !== 1) return null

  const bottomInset = getVisualViewportKeyboardInset()
  if (!isLikelyVisualViewportKeyboardInset(bottomInset)) return null

  const since =
    previous?.source === 'visual-viewport' && (previous.status === 'opening' || previous.status === 'open')
      ? previous.since
      : nowMs()
  const elapsedMs = nowMs() - since
  return {
    status: elapsedMs >= KEYBOARD_FALLBACK_SETTLE_MS ? 'open' : 'opening',
    source: 'visual-viewport',
    phase: null,
    viewportMode: 'overlay',
    bottomInset,
    since,
  }
}

const closedSnapshot = (previous: MobileKeyboardStateSnapshot | null): MobileKeyboardStateSnapshot =>
  withStableSince(
    {
      status: 'closed',
      source: previous?.source ?? 'root',
      phase: null,
      viewportMode: 'overlay',
      bottomInset: 0,
      since: nowMs(),
    },
    previous,
  )

const snapshotsEqual = (
  a: MobileKeyboardStateSnapshot,
  b: MobileKeyboardStateSnapshot,
): boolean =>
  a.status === b.status &&
  a.source === b.source &&
  a.phase === b.phase &&
  a.viewportMode === b.viewportMode &&
  Math.abs(a.bottomInset - b.bottomInset) <= MIN_SCROLL_ADJUSTMENT_PX &&
  Math.abs(a.since - b.since) <= MIN_SCROLL_ADJUSTMENT_PX

export const createMobileKeyboardStateController = (): MobileKeyboardStateController => {
  let latestPayload =
    normalizeKeyboardPayload((window as WindowWithNativeKeyboardInsets).__chromvoidAndroidKeyboardInsets) ??
    normalizeKeyboardPayload((window as WindowWithNativeKeyboardInsets).__chromvoidIosKeyboardInsets)
  let snapshot: MobileKeyboardStateSnapshot = closedSnapshot(null)
  const listeners = new Set<(state: MobileKeyboardStateSnapshot) => void>()

  const readSnapshot = (): MobileKeyboardStateSnapshot => {
    if (latestPayload) return snapshotFromPayload(latestPayload, snapshot)

    const rootSnapshot = snapshotFromRoot(snapshot)
    if (rootSnapshot) return rootSnapshot

    const viewportSnapshot = snapshotFromVisualViewport(snapshot)
    if (viewportSnapshot) return viewportSnapshot

    return closedSnapshot(snapshot)
  }

  const notify = () => {
    for (const listener of listeners) listener(snapshot)
  }

  const refresh = (_reason: string): MobileKeyboardStateSnapshot => {
    const next = readSnapshot()
    const changed = !snapshotsEqual(snapshot, next)
    snapshot = next
    if (changed) notify()
    return snapshot
  }

  const handleNativeEvent = (event: Event) => {
    if (event instanceof CustomEvent) {
      latestPayload = normalizeKeyboardPayload(event.detail)
    }
    refresh('native-event')
  }

  const rootObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          const rootLooksClosed =
            !document.documentElement.hasAttribute('data-mobile-keyboard-expanded') &&
            getRootKeyboardBottomInset() <= MIN_SCROLL_ADJUSTMENT_PX
          if (rootLooksClosed) {
            latestPayload = null
          }
          refresh('root-mutation')
        })

  window.addEventListener(ANDROID_KEYBOARD_INSETS_EVENT, handleNativeEvent)
  window.addEventListener(IOS_KEYBOARD_INSETS_EVENT, handleNativeEvent)
  rootObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      'style',
      'data-mobile-keyboard-expanded',
      NATIVE_KEYBOARD_INSETS_ATTR,
      ANDROID_NATIVE_KEYBOARD_INSETS_ATTR,
      IOS_NATIVE_KEYBOARD_INSETS_ATTR,
      MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
    ],
  })

  refresh('init')

  return {
    getState: () => snapshot,
    refresh,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    cleanup() {
      listeners.clear()
      rootObserver?.disconnect()
      window.removeEventListener(ANDROID_KEYBOARD_INSETS_EVENT, handleNativeEvent)
      window.removeEventListener(IOS_KEYBOARD_INSETS_EVENT, handleNativeEvent)
    },
  }
}
