import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const appSource = resolve(process.cwd(), 'src')

const readSource = (path: string) => readFile(resolve(appSource, path), 'utf8')

const runBootstrap = (source: string, persistedLanguage: string | null) => {
  const attributes = new Map<string, string>()
  const windowStub = {
    localStorage: {
      getItem: () => persistedLanguage,
    },
  }
  const documentStub = {
    documentElement: {
      set dir(value: string) {
        attributes.set('dir', value)
      },
      set lang(value: string) {
        attributes.set('lang', value)
      },
    },
  }

  Function('window', 'document', source)(windowStub, documentStub)
  return attributes
}

describe('document locale bootstrap', () => {
  it('runs after CSP and before product CSS and modules', async () => {
    const html = await readSource('index.html')
    const cspIndex = html.indexOf('Content-Security-Policy')
    const bootstrapIndex = html.indexOf('./assets/bootstrap/document-locale.js')
    const cssIndex = html.indexOf('./styles/styles.css')
    const moduleIndex = html.indexOf('./index.ts')

    expect(cspIndex).toBeGreaterThan(-1)
    expect(bootstrapIndex).toBeGreaterThan(cspIndex)
    expect(cssIndex).toBeGreaterThan(bootstrapIndex)
    expect(moduleIndex).toBeGreaterThan(bootstrapIndex)
    expect(html).toContain('<html lang="en" dir="ltr" loading>')
  })

  it('applies persisted Arabic before render and rejects stale values', async () => {
    const source = await readSource('assets/bootstrap/document-locale.js')

    expect(runBootstrap(source, 'ar')).toEqual(
      new Map([
        ['lang', 'ar'],
        ['dir', 'rtl'],
      ]),
    )
    expect(runBootstrap(source, 'unsupported')).toEqual(
      new Map([
        ['lang', 'en'],
        ['dir', 'ltr'],
      ]),
    )
  })
})
