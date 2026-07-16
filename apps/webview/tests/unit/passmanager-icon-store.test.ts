import {afterEach, describe, expect, it, vi} from 'vitest'
import {computed} from '@reatom/core'

import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('pmIconStore transport binding', () => {
  afterEach(() => {
    pmIconStore.dispose()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    })
    clearAppContext()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('calls transport sendCatalog with preserved this-context', async () => {
    const iconRef = `sha256:${'c'.repeat(64)}`
    const rpcDispatch = vi.fn(async (_command: string, _data: Record<string, unknown>) => ({
      ok: true,
      result: {icon_ref: iconRef},
    }))

    const transport = {
      rpcDispatch,
      sendCatalog: async function (
        this: {rpcDispatch: typeof rpcDispatch},
        command: string,
        data: Record<string, unknown>,
      ) {
        return this.rpcDispatch(command, data)
      },
    }

    initAppContext(createMockAppContext({ws: transport as never}))

    const file = {
      type: 'image/png',
      arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    } as unknown as File
    const uploadedRef = await pmIconStore.uploadIcon(file)

    expect(uploadedRef).toBe(iconRef)
    expect(pmIconStore.getCachedUrl(iconRef)).toBeTruthy()
    expect(rpcDispatch).toHaveBeenCalledWith(
      'passmanager:icon:put',
      expect.objectContaining({mime_type: 'image/png'}),
    )
  })

  it('lists saved icon refs from domain API', async () => {
    const iconRefA = `sha256:${'a'.repeat(64)}`
    const iconRefB = `sha256:${'b'.repeat(64)}`
    const rpcDispatch = vi.fn(async (command: string) => {
      if (command === 'passmanager:icon:list') {
        return {
          ok: true,
          result: {
            icons: [
              {
                icon_ref: iconRefA,
                mime_type: 'image/png',
                background_color: '#102030',
                width: 64,
                height: 64,
                bytes: 1024,
                created_at: 1,
                updated_at: 2,
              },
              {
                icon_ref: iconRefB,
                mime_type: 'image/webp',
                width: 32,
                height: 32,
                bytes: 256,
                created_at: 3,
                updated_at: 4,
              },
            ],
          },
        }
      }

      return {ok: true, result: {}}
    })

    const transport = {
      rpcDispatch,
      sendCatalog: async function (
        this: {rpcDispatch: typeof rpcDispatch},
        command: string,
        data: Record<string, unknown>,
      ) {
        return this.rpcDispatch(command, data)
      },
    }

    initAppContext(createMockAppContext({ws: transport as never}))

    const icons = await pmIconStore.listIcons()

    expect(icons.map((item) => item.iconRef)).toEqual([iconRefA, iconRefB])
    expect(icons[0]?.backgroundColor).toBe('#102030')
    expect(pmIconStore.getCachedBackgroundColor(iconRefA)).toBe('#102030')
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:icon:list', {})
  })

  it('computes and persists a missing background color during lazy icon load', async () => {
    const iconRef = `sha256:${'d'.repeat(64)}`
    const contentBase64 = 'aWNvbg'
    const rpcDispatch = vi.fn(async (command: string, _data: Record<string, unknown>) => {
      if (command === 'passmanager:icon:get') {
        return {
          ok: true,
          result: {
            icon_ref: iconRef,
            mime_type: 'image/png',
            content_base64: contentBase64,
          },
        }
      }
      return {ok: true, result: {}}
    })

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        if (tagName !== 'canvas') return originalCreateElement(tagName, options)
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            getImageData: () => ({
              data: new Uint8ClampedArray([250, 250, 250, 255]),
            }),
          }),
        } as unknown as HTMLCanvasElement
      },
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 1,
        height: 1,
        close: vi.fn(),
      })),
    )
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:icon'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })

    const transport = {
      rpcDispatch,
      sendCatalog: async function (
        this: {rpcDispatch: typeof rpcDispatch},
        command: string,
        data: Record<string, unknown>,
      ) {
        return this.rpcDispatch(command, data)
      },
    }

    initAppContext(createMockAppContext({ws: transport as never}))

    await expect(pmIconStore.loadIconUrl(iconRef)).resolves.toBe('blob:icon')
    await Promise.resolve()
    await Promise.resolve()

    const backgroundColor = pmIconStore.getCachedBackgroundColor(iconRef)
    expect(backgroundColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:icon:setMeta', {
      icon_ref: iconRef,
      background_color: backgroundColor,
    })

    await expect(pmIconStore.loadIconUrl(iconRef)).resolves.toBe('blob:icon')
    expect(rpcDispatch.mock.calls.filter(([command]) => command === 'passmanager:icon:setMeta')).toHaveLength(
      1,
    )
  })

  it('batch preloads unique refs once and retains their Blob URLs until session disposal', async () => {
    const iconRefA = `sha256:${'a'.repeat(64)}`
    const iconRefB = `sha256:${'b'.repeat(64)}`
    const rpcDispatch = vi.fn(async (command: string, data: Record<string, unknown>) => {
      if (command === 'passmanager:icon:getMany') {
        const refs = data['icon_refs'] as string[]
        return {
          ok: true,
          result: {
            icons: refs.map((iconRef) => ({
              icon_ref: iconRef,
              mime_type: 'image/png',
              background_color: '#102030',
              content_base64: 'aWNvbg',
            })),
            missing_icon_refs: [],
          },
        }
      }
      return {ok: true, result: {}}
    })
    const createObjectURL = vi
      .fn<() => string>()
      .mockReturnValueOnce('blob:icon-a')
      .mockReturnValueOnce('blob:icon-b')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: createObjectURL})
    Object.defineProperty(URL, 'revokeObjectURL', {configurable: true, value: revokeObjectURL})
    initAppContext(
      createMockAppContext({
        ws: {
          rpcDispatch,
          sendCatalog: async function (
            this: {rpcDispatch: typeof rpcDispatch},
            command: string,
            data: Record<string, unknown>,
          ) {
            return this.rpcDispatch(command, data)
          },
        } as never,
      }),
    )

    await pmIconStore.preloadIconUrls([iconRefA, iconRefA, iconRefB])
    await pmIconStore.preloadIconUrls([iconRefA, iconRefB])

    expect(rpcDispatch.mock.calls.filter(([command]) => command === 'passmanager:icon:getMany')).toEqual([
      ['passmanager:icon:getMany', {icon_refs: [iconRefA, iconRefB]}],
    ])
    expect(pmIconStore.getCachedUrl(iconRefA)).toBe('blob:icon-a')
    expect(pmIconStore.getCachedUrl(iconRefB)).toBe('blob:icon-b')
    expect(revokeObjectURL).not.toHaveBeenCalled()

    pmIconStore.dispose()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('falls back to bounded single-icon reads when getMany is unavailable', async () => {
    const iconRefA = `sha256:${'a'.repeat(64)}`
    const iconRefB = `sha256:${'b'.repeat(64)}`
    const rpcDispatch = vi.fn(async (command: string, data: Record<string, unknown>) => {
      if (command === 'passmanager:icon:getMany') {
        return {ok: false, error: 'unknown command'}
      }
      if (command === 'passmanager:icon:get') {
        return {
          ok: true,
          result: {
            icon_ref: data['icon_ref'],
            mime_type: 'image/png',
            background_color: '#102030',
            content_base64: 'aWNvbg',
          },
        }
      }
      return {ok: true, result: {}}
    })
    let objectUrlIndex = 0
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:fallback-${++objectUrlIndex}`),
    })
    initAppContext(
      createMockAppContext({
        ws: {
          rpcDispatch,
          sendCatalog: async function (
            this: {rpcDispatch: typeof rpcDispatch},
            command: string,
            data: Record<string, unknown>,
          ) {
            return this.rpcDispatch(command, data)
          },
        } as never,
      }),
    )

    await pmIconStore.preloadIconUrls([iconRefA, iconRefB])

    expect(rpcDispatch.mock.calls.filter(([command]) => command === 'passmanager:icon:getMany')).toHaveLength(
      1,
    )
    expect(rpcDispatch.mock.calls.filter(([command]) => command === 'passmanager:icon:get')).toHaveLength(2)
    expect(pmIconStore.getCachedUrl(iconRefA)).toBeTruthy()
    expect(pmIconStore.getCachedUrl(iconRefB)).toBeTruthy()
  })

  it('does not publish a stale icon response after session disposal', async () => {
    const iconRef = `sha256:${'e'.repeat(64)}`
    let resolveRequest!: (value: unknown) => void
    const rpcDispatch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }),
    )
    const createObjectURL = vi.fn(() => 'blob:stale')
    Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: createObjectURL})
    initAppContext(
      createMockAppContext({
        ws: {
          rpcDispatch,
          sendCatalog: async function (
            this: {rpcDispatch: typeof rpcDispatch},
            command: string,
            data: Record<string, unknown>,
          ) {
            return this.rpcDispatch(command, data)
          },
        } as never,
      }),
    )

    const pending = pmIconStore.loadIconUrl(iconRef)
    pmIconStore.dispose()
    resolveRequest({
      ok: true,
      result: {
        icon_ref: iconRef,
        mime_type: 'image/png',
        background_color: '#102030',
        content_base64: 'aWNvbg',
      },
    })

    await expect(pending).resolves.toBeUndefined()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(pmIconStore.getCachedUrl(iconRef)).toBeUndefined()
  })

  it('invalidates only reactive consumers of the loaded icon ref', async () => {
    const iconRefA = `sha256:${'a'.repeat(64)}`
    const iconRefB = `sha256:${'b'.repeat(64)}`
    const rpcDispatch = vi.fn(async (_command: string, data: Record<string, unknown>) => ({
      ok: true,
      result: {
        icon_ref: data['icon_ref'],
        mime_type: 'image/png',
        background_color: '#102030',
        content_base64: 'aWNvbg',
      },
    }))
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:reactive-a'),
    })
    initAppContext(
      createMockAppContext({
        ws: {
          rpcDispatch,
          sendCatalog: async function (
            this: {rpcDispatch: typeof rpcDispatch},
            command: string,
            data: Record<string, unknown>,
          ) {
            return this.rpcDispatch(command, data)
          },
        } as never,
      }),
    )

    let readsA = 0
    let readsB = 0
    const urlA = computed(() => {
      readsA += 1
      return pmIconStore.getCachedUrl(iconRefA)
    })
    const urlB = computed(() => {
      readsB += 1
      return pmIconStore.getCachedUrl(iconRefB)
    })
    const unsubscribeA = urlA.subscribe(() => {})
    const unsubscribeB = urlB.subscribe(() => {})
    const initialReadsA = readsA
    const initialReadsB = readsB

    await pmIconStore.loadIconUrl(iconRefA)

    expect(readsA).toBeGreaterThan(initialReadsA)
    expect(readsB).toBe(initialReadsB)
    expect(urlA()).toBe('blob:reactive-a')
    unsubscribeA()
    unsubscribeB()
  })
})
