import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

type LocaleDictionary = Record<string, string>

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const localesDir = path.resolve(currentDir, '../../src/i18n/locales')
const localeFiles = fs
  .readdirSync(localesDir)
  .filter((fileName) => fileName.endsWith('.json') && fileName !== 'context.json')
  .sort()

function readLocale(fileName: string): LocaleDictionary {
  return JSON.parse(fs.readFileSync(path.join(localesDir, fileName), 'utf8')) as LocaleDictionary
}

function collectBareNamedPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)]
    .filter((match) => value.charAt((match.index ?? 0) - 1) !== '$')
    .map((match) => match[0])
}

function collectPlaceholderMultiset(value: string): string[] {
  return [...value.matchAll(/\$\{[A-Za-z_][A-Za-z0-9_]*\}|\{\d+\}/g)].map((match) => match[0]).sort()
}

describe('WebView locale placeholders', () => {
  it('rejects bare named placeholders while allowing positional placeholders', () => {
    expect(collectBareNamedPlaceholders('Move {0} to ${target}')).toEqual([])
    expect(collectBareNamedPlaceholders('Connect {label}')).toEqual(['{label}'])

    const violations: string[] = []

    for (const fileName of localeFiles) {
      const locale = readLocale(fileName)

      for (const [key, value] of Object.entries(locale)) {
        for (const placeholder of collectBareNamedPlaceholders(value)) {
          violations.push(`${fileName}:${key}:${placeholder}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('preserves the English placeholder multiset in every locale value', () => {
    const english = readLocale('en.json')
    const mismatches: string[] = []

    for (const fileName of localeFiles) {
      if (fileName === 'en.json') continue

      const locale = readLocale(fileName)

      for (const [key, englishValue] of Object.entries(english)) {
        const localizedValue = locale[key]

        if (typeof localizedValue !== 'string') {
          mismatches.push(`${fileName}:${key}:missing`)
          continue
        }

        const expected = collectPlaceholderMultiset(englishValue)
        const actual = collectPlaceholderMultiset(localizedValue)

        if (expected.join('\u0000') !== actual.join('\u0000')) {
          mismatches.push(
            `${fileName}:${key}:expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
          )
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})
