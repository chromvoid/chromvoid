/**
 * Unit-тесты для AppContext
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {
  type AppContext,
  clearAppContext,
  createMockAppContext,
  getAppContext,
  getCatalog,
  getDeviceState,
  getStore,
  getWebSocket,
  initAppContext,
  tryGetAppContext,
} from '../../src/shared/services/app-context.js'

describe('AppContext', () => {
  afterEach(() => {
    clearAppContext()
  })

  describe('initAppContext()', () => {
    it('initializes context', () => {
      const mockContext = createMockAppContext()
      initAppContext(mockContext)

      expect(tryGetAppContext()).toBe(mockContext)
    })

    it('warns when reinitializing', () => {
      const mockContext1 = createMockAppContext()
      const mockContext2 = createMockAppContext()

      initAppContext(mockContext1)
      initAppContext(mockContext2)

      expect(tryGetAppContext()).toBe(mockContext2)
    })
  })

  describe('getAppContext()', () => {
    it('returns context when initialized', () => {
      const mockContext = createMockAppContext()
      initAppContext(mockContext)

      expect(getAppContext()).toBe(mockContext)
    })

    it('throws when not initialized', () => {
      expect(() => getAppContext()).toThrow('AppContext not initialized')
    })
  })

  describe('tryGetAppContext()', () => {
    it('returns null when not initialized', () => {
      expect(tryGetAppContext()).toBeNull()
    })

    it('returns context when initialized', () => {
      const mockContext = createMockAppContext()
      initAppContext(mockContext)

      expect(tryGetAppContext()).toBe(mockContext)
    })
  })

  describe('clearAppContext()', () => {
    it('clears initialized context', () => {
      const mockContext = createMockAppContext()
      initAppContext(mockContext)

      clearAppContext()

      expect(tryGetAppContext()).toBeNull()
    })
  })

  describe('helper functions', () => {
    let mockContext: AppContext

    beforeEach(() => {
      mockContext = createMockAppContext()
      initAppContext(mockContext)
    })

    it('getStore() returns store', () => {
      expect(getStore()).toBe(mockContext.store)
    })

    it('getWebSocket() returns ws', () => {
      expect(getWebSocket()).toBe(mockContext.ws)
    })

    it('getCatalog() returns catalog', () => {
      expect(getCatalog()).toBe(mockContext.catalog)
    })

    it('getDeviceState() returns state', () => {
      expect(getDeviceState()).toBe(mockContext.state)
    })
  })

  describe('createMockAppContext()', () => {
    it('creates mock context with defaults', () => {
      const mock = createMockAppContext()

      expect(mock.store).toBeDefined()
      expect(mock.ws).toBeDefined()
      expect(mock.catalog).toBeDefined()
      expect(mock.state).toBeDefined()
    })

    it('accepts overrides', () => {
      const customStore = {customField: 'test'} as unknown as AppContext['store']
      const mock = createMockAppContext({store: customStore})

      expect(mock.store).toBe(customStore)
    })
  })
})
