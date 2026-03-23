import {describe, it, expect} from 'vitest'
import {parseBitwardenJson} from './bitwarden.js'

function createJsonFile(data: unknown, name = 'bitwarden.json'): File {
  return new File([JSON.stringify(data)], name, {type: 'application/json'})
}

const baseBitwardenExport = {
  encrypted: false,
  folders: [{id: 'folder-1', name: 'Social'}],
  items: [],
}

describe('Bitwarden JSON parser', () => {
  describe('Login entries (type: 1)', () => {
    it('should parse login entry with all fields', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [
          {
            id: 'item-1',
            folderId: 'folder-1',
            type: 1,
            name: 'GitHub',
            login: {
              username: 'user@test.com',
              password: 'secret123',
              totp: 'JBSWY3DPEHPK3PXP',
              uris: [{match: null, uri: 'https://github.com'}],
            },
            notes: 'My GitHub account',
            fields: [{name: 'Recovery Key', value: 'abc-def-ghi'}],
          },
        ],
      }

      const result = await parseBitwardenJson(createJsonFile(data))

      expect(result.entries).toHaveLength(1)
      const entry = result.entries[0]!
      expect(entry.id).toBe('item-1')
      expect(entry.type).toBe('login')
      expect(entry.name).toBe('GitHub')
      expect(entry.username).toBe('user@test.com')
      expect(entry.password).toBe('secret123')
      expect(entry.urls).toEqual([{value: 'https://github.com', match: 'base_domain'}])
      expect(entry.notes).toBe('My GitHub account')
      expect(entry.folder).toBe('Social')
      expect(entry.customFields).toEqual([{key: 'Recovery Key', value: 'abc-def-ghi'}])
      expect(entry.otp).toBeDefined()
      expect(entry.otp!.secret).toBe('JBSWY3DPEHPK3PXP')
    })

    it('should parse login without optional fields', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [{id: 'item-2', type: 1, name: 'Simple Login', login: {username: 'user', password: 'pass'}}],
      }

      const result = await parseBitwardenJson(createJsonFile(data))

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.urls).toBeUndefined()
      expect(result.entries[0]!.notes).toBeUndefined()
      expect(result.entries[0]!.customFields).toBeUndefined()
      expect(result.entries[0]!.otp).toBeUndefined()
      expect(result.entries[0]!.folder).toBeUndefined()
    })
  })

  describe('Secure note entries (type: 2)', () => {
    it('should parse secure note', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [{id: 'note-1', type: 2, name: 'My Note', notes: 'Secret note content'}],
      }

      const result = await parseBitwardenJson(createJsonFile(data))

      expect(result.entries[0]!.type).toBe('secure_note')
      expect(result.entries[0]!.notes).toBe('Secret note content')
    })
  })

  describe('Card entries (type: 3) → secure_note degradation', () => {
    it('should degrade card to secure_note with card details in notes', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [
          {
            id: 'card-1',
            type: 3,
            name: 'Visa Card',
            notes: 'My main card',
            card: {
              cardholderName: 'John Doe',
              number: '4111111111111111',
              expMonth: '12',
              expYear: '2025',
              code: '123',
              brand: 'Visa',
            },
          },
        ],
      }

      const result = await parseBitwardenJson(createJsonFile(data))

      expect(result.entries[0]!.type).toBe('secure_note')
      expect(result.entries[0]!.notes).toContain('My main card')
      expect(result.entries[0]!.notes).toContain('Card Details')
      expect(result.entries[0]!.notes).toContain('4111111111111111')
    })
  })

  describe('Identity entries (type: 4) → secure_note degradation', () => {
    it('should degrade identity to secure_note with identity details in notes', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [
          {
            id: 'identity-1',
            type: 4,
            name: 'Personal ID',
            identity: {firstName: 'John', lastName: 'Doe', email: 'john@example.com'},
          },
        ],
      }

      const result = await parseBitwardenJson(createJsonFile(data))

      expect(result.entries[0]!.type).toBe('secure_note')
      expect(result.entries[0]!.notes).toContain('Identity Details')
      expect(result.entries[0]!.notes).toContain('John')
    })
  })

  describe('URI match types', () => {
    it('should map all URI match types correctly', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [
          {
            id: 'uri-test',
            type: 1,
            name: 'URI Test',
            login: {
              username: 'user',
              password: 'pass',
              uris: [
                {match: null, uri: 'https://a.com'},
                {match: 0, uri: 'https://b.com'},
                {match: 1, uri: 'https://c.com'},
                {match: 2, uri: 'https://d.com'},
                {match: 3, uri: 'https://e.com'},
                {match: 4, uri: 'https://f.com'},
                {match: 5, uri: 'https://g.com'},
              ],
            },
          },
        ],
      }

      const result = await parseBitwardenJson(createJsonFile(data))
      const urls = result.entries[0]!.urls!

      expect(urls[0]!.match).toBe('base_domain')
      expect(urls[1]!.match).toBe('base_domain')
      expect(urls[2]!.match).toBe('host')
      expect(urls[3]!.match).toBe('starts_with')
      expect(urls[4]!.match).toBe('exact')
      expect(urls[5]!.match).toBe('regex')
      expect(urls[6]!.match).toBe('never')
    })
  })

  describe('Folder mapping', () => {
    it('should map items to folders by folderId', async () => {
      const data = {
        encrypted: false,
        folders: [
          {id: 'f1', name: 'Work'},
          {id: 'f2', name: 'Personal'},
        ],
        items: [
          {id: 'i1', folderId: 'f1', type: 1, name: 'Work Item', login: {username: 'u', password: 'p'}},
          {id: 'i2', folderId: 'f2', type: 1, name: 'Personal Item', login: {username: 'u', password: 'p'}},
          {id: 'i3', type: 1, name: 'No Folder', login: {username: 'u', password: 'p'}},
        ],
      }

      const result = await parseBitwardenJson(createJsonFile(data))

      expect(result.entries[0]!.folder).toBe('Work')
      expect(result.entries[1]!.folder).toBe('Personal')
      expect(result.entries[2]!.folder).toBeUndefined()
      expect(result.folders).toHaveLength(2)
    })
  })

  describe('Error handling', () => {
    it('should reject encrypted exports', async () => {
      const data = {encrypted: true, items: []}
      await expect(parseBitwardenJson(createJsonFile(data))).rejects.toThrow('Encrypted')
    })

    it('should reject invalid JSON', async () => {
      const file = new File(['not json'], 'test.json', {type: 'application/json'})
      await expect(parseBitwardenJson(file)).rejects.toThrow('Invalid JSON')
    })

    it('should reject files over 50MB', async () => {
      const file = createJsonFile({encrypted: false, items: []})
      Object.defineProperty(file, 'size', {value: 51 * 1024 * 1024})
      await expect(parseBitwardenJson(file)).rejects.toThrow('File too large')
    })

    it('should handle empty items array', async () => {
      const data = {encrypted: false, items: []}
      const result = await parseBitwardenJson(createJsonFile(data))
      expect(result.entries).toHaveLength(0)
    })
  })

  describe('OTP extraction', () => {
    it('should extract TOTP secret from login.totp', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [
          {
            id: 'otp-1',
            type: 1,
            name: 'OTP Test',
            login: {username: 'user', password: 'pass', totp: 'JBSWY3DPEHPK3PXP'},
          },
        ],
      }

      const result = await parseBitwardenJson(createJsonFile(data))

      expect(result.entries[0]!.otp).toBeDefined()
      expect(result.entries[0]!.otp!.secret).toBe('JBSWY3DPEHPK3PXP')
      expect(result.entries[0]!.otp!.type).toBe('TOTP')
      expect(result.entries[0]!.otp!.encoding).toBe('base32')
    })

    it('should not set OTP when totp is null', async () => {
      const data = {
        ...baseBitwardenExport,
        items: [{id: 'no-otp', type: 1, name: 'No OTP', login: {username: 'u', password: 'p', totp: null}}],
      }

      const result = await parseBitwardenJson(createJsonFile(data))
      expect(result.entries[0]!.otp).toBeUndefined()
    })
  })
})
