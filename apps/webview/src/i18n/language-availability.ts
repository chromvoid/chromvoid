import {
  LANGUAGE_DEFINITIONS,
  createTranslationStore,
  hasCompleteTranslations,
  isKnownLanguage,
  type KnownLang,
  type KnownLanguageDefinition,
} from '@project/i18n/pure'
import {hasCompletePasswordManagerTranslations} from '@project/passmanager/i18n/availability'
import {hasCompletePasswordImportTranslations} from '@chromvoid/password-import/i18n/availability'

import {locales} from './locales'

const translations = createTranslationStore(locales)
const languageDefinitions = Object.values(LANGUAGE_DEFINITIONS) as KnownLanguageDefinition[]

export const hasCompleteWebviewTranslations = (value: KnownLang): boolean =>
  hasCompleteTranslations(translations, value) &&
  hasCompletePasswordManagerTranslations(value) &&
  hasCompletePasswordImportTranslations(value)

export const selectableLanguageDefinitions = languageDefinitions.filter((definition) =>
  hasCompleteWebviewTranslations(definition.code),
)

export const langsAvailable = selectableLanguageDefinitions.map(
  ({code, nativeName}) => [code, nativeName] as const,
)

export const isSupportedLanguage = (value: string): value is KnownLang =>
  isKnownLanguage(value) && hasCompleteWebviewTranslations(value)

export const resolveSupportedLanguage = (value: string | null): KnownLang =>
  value !== null && isSupportedLanguage(value) ? value : 'en'
