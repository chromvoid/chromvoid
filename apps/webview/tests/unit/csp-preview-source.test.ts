import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import {describe, expect, it} from 'vitest'

function directiveSources(csp: string, directive: string): string[] {
  const clause = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive} `))

  return clause?.split(/\s+/).slice(1) ?? []
}

function readHtmlCsp(path: string): string {
  const html = readFileSync(path, 'utf8')
  const document = new DOMParser().parseFromString(html, 'text/html')
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')
  if (!csp) {
    throw new Error(`Missing Content-Security-Policy meta in ${path}`)
  }
  return csp
}

function readTauriCsp(path: string): string {
  const config = JSON.parse(readFileSync(path, 'utf8')) as {
    app?: {security?: {csp?: string}}
  }
  const csp = config.app?.security?.csp
  if (!csp) {
    throw new Error(`Missing app.security.csp in ${path}`)
  }
  return csp
}

function readViteHtmlCsps(path: string): string[] {
  const config = readFileSync(path, 'utf8')
  const matches = [...config.matchAll(/\b(?:dev|prod)HtmlCsp\s*=\s*("[^"]+")/g)]
  if (matches.length !== 2) {
    throw new Error(`Expected devHtmlCsp and prodHtmlCsp in ${path}`)
  }
  return matches.map((match) => JSON.parse(match[1] ?? '""') as string)
}

describe('prepared preview CSP contract', () => {
  it('allows chromvoid-preview URLs in every preview CSP source list', () => {
    const root = process.cwd()
    const cspEntries = [
      readHtmlCsp(join(root, 'src/index.html')),
      ...readViteHtmlCsps(join(root, 'vite.config.ts')),
      readTauriCsp(join(root, '../chromvoid/src-tauri/tauri.conf.json')),
      readTauriCsp(join(root, '../chromvoid/src-tauri/tauri.dev.conf.json')),
    ]

    for (const csp of cspEntries) {
      expect(directiveSources(csp, 'img-src')).toContain('chromvoid-preview:')
      expect(directiveSources(csp, 'media-src')).toContain('chromvoid-preview:')
    }
  })
})
