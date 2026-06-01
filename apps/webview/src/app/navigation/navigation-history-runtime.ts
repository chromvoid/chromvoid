import type {Logger} from 'root/core/logger'

import {decodeNavigationSnapshotFromUrl, encodeNavigationSnapshotToUrl} from './navigation-url-codec'
import {
  DEFAULT_SNAPSHOT,
  describeSnapshot,
  normalizeSnapshot,
  snapshotsEqual,
} from './navigation-snapshot'
import type {HistoryMode, NavigationIntentKind, NavigationSnapshot} from './navigation.types'

type HistoryState = {
  __chromvoidNavIndex: number
  __chromvoidNavGeneration: number
}

type PendingHistoryRestore = {
  index: number
  url: string
}

type NavigationHistoryRuntimeOptions = {
  logger: Logger
  getSnapshot: () => NavigationSnapshot
  applySnapshot: (
    snapshot: NavigationSnapshot,
    historyMode: HistoryMode,
    intentKind?: NavigationIntentKind,
    resumeEffect?: () => void,
  ) => boolean
  consumeCurrentSurfaceBack: () => boolean
}

function historyIndexFromState(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0
  }

  const raw = (value as Partial<HistoryState>).__chromvoidNavIndex
  return Number.isFinite(raw) ? (raw as number) : 0
}

function historyGenerationFromState(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0
  }

  const raw = (value as Partial<HistoryState>).__chromvoidNavGeneration
  return Number.isFinite(raw) ? (raw as number) : 0
}

export class NavigationHistoryRuntime {
  private historyIndex = 0
  private historyGeneration = 0
  private pendingHistoryRestore: PendingHistoryRestore | null = null
  private readonly historySnapshots = new Map<number, NavigationSnapshot>()

  constructor(private readonly options: NavigationHistoryRuntimeOptions) {}

  initializeFromWindow(): void {
    if (typeof window === 'undefined') {
      return
    }

    this.pendingHistoryRestore = null
    this.historySnapshots.clear()
    this.historyIndex = historyIndexFromState(window.history.state)
    this.historyGeneration = historyGenerationFromState(window.history.state)
  }

  clearSession(): void {
    this.pendingHistoryRestore = null
    this.historySnapshots.clear()
  }

  resetToSnapshot(snapshot: NavigationSnapshot): void {
    this.historyGeneration += 1
    this.historyIndex = 0
    this.pendingHistoryRestore = null
    this.historySnapshots.clear()
    this.options.applySnapshot(snapshot, 'replace')
  }

  hasBrowserHistoryEntry(): boolean {
    return typeof window !== 'undefined' && this.historyIndex > 0
  }

  back(): void {
    if (typeof window === 'undefined') {
      return
    }

    window.history.back()
  }

  getPreviousSnapshot(): NavigationSnapshot | null {
    return this.historyIndex > 0 ? this.historySnapshots.get(this.historyIndex - 1) ?? null : null
  }

  syncHistory(next: NavigationSnapshot, previous: NavigationSnapshot, historyMode: HistoryMode): void {
    if (typeof window === 'undefined' || historyMode === 'none') {
      return
    }

    const nextUrl = encodeNavigationSnapshotToUrl(next, window.location.href)
    const prevUrl = encodeNavigationSnapshotToUrl(previous, window.location.href)
    const changed = !snapshotsEqual(next, previous) || nextUrl !== prevUrl

    if (!changed && historyMode === 'push') {
      return
    }

    if (historyMode === 'replace') {
      window.history.replaceState(this.buildHistoryState(this.historyIndex), '', nextUrl)
      this.recordHistorySnapshot(this.historyIndex, next)
      return
    }

    this.historyIndex += 1
    window.history.pushState(this.buildHistoryState(this.historyIndex), '', nextUrl)
    this.pruneHistorySnapshotsAfter(this.historyIndex)
    this.recordHistorySnapshot(this.historyIndex, next)
  }

  readonly handlePopState = (event: PopStateEvent) => {
    const stateGeneration = historyGenerationFromState(event.state)
    if (stateGeneration !== this.historyGeneration) {
      this.restoreCurrentHistoryEntry()
      return
    }

    const targetIndex = historyIndexFromState(event.state)
    const pendingRestore = this.pendingHistoryRestore
    if (pendingRestore) {
      this.pendingHistoryRestore = null
      if (targetIndex === pendingRestore.index && window.location.href === pendingRestore.url) {
        this.historyIndex = targetIndex
        this.options.logger.debug('[NavigationModel] handlePopState restored current entry', {
          href: window.location.href,
          state: event.state,
          restoredIndex: targetIndex,
        })
        return
      }
    }

    const currentSurface = this.options.getSnapshot().surface
    if (this.options.consumeCurrentSurfaceBack()) {
      const delta = this.historyIndex - targetIndex
      if (delta !== 0) {
        this.pendingHistoryRestore = {
          index: this.historyIndex,
          url: encodeNavigationSnapshotToUrl(this.options.getSnapshot(), window.location.href),
        }
        window.history.go(delta)
        this.options.logger.debug('[NavigationModel] handlePopState consumed by surface handler', {
          href: window.location.href,
          state: event.state,
          surface: currentSurface,
          restoreDelta: delta,
        })
        return
      }

      this.options.logger.debug('[NavigationModel] handlePopState consumed by surface handler without traversal', {
        href: window.location.href,
        state: event.state,
        surface: currentSurface,
      })
      return
    }

    const decoded = decodeNavigationSnapshotFromUrl(window.location.href) ?? DEFAULT_SNAPSHOT
    this.options.logger.debug('[NavigationModel] handlePopState', {
      href: window.location.href,
      state: event.state,
      decoded: describeSnapshot(decoded),
    })
    const applied = this.options.applySnapshot(decoded, 'none', 'history-pop', () => {
      this.resumeBlockedPopState(targetIndex, decoded)
    })
    if (!applied) {
      this.restoreTraversedHistoryEntry(targetIndex, '[NavigationModel] handlePopState blocked by navigation blocker')
      return
    }

    this.historyIndex = targetIndex
    this.recordHistorySnapshot(this.historyIndex, this.options.getSnapshot())
  }

  private resumeBlockedPopState(targetIndex: number, decoded: NavigationSnapshot): void {
    if (typeof window === 'undefined') {
      return
    }

    const delta = targetIndex - this.historyIndex
    if (delta !== 0) {
      window.history.go(delta)
      return
    }

    this.options.applySnapshot(decoded, 'none', 'history-pop')
  }

  private restoreTraversedHistoryEntry(targetIndex: number, message: string): void {
    if (typeof window === 'undefined') {
      return
    }

    const delta = this.historyIndex - targetIndex
    if (delta === 0) {
      this.restoreCurrentHistoryEntry()
      return
    }

    this.pendingHistoryRestore = {
      index: this.historyIndex,
      url: encodeNavigationSnapshotToUrl(this.options.getSnapshot(), window.location.href),
    }
    window.history.go(delta)
    this.options.logger.debug(message, {
      href: window.location.href,
      restoreDelta: delta,
    })
  }

  private restoreCurrentHistoryEntry(): void {
    if (typeof window === 'undefined') {
      return
    }

    const url = encodeNavigationSnapshotToUrl(this.options.getSnapshot(), window.location.href)
    window.history.replaceState(this.buildHistoryState(this.historyIndex), '', url)
  }

  private buildHistoryState(index: number): HistoryState {
    return {
      __chromvoidNavIndex: index,
      __chromvoidNavGeneration: this.historyGeneration,
    }
  }

  private recordHistorySnapshot(index: number, snapshot: NavigationSnapshot): void {
    this.historySnapshots.set(index, normalizeSnapshot(snapshot))
  }

  private pruneHistorySnapshotsAfter(index: number): void {
    for (const key of this.historySnapshots.keys()) {
      if (key > index) {
        this.historySnapshots.delete(key)
      }
    }
  }
}
