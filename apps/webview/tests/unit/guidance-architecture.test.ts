import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const repoRoot = resolve(process.cwd(), '../..')

const uikitGuidanceComponents = [
  'packages/uikit/src/components/cv-guidance-panel.ts',
  'packages/uikit/src/components/cv-guidance-anchor.ts',
] as const

const forbiddenUIKitDependencies = [
  {label: 'WebView root alias', pattern: /from\s+['"]root\//},
  {label: 'WebView source path', pattern: /apps\/webview/},
  {label: 'navigation model', pattern: /\bnavigationModel\b/},
  {label: 'module access model', pattern: /\bmoduleAccessModel\b/},
  {label: 'guidance model', pattern: /\bguidanceModel\b/},
  {label: 'guidance registry', pattern: /\bguidanceDefinitions\b/},
  {label: 'i18n data', pattern: /i18n\/data/},
] as const

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

describe('guidance architecture guards', () => {
  it('keeps UIKit guidance primitives independent from WebView app state', () => {
    for (const path of uikitGuidanceComponents) {
      const source = readRepoFile(path)

      for (const dependency of forbiddenUIKitDependencies) {
        expect(source, `${path} must not import ${dependency.label}`).not.toMatch(dependency.pattern)
      }
    }
  })

  it('keeps the guidance anchor primitive event-based instead of selector-based', () => {
    const source = readRepoFile('packages/uikit/src/components/cv-guidance-anchor.ts')

    expect(source).not.toMatch(/querySelector/)
    expect(source).not.toMatch(/document\./)
    expect(source).toMatch(/GUIDANCE_ANCHOR_REGISTER_EVENT/)
    expect(source).toMatch(/GUIDANCE_ANCHOR_UNREGISTER_EVENT/)
  })
})
