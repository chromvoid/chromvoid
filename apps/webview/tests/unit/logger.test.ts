import {describe, expect, it} from 'vitest'

import {createDefaultLogger} from '../../src/core/logger'

describe('default logger', () => {
  it('uses info level outside dev runtime', () => {
    expect(createDefaultLogger(false).level).toBe('info')
  })

  it('uses debug level in dev runtime', () => {
    expect(createDefaultLogger(true).level).toBe('debug')
  })
})
