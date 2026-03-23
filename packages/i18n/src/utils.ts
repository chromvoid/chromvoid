import type {TValues} from './types'

export function getValue(key: string, values: TValues): string | undefined {
  const path = key.split('.')
  let current: string | number | TValues | undefined = values

  for (const subkey of path) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = current[subkey]
  }

  if (current === undefined) {
    return undefined
  }

  return current.toString()
}

export const setDocumentLang = (value: string) => {
  if (typeof document !== 'undefined') {
    document.querySelector('html')?.setAttribute('lang', value)
  }
}

const PLACEHOLDER_PATTERN = /\$\{([a-zA-Z0-9_.,=)(: ]+)\}/g

export const replaceValues = (template: string, values: TValues): string => {
  return template.replace(PLACEHOLDER_PATTERN, (match: string, expression: string) => {
    const value = getValue(expression, values)
    if (value !== undefined) {
      return value
    }
    return match
  })
}
