import {describe, expect, it} from 'vitest'
import {getImportDialogFileAccept} from './file-accept.js'

describe('getImportDialogFileAccept', () => {
  it('keeps the extension filter on desktop runtimes', () => {
    expect(
      getImportDialogFileAccept(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
      ),
    ).toBe('.kdbx,.json,.csv')
  })

  it('removes the accept filter on Android so .kdbx stays selectable', () => {
    expect(
      getImportDialogFileAccept(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36',
      ),
    ).toBeNull()
  })
})
