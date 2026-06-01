import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import data from '../../src/i18n/data.json'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const gatewayDir = path.resolve(currentDir, '../../src/routes/gateway')

function collectGatewayKeys(dirPath: string): string[] {
  const keys = new Set<string>()

  for (const entry of fs.readdirSync(dirPath, {withFileTypes: true})) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      for (const key of collectGatewayKeys(fullPath)) keys.add(key)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue

    const source = fs.readFileSync(fullPath, 'utf8')
    for (const match of source.matchAll(/i18n\('((?:gateway:[^']+))'(?: as any)?/g)) {
      keys.add(match[1]!)
    }
  }

  return [...keys].sort()
}

describe('gateway route i18n coverage', () => {
  it('contains all gateway translation keys in data.json', () => {
    const translations = data as Record<string, {en?: string; ru?: string}>
    const keys = collectGatewayKeys(gatewayDir)

    expect(keys.length).toBeGreaterThan(0)

    for (const key of keys) {
      expect(translations).toHaveProperty(key)
      expect(translations[key]).toMatchObject({
        en: expect.any(String),
        ru: expect.any(String),
      })
    }
  })
})
