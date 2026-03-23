import {describe, it, expect} from 'vitest'
import {
  IMPORT_LIMITS,
  ImportValidationError,
  assertFileSize,
  assertEntriesLimit,
  assertTextMaxLen,
} from './validation.js'

describe('validation', () => {
  describe('IMPORT_LIMITS', () => {
    it('should define all limit constants', () => {
      expect(IMPORT_LIMITS.MAX_FILE_SIZE).toBe(50 * 1024 * 1024)
      expect(IMPORT_LIMITS.MAX_ENTRIES).toBe(10_000)
      expect(IMPORT_LIMITS.MAX_NOTE_LENGTH).toBe(50_000)
      expect(IMPORT_LIMITS.MAX_PASSWORD_LENGTH).toBe(10_000)
      expect(IMPORT_LIMITS.MAX_TITLE_LENGTH).toBe(300)
      expect(IMPORT_LIMITS.MAX_USERNAME_LENGTH).toBe(300)
      expect(IMPORT_LIMITS.MAX_URL_LENGTH).toBe(2000)
      expect(IMPORT_LIMITS.MAX_URL_RULES).toBe(50)
      expect(IMPORT_LIMITS.MAX_CUSTOM_FIELDS).toBe(100)
      expect(IMPORT_LIMITS.MAX_CUSTOM_FIELD_KEY_LENGTH).toBe(200)
      expect(IMPORT_LIMITS.MAX_CUSTOM_FIELD_VALUE_LENGTH).toBe(10_000)
    })
  })

  describe('ImportValidationError', () => {
    it('should have correct name and code', () => {
      const error = new ImportValidationError('test', 'IMPORT_FILE_TOO_LARGE')
      expect(error.name).toBe('ImportValidationError')
      expect(error.code).toBe('IMPORT_FILE_TOO_LARGE')
      expect(error.message).toBe('test')
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('assertFileSize', () => {
    it('should pass for files under limit', () => {
      const file = new File(['x'], 'test.csv', {type: 'text/csv'})
      expect(() => assertFileSize(file)).not.toThrow()
    })

    it('should throw IMPORT_FILE_TOO_LARGE for files over 50MB', () => {
      const file = new File(['x'], 'test.csv')
      Object.defineProperty(file, 'size', {value: 51 * 1024 * 1024})
      expect(() => assertFileSize(file)).toThrow(ImportValidationError)
      try {
        assertFileSize(file)
      } catch (e) {
        expect((e as ImportValidationError).code).toBe('IMPORT_FILE_TOO_LARGE')
      }
    })

    it('should pass for files exactly at limit', () => {
      const file = new File(['x'], 'test.csv')
      Object.defineProperty(file, 'size', {value: 50 * 1024 * 1024})
      expect(() => assertFileSize(file)).not.toThrow()
    })
  })

  describe('assertEntriesLimit', () => {
    it('should pass for counts under limit', () => {
      expect(() => assertEntriesLimit(100)).not.toThrow()
      expect(() => assertEntriesLimit(10_000)).not.toThrow()
    })

    it('should throw IMPORT_TOO_MANY_ENTRIES for counts over limit', () => {
      expect(() => assertEntriesLimit(10_001)).toThrow(ImportValidationError)
      try {
        assertEntriesLimit(10_001)
      } catch (e) {
        expect((e as ImportValidationError).code).toBe('IMPORT_TOO_MANY_ENTRIES')
      }
    })
  })

  describe('assertTextMaxLen', () => {
    it('should pass for text under limit', () => {
      expect(() => assertTextMaxLen('hello', 10, 'test')).not.toThrow()
    })

    it('should pass for text exactly at limit', () => {
      expect(() => assertTextMaxLen('hello', 5, 'test')).not.toThrow()
    })

    it('should throw IMPORT_FIELD_TOO_LONG for text over limit', () => {
      expect(() => assertTextMaxLen('hello world', 5, 'test')).toThrow(ImportValidationError)
      try {
        assertTextMaxLen('hello world', 5, 'test')
      } catch (e) {
        expect((e as ImportValidationError).code).toBe('IMPORT_FIELD_TOO_LONG')
        expect((e as ImportValidationError).message).toContain('test')
      }
    })
  })
})
