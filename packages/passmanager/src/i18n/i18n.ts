import type {Lang} from '@project/i18n'
import {createI18n} from '@project/i18n'

import data from './data.json'

const localStorageKey = 'current-lang'

export const {i18n, setLang, getLang, langState} = createI18n(
  data,
  (globalThis.localStorage?.getItem(localStorageKey) as Lang) ?? 'en',
  {fallbackLang: 'en'},
)
export const lang = {
  localStorageKey,
}
