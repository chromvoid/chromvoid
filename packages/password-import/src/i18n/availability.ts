import {locales} from './locales'
import type {TranslationKey} from './locales'

type LocaleName = keyof typeof locales
type Locale = Partial<Record<TranslationKey, string>>

const fallbackLocale: Record<TranslationKey, string> = locales.en
const translationKeys = Object.keys(fallbackLocale) as TranslationKey[]

export function hasCompletePasswordImportTranslations(value: string): boolean {
  const locale: Locale = locales[value as LocaleName] ?? {}
  return translationKeys.every((key) => {
    const translation = locale[key]
    return typeof translation === 'string' && translation.trim().length > 0
  })
}
