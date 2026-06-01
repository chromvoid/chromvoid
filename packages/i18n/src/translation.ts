import {action, atom} from '@reatom/core'

import type {CreateI18nOptions, I18nModel, I18nResult, Lang, PickValues, TransStore} from './types'
import {replaceValues, setDocumentLang} from './utils'

const readTranslation = <T extends TransStore>(data: T, key: keyof T, lang: Lang, fallbackLang?: Lang) => {
  const unit = data[key]
  if (unit === undefined) {
    return undefined
  }

  const translation = unit[lang]
  if (translation !== undefined) {
    return translation
  }

  if (fallbackLang === undefined || fallbackLang === lang) {
    return undefined
  }

  return unit[fallbackLang]
}

export const createI18n = <const T extends TransStore, L extends Lang>(
  data: T,
  lang: L,
  options: CreateI18nOptions = {},
): I18nModel<T, L> => {
  const fallbackLang = options.fallbackLang
  const syncDocumentLang = options.syncDocumentLang ?? true

  const langState = atom<Lang>(lang, 'i18n.lang')
  if (syncDocumentLang) {
    setDocumentLang(lang)
  }

  let cachedLang: Lang = lang
  const translationCache = new Map<keyof T, unknown>()

  const setLang = action((value: Lang) => {
    langState.set(value)
    if (cachedLang !== value) {
      cachedLang = value
      translationCache.clear()
    }
    if (syncDocumentLang) {
      setDocumentLang(value)
    }
  }, 'i18n.setLang')

  const i18n = <K extends keyof T, const V extends PickValues<T, K, L>>(
    key: K,
    values: V | undefined = undefined,
  ): I18nResult<T, K, L, V> => {
    const currentLang = langState()
    if (currentLang !== cachedLang) {
      cachedLang = currentLang
      translationCache.clear()
    }

    let translation: unknown
    if (values === undefined && translationCache.has(key)) {
      translation = translationCache.get(key)
    } else {
      translation = readTranslation(data, key, currentLang, fallbackLang)
      if (values === undefined) {
        translationCache.set(key, translation)
      }
    }

    if (translation === undefined) {
      return key as I18nResult<T, K, L, V>
    }

    if (values === undefined) {
      return translation as I18nResult<T, K, L, V>
    }

    return replaceValues(translation as string, values) as I18nResult<T, K, L, V>
  }

  return {
    store: () => data,
    getLang: () => langState(),
    langState,
    setLang,
    i18n,
  }
}
