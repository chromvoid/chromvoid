import type {ManagerRoot} from '@project/passmanager/core'

import type {Logger} from 'root/core/logger'
import {passmanagerNavigationController} from 'root/features/passmanager/passmanager-navigation.controller'
import {getPassmanagerRoot} from 'root/features/passmanager/models/pm-root.adapter'
import {getAppContext, tryGetAppContext} from 'root/shared/services/app-context'
import {subscribeCallbackAfterInitial} from 'root/shared/services/subscribed-signal'

import {
  DEFAULT_FILES_PATH,
  DEFAULT_OVERLAY,
  describeSnapshot,
  normalizeSnapshot,
  snapshotsEqual,
  shouldReplaceTransientPasswordsHistoryEntry,
} from './navigation-snapshot'
import type {HistoryMode, NavigationSnapshot, OverlayRoute, PassmanagerRoute} from './navigation.types'

type NavigationExternalSyncOptions = {
  logger: Logger
  getSnapshot: () => NavigationSnapshot
  applySnapshot: (snapshot: NavigationSnapshot, historyMode: HistoryMode) => void
  withSuppressedExternalSync: <T>(fn: () => T) => T
  isExternalSyncSuppressed: () => boolean
  incrementCatalogRevision: () => void
  subscribeOverlayEvaluation: (listener: () => void) => () => void
  subscribeDocumentEvaluation: (listener: () => void) => () => void
  syncInvalidOverlay: () => void
  syncInvalidDocument: () => void
}

export class NavigationExternalSync {
  private scheduledExternalSync = false
  private scheduledHistoryMode: Exclude<HistoryMode, 'none'> = 'push'
  private readonly unsubscribers: Array<() => void> = []

  constructor(private readonly options: NavigationExternalSyncOptions) {}

  attachPassmanager(root: ManagerRoot | undefined): void {
    const current = this.options.getSnapshot()
    this.options.withSuppressedExternalSync(() => {
      passmanagerNavigationController.attach(root)

      this.options.logger.debug('[NavigationModel] attachPassmanager', {
        hasRoot: Boolean(root),
        current: describeSnapshot(current),
      })

      if (current.surface === 'passwords' && root) {
        passmanagerNavigationController.applyRoute(current.passwords ?? {kind: 'root'})
      }
    })
  }

  detachPassmanager(): void {
    this.options.withSuppressedExternalSync(() => {
      passmanagerNavigationController.detach()
    })
  }

  subscribeToExternalState(): void {
    const ctx = tryGetAppContext()
    const catalogService = ctx?.catalog as {catalog?: {subscribe?: (listener: () => void) => (() => void) | void}} | undefined
    const catalog = catalogService?.catalog
    const schedule = (mode: Exclude<HistoryMode, 'none'> = 'push') => this.scheduleExternalSync(mode)

    if (catalog?.subscribe) {
      const unsubscribe = subscribeCallbackAfterInitial(
        (listener) => catalog.subscribe?.(listener) ?? (() => {}),
        () => {
          this.options.incrementCatalogRevision()
        },
      )
      if (typeof unsubscribe === 'function') {
        this.unsubscribers.push(unsubscribe)
      }
    }

    this.unsubscribers.push(
      subscribeCallbackAfterInitial(
        (listener) => passmanagerNavigationController.subscribe(listener),
        () => schedule('push'),
      ),
    )
    this.unsubscribers.push(
      subscribeCallbackAfterInitial(this.options.subscribeOverlayEvaluation, () => {
        this.options.syncInvalidOverlay()
      }),
    )
    this.unsubscribers.push(
      subscribeCallbackAfterInitial(this.options.subscribeDocumentEvaluation, () => {
        this.options.syncInvalidDocument()
      }),
    )
  }

  cleanupSubscriptions(): void {
    this.scheduledExternalSync = false
    this.scheduledHistoryMode = 'push'

    while (this.unsubscribers.length > 0) {
      const unsubscribe = this.unsubscribers.pop()
      try {
        unsubscribe?.()
      } catch {
        // best-effort cleanup
      }
    }
  }

  syncFromExternal(historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    if (this.options.isExternalSyncSuppressed()) {
      return
    }

    const current = this.options.getSnapshot()
    const next = this.readExternalSnapshot()
    this.options.logger.debug('[NavigationModel] syncFromExternal', {
      historyMode,
      current: describeSnapshot(current),
      next: describeSnapshot(next),
    })

    if (snapshotsEqual(next, current)) {
      return
    }

    const effectiveHistoryMode =
      historyMode === 'push' && shouldReplaceTransientPasswordsHistoryEntry(current, next)
        ? 'replace'
        : historyMode

    this.options.applySnapshot(next, effectiveHistoryMode)
  }

  scheduleExternalSync(mode: Exclude<HistoryMode, 'none'>): void {
    if (this.options.isExternalSyncSuppressed()) {
      return
    }

    if (mode === 'push') {
      this.scheduledHistoryMode = 'push'
    }

    if (this.scheduledExternalSync) {
      return
    }

    this.scheduledExternalSync = true
    queueMicrotask(() => {
      this.scheduledExternalSync = false
      const nextMode = this.scheduledHistoryMode
      this.scheduledHistoryMode = 'push'
      this.syncFromExternal(nextMode)
    })
  }

  readExternalSnapshot(): NavigationSnapshot {
    const current = this.options.getSnapshot()

    if (current.surface === 'passwords') {
      const route: PassmanagerRoute =
        getPassmanagerRoot() != null
          ? passmanagerNavigationController.readRoute()
          : current.passwords ?? {kind: 'root'}

      return normalizeSnapshot({
        surface: 'passwords',
        passwords: route,
        overlay: DEFAULT_OVERLAY,
      })
    }

    if (current.surface === 'files') {
      const path = this.readExternalFilesPath(current.files?.path || DEFAULT_FILES_PATH)
      const currentPath = current.files?.path || DEFAULT_FILES_PATH
      const document = path === currentPath ? current.files?.document : undefined

      return normalizeSnapshot({
        surface: 'files',
        files: {
          path,
          ...(document ? {document} : {}),
        },
        overlay: document ? DEFAULT_OVERLAY : this.readExternalFilesOverlay(current.overlay),
      })
    }

    return current
  }

  readExternalFilesPath(fallbackPath = DEFAULT_FILES_PATH): string {
    const ctx = tryGetAppContext()
    return ctx?.store.currentPath?.() || fallbackPath || DEFAULT_FILES_PATH
  }

  applySnapshotToExternal(snapshot: NavigationSnapshot): void {
    const {store} = getAppContext()
    this.options.logger.debug('[NavigationModel] applySnapshotToExternal', {
      snapshot: describeSnapshot(snapshot),
    })

    store.showRemoteStoragePage?.set(false)
    store.showGatewayPage?.set(false)
    store.showRemotePage?.set(false)
    store.showSettingsPage?.set(false)
    store.isShowPasswordManager?.set(false)
    store.detailsPanelFileId?.set(null)

    switch (snapshot.surface) {
      case 'files':
        store.currentPath?.set(snapshot.files?.path || DEFAULT_FILES_PATH)
        if (snapshot.overlay?.kind === 'details') {
          store.detailsPanelFileId?.set(snapshot.overlay.fileId)
        }
        break
      case 'passwords':
        store.isShowPasswordManager?.set(true)
        if (getPassmanagerRoot()) {
          passmanagerNavigationController.applyRoute(snapshot.passwords ?? {kind: 'root'})
        }
        break
      case 'settings':
        store.showSettingsPage?.set(true)
        break
      case 'passkeys':
        break
      case 'remote':
        store.showRemotePage?.set(true)
        break
      case 'gateway':
        store.showGatewayPage?.set(true)
        break
      case 'remote-storage':
        store.showRemoteStoragePage?.set(true)
        break
    }
  }

  private readExternalFilesOverlay(currentOverlay: OverlayRoute | undefined): OverlayRoute {
    if (currentOverlay?.kind === 'gallery' || currentOverlay?.kind === 'video') {
      return currentOverlay
    }

    const ctx = tryGetAppContext()
    const fileId = ctx?.store.detailsPanelFileId?.()
    if (typeof fileId === 'number' && Number.isFinite(fileId)) {
      return {kind: 'details', fileId}
    }

    return DEFAULT_OVERLAY
  }
}
