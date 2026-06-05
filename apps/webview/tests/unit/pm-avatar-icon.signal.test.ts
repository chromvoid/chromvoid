import {describe, expect, it, vi} from 'vitest'

import {Group, ManagerRoot} from '@project/passmanager'
import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'
import {PMAvatarIcon} from '../../src/features/passmanager/components/pm-avatar-icon'
import {PMAvatarIconModel} from '../../src/features/passmanager/components/pm-avatar-icon.model'

function createElement() {
  PMAvatarIcon.define()
  return document.createElement(PMAvatarIcon.elementName) as PMAvatarIcon
}

async function settle(element: PMAvatarIcon) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return {promise, resolve, reject}
}

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
}

function createManagerRoot() {
  return new ManagerRoot({
    save: async () => true,
    read: async () => undefined,
    remove: async () => true,
    getOTP: async () => undefined,
    getOTPSeckey: async () => undefined,
    removeOTP: async () => true,
    saveOTP: async () => true,
    readEntryPassword: async () => undefined,
    readEntryNote: async () => undefined,
    saveEntryPassword: async () => true,
    saveEntryNote: async () => true,
    removeEntryPassword: async () => true,
    removeEntryNote: async () => true,
    saveEntryMeta: async () => true,
    removeEntry: async () => true,
    readEntrySshPrivateKey: async () => undefined,
    readEntrySshPublicKey: async () => undefined,
    saveEntrySshPrivateKey: async () => true,
    saveEntrySshPublicKey: async () => true,
    removeEntrySshPrivateKey: async () => true,
    removeEntrySshPublicKey: async () => true,
  } as any)
}

function createIconRefSource(initial: string) {
  let value = initial
  const listeners = new Set<() => void>()

  const source = Object.assign(() => value, {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: string) {
      value = next
      for (const listener of listeners) {
        listener()
      }
    },
  })

  return source
}

function createSyncIconRefSource(initial: string) {
  let value = initial
  const listeners = new Set<() => void>()

  return Object.assign(() => value, {
    subscribe(listener: () => void) {
      listeners.add(listener)
      listener()
      return () => {
        listeners.delete(listener)
      }
    },
    set(next: string) {
      value = next
      for (const listener of listeners) {
        listener()
      }
    },
  })
}

describe('PMAvatarIconModel iconRef resolution', () => {
  it('reads string and signal iconRef sources', () => {
    const model = new PMAvatarIconModel()
    const iconRefSignal = createIconRefSource('alpha')

    model.actions.setIconRef(iconRefSignal)

    expect(model.resolveIconRefSource()).toBe('alpha')
    expect(model.resolveIconRef()).toBe('alpha')

    iconRefSignal.set('beta')

    expect(model.resolveIconRefSource()).toBe('beta')
    expect(model.resolveIconRef()).toBe('beta')

    model.actions.setIconRef('  gamma  ')

    expect(model.resolveIconRefSource()).toBe('gamma')
    expect(model.resolveIconRef()).toBe('gamma')
  })

  it('does not clear pending icon state after disconnecting before load resolves', async () => {
    const load = deferred<string | undefined>()
    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockReturnValue(undefined)
    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockReturnValue(load.promise)
    const model = new PMAvatarIconModel()

    try {
      model.actions.setIconRef('alpha')
      model.connect()

      expect(model.state.pendingIconRef()).toBe('alpha')

      model.disconnect()
      load.resolve('blob:alpha')
      await flushAsync()

      expect(model.state.pendingIconRef()).toBe('alpha')
    } finally {
      model.disconnect()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })

  it('does not let stale icon loads clear a newer pending icon ref', async () => {
    const firstLoad = deferred<string | undefined>()
    const secondLoad = deferred<string | undefined>()
    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockReturnValue(undefined)
    const loadIconUrlSpy = vi
      .spyOn(pmIconStore, 'loadIconUrl')
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise)
    const model = new PMAvatarIconModel()

    try {
      model.actions.setIconRef('alpha')
      model.connect()
      expect(model.state.pendingIconRef()).toBe('alpha')

      model.actions.setIconRef('beta')
      expect(model.state.pendingIconRef()).toBe('beta')

      firstLoad.resolve('blob:alpha')
      await flushAsync()
      expect(model.state.pendingIconRef()).toBe('beta')

      secondLoad.resolve('blob:beta')
      await flushAsync()
      expect(model.state.pendingIconRef()).toBe('')
    } finally {
      model.disconnect()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })
})

describe('PMAvatarIcon subscription cleanup', () => {
  it('unsubscribes on disconnect and resumes on reconnect', async () => {
    const element = createElement()
    const iconRefSignal = createIconRefSource('alpha')
    const cache = new Map<string, string>()
    const calls: string[] = []

    const unsubscribe = vi.fn()
    const subscribeSpy = vi.spyOn(pmIconStore, 'subscribe').mockImplementation((listener) => {
      void listener
      return unsubscribe
    })
    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockImplementation((iconRef) => {
      if (!iconRef) return undefined
      return cache.get(iconRef)
    })
    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockImplementation(async (iconRef) => {
      if (!iconRef) return undefined
      calls.push(iconRef)
      const url = `blob:${iconRef}`
      cache.set(iconRef, url)
      return url
    })

    try {
      element.iconRef = iconRefSignal
      document.body.append(element)
      await element.updateComplete

      expect(calls).toContain('alpha')

      element.remove()
      expect(unsubscribe).toHaveBeenCalledTimes(1)

      calls.length = 0
      iconRefSignal.set('beta')
      await Promise.resolve()
      expect(calls).not.toContain('beta')

      document.body.append(element)
      await element.updateComplete

      expect(calls).toContain('beta')
    } finally {
      element.remove()
      subscribeSpy.mockRestore()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })

  it('stops listening to the previous iconRef source after a source switch', async () => {
    const element = createElement()
    const firstSource = createIconRefSource('alpha')
    const secondSource = createIconRefSource('beta')
    const cache = new Map<string, string>()
    const calls: string[] = []

    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockImplementation((iconRef) => {
      if (!iconRef) return undefined
      return cache.get(iconRef)
    })
    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockImplementation(async (iconRef) => {
      if (!iconRef) return undefined
      calls.push(iconRef)
      const url = `blob:${iconRef}`
      cache.set(iconRef, url)
      return url
    })
    const subscribeSpy = vi.spyOn(pmIconStore, 'subscribe').mockImplementation((listener) => {
      void listener
      return () => {}
    })

    try {
      element.iconRef = firstSource
      document.body.append(element)
      await element.updateComplete

      expect(calls).toContain('alpha')

      calls.length = 0
      element.iconRef = secondSource
      await element.updateComplete

      expect(calls).toContain('beta')

      calls.length = 0
      firstSource.set('gamma')
      await Promise.resolve()
      expect(calls).not.toContain('gamma')

      secondSource.set('delta')
      await Promise.resolve()
      expect(calls).toContain('delta')
    } finally {
      element.remove()
      subscribeSpy.mockRestore()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })

  it('does not duplicate the initial load for sync-callback sources and ignores same normalized updates', async () => {
    const element = createElement()
    const iconRefSignal = createSyncIconRefSource(' alpha ')
    const cache = new Map<string, string>()
    const calls: string[] = []

    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockImplementation((iconRef) => {
      if (!iconRef) return undefined
      return cache.get(iconRef)
    })
    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockImplementation(async (iconRef) => {
      if (!iconRef) return undefined
      calls.push(iconRef)
      const url = `blob:${iconRef}`
      cache.set(iconRef, url)
      return url
    })
    const subscribeSpy = vi.spyOn(pmIconStore, 'subscribe').mockImplementation((listener) => {
      void listener
      return () => {}
    })

    try {
      element.iconRef = iconRefSignal
      document.body.append(element)
      await element.updateComplete
      await Promise.resolve()

      expect(calls).toEqual(['alpha'])

      calls.length = 0
      iconRefSignal.set('alpha')
      await Promise.resolve()

      expect(calls).toEqual([])

      iconRefSignal.set('beta')
      await Promise.resolve()

      expect(calls).toEqual(['beta'])
    } finally {
      element.remove()
      subscribeSpy.mockRestore()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })

  it('loads and renders custom icon from group iconRef', async () => {
    const element = createElement()
    const group = Group.create({
      name: 'Team',
      icon: 'folder',
      iconRef: 'group-icon-ref',
      entries: [],
    })

    const cache = new Map<string, string>()

    const subscribeSpy = vi.spyOn(pmIconStore, 'subscribe').mockImplementation((listener) => {
      void listener
      return () => {}
    })
    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockImplementation((iconRef) => {
      if (!iconRef) return undefined
      return cache.get(iconRef)
    })
    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockImplementation(async (iconRef) => {
      if (iconRef !== 'group-icon-ref') return undefined
      const url = 'blob:group-icon'
      cache.set(iconRef, url)
      return url
    })

    try {
      element.item = group
      document.body.append(element)
      await element.updateComplete

      expect(loadIconUrlSpy).toHaveBeenCalledWith('group-icon-ref')

      await Promise.resolve()
      await element.updateComplete

      const image = element.shadowRoot?.querySelector('img')
      expect(image).not.toBeNull()
      expect(image?.getAttribute('src')).toBe('blob:group-icon')
    } finally {
      element.remove()
      subscribeSpy.mockRestore()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })

  it('reacts to entry iconRef updates without remounting', async () => {
    const element = createElement()
    const root = createManagerRoot()
    root.entries.set([])
    const entry = root.createEntry(
      {
        title: 'Entry',
        username: 'alice',
        urls: [],
        iconRef: 'entry-icon-old',
      },
      '',
      '',
      undefined,
    )

    await entry.flushPendingPersistence()

    const cache = new Map<string, string>()
    const listeners = new Set<() => void>()

    const subscribeSpy = vi.spyOn(pmIconStore, 'subscribe').mockImplementation((listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    })
    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockImplementation((iconRef) => {
      if (!iconRef) return undefined
      return cache.get(iconRef)
    })
    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockImplementation(async (iconRef) => {
      if (!iconRef) return undefined
      const url = `blob:${iconRef}`
      cache.set(iconRef, url)
      for (const listener of listeners) {
        listener()
      }
      return url
    })

    try {
      element.item = entry
      document.body.append(element)
      await settle(element)

      expect(loadIconUrlSpy).toHaveBeenCalledWith('entry-icon-old')
      expect(element.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe('blob:entry-icon-old')

      await entry.update(
        {
          ...entry.data(),
          iconRef: 'entry-icon-new',
        },
        undefined,
        undefined,
      )
      await settle(element)

      expect(loadIconUrlSpy).toHaveBeenCalledWith('entry-icon-new')
      expect(element.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe('blob:entry-icon-new')
    } finally {
      element.remove()
      subscribeSpy.mockRestore()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })
})

describe('PMAvatarIcon cached image rendering', () => {
  it('loads cached image background metadata without blocking image rendering', async () => {
    const element = createElement()
    const iconRef = 'entry-icon-with-background'
    const cache = new Map<string, string>([[iconRef, `blob:${iconRef}`]])

    const subscribeSpy = vi.spyOn(pmIconStore, 'subscribe').mockImplementation((listener) => {
      void listener
      return () => {}
    })
    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockImplementation((ref) => {
      if (!ref) return undefined
      return cache.get(ref)
    })
    const getCachedBackgroundColorSpy = vi
      .spyOn(pmIconStore, 'getCachedBackgroundColor')
      .mockImplementation((ref) => (ref === iconRef ? '#102030' : undefined))
    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockResolvedValue(`blob:${iconRef}`)

    try {
      element.iconRef = iconRef
      document.body.append(element)
      await settle(element)

      expect(getCachedBackgroundColorSpy).toHaveBeenCalledWith(iconRef)
      expect(element.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe(`blob:${iconRef}`)
    } finally {
      element.remove()
      subscribeSpy.mockRestore()
      getCachedUrlSpy.mockRestore()
      getCachedBackgroundColorSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })
})
