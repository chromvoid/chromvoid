import {describe, it, expect, beforeEach} from 'vitest'
import {MockTransport} from '../../src/core/transport/mock/mock-transport'
import type {TransportLike} from '../../src/core/transport/transport'

/** Wait for a microtask (MockTransport.connect uses queueMicrotask). */
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('MockTransport', () => {
  let t: MockTransport

  beforeEach(() => {
    t = new MockTransport()
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
      await tick()
      expect(t.connected()).toBe(true)
      expect(t.connecting()).toBe(false)
    })

    it('disconnect sets connected=false', async () => {
      t.connect()
      await tick()
      t.disconnect()
      expect(t.connected()).toBe(false)
    })

    it('double connect is idempotent', async () => {
      t.connect()
      await tick()
      t.connect()
      expect(t.connected()).toBe(true)
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

    it('syncInit returns catalog tree', async () => {
      await t.sendCatalog('catalog:createDir', {parentPath: '/', name: 'sync-test'})

      const res = (await t.sendCatalog('catalog:syncInit', {})) as any
      expect(res.ok).toBe(true)
      expect(res.result.data).toBeDefined()
      expect(res.result.data.i).toBe(0)
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
      await transport.sendCatalog('passmanager:entry:save', {
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
      await expect(
        t.setOTPSecret({otpId: 'nonexistent-otp', secret: 'JBSWY3DPEHPK3PXP'}),
      ).rejects.toThrow()
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
