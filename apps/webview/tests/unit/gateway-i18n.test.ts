import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import en from '../../src/i18n/locales/en.json'
import ru from '../../src/i18n/locales/ru.json'

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
  it('contains all gateway translation keys in English and Russian locales', () => {
    const keys = collectGatewayKeys(gatewayDir)

    expect(keys.length).toBeGreaterThan(0)

    for (const key of keys) {
      expect(en).toHaveProperty(key)
      expect(ru).toHaveProperty(key)
      expect(en[key as keyof typeof en]).toEqual(expect.any(String))
      expect(ru[key as keyof typeof ru]).toEqual(expect.any(String))
    }
  })
})
