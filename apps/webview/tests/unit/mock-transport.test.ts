import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {MockTransport} from '../../src/core/transport/mock/mock-transport'
import type {TransportLike} from '../../src/core/transport/transport'

async function waitForConnection(transport: MockTransport) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (transport.connected() && !transport.connecting()) {
      return
    }
    await Promise.resolve()
  }
  throw new Error('MockTransport did not finish connecting')
}

describe('MockTransport', () => {
  let t: MockTransport
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    t = new MockTransport()
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  describe('connection lifecycle', () => {
    it('starts disconnected', () => {
      expect(t.connected()).toBe(false)
      expect(t.connecting()).toBe(false)
    })

    it('connect sets connecting=true synchronously', () => {
      t.connect()
      expect(t.connecting()).toBe(true)
    })

    it('connect sets connected=true after microtask', async () => {
      t.connect()
      await waitForConnection(t)
      expect(t.connected()).toBe(true)
      expect(t.connecting()).toBe(false)
    })

    it('disconnect sets connected=false', async () => {
      t.connect()
      await waitForConnection(t)
      t.disconnect()
      expect(t.connected()).toBe(false)
    })

    it('double connect is idempotent', async () => {
      t.connect()
      await waitForConnection(t)
      t.connect()
      expect(t.connected()).toBe(true)
    })

    it('restores passmanager state from dedicated mock endpoint', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/mock-state') {
          return new Response('Not found', {status: 404})
        }
        if (url === '/api/mock-passmanager-state') {
          return new Response(
            JSON.stringify({
              version: 1,
              revision: 3,
              nextNodeId: 10,
              folders: ['Work'],
              foldersMeta: [],
              tags: ['Zero Use'],
              entries: [{nodeId: 9, meta: {id: 'entry-1', title: 'Entry 1', folderPath: 'Work'}}],
              secrets: [],
              otpSecrets: [],
              icons: [],
            }),
            {status: 200},
          )
        }
        return new Response('Unsupported', {status: 500})
      }) as typeof globalThis.fetch

      t.connect()
      await waitForConnection(t)

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any
      expect(exported.ok).toBe(true)
      expect(exported.result.root.folders).toEqual(['Work'])
      expect(exported.result.root.tags).toEqual(['Zero Use'])
      expect(exported.result.root.entries).toEqual([
        expect.objectContaining({
          id: 'entry-1',
          title: 'Entry 1',
          folderPath: 'Work',
        }),
      ])
    })

    it('round-trips group description through setMeta and root import/export', async () => {
      globalThis.fetch = vi.fn(
        async () => new Response('Not found', {status: 404}),
      ) as typeof globalThis.fetch

      t.connect()
      await waitForConnection(t)

      await t.sendPassmanager('passmanager:group:ensure', {path: 'Work'})
      await t.sendPassmanager('passmanager:group:setMeta', {
        path: 'Work',
        description: 'Runbooks',
      })

      let exported = (await t.sendPassmanager('passmanager:root:export', {})) as any
      expect(exported.result.root.foldersMeta).toEqual([{path: 'Work', description: 'Runbooks'}])

      await t.sendPassmanager('passmanager:root:import', {
        folders: ['Work'],
        folders_meta: [{path: 'Work', description: 'Imported description'}],
        entries: [],
      })

      exported = (await t.sendPassmanager('passmanager:root:export', {})) as any
      expect(exported.result.root.foldersMeta).toEqual([{path: 'Work', description: 'Imported description'}])
    })

    it('round-trips zero-use tags through setCatalog and root export', async () => {
      await t.sendPassmanager('passmanager:tags:setCatalog', {
        tags: ['Zero Use', ' #Work ', 'work'],
      })

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any

      expect(exported.ok).toBe(true)
      expect(exported.result.root.tags).toEqual(['Zero Use', 'Work'])
    })

    it('preserves zero-use tags through root import/export', async () => {
      await t.sendPassmanager('passmanager:root:import', {
        tags: ['Zero Use', 'Client A'],
        entries: [{id: 'entry-1', title: 'Entry 1', tags: ['Client A']}],
      })

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any

      expect(exported.ok).toBe(true)
      expect(exported.result.root.tags).toEqual(['Client A', 'Zero Use'])
    })

    it('persists passmanager mutations to dedicated mock endpoint', async () => {
      vi.useFakeTimers()
      const calls: Array<{url: string; method: string}> = []

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        calls.push({url, method})

        if (method === 'GET') {
          return new Response('Not found', {status: 404})
        }
        return new Response('OK', {status: 200})
      }) as typeof globalThis.fetch

      t.connect()
      await waitForConnection(t)

      await t.sendPassmanager('passmanager:entry:save', {
        entry_id: 'entry-1',
        title: 'Entry 1',
      })

      await vi.advanceTimersByTimeAsync(600)

      expect(calls.some((call) => call.url === '/api/mock-passmanager-state' && call.method === 'POST')).toBe(
        true,
      )
    })
  })

  describe('catalog operations', () => {
    it('list root returns empty items', async () => {
      const res = (await t.sendCatalog('catalog:list', {path: '/'})) as any
      expect(res.ok).toBe(true)
      expect(res.result.items).toEqual([])
    })

    it('createDir + list shows new dir', async () => {
      const create = (await t.sendCatalog('catalog:createDir', {
        parentPath: '/',
        name: 'test-folder',
      })) as any
      expect(create.ok).toBe(true)
      expect(create.result.nodeId).toBeGreaterThan(0)

      const list = (await t.sendCatalog('catalog:list', {path: '/'})) as any
      expect(list.ok).toBe(true)
      const names = list.result.items.map((i: any) => i.name)
      expect(names).toContain('test-folder')
    })

    it('rename updates name', async () => {
      const create = (await t.sendCatalog('catalog:createDir', {
        parentPath: '/',
        name: 'old-name',
      })) as any
      const nodeId = create.result.nodeId

      const rename = (await t.sendCatalog('catalog:rename', {nodeId, newName: 'new-name'})) as any
      expect(rename.ok).toBe(true)

      const list = (await t.sendCatalog('catalog:list', {path: '/'})) as any
      const names = list.result.items.map((i: any) => i.name)
      expect(names).toContain('new-name')
      expect(names).not.toContain('old-name')
    })

    it('delete removes node', async () => {
      const create = (await t.sendCatalog('catalog:createDir', {
        parentPath: '/',
        name: 'to-delete',
      })) as any
      const nodeId = create.result.nodeId

      const del = (await t.sendCatalog('catalog:delete', {nodeId})) as any
      expect(del.ok).toBe(true)

      const list = (await t.sendCatalog('catalog:list', {path: '/'})) as any
      const ids = list.result.items.map((i: any) => i.nodeId)
      expect(ids).not.toContain(nodeId)
    })

    it('sync manifest returns catalog summary', async () => {
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'sync-test'})

      const res = (await t.sendCatalog('catalog:sync:manifest', {})) as any
      expect(res.ok).toBe(true)
      expect(res.result.root_summaries).toEqual(
        expect.arrayContaining([expect.objectContaining({n: 'sync-test'})]),
      )
    })

    it('move relocates node', async () => {
      const dir1 = (await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'src'})) as any
      const dir2 = (await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'dst'})) as any
      const child = (await t.sendCatalog('catalog:createDir', {
        parentPath: '/src',
        name: 'child',
      })) as any

      const mv = (await t.sendCatalog('catalog:move', {
        nodeId: child.result.nodeId,
        newParentPath: '/dst',
      })) as any
      expect(mv.ok).toBe(true)

      const srcList = (await t.sendCatalog('catalog:list', {path: '/src'})) as any
      expect(srcList.result.items).toHaveLength(0)

      const dstList = (await t.sendCatalog('catalog:list', {path: '/dst'})) as any
      expect(dstList.result.items).toHaveLength(1)
      expect(dstList.result.items[0].name).toBe('child')
    })

    it('unsupported command returns error', async () => {
      const res = (await t.sendCatalog('catalog:nonexistent', {})) as any
      expect(res.ok).toBe(false)
    })

    it('returns source metadata for uploaded files', async () => {
      const uploaded = await t.uploadFile(
        {parentPath: '/', name: 'notes.md'},
        new File(['# Notes'], 'notes.md', {type: 'text/markdown'}),
      )
      const nodeId = uploaded.nodeId

      const metadata = await t.sourceMetadata(nodeId)
      expect(metadata).toMatchObject({
        nodeId,
        nodeType: 1,
        name: 'notes.md',
        mimeType: 'text/markdown',
        size: 7,
      })
      expect(metadata.sourceRevision).toEqual(expect.any(Number))

      const catalogMetadata = (await t.sendCatalog('catalog:source:metadata', {nodeId})) as any
      expect(catalogMetadata.ok).toBe(true)
      expect(catalogMetadata.result.sourceRevision).toBe(metadata.sourceRevision)
    })

    it('clears inspected media metadata after upload', async () => {
      const uploaded = await t.uploadFile(
        {parentPath: '/', name: 'audio-only.mp4'},
        new File([], 'audio-only.mp4', {type: 'video/mp4'}),
      )
      const nodeId = uploaded.nodeId

      const inspected = (await t.sendCatalog('catalog:media:inspect', {nodeId})) as any
      expect(inspected.result.mediaInfo).toMatchObject({kind: 'audio'})
      const before = await t.sourceMetadata(nodeId)

      await t.uploadFile(nodeId, new File(['changed'], 'audio-only.mp4', {type: 'video/mp4'}))

      const metadata = await t.sourceMetadata(nodeId)
      expect(metadata.sourceRevision).not.toBe(before.sourceRevision)
      expect(metadata.mediaInfo).toBeNull()
      expect(metadata.mediaInspectedRevision).toBe(0)
    })

    it('replaces file bytes, bumps source revision, and emits catalog update events', async () => {
      const uploaded = await t.uploadFile(
        {parentPath: '/', name: 'notes.md'},
        new File(['old'], 'notes.md', {type: 'text/markdown'}),
      )
      const nodeId = uploaded.nodeId
      const before = await t.sourceMetadata(nodeId)
      const events: unknown[] = []
      t.on('catalog:event', (_message, event) => events.push(event))

      const result = await t.replaceFile(nodeId, new TextEncoder().encode('new text'), {
        mimeType: 'text/markdown',
        expectedSourceRevision: before.sourceRevision,
      })

      expect(result.size).toBe(8)
      expect(result.sourceRevision).not.toBe(before.sourceRevision)
      expect(result).toMatchObject({
        mediaInfo: null,
        mediaInspectedRevision: 0,
      })
      const metadata = await t.sourceMetadata(nodeId)
      expect(metadata.mediaInfo).toBeNull()
      expect(metadata.mediaInspectedRevision).toBe(0)
      const chunks: Uint8Array[] = []
      for await (const chunk of await t.downloadFile(nodeId)) {
        chunks.push(chunk)
      }
      expect(new TextDecoder().decode(chunks[0])).toBe('new text')
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'node_updated',
          nodeId,
          metadata: expect.objectContaining({
            size: 8,
            sourceRevision: result.sourceRevision,
          }),
        }),
      )
    })

    it('rejects stale file replacement unless overwrite is requested', async () => {
      const uploaded = await t.uploadFile(
        {parentPath: '/', name: 'notes.md'},
        new File(['old'], 'notes.md', {type: 'text/markdown'}),
      )
      const nodeId = uploaded.nodeId
      const before = await t.sourceMetadata(nodeId)

      await expect(
        t.replaceFile(nodeId, new TextEncoder().encode('stale'), {
          mimeType: 'text/markdown',
          expectedSourceRevision: (before.sourceRevision ?? 0) - 1,
        }),
      ).rejects.toMatchObject({code: 'ERR_STALE_SOURCE'})

      await expect(
        t.replaceFile(nodeId, new TextEncoder().encode('overwrite'), {
          mimeType: 'text/markdown',
          expectedSourceRevision: (before.sourceRevision ?? 0) - 1,
          conflictMode: 'overwrite',
        }),
      ).resolves.toMatchObject({size: 9})
    })

    it('supports zero-byte file replacement and download', async () => {
      const uploaded = await t.uploadFile(
        {parentPath: '/', name: 'empty.md'},
        new File(['content'], 'empty.md', {type: 'text/markdown'}),
      )
      const nodeId = uploaded.nodeId
      const before = await t.sourceMetadata(nodeId)

      const result = await t.replaceFile(nodeId, new Uint8Array(), {
        mimeType: 'text/markdown',
        expectedSourceRevision: before.sourceRevision,
      })

      expect(result.size).toBe(0)
      const chunks: Uint8Array[] = []
      for await (const chunk of await t.downloadFile(nodeId)) {
        chunks.push(chunk)
      }
      expect(chunks).toEqual([])
    })
  })

  describe('secret operations', () => {
    it('writeSecret + readSecret roundtrip', async () => {
      const create = (await t.sendCatalog('catalog:createDir', {
        parentPath: '/',
        name: 'secret-holder',
      })) as any
      const nodeId = create.result.nodeId

      const data = new TextEncoder().encode('my-secret')
      await t.writeSecret(nodeId, data.buffer as ArrayBuffer)

      const chunks: Uint8Array[] = []
      for await (const chunk of await t.readSecret(nodeId)) {
        chunks.push(chunk)
      }
      const combined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
      let off = 0
      for (const c of chunks) {
        combined.set(c, off)
        off += c.length
      }

      expect(new TextDecoder().decode(combined)).toBe('my-secret')
    })

    it('eraseSecret removes data so readSecret throws', async () => {
      const create = (await t.sendCatalog('catalog:createDir', {
        parentPath: '/',
        name: 'erase-test',
      })) as any
      const nodeId = create.result.nodeId

      const data = new TextEncoder().encode('temp')
      await t.writeSecret(nodeId, data.buffer as ArrayBuffer)
      await t.eraseSecret(nodeId)

      await expect(t.readSecret(nodeId)).rejects.toThrow()
    })
  })

  describe('event system', () => {
    it('on/off registers and removes handlers', () => {
      const calls: unknown[] = []
      const handler = (msg: unknown) => calls.push(msg)
      t.on('test-event', handler)
      t.off('test-event', handler)
      // No crash = pass
    })
  })

  describe('OTP operations', () => {
    const OTP_ID = 'test-otp-001'
    const ENTRY_ID = 'test-entry-otp'

    async function createEntryWithOTP(transport: MockTransport) {
      await transport.sendPassmanager('passmanager:entry:save', {
        entry_id: ENTRY_ID,
        title: 'OTP Test Entry',
        otps: [{id: OTP_ID, label: 'Primary'}],
      })
    }
    it('generateOTP returns padded string', async () => {
      await createEntryWithOTP(t)
      const code = await t.generateOTP({otpId: OTP_ID, digits: 6})
      expect(code).toHaveLength(6)
      expect(/^\d{6}$/.test(code)).toBe(true)
    })
    it('setOTPSecret + removeOTPSecret lifecycle', async () => {
      await createEntryWithOTP(t)
      await t.setOTPSecret({otpId: OTP_ID, secret: 'JBSWY3DPEHPK3PXP'})
      await t.removeOTPSecret({otpId: OTP_ID})
    })

    it('setOTPSecret stores secret and generateOTP still returns a code without crypto dependencies', async () => {
      await createEntryWithOTP(t)

      await t.setOTPSecret({otpId: OTP_ID, secret: 'JBSWY3DPEHPK3PXP'})

      const response = (await t.sendPassmanager('passmanager:otp:generate', {
        otp_id: OTP_ID,
        entry_id: ENTRY_ID,
        digits: 6,
      })) as {ok: boolean; result?: {otp?: string}}

      expect(response.ok).toBe(true)
      expect(response.result?.otp).toMatch(/^\d{6}$/)
    })

    it('generateOTP resolves by entryId', async () => {
      await createEntryWithOTP(t)
      const code = await t.generateOTP({entryId: ENTRY_ID, digits: 6})
      expect(code).toHaveLength(6)
      expect(/^\d{6}$/.test(code)).toBe(true)
    })

    it('generateOTP rejects when no domain IDs provided', async () => {
      await expect(t.generateOTP({})).rejects.toThrow()
    })

    it('setOTPSecret rejects when OTP not found in meta', async () => {
      await expect(t.setOTPSecret({otpId: 'nonexistent-otp', secret: 'JBSWY3DPEHPK3PXP'})).rejects.toThrow()
    })
  })

  describe('passmanager secret contracts', () => {
    it('normalizes and preserves entry tags in read/list/export', async () => {
      const created = (await t.sendPassmanager('passmanager:entry:save', {
        entry_id: 'tagged-entry',
        title: 'Tagged Entry',
        tags: ['  #Work  ', 'work'],
      })) as any
      expect(created.ok).toBe(true)

      const read = (await t.sendPassmanager('passmanager:entry:read', {
        entry_id: 'tagged-entry',
      })) as any
      expect(read.ok).toBe(true)
      expect(read.result.entry.tags).toEqual(['Work'])

      const listed = (await t.sendPassmanager('passmanager:entry:list', {})) as any
      expect(listed.ok).toBe(true)
      expect(listed.result.entries.find((entry: any) => entry.id === 'tagged-entry')?.tags).toEqual(['Work'])

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any
      expect(exported.ok).toBe(true)
      expect(exported.result.root.entries.find((entry: any) => entry.id === 'tagged-entry')?.tags).toEqual([
        'Work',
      ])
    })

    it('removes mock entry tags when save receives an explicit empty list', async () => {
      await t.sendPassmanager('passmanager:entry:save', {
        entry_id: 'tagged-entry',
        title: 'Tagged Entry',
        tags: ['Work'],
      })
      await t.sendPassmanager('passmanager:entry:save', {
        entry_id: 'tagged-entry',
        title: 'Tagged Entry',
        tags: [],
      })

      const read = (await t.sendPassmanager('passmanager:entry:read', {
        entry_id: 'tagged-entry',
      })) as any
      expect(read.ok).toBe(true)
      expect(read.result.entry.tags).toBeUndefined()
    })

    it('allows note for payment_card entries and includes it in root export', async () => {
      const created = (await t.sendPassmanager('passmanager:entry:save', {
        entry_id: 'card-1',
        title: 'Personal Visa',
        entry_type: 'payment_card',
        payment_card: {
          cardholder_name: 'JOHN DOE',
          brand: 'visa',
          exp_month: 12,
          exp_year: 2028,
        },
      })) as any
      expect(created.ok).toBe(true)

      const saved = (await t.sendPassmanager('passmanager:secret:save', {
        entry_id: 'card-1',
        secret_type: 'note',
        value: 'Billing address: 1 Payment Street',
      })) as any
      expect(saved.ok).toBe(true)

      const read = (await t.sendPassmanager('passmanager:secret:read', {
        entry_id: 'card-1',
        secret_type: 'note',
      })) as any
      expect(read.ok).toBe(true)
      expect(read.result.value).toBe('Billing address: 1 Payment Street')

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any
      expect(exported.ok).toBe(true)
      const entry = exported.result.root.entries.find((item: any) => item.id === 'card-1')
      expect(entry.note).toBe('Billing address: 1 Payment Street')
    })
  })
})

describe('TransportLike contract shape', () => {
  it('MockTransport satisfies TransportLike', () => {
    const t: TransportLike = new MockTransport()
    expect(t.kind).toBeDefined()
    expect(typeof t.connect).toBe('function')
    expect(typeof t.disconnect).toBe('function')
    expect(typeof t.on).toBe('function')
    expect(typeof t.off).toBe('function')
    expect(typeof t.sendCatalog).toBe('function')
    expect(typeof t.sendPassmanager).toBe('function')
    expect(typeof t.uploadFile).toBe('function')
    expect(typeof t.downloadFile).toBe('function')
    expect(typeof t.readSecret).toBe('function')
    expect(typeof t.writeSecret).toBe('function')
    expect(typeof t.eraseSecret).toBe('function')
    expect(typeof t.generateOTP).toBe('function')
    expect(typeof t.setOTPSecret).toBe('function')
    expect(typeof t.removeOTPSecret).toBe('function')
    expect(typeof t.connected).toBe('function')
    expect(typeof t.connecting).toBe('function')
    expect(typeof t.lastError).toBe('function')
  })
})
