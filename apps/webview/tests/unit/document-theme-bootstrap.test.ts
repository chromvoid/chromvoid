import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {describe, expect, it, vi} from 'vitest'

const readSource = (path: string) => readFile(resolve(process.cwd(), 'src', path), 'utf8')

const persistedTheme = (data: string, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    data,
    id: 1,
    timestamp: Date.now(),
    to: Date.now() + 60_000,
    version: 0,
    ...overrides,
  })

const runBootstrap = (
  source: string,
  storedTheme: string | null,
  options: {systemDark?: boolean; storageDenied?: boolean} = {},
) => {
  const attributes = new Map<string, string>()
  const getItem = vi.fn((key: string) => {
    if (options.storageDenied) throw new DOMException('Storage access denied', 'SecurityError')
    return key === 'theme-state' ? storedTheme : null
  })
  const removeItem = vi.fn()
  const windowStub = {
    localStorage: {getItem, removeItem},
    matchMedia: () => ({matches: options.systemDark ?? false}),
  }
  const documentStub = {
    documentElement: {
      setAttribute(name: string, value: string) {
        attributes.set(name, value)
      },
    },
  }

  Function('window', 'document', source)(windowStub, documentStub)
  return {attributes, removeItem}
}

describe('document theme bootstrap', () => {
  it('runs after CSP and before product CSS and modules', async () => {
    const html = await readSource('index.html')
    const cspIndex = html.indexOf('Content-Security-Policy')
    const bootstrapIndex = html.indexOf('./assets/bootstrap/document-theme.js')

    expect(cspIndex).toBeGreaterThan(-1)
    expect(bootstrapIndex).toBeGreaterThan(cspIndex)
    expect(html.indexOf('./styles/styles.css')).toBeGreaterThan(bootstrapIndex)
    expect(html.indexOf('./index.ts')).toBeGreaterThan(bootstrapIndex)
  })

  it.each([
    {theme: 'light', systemDark: true},
    {theme: 'dark', systemDark: false},
  ])('applies persisted $theme before the opposite system theme can render', async ({theme, systemDark}) => {
    const source = await readSource('assets/bootstrap/document-theme.js')
    const {attributes} = runBootstrap(source, persistedTheme(theme), {systemDark})

    expect(attributes).toEqual(
      new Map([
        ['data-theme', theme],
        ['theme', theme],
      ]),
    )
  })

  it.each([true, false])(
    'leaves system mode and missing settings to CSS (system dark: %s)',
    async (systemDark) => {
      const source = await readSource('assets/bootstrap/document-theme.js')

      expect(runBootstrap(source, persistedTheme('system'), {systemDark}).attributes.size).toBe(0)
      expect(runBootstrap(source, null, {systemDark}).attributes.size).toBe(0)
    },
  )

  it('ignores corrupt records, unsupported versions and invalid theme values', async () => {
    const source = await readSource('assets/bootstrap/document-theme.js')

    for (const record of [
      '{',
      'null',
      '"dark"',
      '{}',
      persistedTheme('dark', {version: 1}),
      persistedTheme('invalid'),
    ]) {
      expect(runBootstrap(source, record).attributes.size).toBe(0)
    }
  })

  it('discards expired records with the same boundary as the persistence adapter', async () => {
    const source = await readSource('assets/bootstrap/document-theme.js')
    const {attributes, removeItem} = runBootstrap(source, persistedTheme('dark', {to: 0}))

    expect(attributes.size).toBe(0)
    expect(removeItem).toHaveBeenCalledExactlyOnceWith('theme-state')
  })

  it('keeps the system fallback when storage access is denied', async () => {
    const source = await readSource('assets/bootstrap/document-theme.js')

    expect(runBootstrap(source, null, {storageDenied: true}).attributes.size).toBe(0)
  })
})
