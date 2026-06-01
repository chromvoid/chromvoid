import {describe, expect, it} from 'vitest'

import {formatMarkdownSource} from '../../src/features/file-manager/services/markdown-formatter'

describe('formatMarkdownSource', () => {
  it('formats Markdown with Prettier while preserving prose wrapping', async () => {
    await expect(formatMarkdownSource('# Title\n\nA long paragraph stays on one line.\n- one\n- two')).resolves.toBe(
      '# Title\n\nA long paragraph stays on one line.\n\n- one\n- two\n',
    )
  })
})
