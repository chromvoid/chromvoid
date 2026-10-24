import {expect, test} from 'vitest'
import * as passwordImport from '@chromvoid/password-import'

test('Import Password → Core service and dialog are the public import boundary', () => {
  expect(typeof passwordImport.CredentialImportService).toBe('function')
  expect(typeof passwordImport.ImportDialog).toBe('function')
  expect(typeof passwordImport.setCredentialImportService).toBe('function')
  for (const retired of ['parseKeePass', 'parseCSV', 'parseBitwardenJson', 'parse1Password1PUX', 'mapAndSaveEntry']) {
    expect(retired in passwordImport).toBe(false)
  }
})
