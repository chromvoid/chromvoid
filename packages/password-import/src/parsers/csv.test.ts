import {describe, it, expect} from 'vitest'
import {parseCSV} from './csv.js'

function createCSVFile(content: string, name = 'test.csv'): File {
  return new File([content], name, {type: 'text/csv'})
}

describe('CSV parser', () => {
  describe('LastPass format', () => {
    it('should parse LastPass CSV export', async () => {
      const csv = `url,username,password,extra,name,grouping,fav
https://github.com,user@test.com,secret123,some notes,GitHub,Social,0
https://gmail.com,user@test.com,pass456,,Gmail,Email,1`

      const result = await parseCSV(createCSVFile(csv))

      expect(result.entries).toHaveLength(2)
      expect(result.entries[0]!.name).toBe('GitHub')
      expect(result.entries[0]!.username).toBe('user@test.com')
      expect(result.entries[0]!.password).toBe('secret123')
      expect(result.entries[0]!.urls).toEqual([
        {value: 'https://github.com', match: 'base_domain'},
      ])
      expect(result.entries[0]!.notes).toBe('some notes')
      expect(result.entries[0]!.folder).toBe('Social')
      expect(result.entries[0]!.type).toBe('login')

      expect(result.entries[1]!.name).toBe('Gmail')
      expect(result.entries[1]!.folder).toBe('Email')
    })
  })

  describe('Bitwarden format', () => {
    it('should parse Bitwarden CSV export', async () => {
      const csv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
Social,1,login,GitHub,,,,https://github.com,user@test.com,secret123,
Banking,,login,Chase,,,,https://chase.com,bankuser,bankpass,`

      const result = await parseCSV(createCSVFile(csv))

      expect(result.entries).toHaveLength(2)
      expect(result.entries[0]!.name).toBe('GitHub')
      expect(result.entries[0]!.username).toBe('user@test.com')
      expect(result.entries[0]!.password).toBe('secret123')
      expect(result.entries[0]!.urls).toEqual([
        {value: 'https://github.com', match: 'base_domain'},
      ])
      expect(result.entries[0]!.folder).toBe('Social')
    })
  })

  describe('Generic format', () => {
    it('should parse generic CSV with title/username/password/url/notes', async () => {
      const csv = `title,username,password,url,notes,folder
GitHub,user@test.com,secret123,https://github.com,my notes,Dev`

      const result = await parseCSV(createCSVFile(csv))

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.name).toBe('GitHub')
      expect(result.entries[0]!.password).toBe('secret123')
      expect(result.entries[0]!.folder).toBe('Dev')
    })
  })

  describe('Invalid rows', () => {
    it('should skip rows without title', async () => {
      const csv = `name,password
,secret123
GitHub,pass456`

      const result = await parseCSV(createCSVFile(csv))

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.name).toBe('GitHub')
      expect(result.warnings.some((w) => w.includes('Skipped'))).toBe(true)
    })

    it('should skip rows without password', async () => {
      const csv = `name,password
GitHub,
Chase,bankpass`

      const result = await parseCSV(createCSVFile(csv))

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.name).toBe('Chase')
    })
  })

  describe('Folder handling', () => {
    it('should normalize folder paths', async () => {
      const csv = `name,password,folder
A,pass1,Social/Media
B,pass2,Banking\\Savings
C,pass3,/`

      const result = await parseCSV(createCSVFile(csv))

      expect(result.entries[0]!.folder).toBe('Social/Media')
      expect(result.entries[1]!.folder).toBe('Banking/Savings')
      expect(result.entries[2]!.folder).toBeUndefined()
    })

    it('should collect unique folders', async () => {
      const csv = `name,password,folder
A,pass1,Social
B,pass2,Social
C,pass3,Banking`

      const result = await parseCSV(createCSVFile(csv))

      const folderPaths = result.folders.map((f) => f.path)
      expect(folderPaths).toContain('Social')
      expect(folderPaths).toContain('Banking')
    })
  })

  describe('File size validation', () => {
    it('should reject files larger than 50MB', async () => {
      const file = createCSVFile('name,password\ntest,pass')
      Object.defineProperty(file, 'size', {value: 51 * 1024 * 1024})

      await expect(parseCSV(file)).rejects.toThrow('File too large')
    })
  })

  describe('Empty and edge cases', () => {
    it('should handle empty CSV', async () => {
      const csv = `name,password`
      const result = await parseCSV(createCSVFile(csv))
      expect(result.entries).toHaveLength(0)
    })

    it('should return empty conflicts array', async () => {
      const csv = `name,password\nTest,pass1`
      const result = await parseCSV(createCSVFile(csv))
      expect(result.conflicts).toEqual([])
    })

    it('should handle entries without url', async () => {
      const csv = `name,password
MyEntry,secret`
      const result = await parseCSV(createCSVFile(csv))
      expect(result.entries[0]!.urls).toEqual([])
    })

    it('should trim whitespace from values', async () => {
      const csv = `name,password,username
  GitHub  ,  pass123  ,  user@test.com  `
      const result = await parseCSV(createCSVFile(csv))
      expect(result.entries[0]!.name).toBe('GitHub')
      expect(result.entries[0]!.password).toBe('pass123')
      expect(result.entries[0]!.username).toBe('user@test.com')
    })

    it('should generate unique IDs for entries', async () => {
      const csv = `name,password
A,pass1
B,pass2`
      const result = await parseCSV(createCSVFile(csv))
      expect(result.entries[0]!.id).toBeTruthy()
      expect(result.entries[1]!.id).toBeTruthy()
      expect(result.entries[0]!.id).not.toBe(result.entries[1]!.id)
    })
  })

  describe('Field length validation', () => {
    it('should skip rows with title exceeding max length', async () => {
      const longTitle = 'A'.repeat(301)
      const csv = `name,password\n${longTitle},pass1\nValid,pass2`
      const result = await parseCSV(createCSVFile(csv))
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.name).toBe('Valid')
      expect(result.warnings.some((w) => w.includes('Field too long'))).toBe(true)
    })

    it('should skip rows with password exceeding max length', async () => {
      const longPass = 'P'.repeat(10001)
      const csv = `name,password\nTest,${longPass}\nValid,pass2`
      const result = await parseCSV(createCSVFile(csv))
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0]!.name).toBe('Valid')
    })
  })
})
