import {computed} from '@reatom/core'
import type {Lang} from '@project/i18n'
import {createI18n, createTranslationStore, resolveTextDirection} from '@project/i18n'

import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {setLang as setPasswordImportLang} from '@chromvoid/password-import/i18n'

import {
  isSupportedLanguage,
  langsAvailable,
  resolveSupportedLanguage,
} from './language-availability'
import {locales} from './locales'

const translations = createTranslationStore(locales)
const localStorageKey = 'current-lang'

const readPersistedLanguage = (): string | null => {
  try {
    return globalThis.localStorage?.getItem(localStorageKey) ?? null
  } catch {
    return null
  }
}

const persistLanguage = (value: string): void => {
  try {
    globalThis.localStorage?.setItem(localStorageKey, value)
  } catch {
    // Language selection still applies for this session when storage is unavailable.
  }
}

const applyDocumentLanguage = (value: string): void => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = value
  document.documentElement.dir = resolveTextDirection(value)
}

const i18nModel = createI18n(translations, resolveSupportedLanguage(readPersistedLanguage()), {
  fallbackLang: 'en',
  syncDocumentLang: false,
})

export const {i18n, getLang, langState} = i18nModel
export const directionState = computed(() => resolveTextDirection(langState()), 'i18n.direction')

export const setLang = (value: Lang): boolean => {
  if (!isSupportedLanguage(value)) return false
  i18nModel.setLang(value)
  return true
}

// App-lifetime integration boundary. Reatom calls this synchronously on subscribe,
// keeping pre-paint bootstrap, runtime document state, persistence, and packages aligned.
langState.subscribe((value: Lang) => {
  applyDocumentLanguage(value)
  persistLanguage(value)
  setPasswordManagerLang(value)
  setPasswordImportLang(value)
})

export {isSupportedLanguage, langsAvailable, resolveSupportedLanguage}

export const lang = {
  langs: langsAvailable,
  available: langsAvailable.map(([value]) => value),
  localStorageKey,
}

export const initI18n = () => {
  window.i18n = i18n
}

declare global {
  interface Window {
    i18n: typeof i18n
  }
}
