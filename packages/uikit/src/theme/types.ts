export type CVThemeTokenName = `--cv-${string}`

export type CVThemeTokens = Record<CVThemeTokenName, string>

export interface CVThemeDefinition {
  name: string
  tokens: CVThemeTokens
}

export type CVThemeTarget = HTMLElement | ShadowRoot | Document
