import type {CVThemeDefinition, CVThemeTarget, CVThemeTokenName, CVThemeTokens} from './types'

const themes = new Map<string, CVThemeDefinition>()
const appliedTokensByElement = new WeakMap<HTMLElement, Set<CVThemeTokenName>>()

const CV_TOKEN_PREFIX = '--cv-'

function validateThemeTokens(tokens: CVThemeTokens): void {
  for (const key of Object.keys(tokens)) {
    if (!key.startsWith(CV_TOKEN_PREFIX)) {
      throw new Error(`Invalid theme token "${key}". Tokens must use the "--cv-*" prefix.`)
    }
  }
}

function cloneTokens(tokens: CVThemeTokens): CVThemeTokens {
  return {...tokens}
}

function resolveTargetElement(target: CVThemeTarget): HTMLElement {
  if (target instanceof HTMLElement) {
    return target
  }

  if (target instanceof Document) {
    return target.documentElement
  }

  return target.host as HTMLElement
}

export function defineTheme(name: string, tokens: CVThemeTokens): CVThemeDefinition {
  if (!name.trim()) {
    throw new Error('Theme name must be a non-empty string.')
  }

  validateThemeTokens(tokens)

  const definition: CVThemeDefinition = {
    name,
    tokens: cloneTokens(tokens),
  }

  themes.set(name, definition)

  return {
    name: definition.name,
    tokens: cloneTokens(definition.tokens),
  }
}

export function getTheme(name: string): CVThemeDefinition | undefined {
  const definition = themes.get(name)
  if (!definition) return undefined

  return {
    name: definition.name,
    tokens: cloneTokens(definition.tokens),
  }
}

export function applyTheme(target: CVThemeTarget, name: string): HTMLElement {
  const definition = themes.get(name)
  if (!definition) {
    throw new Error(`Unknown theme: ${name}`)
  }

  const element = resolveTargetElement(target)
  const previousTokens = appliedTokensByElement.get(element)
  if (previousTokens) {
    for (const key of previousTokens) {
      element.style.removeProperty(key)
    }
  }

  const nextTokenNames = new Set<CVThemeTokenName>()
  for (const [key, value] of Object.entries(definition.tokens) as Array<[CVThemeTokenName, string]>) {
    element.style.setProperty(key, value)
    nextTokenNames.add(key)
  }

  element.setAttribute('data-cv-theme', definition.name)
  appliedTokensByElement.set(element, nextTokenNames)

  return element
}
