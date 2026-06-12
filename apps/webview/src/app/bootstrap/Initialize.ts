import {initI18n} from '../../i18n'
import {Router} from '../router/router'
import {ChromVoidState} from '../../core/state/app-state'
import {CatalogService} from '../../core/catalog/catalog'
import {
  CatalogOTPSecretsGateway,
  CatalogPasswordsRepository,
  ManagerSaverAdapter,
  PassmanagerTransport,
} from '../../core/state/passmanager'
import type {TransportLike} from '../../core/transport/transport'
import {MockTransport} from '../../core/transport/mock/mock-transport'
import {TauriTransport} from '../../core/transport/tauri/tauri-transport'
import {isTauriRuntime} from '../../core/runtime/runtime'
import {androidSystemBackModel} from '../navigation/android-system-back.model'
import {readInitialSurface} from '../navigation/initial-surface'
import {initAppContext, tryGetAppContext} from '../../shared/services/app-context'
import {biometricAppGateModel} from '../../routes/biometric-app-gate/biometric-app-gate.model'
import {purgePreparedFileSources} from '../../features/media/components/file-loader'
import {setupMediaStreamErrorDispatch} from '../../features/media/models/media-stream-owner-registry'
import {
  handleMediaCatalogEvent,
  releaseMediaSourcesForVaultLock,
} from '../../features/media/models/media-lifecycle'
import {mediaPlaybackModel} from '../../features/media/models/media-playback.model'
import {Store} from '../state/store'
import type {FullChromVoidState} from '@chromvoid/scheme'

import {configureSurfaceComponentLoader, ensureDashboardSurfaceComponents} from './surface-component-loader'
import {removeLegacyUIFlagStorage} from './legacy-cleanup'
import {syncIOSViewportZoomPolicy} from './ios-viewport'
import {scheduleAfterFirstPaintIdle} from './idle-scheduler'
import {startUiComponentIdleWarmup} from './ui-component-idle-warmup'

function formatBootstrapFatalError(scope: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `${scope} bootstrap failed: ${message}`
}

export const init = () => {
  if (tryGetAppContext() !== null) return

  initI18n()

  const runtimeIsTauri = isTauriRuntime()
  const initialSurface = readInitialSurface()
  const deferNonCriticalStartup = initialSurface === 'passwords'

  removeLegacyUIFlagStorage()
  syncIOSViewportZoomPolicy(runtimeIsTauri)

  {
    const href = typeof location !== 'undefined' ? location.href : undefined
    const hasGlobalTauri = typeof (globalThis as unknown as {__TAURI__?: unknown}).__TAURI__ === 'object'
    const hasTauriInternals =
      typeof (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ === 'object'
    console.info('[dashboard] init()', {
      href,
      transport: runtimeIsTauri ? 'tauri' : 'mock',
      hasGlobalTauri,
      hasTauriInternals,
    })
  }

  // --- core wiring ---
  const state = new ChromVoidState()
  const ws: TransportLike = runtimeIsTauri ? new TauriTransport() : new MockTransport()
  const catalog = new CatalogService(ws)
  const store = new Store(ws, state, catalog)
  const router = new Router(ws, state, store)

  initAppContext({store, ws, catalog, state, router})
  androidSystemBackModel.registerGlobalHandler()

  // --- passmanager ports ---
  const transport = new PassmanagerTransport(catalog)
  const repo = new CatalogPasswordsRepository(catalog, transport)
  const secrets = new CatalogOTPSecretsGateway(catalog, transport)
  const saver = new ManagerSaverAdapter(repo, secrets)
  configureSurfaceComponentLoader({managerSaver: saver})
  startUiComponentIdleWarmup()

  if (initialSurface === 'passwords') {
    void ensureDashboardSurfaceComponents('passwords').catch((error) => {
      console.warn('[dashboard] failed to preload passwords surface:', error)
    })
  }

  if (runtimeIsTauri) {
    const connectRemoteSession = () => {
      void import('../../routes/remote/remote-session.model')
        .then(({remoteSessionModel}) => remoteSessionModel.connect())
        .catch((error) => {
          console.warn('[dashboard] remote session bootstrap failed:', error)
        })
    }

    if (deferNonCriticalStartup) {
      scheduleAfterFirstPaintIdle(connectRemoteSession)
    } else {
      connectRemoteSession()
    }
  }

  biometricAppGateModel.connect()

  // --- ws event handlers ---
  ws.on('update:state', (_message, data) => {
    const next = data as Partial<FullChromVoidState>
    if (!next || typeof next !== 'object') return
    const prevOpened = state.data().StorageOpened
    state.update(next)
    const nowOpened = state.data().StorageOpened
    if (prevOpened !== nowOpened) {
      console.info('[debug][state] StorageOpened changed: %s -> %s', prevOpened, nowOpened)
      if (prevOpened && !nowOpened) {
        void releaseMediaSourcesForVaultLock().catch((error) => {
          console.warn('[dashboard][media] vault close release failed', error)
        })
      }
    }
  })

  ws.on('catalog:event', (_message, payload) => {
    handleMediaCatalogEvent(payload)
  })

  ws.on('vault:locked', (_message, payload) => {
    const wasOpened = state.data().StorageOpened
    state.update({StorageOpened: false})
    let reason: string | undefined
    if (payload && typeof payload === 'object') {
      const r = (payload as Record<string, unknown>)['reason']
      if (typeof r === 'string') reason = r
    }
    void purgePreparedFileSources('vault-lock').catch((error) => {
      console.warn('[dashboard][preview-cache] vault lock purge failed', error)
    })
    void releaseMediaSourcesForVaultLock().catch((error) => {
      console.warn('[dashboard][media] vault lock release failed', error)
    })
    if (wasOpened && reason !== 'manual') {
      store.handleVaultLocked({reason, source: 'system'})
    }
  })
  setupMediaStreamErrorDispatch(ws)
  ws.on('android-audio-player:event', (_message, payload) => {
    mediaPlaybackModel.handleAndroidAudioPlayerEvent(payload)
  })
  ws.on('native-audio-player:event', (_message, payload) => {
    mediaPlaybackModel.handleNativeAudioPlayerEvent(payload)
  })

  // --- connect and setup subsystems ---
  ws.connect()

  const startRuntimeBootstrap = () => {
    void Promise.all([
      import('./runtime-capabilities-sync'),
      import('./mobile-visual-viewport'),
      import('./mobile-keyboard-focus-scroll'),
      import('./pinch-zoom-prevention'),
      import('./mobile-lifecycle'),
      import('./android-password-save-handoff'),
      import('./android-share-files-handoff'),
      import('./android-media-session'),
      import('./android-audio-warmup'),
    ])
      .then(
        ([
          {setupRuntimeCapabilitiesSync},
          {setupMobileVisualViewportSync},
          {setupMobileKeyboardFocusScroll},
          {setupPinchZoomPrevention},
          {setupMobileLifecycle},
          {setupAndroidPasswordSaveHandoff},
          {setupAndroidShareFilesHandoff},
          {setupAndroidMediaSessionBridge},
          {setupAndroidAudioWarmup},
        ]) => {
          setupRuntimeCapabilitiesSync(ws, store, runtimeIsTauri)
          setupMobileVisualViewportSync()
          setupMobileKeyboardFocusScroll(store)
          setupPinchZoomPrevention()
          setupMobileLifecycle(ws, store)
          setupAndroidPasswordSaveHandoff()
          setupAndroidShareFilesHandoff()
          setupAndroidMediaSessionBridge(ws)
          setupAndroidAudioWarmup(ws)

          if (runtimeIsTauri) {
            void import('./mobile-keyboard-tap')
              .then(({setupMobileKeyboardTapWorkaround}) => {
                setupMobileKeyboardTapWorkaround(store)
              })
              .catch((error) => {
                console.warn('[dashboard] mobile keyboard bootstrap failed:', error)
              })
          }
        },
      )
      .catch((error) => {
        console.warn('[dashboard] runtime bootstrap failed:', error)
        store.markBootstrapFatalError(formatBootstrapFatalError('Runtime', error))
      })
  }

  const startDeferredDataWork = () => {
    void Promise.all([
      import('./catalog-sync'),
      import('./passmanager-reload'),
      import('./ssh-agent-handler'),
    ])
      .then(([{setupCatalogSync}, {setupPassmanagerReload}, {setupSshAgentHandler}]) => {
        setupCatalogSync(ws, state, store, catalog)
        setupPassmanagerReload(ws, store, repo)
        setupSshAgentHandler(ws)
      })
      .catch((error) => {
        console.warn('[dashboard] deferred data bootstrap failed:', error)
        store.markBootstrapFatalError(formatBootstrapFatalError('Data', error))
      })
  }

  if (deferNonCriticalStartup) {
    scheduleAfterFirstPaintIdle(startRuntimeBootstrap)
    scheduleAfterFirstPaintIdle(startDeferredDataWork)
  } else {
    startRuntimeBootstrap()
    startDeferredDataWork()
  }
}
