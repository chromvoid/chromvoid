import {createI18n, createTranslationStore} from '@project/i18n'

import {locales} from './locales'

export const {i18n, setLang, getLang, langState} = createI18n(
  createTranslationStore(locales),
  'en',
  {fallbackLang: 'en', syncDocumentLang: false},
)

export const lang = {
  localStorageKey: 'current-lang',
}
