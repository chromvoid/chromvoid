import {afterEach, describe, expect, it, vi} from 'vitest'

import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'

describe('pmIconStore transport binding', () => {
  afterEach(() => {
    pmIconStore.dispose()
    delete (window as any).catalog
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

    ;(window as any).catalog = {transport}

    const file = {
      type: 'image/png',
      arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
    } as unknown as File
    const uploadedRef = await pmIconStore.uploadIcon(file)

    expect(uploadedRef).toBe(iconRef)
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

    ;(window as any).catalog = {transport}

    const icons = await pmIconStore.listIcons()

    expect(icons.map((item) => item.iconRef)).toEqual([iconRefA, iconRefB])
    expect(rpcDispatch).toHaveBeenCalledWith('passmanager:icon:list', {})
  })
})
