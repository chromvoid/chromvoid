// jsdom globals or polyfills if needed
// Simplified setup for unit tests of web components
import {beforeAll} from 'vitest'

// Mock localStorage for jsdom (required for Reatom persist adapters)
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

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: localStorageMock,
})

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: localStorageMock,
  })
}

const {CVButton} = await import('@chromvoid/uikit/components/cv-button')

CVButton.define()

const {getPassmanagerRoot, setPassmanagerRoot} =
  await import('../../src/features/passmanager/models/pm-root.adapter')

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'passmanager', {
    configurable: true,
    get() {
      return getPassmanagerRoot()
    },
    set(value) {
      setPassmanagerRoot(value as never)
    },
  })
}

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

if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value() {},
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value() {},
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: () => Promise.resolve(),
  })
}

const originalAttachInternals = (HTMLElement.prototype as any).attachInternals as
  | ((...args: unknown[]) => any)
  | undefined

Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
  configurable: true,
  value: function (...args: unknown[]) {
    const internals = originalAttachInternals ? (originalAttachInternals.apply(this, args) ?? {}) : {}

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

// jsdom is already in the vitest browser, but install the base container
beforeAll(() => {
  // Create a root container for renderers
  const root = document.createElement('div')
  root.id = 'test-root'
  document.body.appendChild(root)
})
