/**AppContext is a DI container to replace global windows. *
*
* Provides centralized access to application services
* without using global variables.
*
* Use of:
* - import {getAppContext} from './shared/services/app-context.js'
* - const {store, catalog, ws} = getAppContext()
*
* Advantages:
- Explicit dependencies
- Easy to wet in tests
- No global state.
*/
import type {ChromVoidState} from '../../core/state/app-state.js'
import type {CatalogService} from '../../core/catalog/catalog.js'
import type {TransportLike} from '../../core/transport/transport.js'
import {atom} from '@reatom/core'
import type {Router, Routes} from '../../app/router/router.js'
import type {Store} from '../../app/state/store.js'

/*** Application context interface
 */
export interface AppContext {
  /**UI Global Storage*/
  store: Store
  /** Transport (WebSocket in browser, IPC in Tauri) */
  ws: TransportLike
  /**Directory service (legacy)*/
  catalog: CatalogService
  /**Status of device*/
  state: ChromVoidState
  /** Application router */
  router: Router
}

type AppContextInit = AppContext | Partial<AppContext>

function isCompleteAppContext(context: AppContextInit): context is AppContext {
  return Boolean(context.store && context.ws && context.catalog && context.state && context.router)
}

/*** Internal context storage
 */
let _context: AppContext | null = null

/*** Initialize the context of the application
 */
export function initAppContext(context: AppContextInit): void {
  if (_context !== null) {
    console.warn('AppContext already initialized, overwriting...')
  }
  _context = isCompleteAppContext(context) ? context : createMockAppContext(context)
}

/*** Get the context of the application
 * @throws Error if the context is not initialized
 */
export function getAppContext(): AppContext {
  if (_context === null) {
    throw new Error('AppContext not initialized. Call initAppContext() first.')
  }
  return _context
}

/**Get context or null (for optional dependencies)
 */
export function tryGetAppContext(): AppContext | null {
  return _context
}

/**Clear the context (for tests)
 */
export function clearAppContext(): void {
  _context = null
}

/**Helper for easy access to the stor
 */
export function getStore(): Store {
  return getAppContext().store
}

/**Helper for easy access to WebSocket
 */
export function getWebSocket(): TransportLike {
  return getAppContext().ws
}

/**Helper for easy access to the catalog
 */
export function getCatalog(): CatalogService {
  return getAppContext().catalog
}

/**Helper for easy access to the state
 */
export function getDeviceState(): ChromVoidState {
  return getAppContext().state
}

/**Helper for easy access to router
 */
export function getRouter(): Router {
  return getAppContext().router
}

/**Create a mock context for tests
 */
export function createMockAppContext(overrides?: Partial<AppContext>): AppContext {
  const mockNotifications = {
    pushNotification: () => {},
  }
  const route = atom<Routes>('dashboard')
  const isLoading = atom(false)

  return {
    store: {
      pushNotification: mockNotifications.pushNotification,
      ...overrides?.store,
    } as unknown as Store,
    ws: {
      connected: () => false,
      connecting: () => false,
      ...overrides?.ws,
    } as unknown as TransportLike,
    catalog: {
      syncing: () => false,
      lastError: () => null,
      ...overrides?.catalog,
    } as unknown as CatalogService,
    state: {
      data: () => null,
      ...overrides?.state,
    } as unknown as ChromVoidState,
    router: {
      route,
      isLoading,
    } satisfies Pick<Router, 'route' | 'isLoading'> as Router,
    ...overrides,
  }
}
