import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {readFileSync} from 'fs'
import {KeePassParseError, parseKeePass} from './keepass.js'

/* eslint-disable @typescript-eslint/no-explicit-any */

function loadFixture() {
  const buf = readFileSync(new URL('./kees.kdbx', import.meta.url))
  return new File([buf], 'kees.kdbx')
}

describe('KeePass parser', () => {
  describe('KeePassParseError', () => {
    it('should create error with correct code', () => {
      const error = new KeePassParseError('test', 'IMPORT_INVALID_PASSWORD')
      expect(error.name).toBe('KeePassParseError')
      expect(error.code).toBe('IMPORT_INVALID_PASSWORD')
      expect(error.message).toBe('test')
      expect(error).toBeInstanceOf(Error)
    })

    it('should support all error codes', () => {
      const codes = [
        'IMPORT_INVALID_PASSWORD',
        'IMPORT_CORRUPT_FILE',
        'IMPORT_UNSUPPORTED_FORMAT',
        'IMPORT_FILE_TOO_LARGE',
        'IMPORT_TOO_MANY_ENTRIES',
        'IMPORT_PARSE_ERROR',
      ] as const
      for (const code of codes) {
        const error = new KeePassParseError('test', code)
        expect(error.code).toBe(code)
        expect(error.name).toBe('KeePassParseError')
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('should have correct prototype chain', () => {
      const error = new KeePassParseError('msg', 'IMPORT_PARSE_ERROR')
      expect(error instanceof KeePassParseError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('parseKeePass', () => {
    it('should reject files larger than 50MB', async () => {
      const {parseKeePass} = await import('./keepass.js')
      const file = new File(['x'], 'test.kdbx')
      Object.defineProperty(file, 'size', {value: 51 * 1024 * 1024})

      await expect(parseKeePass(file, 'password')).rejects.toThrow(KeePassParseError)
      try {
        await parseKeePass(file, 'password')
      } catch (e) {
        expect((e as KeePassParseError).code).toBe('IMPORT_FILE_TOO_LARGE')
      }
    })

    it('should accept files at exactly 50MB', async () => {
      const {parseKeePass} = await import('./keepass.js')
      const file = new File(['x'], 'test.kdbx')
      Object.defineProperty(file, 'size', {value: 50 * 1024 * 1024})

      try {
        await parseKeePass(file, 'password')
      } catch (e) {
        expect((e as KeePassParseError).code).not.toBe('IMPORT_FILE_TOO_LARGE')
      }
    })

    it('should throw IMPORT_PARSE_ERROR for invalid kdbx data', async () => {
      const {parseKeePass} = await import('./keepass.js')
      const file = new File(['not a kdbx file'], 'test.kdbx', {type: 'application/octet-stream'})

      await expect(parseKeePass(file, 'password')).rejects.toThrow(KeePassParseError)
    })

    it('should throw for data with bad signature', async () => {
      const {parseKeePass} = await import('./keepass.js')
      const file = new File([new Uint8Array(100)], 'test.kdbx')

      try {
        await parseKeePass(file, 'password')
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(KeePassParseError)
        const code = (e as KeePassParseError).code
        expect(['IMPORT_CORRUPT_FILE', 'IMPORT_UNSUPPORTED_FORMAT', 'IMPORT_PARSE_ERROR']).toContain(code)
      }
    })

    it('should include file size in error message for oversized files', async () => {
      const {parseKeePass} = await import('./keepass.js')
      const file = new File(['x'], 'test.kdbx')
      Object.defineProperty(file, 'size', {value: 60 * 1024 * 1024})

      try {
        await parseKeePass(file, 'password')
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as KeePassParseError).message).toContain('60.0MB')
        expect((e as KeePassParseError).message).toContain('50MB')
      }
    })
  })

  describe('parseKeePass with mocked kdbxweb', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.doUnmock('kdbxweb')
    })

    function mockKdbxweb(loadResult: any) {
      vi.doMock('kdbxweb', () => ({
        Credentials: class {},
        ProtectedValue: {fromString: () => ({})},
        Kdbx: {
          load: typeof loadResult === 'function' ? loadResult : vi.fn().mockResolvedValue(loadResult),
        },
      }))
    }

    function mockKdbxwebError(error: Error) {
      vi.doMock('kdbxweb', () => ({
        Credentials: class {},
        ProtectedValue: {fromString: () => ({})},
        Kdbx: {
          load: vi.fn().mockRejectedValue(error),
        },
      }))
    }

    async function importParseKeePass() {
      const mod = await import('./keepass.js')
      return mod.parseKeePass
    }

    function makeFile() {
      return new File(['x'], 'test.kdbx')
    }

    function makeDb(rootGroups: any[] = [], rootEntries: any[] = []) {
      return {
        groups: [
          {
            uuid: {toString: () => 'root-uuid'},
            name: 'Root',
            enableSearching: undefined,
            entries: rootEntries,
            groups: rootGroups,
          },
        ],
      }
    }

    function makeEntry(fieldsArr: [string, any][], uuid = 'entry-1') {
      return {
        uuid: {toString: () => uuid},
        fields: new Map<string, any>(fieldsArr),
      }
    }

    function makeEntryObject(fields: Record<string, any>, uuid = 'entry-1') {
      return {
        uuid: {toString: () => uuid},
        fields,
      }
    }

    function makeGroup(
      name: string,
      opts: {entries?: any[]; groups?: any[]; enableSearching?: boolean; uuid?: string} = {},
    ) {
      return {
        uuid: {toString: () => opts.uuid ?? `${name}-uuid`},
        name,
        enableSearching: opts.enableSearching ?? undefined,
        entries: opts.entries ?? [],
        groups: opts.groups ?? [],
      }
    }

    it('should map Invalid credentials error to IMPORT_INVALID_PASSWORD', async () => {
      mockKdbxwebError(new Error('Invalid credentials or key'))
      const parseKeePass = await importParseKeePass()

      try {
        await parseKeePass(makeFile(), 'wrong')
        expect.fail('Should have thrown')
      } catch (e: any) {
        expect(e.name).toBe('KeePassParseError')
        expect(e.code).toBe('IMPORT_INVALID_PASSWORD')
      }
    })

    it('should map Not a KeePass error to IMPORT_CORRUPT_FILE', async () => {
      mockKdbxwebError(new Error('Not a KeePass database'))
      const parseKeePass = await importParseKeePass()

      try {
        await parseKeePass(makeFile(), 'test')
        expect.fail('Should have thrown')
      } catch (e: any) {
        expect(e.name).toBe('KeePassParseError')
        expect(e.code).toBe('IMPORT_CORRUPT_FILE')
      }
    })

    it('should map signature error to IMPORT_CORRUPT_FILE', async () => {
      mockKdbxwebError(new Error('Bad signature'))
      const parseKeePass = await importParseKeePass()

      try {
        await parseKeePass(makeFile(), 'test')
        expect.fail('Should have thrown')
      } catch (e: any) {
        expect(e.name).toBe('KeePassParseError')
        expect(e.code).toBe('IMPORT_CORRUPT_FILE')
      }
    })

    it('should map Unsupported version error to IMPORT_UNSUPPORTED_FORMAT', async () => {
      mockKdbxwebError(new Error('Unsupported version'))
      const parseKeePass = await importParseKeePass()

      try {
        await parseKeePass(makeFile(), 'test')
        expect.fail('Should have thrown')
      } catch (e: any) {
        expect(e.name).toBe('KeePassParseError')
        expect(e.code).toBe('IMPORT_UNSUPPORTED_FORMAT')
      }
    })

    it('should map unknown error to IMPORT_PARSE_ERROR', async () => {
      mockKdbxwebError(new Error('Something unexpected happened'))
      const parseKeePass = await importParseKeePass()

      try {
        await parseKeePass(makeFile(), 'test')
        expect.fail('Should have thrown')
      } catch (e: any) {
        expect(e.name).toBe('KeePassParseError')
        expect(e.code).toBe('IMPORT_PARSE_ERROR')
      }
    })

    it('should process groups and entries from a mock database', async () => {
      const entry = makeEntry(
        [
          ['Title', 'My Login'],
          ['UserName', 'user@example.com'],
          ['Password', 'secret123'],
          ['URL', 'https://example.com'],
          ['Notes', 'Some notes'],
        ],
        'entry-uuid-1',
      )

      const group = makeGroup('Personal', {entries: [entry]})
      const db = makeDb([group])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]).toMatchObject({
        id: 'entry-uuid-1',
        type: 'login',
        name: 'My Login',
        username: 'user@example.com',
        password: 'secret123',
        notes: 'Some notes',
        folder: 'Personal',
      })
      expect(result.entries[0]!.urls).toEqual([{value: 'https://example.com', match: 'base_domain'}])

      expect(result.folders).toHaveLength(1)
      expect(result.folders[0]).toMatchObject({name: 'Personal', path: 'Personal'})

      expect(result.conflicts).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('should process entries when fields are plain objects', async () => {
      const entry = makeEntryObject(
        {
          Title: 'Object Fields Login',
          UserName: 'object-user@example.com',
          Password: {getText: () => 'obj-secret-123'},
          URL: 'https://object.example.com',
          Notes: 'Object notes',
          CustomKey: 'CustomValue',
        },
        'entry-obj-uuid-1',
      )

      const group = makeGroup('Personal', {entries: [entry]})
      const db = makeDb([group])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]).toMatchObject({
        id: 'entry-obj-uuid-1',
        type: 'login',
        name: 'Object Fields Login',
        username: 'object-user@example.com',
        password: 'obj-secret-123',
        notes: 'Object notes',
        folder: 'Personal',
      })
      expect(result.entries[0]!.urls).toEqual([{value: 'https://object.example.com', match: 'base_domain'}])
      expect(result.entries[0]!.customFields).toEqual([{key: 'CustomKey', value: 'CustomValue'}])
    })

    it('should skip Recycle Bin group', async () => {
      const recycleBin = makeGroup('Recycle Bin', {
        entries: [
          makeEntry([
            ['Title', 'Deleted'],
            ['Password', 'pass'],
          ]),
        ],
      })
      const db = makeDb([recycleBin])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(0)
      expect(result.folders.find((f) => f.name === 'Recycle Bin')).toBeUndefined()
    })

    it('should skip groups with enableSearching === false', async () => {
      const hidden = makeGroup('Hidden Group', {
        enableSearching: false,
        entries: [
          makeEntry([
            ['Title', 'Hidden'],
            ['Password', 'pass'],
          ]),
        ],
      })
      const db = makeDb([hidden])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(0)
    })

    it('should skip entries without title and password and add warning', async () => {
      const entry = makeEntry([
        ['Title', ''],
        ['UserName', 'just-username'],
        ['Password', ''],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(0)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('just-username')
    })

    it('should classify entries as secure_note when no password', async () => {
      const entry = makeEntry([
        ['Title', 'My Note'],
        ['UserName', ''],
        ['Password', ''],
        ['Notes', 'Important note content'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.type).toBe('secure_note')
      expect(result.entries[0]!.name).toBe('My Note')
      expect(result.entries[0]!.password).toBeUndefined()
    })

    it('should extract custom fields', async () => {
      const entry = makeEntry([
        ['Title', 'Custom Entry'],
        ['Password', 'pass'],
        ['CustomKey', 'CustomValue'],
        ['AnotherField', 'AnotherValue'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.customFields).toEqual([
        {key: 'CustomKey', value: 'CustomValue'},
        {key: 'AnotherField', value: 'AnotherValue'},
      ])
    })

    it('should extract keepass standard icon id', async () => {
      const entry = {
        ...makeEntry([
          ['Title', 'Standard Icon Entry'],
          ['Password', 'pass'],
        ]),
        icon: 4,
      }
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.icon).toMatchObject({
        source: 'keepass-standard',
        sourceId: '4',
      })
    })

    it('should extract keepass custom icon payload', async () => {
      const iconBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
      ])
      const entry = {
        ...makeEntry([
          ['Title', 'Custom Icon Entry'],
          ['Password', 'pass'],
        ]),
        customIconUuid: 'custom-1',
      }
      const db = makeDb([], [entry]) as any
      db.meta = {
        customIcons: new Map([['custom-1', iconBytes]]),
      }

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.icon).toMatchObject({
        source: 'keepass-custom',
        sourceId: 'custom-1',
        mimeType: 'image/png',
        contentBase64: Buffer.from(iconBytes).toString('base64'),
      })
    })

    it('should extract OTP from otpauth:// URI', async () => {
      const entry = makeEntry([
        ['Title', 'OTP Entry'],
        ['Password', 'pass'],
        ['otp', 'otpauth://totp/test?secret=JBSWY3DPEHPK3PXP&issuer=Test'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.otp).toEqual({
        secret: 'JBSWY3DPEHPK3PXP',
        label: 'OTP',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        encoding: 'base32',
        type: 'TOTP',
      })
    })

    it('should extract OTP from base32 secret string', async () => {
      const entry = makeEntry([
        ['Title', 'OTP Base32'],
        ['Password', 'pass'],
        ['otp', 'JBSWY3DPEHPK3PXP'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.otp).toMatchObject({
        secret: 'JBSWY3DPEHPK3PXP',
        encoding: 'base32',
        type: 'TOTP',
      })
    })

    it('should extract OTP from TOTP Seed field', async () => {
      const entry = makeEntry([
        ['Title', 'TOTP Seed Entry'],
        ['Password', 'pass'],
        ['TOTP Seed', 'MYSECRET32'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.otp).toMatchObject({
        secret: 'MYSECRET32',
        type: 'TOTP',
      })
    })

    it('should extract OTP from TimeOtp-Secret-Base32 field', async () => {
      const entry = makeEntry([
        ['Title', 'TimeOtp Entry'],
        ['Password', 'pass'],
        ['TimeOtp-Secret-Base32', 'BASE32SECRET'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.otp).toMatchObject({
        secret: 'BASE32SECRET',
        type: 'TOTP',
      })
    })

    it('should not include OTP fields in custom fields', async () => {
      const entry = makeEntry([
        ['Title', 'OTP No Custom'],
        ['Password', 'pass'],
        ['otp', 'otpauth://totp/test?secret=ABC&issuer=Test'],
        ['CustomField', 'value'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      const otpInCustom = result.entries[0]!.customFields?.find((f) => f.key === 'otp')
      expect(otpInCustom).toBeUndefined()
      const custom = result.entries[0]!.customFields?.find((f) => f.key === 'CustomField')
      expect(custom).toBeDefined()
    })

    it('should handle string Password field (non-ProtectedValue)', async () => {
      const entry = makeEntry([
        ['Title', 'String Pass Entry'],
        ['Password', 'plain-pass'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.password).toBe('plain-pass')
    })

    it('should stop at entry limit and add warning', async () => {
      const entries = Array.from({length: 10_001}, (_, i) =>
        makeEntry(
          [
            ['Title', `Entry ${i}`],
            ['Password', `pass-${i}`],
          ],
          `entry-${i}`,
        ),
      )

      const db = makeDb([], entries)

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toHaveLength(10_000)
      expect(result.warnings).toContain('Import limit reached: only first 10000 entries were imported')
    })

    it('should handle empty database with no entries', async () => {
      const db = makeDb()

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries).toEqual([])
      expect(result.folders).toHaveLength(0)
      expect(result.conflicts).toEqual([])
    })

    it('should handle nested group hierarchy', async () => {
      const level2 = makeGroup('Level2', {
        entries: [
          makeEntry(
            [
              ['Title', 'Deep Entry'],
              ['Password', 'deep-pass'],
            ],
            'deep-entry',
          ),
        ],
      })
      const level1 = makeGroup('Level1', {groups: [level2]})
      const db = makeDb([level1])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.folder).toBe('Level1/Level2')
      expect(result.folders).toHaveLength(2)
      expect(result.folders[1]).toMatchObject({
        name: 'Level2',
        path: 'Level1/Level2',
      })
    })

    it('should replace slashes in group names with fraction slash (U+2215)', async () => {
      const entry = makeEntry(
        [
          ['Title', 'Receipt'],
          ['Password', 'pass'],
        ],
        'entry-slash',
      )
      const group = makeGroup('Чеки/Квитанции', {entries: [entry]})
      const db = makeDb([group])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      // Slash in group name must NOT create nested groups
      expect(result.folders).toHaveLength(1)
      expect(result.folders[0]!.name).toBe('Чеки\u2215Квитанции')
      expect(result.folders[0]!.path).toBe('Чеки\u2215Квитанции')
      expect(result.entries[0]!.folder).toBe('Чеки\u2215Квитанции')
    })

    it('should use "Untitled" for entries without a title', async () => {
      const entry = makeEntry([
        ['Title', ''],
        ['Password', 'has-pass'],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      expect(result.entries[0]!.name).toBe('Untitled')
    })

    it('should not include empty optional fields', async () => {
      const entry = makeEntry([
        ['Title', 'Minimal'],
        ['UserName', ''],
        ['Password', 'pass'],
        ['URL', ''],
        ['Notes', ''],
      ])
      const db = makeDb([], [entry])

      mockKdbxweb(db)
      const parseKeePass = await importParseKeePass()
      const result = await parseKeePass(makeFile(), 'password')

      const e = result.entries[0]!
      expect(e.username).toBeUndefined()
      expect(e.urls).toBeUndefined()
      expect(e.notes).toBeUndefined()
      expect(e.customFields).toBeUndefined()
      expect(e.otp).toBeUndefined()
    })
  })

  describe('parseKeePass with real kdbx file (kees.kdbx)', () => {
    const PASSWORD = '123123123123'

    it('should parse the file without errors', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)

      expect(result.entries).toBeInstanceOf(Array)
      expect(result.folders).toBeInstanceOf(Array)
      expect(result.conflicts).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('should extract exactly one entry', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)
      expect(result.entries).toHaveLength(1)
    })

    it('should parse entry fields correctly', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)
      const entry = result.entries[0]!

      expect(entry).toMatchObject({
        type: 'login',
        name: 'Test',
        username: 'user',
        password: ',asK[_Km>eG#}?f(p[zUggFwJ6!A',
      })
      expect(entry.folder).toBeUndefined()
    })

    it('should extract URL with base_domain match', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)
      const entry = result.entries[0]!

      expect(entry.urls).toEqual([{value: 'google.com', match: 'base_domain'}])
    })

    it('should extract custom fields', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)
      const entry = result.entries[0]!

      expect(entry.customFields).toEqual([{key: 'Поле', value: 'Значение'}])
    })

    it('should extract folder hierarchy', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)

      expect(result.folders).toHaveLength(5)
      expect(result.folders.map((f) => f.name)).toEqual([
        'Windows',
        'Сеть',
        'Интернет',
        'EMail',
        'Домашний банк',
      ])
    })

    it('should build correct folder paths', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)

      expect(result.folders.map((f) => f.path)).toEqual([
        'Windows',
        'Сеть',
        'Интернет',
        'EMail',
        'Домашний банк',
      ])
    })

    it('should assign unique ids to all folders', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)
      const ids = result.folders.map((f) => f.id)

      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) {
        expect(id).toBeTruthy()
      }
    })

    it('should throw IMPORT_INVALID_PASSWORD for wrong password', async () => {
      await expect(parseKeePass(loadFixture(), 'wrong-password')).rejects.toThrow(KeePassParseError)

      try {
        await parseKeePass(loadFixture(), 'wrong-password')
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as KeePassParseError).code).toBe('IMPORT_INVALID_PASSWORD')
      }
    })

    it('should have no OTP on the entry', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)
      expect(result.entries[0]!.otp).toBeUndefined()
    })

    it('should have no notes on the entry', async () => {
      const result = await parseKeePass(loadFixture(), PASSWORD)
      expect(result.entries[0]!.notes).toBeUndefined()
    })
  })
})
