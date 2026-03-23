import {describe, it, expect} from 'vitest'
import type {CatalogOperations} from './mapper.js'
import {mapAndSaveEntry, overwriteEntry, ImportOrchestrator} from './mapper.js'
import type {ImportedEntry, ImportProgress, ExistingEntryInfo} from './types.js'

function createMockCatalog(): CatalogOperations & {
  calls: Array<{method: string; args: unknown[]}>
  dirs: Map<string, number>
  nextNodeId: number
} {
  let nextNodeId = 1
  const dirs = new Map<string, number>()
  const calls: Array<{method: string; args: unknown[]}> = []

  return {
    calls,
    dirs,
    get nextNodeId() {
      return nextNodeId
    },
    set nextNodeId(v) {
      nextNodeId = v
    },

    async createDir(name, parentPath) {
      calls.push({method: 'createDir', args: [name, parentPath]})
      const fullPath = `${parentPath}/${name}`.replace(/\/\//g, '/')
      if (dirs.has(fullPath)) return {nameExists: true as const}
      const nodeId = nextNodeId++
      dirs.set(fullPath, nodeId)
      return {nodeId}
    },

    async prepareUpload(parentPath, name, size, chunkSize, mimeType) {
      calls.push({method: 'prepareUpload', args: [parentPath, name, size, chunkSize, mimeType]})
      return {nodeId: nextNodeId++}
    },

    async upload(nodeId, size, data) {
      calls.push({method: 'upload', args: [nodeId, size, data]})
    },

    async setOTPSecret(params) {
      calls.push({method: 'setOTPSecret', args: [params]})
    },

    async deleteNode(nodeId) {
      calls.push({method: 'deleteNode', args: [nodeId]})
    },

    async putIcon(contentBase64, mimeType) {
      calls.push({method: 'putIcon', args: [contentBase64, mimeType]})
      return {iconRef: `sha256:${'a'.repeat(64)}`}
    },

    async setGroupIcon(path, iconRef) {
      calls.push({method: 'setGroupIcon', args: [path, iconRef]})
    },
  }
}

function makeEntry(overrides: Partial<ImportedEntry> = {}): ImportedEntry {
  return {
    id: 'entry-1',
    type: 'login',
    name: 'GitHub',
    username: 'user@test.com',
    password: 'secret123',
    urls: [{value: 'https://github.com', match: 'base_domain'}],
    notes: 'My account',
    ...overrides,
  }
}

describe('mapper', () => {
  describe('mapAndSaveEntry', () => {
    it('should create entry directory and write all files', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry()

      const result = await mapAndSaveEntry(catalog, entry)

      expect(result.entryNodeId).toBeGreaterThan(0)

      const createDirCalls = catalog.calls.filter((c) => c.method === 'createDir')
      expect(createDirCalls[0]!.args[0]).toBe('GitHub')

      const uploadCalls = catalog.calls.filter((c) => c.method === 'prepareUpload')
      const fileNames = uploadCalls.map((c) => c.args[1])
      expect(fileNames).toContain('meta.json')
      expect(fileNames).toContain('.password')
      expect(fileNames).toContain('.note')
    })

    it('should create folder chain for nested entries', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({folder: 'Social/Media'})

      await mapAndSaveEntry(catalog, entry)

      const createDirCalls = catalog.calls.filter((c) => c.method === 'createDir')
      expect(createDirCalls.length).toBeGreaterThanOrEqual(3)
      expect(createDirCalls[0]!.args).toEqual(['Social', '/'])
      expect(createDirCalls[1]!.args).toEqual(['Media', '/Social'])
    })

    it('should never produce double slashes in paths', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({folder: 'A/B'})

      await mapAndSaveEntry(catalog, entry)

      const allPaths = catalog.calls
        .filter((c) => c.method === 'createDir' || c.method === 'prepareUpload')
        .flatMap((c) => c.args.filter((a): a is string => typeof a === 'string'))
      for (const p of allPaths) {
        expect(p).not.toContain('//')
      }
    })

    it('should auto-rename on name collision', async () => {
      const catalog = createMockCatalog()
      catalog.dirs.set('/GitHub', 100)

      const entry = makeEntry()
      await mapAndSaveEntry(catalog, entry)

      const createDirCalls = catalog.calls.filter((c) => c.method === 'createDir')
      const entryDirCalls = createDirCalls.filter((c) => (c.args[0] as string).startsWith('GitHub'))
      expect(entryDirCalls.some((c) => c.args[0] === 'GitHub (2)')).toBe(true)
    })

    it('should write .fields.json for entries with custom fields', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({
        customFields: [{key: 'Recovery', value: 'abc-def'}],
      })

      await mapAndSaveEntry(catalog, entry)

      const uploadCalls = catalog.calls.filter((c) => c.method === 'prepareUpload')
      const fileNames = uploadCalls.map((c) => c.args[1])
      expect(fileNames).toContain('.fields.json')
    })

    it('should upload icon and persist iconRef in meta', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({
        icon: {
          contentBase64: 'aGVsbG8=',
          mimeType: 'image/png',
        },
      })

      await mapAndSaveEntry(catalog, entry)

      const putIconCalls = catalog.calls.filter((c) => c.method === 'putIcon')
      expect(putIconCalls).toHaveLength(1)

      const uploadCalls = catalog.calls.filter((c) => c.method === 'upload')
      const metaUpload = uploadCalls[0]?.args[2] as Uint8Array
      const metaJson = JSON.parse(new TextDecoder().decode(metaUpload)) as {iconRef?: string}
      expect(metaJson.iconRef).toBe(`sha256:${'a'.repeat(64)}`)
    })

    it('should not write .password for entries without password', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({password: undefined, type: 'secure_note'})

      await mapAndSaveEntry(catalog, entry)

      const uploadCalls = catalog.calls.filter((c) => c.method === 'prepareUpload')
      const fileNames = uploadCalls.map((c) => c.args[1])
      expect(fileNames).not.toContain('.password')
    })

    it('should call setOTPSecret for entries with OTP', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({
        otp: {secret: 'JBSWY3DPEHPK3PXP', label: 'GitHub OTP', encoding: 'base32', type: 'TOTP'},
      })

      await mapAndSaveEntry(catalog, entry)

      const otpCalls = catalog.calls.filter((c) => c.method === 'setOTPSecret')
      expect(otpCalls).toHaveLength(1)
      expect((otpCalls[0]!.args[0] as Record<string, unknown>)['secret']).toBe('JBSWY3DPEHPK3PXP')
      expect((otpCalls[0]!.args[0] as Record<string, unknown>)['encoding']).toBe('base32')
    })

    it('should not call setOTPSecret for entries without OTP', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({otp: undefined})

      await mapAndSaveEntry(catalog, entry)

      const otpCalls = catalog.calls.filter((c) => c.method === 'setOTPSecret')
      expect(otpCalls).toHaveLength(0)
    })

    it('should sanitize directory names', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({name: 'My:Entry/With*Bad"Chars'})

      await mapAndSaveEntry(catalog, entry)

      const createDirCalls = catalog.calls.filter((c) => c.method === 'createDir')
      const entryDir = createDirCalls.find((c) => (c.args[0] as string).startsWith('My'))
      expect(entryDir?.args[0]).toBe('My-Entry-With-Bad-Chars')
    })

    it('should include import_source in meta.json', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({folder: 'Work'})

      await mapAndSaveEntry(catalog, entry)

      const metaPrepare = catalog.calls
        .filter((c) => c.method === 'prepareUpload')
        .find((c) => c.args[1] === 'meta.json')
      expect(metaPrepare).toBeDefined()

      const metaUpload = catalog.calls.find((c) => c.method === 'upload' && c.args[2] instanceof Uint8Array)
      expect(metaUpload).toBeDefined()
      const decoded = new TextDecoder().decode(metaUpload!.args[2] as Uint8Array)
      const parsed = JSON.parse(decoded)
      expect(parsed.import_source).toBeDefined()
      expect(parsed.import_source.original_id).toBe('entry-1')
      expect(parsed.import_source.folder_path).toBe('Work')
    })

    it('should duplicate custom fields in .note', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({
        notes: 'Base note',
        customFields: [{key: 'PIN', value: '1234'}],
      })

      await mapAndSaveEntry(catalog, entry)

      const uploadCalls = catalog.calls.filter((c) => c.method === 'prepareUpload')
      const noteUpload = uploadCalls.find((c) => c.args[1] === '.note')
      expect(noteUpload).toBeDefined()
    })

    it('should normalize OTP encoding base16 to hex', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({
        otp: {secret: 'ABC', encoding: 'base16', type: 'TOTP'},
      })

      await mapAndSaveEntry(catalog, entry)

      const otpCalls = catalog.calls.filter((c) => c.method === 'setOTPSecret')
      expect((otpCalls[0]!.args[0] as Record<string, unknown>)['encoding']).toBe('hex')
    })

    it('should use entry id as name when name is empty', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({name: '', id: 'fallback-id'})

      await mapAndSaveEntry(catalog, entry)

      const createDirCalls = catalog.calls.filter((c) => c.method === 'createDir')
      const entryDir = createDirCalls.find((c) => c.args[0] === 'fallback-id')
      expect(entryDir).toBeDefined()
    })

    it('should not write .note when notes and customFields are empty', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({notes: undefined, customFields: undefined})

      await mapAndSaveEntry(catalog, entry)

      const uploadCalls = catalog.calls.filter((c) => c.method === 'prepareUpload')
      const fileNames = uploadCalls.map((c) => c.args[1])
      expect(fileNames).not.toContain('.note')
    })

    it('should not write .fields.json when customFields is empty array', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({customFields: []})

      await mapAndSaveEntry(catalog, entry)

      const uploadCalls = catalog.calls.filter((c) => c.method === 'prepareUpload')
      const fileNames = uploadCalls.map((c) => c.args[1])
      expect(fileNames).not.toContain('.fields.json')
    })

    it('should handle entry with no folder', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({folder: undefined})

      await mapAndSaveEntry(catalog, entry)

      const createDirCalls = catalog.calls.filter((c) => c.method === 'createDir')
      expect(createDirCalls).toHaveLength(1)
      expect(createDirCalls[0]!.args[0]).toBe('GitHub')
    })

    it('should use default OTP values when not specified', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({
        otp: {secret: 'TESTSECRET', type: 'TOTP'},
      })

      await mapAndSaveEntry(catalog, entry)

      const otpCalls = catalog.calls.filter((c) => c.method === 'setOTPSecret')
      const params = otpCalls[0]!.args[0] as Record<string, unknown>
      expect(params['algorithm']).toBe('SHA1')
      expect(params['digits']).toBe(6)
      expect(params['period']).toBe(30)
      expect(params['encoding']).toBe('base32')
      expect(params['label']).toBe('OTP')
    })
  })

  describe('ImportOrchestrator', () => {
    it('should import multiple entries and track progress', async () => {
      const catalog = createMockCatalog()
      const orchestrator = new ImportOrchestrator()
      const entries = [makeEntry({id: '1', name: 'A'}), makeEntry({id: '2', name: 'B'})]
      const progressUpdates: ImportProgress[] = []

      const result = await orchestrator.execute(catalog, entries, (p) => progressUpdates.push({...p}))

      expect(result.success).toBe(true)
      expect(result.progress.imported).toBe(2)
      expect(result.progress.errors).toBe(0)
      expect(progressUpdates.length).toBeGreaterThan(0)
    })

    it('should handle errors gracefully and continue', async () => {
      const catalog = createMockCatalog()
      let callCount = 0
      const originalCreateDir = catalog.createDir.bind(catalog)
      catalog.createDir = async (name, parentPath) => {
        callCount++
        if (callCount === 2) throw new Error('RPC failed')
        return originalCreateDir(name, parentPath)
      }

      const orchestrator = new ImportOrchestrator()
      const entries = [makeEntry({id: '1', name: 'A'}), makeEntry({id: '2', name: 'B'})]

      const result = await orchestrator.execute(catalog, entries)

      expect(result.progress.imported).toBe(1)
      expect(result.progress.errors).toBe(1)
      expect(result.errors.length).toBe(1)
    })

    it('should stop when aborted', async () => {
      const catalog = createMockCatalog()
      const orchestrator = new ImportOrchestrator()
      const entries = Array.from({length: 10}, (_, i) => makeEntry({id: `${i}`, name: `Entry ${i}`}))

      const originalCreateDir = catalog.createDir.bind(catalog)
      let entryCount = 0
      catalog.createDir = async (name, parentPath) => {
        entryCount++
        if (entryCount > 1) orchestrator.abort()
        return originalCreateDir(name, parentPath)
      }

      const result = await orchestrator.execute(catalog, entries)

      expect(result.success).toBe(false)
      expect(result.progress.imported).toBeLessThan(10)
    })

    it('should report progress with currentItem', async () => {
      const catalog = createMockCatalog()
      const orchestrator = new ImportOrchestrator()
      const entries = [makeEntry({id: '1', name: 'First'})]
      const progressUpdates: ImportProgress[] = []

      await orchestrator.execute(catalog, entries, (p) => progressUpdates.push({...p}))

      const withCurrentItem = progressUpdates.find((p) => p.currentItem === 'First')
      expect(withCurrentItem).toBeDefined()
    })

    it('should return success false when there are errors', async () => {
      const catalog = createMockCatalog()
      catalog.createDir = async () => {
        throw new Error('fail')
      }

      const orchestrator = new ImportOrchestrator()
      const result = await orchestrator.execute(catalog, [makeEntry()])

      expect(result.success).toBe(false)
      expect(result.progress.errors).toBe(1)
    })

    it('should overwrite existing entries and create new ones', async () => {
      const catalog = createMockCatalog()
      const orchestrator = new ImportOrchestrator()

      const existingMap = new Map<string, ExistingEntryInfo>([
        ['existing-1', {nodeId: 100, path: '/Social/GitHub', childNodeIds: [201, 202, 203]}],
      ])

      const entries = [
        makeEntry({id: 'existing-1', name: 'GitHub'}),
        makeEntry({id: 'new-1', name: 'Twitter'}),
      ]

      const result = await orchestrator.execute(catalog, entries, undefined, existingMap)

      expect(result.success).toBe(true)
      expect(result.progress.updated).toBe(1)
      expect(result.progress.imported).toBe(1)
    })

    it('should not add overwritten entries to rollback list', async () => {
      const catalog = createMockCatalog()
      const orchestrator = new ImportOrchestrator()

      const existingMap = new Map<string, ExistingEntryInfo>([
        ['existing-1', {nodeId: 100, path: '/Social/GitHub', childNodeIds: [201]}],
      ])

      const entries = [makeEntry({id: 'existing-1', name: 'GitHub'})]
      const result = await orchestrator.execute(catalog, entries, undefined, existingMap)

      expect(result.success).toBe(true)
      expect(result.progress.updated).toBe(1)
      expect(result.progress.imported).toBe(0)

      // Verify deleteNode was called only for child cleanup, not for rollback
      const deleteCalls = catalog.calls.filter((c) => c.method === 'deleteNode')
      expect(deleteCalls).toHaveLength(1)
      expect(deleteCalls[0]!.args[0]).toBe(201)
    })
  })

  describe('overwriteEntry', () => {
    it('should delete child nodes and write new files to existing path', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({id: 'entry-1', name: 'GitHub'})
      const existing: ExistingEntryInfo = {
        nodeId: 100,
        path: '/Social/GitHub',
        childNodeIds: [201, 202, 203],
      }

      const result = await overwriteEntry(catalog, entry, existing)

      expect(result.entryNodeId).toBe(100)

      const deleteCalls = catalog.calls.filter((c) => c.method === 'deleteNode')
      expect(deleteCalls).toHaveLength(3)
      expect(deleteCalls.map((c) => c.args[0])).toEqual([201, 202, 203])

      const uploadCalls = catalog.calls.filter((c) => c.method === 'prepareUpload')
      const parentPaths = uploadCalls.map((c) => c.args[0])
      for (const p of parentPaths) {
        expect(p).toBe('/Social/GitHub')
      }
      const fileNames = uploadCalls.map((c) => c.args[1])
      expect(fileNames).toContain('meta.json')
      expect(fileNames).toContain('.password')
    })

    it('should not create any directories', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry()
      const existing: ExistingEntryInfo = {
        nodeId: 50,
        path: '/Work/Slack',
        childNodeIds: [],
      }

      await overwriteEntry(catalog, entry, existing)

      const createDirCalls = catalog.calls.filter((c) => c.method === 'createDir')
      expect(createDirCalls).toHaveLength(0)
    })

    it('should save overwrite target by existing entryId and keep original_id in import_source', async () => {
      const catalog = createMockCatalog()
      const entry = makeEntry({
        id: 'keepass-id-1',
        otp: {secret: 'JBSWY3DPEHPK3PXP', label: 'OTP', encoding: 'base32', type: 'TOTP'},
      })
      const existing: ExistingEntryInfo = {
        nodeId: 77,
        path: '/Root/Entry',
        childNodeIds: [],
        entryId: 'domain-entry-77',
      }

      await overwriteEntry(catalog, entry, existing)

      const uploadCalls = catalog.calls.filter((c) => c.method === 'upload')
      const metaBytes = uploadCalls[0]?.args[2] as Uint8Array
      const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as {
        id?: string
        import_source?: {original_id?: string}
      }

      expect(meta.id).toBe('domain-entry-77')
      expect(meta.import_source?.original_id).toBe('keepass-id-1')

      const otpCall = catalog.calls.find((c) => c.method === 'setOTPSecret')
      const otpArgs = otpCall?.args[0] as {entryId?: string}
      expect(otpArgs.entryId).toBe('domain-entry-77')
    })
  })
})
