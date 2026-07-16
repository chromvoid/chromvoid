import {atom} from '@reatom/core'

import {locales} from './i18n/locales'
import type {TranslationKey} from './i18n/locales'

export {hasCompletePasswordImportTranslations} from './i18n/availability'

type LocaleName = keyof typeof locales
type Lang = LocaleName | (string & {})
type Locale = Partial<Record<TranslationKey, string>>

const DEFAULT_LANG: LocaleName = 'en'
const fallbackLocale: Record<TranslationKey, string> = locales[DEFAULT_LANG]

const getLocale = (value: Lang): Locale => locales[value as LocaleName] ?? {}

export const langState = atom<Lang>(DEFAULT_LANG)

export function setLang(value: Lang) {
  langState.set(value)
}

export function getLang(): Lang {
  return langState()
}

export function i18n(key: TranslationKey): string {
  return getLocale(langState())[key] ?? fallbackLocale[key]
}
