import {expect, test} from 'vitest'
import * as passwordImport from '../../../../packages/password-import/src/index'

// Test that password-import package is available
test('Import Password → Package is available', () => {
  expect(passwordImport).toBeTruthy()
})

// Test that parsers can be imported (minimal test)
test('Import Password → Parsers can be imported', async () => {
  expect(typeof passwordImport.parseKeePass).toBe('function')
  expect(typeof passwordImport.parseCSV).toBe('function')
  expect(typeof passwordImport.parseBitwardenJson).toBe('function')

  // Test that mapper is available
  expect(typeof passwordImport.detectConflicts).toBe('function')
  expect(typeof passwordImport.mapAndSaveEntry).toBe('function')

  // Test that dialog is available
  expect(typeof passwordImport.ImportDialog).toBe('function')
})
