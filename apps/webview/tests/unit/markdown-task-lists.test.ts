import {describe, expect, it} from 'vitest'

import {
  findMarkdownTaskMarkerInLine,
  getMarkdownTaskListItemCheckedAtLine,
  toggleMarkdownTaskListItemAtLine,
} from '../../src/features/file-manager/services/markdown-task-lists'

describe('markdown task list helpers', () => {
  it.each([
    ['- [ ] todo', '- [x] todo', true],
    ['* [x] done', '* [ ] done', false],
    ['+ [X] done', '+ [ ] done', false],
    ['  - [ ] nested', '  - [x] nested', true],
    ['1. [ ] ordered', '1. [x] ordered', true],
    ['2) [x] ordered', '2) [ ] ordered', false],
  ])('toggles %s', (line, expectedLine, checked) => {
    const result = toggleMarkdownTaskListItemAtLine(line, 0)

    expect(result).toEqual({source: expectedLine, checked})
  })

  it('toggles the requested source line without changing adjacent content', () => {
    const source = '# Notes\n\n- [ ] first\n- [x] second'

    expect(toggleMarkdownTaskListItemAtLine(source, 3)).toEqual({
      source: '# Notes\n\n- [ ] first\n- [ ] second',
      checked: false,
    })
  })

  it('ignores non-task lines and out-of-range lines', () => {
    expect(toggleMarkdownTaskListItemAtLine('- regular item', 0)).toBeNull()
    expect(toggleMarkdownTaskListItemAtLine('- [ ] todo', 3)).toBeNull()
    expect(toggleMarkdownTaskListItemAtLine('- [ ] todo', -1)).toBeNull()
  })

  it('reads the checked state for a source line', () => {
    const source = '# Notes\n\n- [ ] first\n- [x] second'

    expect(getMarkdownTaskListItemCheckedAtLine(source, 2)).toBe(false)
    expect(getMarkdownTaskListItemCheckedAtLine(source, 3)).toBe(true)
    expect(getMarkdownTaskListItemCheckedAtLine(source, 1)).toBeNull()
  })

  it('reports marker positions inside a full source line', () => {
    expect(findMarkdownTaskMarkerInLine('  12. [x] item', 4)).toEqual({
      checked: true,
      line: 4,
      markerStart: 6,
      markerEnd: 9,
    })
  })
})
