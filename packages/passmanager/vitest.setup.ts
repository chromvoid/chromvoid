// Provide minimal localStorage polyfill for modules that access it at load time
// (e.g. i18n.ts reads globalThis.localStorage?.getItem)
// Node.js v22+ has experimental localStorage but it may be broken without --localstorage-file,
// so we always override with a working in-memory implementation.
{
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
}

// Provide minimal document.body for notify module (appendChild)
if (typeof document === 'undefined') {
  const noop = () => {}
  ;(globalThis as unknown as {document: unknown}).document = {
    body: {appendChild: noop, removeChild: noop},
    createElement: () => ({
      click: noop,
      set href(_v: string) {},
      set download(_v: string) {},
      set value(_v: string) {},
      style: {},
      select: noop,
      remove: noop,
    }),
    execCommand: noop,
  }
}

// Provide matchMedia stub for notify module
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () =>
    ({matches: false, addEventListener: () => {}, removeEventListener: () => {}}) as unknown as MediaQueryList
}
