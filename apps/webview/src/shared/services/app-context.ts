/**
 * AppContext — DI-контейнер для замены глобальных window.*
 *
 * Предоставляет централизованный доступ к сервисам приложения
 * без использования глобальных переменных.
 *
 * Использование:
 * - import {getAppContext} from './shared/services/app-context.js'
 * - const {store, catalog, ws} = getAppContext()
 *
 * Преимущества:
 * - Явные зависимости
 * - Легко мокать в тестах
 * - Нет глобального состояния
 */
import type {ChromVoidState} from '../../core/state/app-state.js'
import type {CatalogFacade} from '../../core/catalog/catalog-facade.js'
import type {CatalogService} from '../../core/catalog/catalog.js'
import type {TransportLike} from '../../core/transport/transport.js'
import type {Store} from '../../app/state/store.js'

/**
 * Интерфейс контекста приложения
 */
export interface AppContext {
  /** Глобальный стор UI */
  store: Store
  /** Transport (WebSocket in browser, IPC in Tauri) */
  ws: TransportLike
  /** Сервис каталога (legacy) */
  catalog: CatalogService
  /** Состояние устройства */
  state: ChromVoidState
  /** Фасад каталога (новый API) */
  catalogFacade?: CatalogFacade
}

/**
 * Внутреннее хранилище контекста
 */
let _context: AppContext | null = null

/**
 * Инициализировать контекст приложения
 */
export function initAppContext(context: AppContext): void {
  if (_context !== null) {
    console.warn('AppContext already initialized, overwriting...')
  }
  _context = context

  // Экспортируем getAppContext в window для E2E-тестов
  // Это позволяет Playwright получать доступ к контексту через page.evaluate
  if (typeof window !== 'undefined') {
    ;(window as unknown as {getAppContext: typeof getAppContext}).getAppContext = getAppContext
  }
}

/**
 * Получить контекст приложения
 * @throws Error если контекст не инициализирован
 */
export function getAppContext(): AppContext {
  if (_context === null) {
    throw new Error('AppContext not initialized. Call initAppContext() first.')
  }
  return _context
}

/**
 * Получить контекст или null (для опциональных зависимостей)
 */
export function tryGetAppContext(): AppContext | null {
  return _context
}

/**
 * Очистить контекст (для тестов)
 */
export function clearAppContext(): void {
  _context = null
}

/**
 * Хелпер для удобного доступа к стору
 */
export function getStore(): Store {
  return getAppContext().store
}

/**
 * Хелпер для удобного доступа к WebSocket
 */
export function getWebSocket(): TransportLike {
  return getAppContext().ws
}

/**
 * Хелпер для удобного доступа к каталогу
 */
export function getCatalog(): CatalogService {
  return getAppContext().catalog
}

/**
 * Хелпер для удобного доступа к состоянию
 */
export function getDeviceState(): ChromVoidState {
  return getAppContext().state
}

/**
 * Создать mock-контекст для тестов
 */
export function createMockAppContext(overrides?: Partial<AppContext>): AppContext {
  const mockNotifications = {
    pushNotification: () => {},
  }

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
    ...overrides,
  }
}
