import {registerPassManagerComponents} from '../../features/passmanager/registration'
import {initI18n} from '../../i18n'
import {Router} from '../router/router'
import {ChromVoidActions} from '../../core/state/app-actions'
import {ChromVoidState} from '../../core/state/app-state'
import {CatalogService} from '../../core/catalog/catalog'
import {
  CatalogOTPSecretsGateway,
  CatalogPasswordsRepository,
  CatalogTransport,
  ManagerSaverAdapter,
} from '../../core/state/passmanager'
import type {TransportLike} from '../../core/transport/transport'
import {MockTransport} from '../../core/transport/mock/mock-transport'
import {TauriTransport} from '../../core/transport/tauri/tauri-transport'
import {isTauriRuntime} from '../../core/runtime/runtime'
import {androidSystemBackModel} from '../navigation/android-system-back.model'
import {initAppContext} from '../../shared/services/app-context'
import {biometricAppGateModel} from '../../routes/biometric-app-gate/biometric-app-gate.model'
import {Store} from '../state/store'
import type {FullChromVoidState} from '@chromvoid/scheme'
import {remoteSessionModel} from '../../routes/remote/remote-session.model'

import {removeLegacyUIFlagStorage} from './legacy-cleanup'
import {syncIOSViewportZoomPolicy} from './ios-viewport'
import {setupPinchZoomPrevention} from './pinch-zoom-prevention'
import {setupMobileKeyboardTapWorkaround} from './mobile-keyboard-tap'
import {setupMobileVisualViewportSync} from './mobile-visual-viewport'
import {setupMobileLifecycle} from './mobile-lifecycle'
import {setupCatalogSync} from './catalog-sync'
import {setupPassmanagerReload} from './passmanager-reload'
import {setupSshAgentHandler} from './ssh-agent-handler'
import {setupRuntimeCapabilitiesSync} from './runtime-capabilities-sync'
import {setupAndroidPasswordSaveHandoff} from './android-password-save-handoff'

export const init = () => {
  initI18n()

  const runtimeIsTauri = isTauriRuntime()

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

  initAppContext({store, ws, catalog, state})
  androidSystemBackModel.registerGlobalHandler()

  // Backward-compatible globals (used by some E2E tests and legacy code).
  window.ws = ws
  window.state = state
  window.store = store
  window.catalog = catalog
  window.actions = new ChromVoidActions(ws, state)
  window.router = new Router(ws, state, store)

  if (runtimeIsTauri) {
    void remoteSessionModel.connect()
  }
  biometricAppGateModel.connect()

  // --- passmanager ports ---
  const transport = new CatalogTransport(catalog)
  const repo = new CatalogPasswordsRepository(catalog, transport)
  const secrets = new CatalogOTPSecretsGateway(catalog, transport)
  const saver = new ManagerSaverAdapter(repo, secrets)

  // --- connect and setup subsystems ---
  ws.connect()

  setupRuntimeCapabilitiesSync(ws, store, runtimeIsTauri)
  if (runtimeIsTauri) setupMobileKeyboardTapWorkaround(store)
  setupMobileVisualViewportSync()
  setupPinchZoomPrevention()
  setupMobileLifecycle(ws, store)
  setupAndroidPasswordSaveHandoff()

  // --- ws event handlers ---
  ws.on('update:state', (_message, data) => {
    const next = data as Partial<FullChromVoidState>
    if (!next || typeof next !== 'object') return
    const prevOpened = state.data().StorageOpened
    state.update(next)
    const nowOpened = state.data().StorageOpened
    if (prevOpened !== nowOpened) {
      console.info('[debug][state] StorageOpened changed: %s -> %s', prevOpened, nowOpened)
    }
  })

  ws.on('vault:locked', (_message, payload) => {
    state.update({StorageOpened: false})
    let reason: string | undefined
    if (payload && typeof payload === 'object') {
      const r = (payload as Record<string, unknown>)['reason']
      if (typeof r === 'string') reason = r
    }
    store.handleVaultLocked(reason)
  })

  setupSshAgentHandler(ws)
  registerPassManagerComponents(saver)

  // --- catalog sync & passmanager reload ---
  setupCatalogSync(ws, state, store, catalog)
  setupPassmanagerReload(ws, store, catalog)
}
