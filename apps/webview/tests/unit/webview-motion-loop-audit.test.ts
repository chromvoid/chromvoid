import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

import {
  collectMotionLoopFindings,
  compareFindingsToBaseline,
  classifications,
  loadBaseline,
  validateBaseline,
} from '../../../../scripts/check-webview-motion-loops.mjs'

function writeFixture(rootDir: string, relativePath: string, body: string) {
  const fullPath = path.join(rootDir, relativePath)
  mkdirSync(path.dirname(fullPath), {recursive: true})
  writeFileSync(fullPath, body)
}

describe('WebView motion loop audit', () => {
  it('fails synthetic new decorative loop candidates that are not baselined', () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'chromvoid-motion-loop-check-'))

    try {
      writeFixture(
        tempRoot,
        'apps/webview/src/features/example/decorative.ts',
        `
export const styles = css\`
  .decorative {
    animation: glow-loop 2s linear infinite;
  }
\`
`,
      )

      const findings = collectMotionLoopFindings(tempRoot, ['apps/webview/src'])
      const result = compareFindingsToBaseline(findings, [])

      expect(result.schemaErrors).toEqual([])
      expect(result.unbaselinedFindings).toHaveLength(1)
      expect(result.unbaselinedFindings[0]).toMatchObject({
        path: 'apps/webview/src/features/example/decorative.ts',
        term: 'glow-loop',
      })
    } finally {
      rmSync(tempRoot, {recursive: true, force: true})
    }
  })

  it('accepts reviewed baseline entries and ignores generated icon metadata/assets', () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'chromvoid-motion-loop-check-'))

    try {
      writeFixture(
        tempRoot,
        'apps/webview/src/features/example/loading.ts',
        `
export const styles = css\`
  .loader {
    animation: spin 1s linear infinite;
  }
\`
`,
      )
      writeFixture(
        tempRoot,
        'apps/webview/src/assets/icons/icons.json',
        '{"tags":["pulse","infinite","breathing"]}',
      )

      const findings = collectMotionLoopFindings(tempRoot, ['apps/webview/src'])
      const result = compareFindingsToBaseline(findings, [
        {
          path: 'apps/webview/src/features/example/loading.ts',
          snippet: 'animation: spin 1s linear infinite;',
          classification: 'real-pending',
          reducedMotionCovered: true,
        },
      ])

      expect(findings).toHaveLength(1)
      expect(result).toEqual({schemaErrors: [], unbaselinedFindings: []})
    } finally {
      rmSync(tempRoot, {recursive: true, force: true})
    }
  })

  it('keeps the checked-in baseline schema explicit', () => {
    const baseline = loadBaseline(path.resolve(process.cwd(), '../../scripts/fixtures/webview-motion-loop-baseline.json'))

    expect(validateBaseline(baseline)).toEqual([])
    expect(baseline.length).toBeGreaterThan(0)

    for (const entry of baseline) {
      expect(entry.path).toMatch(/^(apps\/webview\/src|packages\/uikit\/src\/components)\//)
      expect(typeof entry.snippet === 'string' || typeof entry.linePattern === 'string').toBe(true)
      expect(classifications.has(entry.classification)).toBe(true)
      expect(typeof entry.reducedMotionCovered).toBe('boolean')
    }
  })
})
