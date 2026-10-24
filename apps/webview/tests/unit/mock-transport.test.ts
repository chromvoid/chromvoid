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
              tagMeta: {'zero-use': {colorId: 'cyan'}},
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
      expect(exported.result.root.tagMeta).toEqual({'zero-use': {colorId: 'cyan'}})
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
        tag_meta: {
          'zero-use': {colorId: 'pink'},
          work: {color_id: 'green'},
          stale: {colorId: 'cyan'},
        },
      })

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any

      expect(exported.ok).toBe(true)
      expect(exported.result.root.tags).toEqual(['Zero Use', 'Work'])
      expect(exported.result.root.tagMeta).toEqual({
        'zero-use': {colorId: 'pink'},
        work: {colorId: 'green'},
      })
    })

    it('preserves zero-use tags through root import/export', async () => {
      await t.sendPassmanager('passmanager:root:import', {
        tags: ['Zero Use', 'Client A'],
        tagMeta: {'zero-use': {colorId: 'amber'}, 'client-a': {colorId: 'blue'}},
        entries: [{id: 'entry-1', title: 'Entry 1', tags: ['Client A']}],
      })

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any

      expect(exported.ok).toBe(true)
      expect(exported.result.root.tags).toEqual(['Client A', 'Zero Use'])
      expect(exported.result.root.tagMeta).toEqual({
        'client-a': {colorId: 'blue'},
        'zero-use': {colorId: 'amber'},
      })
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

    it('round-trips a credential security audit without changing the visible revision', async () => {
      const getRevision = () =>
        (t as unknown as {passmanagerRevision: number}).passmanagerRevision
      const beforeRevision = getRevision()
      const artifact = {
        version: 1,
        algorithmVersion: 1,
        revision: 'loaded:entry',
        generatedAt: Date.now(),
        entries: {},
        failedEntryIds: [],
      }

      const set = (await t.sendPassmanager('passmanager:securityAudit:set', {artifact})) as any
      const get = (await t.sendPassmanager('passmanager:securityAudit:get', {})) as any

      expect(set.ok).toBe(true)
      expect(get).toEqual({ok: true, result: {artifact}})
      expect(getRevision()).toBe(beforeRevision)
    })

    it('rejects secret-bearing credential security audit payloads', async () => {
      const result = (await t.sendPassmanager('passmanager:securityAudit:set', {
        artifact: {
          version: 1,
          algorithmVersion: 1,
          revision: 'loaded:entry',
          generatedAt: Date.now(),
          entries: {},
          failedEntryIds: [],
          password: 'must-not-store',
        },
      })) as any

      expect(result.ok).toBe(false)
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
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'src'})
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'dst'})
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

    it('counts folder page quick filters recursively while keeping direct items', async () => {
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'docs'})
      await t.sendCatalog('catalog:createDir', {parentPath: '/docs', name: 'nested'})
      await t.uploadFile(
        {parentPath: '/docs/nested', name: 'daily.md'},
        new File(['# Daily'], 'daily.md', {type: 'text/markdown'}),
      )
      await t.uploadFile(
        {parentPath: '/docs', name: 'photo.jpg'},
        new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {type: 'image/jpeg'}),
      )

      const page = (await t.sendCatalog('catalog:folder:list', {
        path: '/docs',
        offset: 0,
        limit: 20,
        filter: {include_hidden: false, file_types: []},
      })) as any

      expect(page.ok).toBe(true)
      expect(page.result.items.map((item: any) => item.name)).toEqual(['nested', 'photo.jpg'])
      expect(page.result.filter_counts).toEqual({all: 2, markdown: 1, images: 1})
    })

    it('completes visible catalog file links with current folder ranking and limit', async () => {
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'docs'})
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'archive'})
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: '.private'})
      await t.uploadFile(
        {parentPath: '/docs', name: 'report.md'},
        new File(['# Report'], 'report.md', {type: 'text/markdown'}),
      )
      await t.uploadFile(
        {parentPath: '/archive', name: 'report.md'},
        new File(['# Old Report'], 'report.md', {type: 'text/markdown'}),
      )
      await t.uploadFile(
        {parentPath: '/docs', name: 'photo.jpg'},
        new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {type: 'image/jpeg'}),
      )
      await t.uploadFile(
        {parentPath: '/.private', name: 'report.md'},
        new File(['hidden'], 'report.md', {type: 'text/markdown'}),
      )

      const ranked = (await t.sendCatalog('catalog:file-links:complete', {
        query: 'report',
        limit: 1,
        current_path: '/docs',
      })) as any
      expect(ranked.ok).toBe(true)
      expect(ranked.result.items.map((item: any) => item.path)).toEqual(['/docs/report.md'])

      const all = (await t.sendCatalog('catalog:file-links:complete', {
        query: '',
        limit: 20,
      })) as any
      expect(all.ok).toBe(true)
      expect(all.result.items.map((item: any) => item.path)).toEqual(
        expect.arrayContaining(['/docs/report.md', '/archive/report.md', '/docs/photo.jpg']),
      )
      expect(all.result.items.map((item: any) => item.path)).not.toContain('/docs')
      expect(all.result.items.map((item: any) => item.path)).not.toContain('/.private/report.md')
    })

    it('resolves catalog file links and fails closed for hidden, directory, and invalid targets', async () => {
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'docs'})
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: '.private'})
      await t.uploadFile(
        {parentPath: '/docs', name: 'guide.md'},
        new File(['# Guide'], 'guide.md', {type: 'text/markdown'}),
      )
      await t.uploadFile(
        {parentPath: '/.private', name: 'secret.md'},
        new File(['hidden'], 'secret.md', {type: 'text/markdown'}),
      )

      const resolved = (await t.sendCatalog('catalog:file-links:resolve', {
        targets: ['/docs/guide.md', '/docs', '/.private/secret.md', '../guide.md', '/'],
      })) as any

      expect(resolved.ok).toBe(true)
      expect(resolved.result.results).toEqual([
        expect.objectContaining({
          target: '/docs/guide.md',
          item: expect.objectContaining({path: '/docs/guide.md', name: 'guide.md'}),
        }),
        {target: '/docs', item: null},
        {target: '/.private/secret.md', item: null},
        {target: '../guide.md', item: null},
        {target: '/', item: null},
      ])
    })

    it('prepares attachment folders and fresh escaped Markdown image links like Core', async () => {
      const request = {
        folder_path: ' /Заметки//Фото 100% (дом)/ ',
        file_name: 'Поездка [1]_!.png',
        mime_type: 'image/png',
      }
      const first = (await t.sendCatalog('catalog:attachment:prepare', request)) as any
      expect(first.ok).toBe(true)
      expect(first.result.parent_path).toBe('/Заметки/Фото 100% (дом)')
      expect(first.result.name).toMatch(/^Поездка--1-_-[\w-]{22}\.png$/u)
      expect(first.result.path).toBe(`${first.result.parent_path}/${first.result.name}`)
      expect(first.result.mime_type).toBe('image/png')
      const target = /^!\[Поездка--1-\\_\]\(<([^>]+)>\)$/u.exec(first.result.markdown)?.[1] ?? ''
      expect(target).toMatch(/^[\w%/.~-]+$/u)
      expect(decodeURIComponent(target)).toBe(first.result.path)

      // Preparation creates the folder chain only; the create-only upload writes the file.
      const folder = (await t.sendCatalog('catalog:list', {path: first.result.parent_path})) as any
      expect(folder.ok).toBe(true)
      expect(folder.result.items).toEqual([])

      const second = (await t.sendCatalog('catalog:attachment:prepare', request)) as any
      expect(second.ok).toBe(true)
      expect(second.result.name).not.toBe(first.result.name)
    })

    it('rejects invalid attachment destinations and non-images without catalog changes', async () => {
      for (const folder_path of [
        '/',
        'relative',
        '/created/../bad',
        '/created/./bad',
        '/created/\\bad',
        '/created/\nbad',
        '/.passmanager/images',
        '/.wallet/images',
      ]) {
        const result = (await t.sendCatalog('catalog:attachment:prepare', {
          folder_path,
          file_name: 'a.png',
          mime_type: 'image/png',
        })) as any
        expect(result.ok, folder_path).toBe(false)
      }
      const nonImage = (await t.sendCatalog('catalog:attachment:prepare', {
        folder_path: '/created',
        file_name: 'a.txt',
        mime_type: 'text/plain',
      })) as any
      expect(nonImage.ok).toBe(false)

      const root = (await t.sendCatalog('catalog:list', {path: '/'})) as any
      expect(root.result.items).toEqual([])
    })

    it('keeps a file on the attachment folder path and names extensionless images from MIME', async () => {
      await t.uploadFile({parentPath: '/', name: 'existing'}, new File(['ab'], 'existing', {type: 'image/png'}))
      const conflict = (await t.sendCatalog('catalog:attachment:prepare', {
        folder_path: '/existing/child',
        file_name: 'a.png',
        mime_type: 'image/png',
      })) as any
      expect(conflict.ok).toBe(false)
      const root = (await t.sendCatalog('catalog:list', {path: '/'})) as any
      expect(root.result.items).toEqual([expect.objectContaining({name: 'existing', isFile: true, size: 2})])

      const image = (await t.sendCatalog('catalog:attachment:prepare', {
        folder_path: '/attachments',
        file_name: 'clipboard',
        mime_type: 'image/png',
      })) as any
      expect(image.ok).toBe(true)
      expect(image.result.name).toMatch(/^clipboard-[\w-]{22}\.png$/u)
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

    it('renames OTP secret labels', async () => {
      await createEntryWithOTP(t)
      await t.setOTPSecret({otpId: OTP_ID, secret: 'JBSWY3DPEHPK3PXP'})

      const response = (await t.sendPassmanager('passmanager:otp:renameSecret', {
        otp_id: OTP_ID,
        previous_label: 'Primary',
        next_label: 'Backup',
      })) as {ok: boolean}

      expect(response.ok).toBe(true)
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
    it('atomically creates login metadata and secrets', async () => {
      const created = (await t.sendPassmanager('passmanager:entry:create', {
        entry_id: 'atomic-login',
        title: 'Atomic login',
        entry_type: 'login',
        group_path: '/Work/Production',
        username: 'alice',
        urls: [],
        secrets: {
          password: 'secret',
          note: 'private',
        },
      })) as any

      expect(created).toEqual({ok: true, result: {entry_id: 'atomic-login'}})
      const password = (await t.sendPassmanager('passmanager:secret:read', {
        entry_id: 'atomic-login',
        secret_type: 'password',
      })) as any
      const note = (await t.sendPassmanager('passmanager:secret:read', {
        entry_id: 'atomic-login',
        secret_type: 'note',
      })) as any
      const entry = (await t.sendPassmanager('passmanager:entry:read', {
        entry_id: 'atomic-login',
      })) as any

      expect(password.result.value).toBe('secret')
      expect(note.result.value).toBe('private')
      expect(entry.result.entry.folderPath).toBe('Work/Production')
    })

    it('stores generated SSH keys at root and preserves them when the source entry is deleted', async () => {
      await t.sendPassmanager('passmanager:entry:save', {
        entry_id: 'ssh-source',
        title: 'SSH source',
      })
      const generated = (await t.sendPassmanager('passmanager:ssh:keygen', {
        key_type: 'ed25519',
        name: 'Deploy key',
        comment: 'deploy@example.test',
        source_entry_id: 'ssh-source',
      })) as any
      expect(generated.ok).toBe(true)

      await t.sendPassmanager('passmanager:entry:delete', {entry_id: 'ssh-source'})

      const listed = (await t.sendPassmanager('passmanager:ssh:list', {})) as any
      expect(listed.result.sshKeys).toEqual([
        expect.objectContaining({
          id: generated.result.key_id,
          name: 'Deploy key',
          sourceEntryId: 'ssh-source',
        }),
      ])
      const publicRead = (await t.sendPassmanager('passmanager:ssh:secret:read', {
        key_id: generated.result.key_id,
        secret_type: 'ssh_public_key',
      })) as any
      expect(publicRead.result.value).toBe(generated.result.public_key_openssh)

      await t.sendPassmanager('passmanager:ssh:key:delete', {key_id: generated.result.key_id})
      expect((await t.sendPassmanager('passmanager:ssh:list', {}) as any).result.sshKeys).toEqual([])
      expect((await t.sendPassmanager('passmanager:ssh:secret:read', {
        key_id: generated.result.key_id,
        secret_type: 'ssh_public_key',
      }) as any).ok).toBe(false)
    })

    it('migrates legacy entry SSH metadata and secrets into the root namespace', async () => {
      await t.sendPassmanager('passmanager:entry:save', {entry_id: 'legacy-entry', title: 'Legacy'})
      await t.sendPassmanager('passmanager:secret:save', {
        entry_id: 'legacy-entry',
        secret_type: 'ssh_private_key:invalid key',
        value: 'PRIVATE',
      })
      await t.sendPassmanager('passmanager:secret:save', {
        entry_id: 'legacy-entry',
        secret_type: 'ssh_public_key:invalid key',
        value: 'PUBLIC',
      })

      const imported = (await t.sendPassmanager('passmanager:root:import', {
        mode: 'merge',
        entries: [{
          id: 'legacy-entry',
          title: 'Legacy',
          sshKeys: [{id: 'invalid key', type: 'ed25519', fingerprint: 'SHA256:legacy'}],
        }],
        folders: [],
      })) as any
      expect(imported.ok).toBe(true)

      const listed = (await t.sendPassmanager('passmanager:ssh:list', {})) as any
      expect(listed.result.sshKeys).toHaveLength(1)
      const migratedKey = listed.result.sshKeys[0]
      expect(migratedKey.id).toMatch(/^migrated-[a-f0-9]{32}$/)
      expect(migratedKey.sourceEntryId).toBe('legacy-entry')
      expect((await t.sendPassmanager('passmanager:ssh:secret:read', {
        key_id: migratedKey.id,
        secret_type: 'ssh_public_key',
      }) as any).result.value).toBe('PUBLIC')

      const exported = (await t.sendPassmanager('passmanager:root:export', {})) as any
      expect(exported.result.root.version).toBe(4)
      expect(exported.result.root.sshKeys).toEqual([migratedKey])
      expect(exported.result.root.entries[0]).not.toHaveProperty('sshKeys')
    })

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
