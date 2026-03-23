// jsdom globals or polyfills if needed
// Упрощённый setup для unit-тестов web components
import {beforeAll} from 'vitest'

// Мок localStorage для jsdom (требуется для @statx/persist)
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(globalThis, 'localStorage', {value: localStorageMock})

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

if (typeof globalThis.ResizeObserver !== 'function') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  })
}

const originalAttachInternals = (HTMLElement.prototype as any).attachInternals as
  | ((...args: unknown[]) => any)
  | undefined

Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
  configurable: true,
  value: function (...args: unknown[]) {
    const internals = originalAttachInternals
      ? originalAttachInternals.apply(this, args) ?? {}
      : {}

    if (typeof internals.setFormValue !== 'function') internals.setFormValue = () => {}
    if (typeof internals.setValidity !== 'function') internals.setValidity = () => {}
    if (typeof internals.checkValidity !== 'function') internals.checkValidity = () => true
    if (typeof internals.reportValidity !== 'function') internals.reportValidity = () => true
    if (!('form' in internals)) internals.form = null
    if (!('labels' in internals)) internals.labels = []
    if (!('validity' in internals)) internals.validity = {}
    if (!('validationMessage' in internals)) internals.validationMessage = ''
    if (!('willValidate' in internals)) internals.willValidate = false
    if (!('states' in internals)) internals.states = new Set<string>()

    return internals
  },
})

// jsdom уже есть в среде vitest browser, но установим базовый контейнер
beforeAll(() => {
  // Создаём корневой контейнер для рендеров
  const root = document.createElement('div')
  root.id = 'test-root'
  document.body.appendChild(root)
})
