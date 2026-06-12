import {describe, expect, it} from 'vitest'

import {formatFileSize} from '../../src/utils/format-file-size'

describe('formatFileSize', () => {
  it('formats TB and larger units without falling through to undefined units', () => {
    expect(formatFileSize(1024 ** 4)).toBe('1 TB')
    expect(formatFileSize(1024 ** 5)).toBe('1 PB')
  })

  it('uses caller-provided empty text for missing sizes', () => {
    expect(formatFileSize(undefined, {empty: '—'})).toBe('—')
    expect(formatFileSize(Number.NaN, {empty: '—'})).toBe('—')
  })
})
