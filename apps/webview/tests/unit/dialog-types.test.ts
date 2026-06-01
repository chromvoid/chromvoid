import {describe, expect, it} from 'vitest'

import {FileValidators} from '../../src/shared/services/dialog-types'

describe('FileValidators', () => {
  it('returns translated required and max-length validation messages', () => {
    expect(FileValidators.required('   ')).toEqual({
      valid: false,
      message: 'This field is required',
    })

    expect(FileValidators.maxLength(3)('abcd')).toEqual({
      valid: false,
      message: 'Maximum length: 3 characters',
    })
  })

  it('returns translated file-name validation messages', () => {
    expect(FileValidators.fileName('')).toEqual({
      valid: false,
      message: 'File name cannot be empty',
    })

    expect(FileValidators.fileName('bad:name')).toEqual({
      valid: false,
      message: 'File name contains invalid characters: < > : " / \\\\ | ? *',
    })

    expect(FileValidators.fileName('CON')).toEqual({
      valid: false,
      message: 'This name is reserved by the system and cannot be used',
    })

    expect(FileValidators.fileName('name.')).toEqual({
      valid: false,
      message: 'File name cannot start or end with a dot or space',
    })
  })
})
