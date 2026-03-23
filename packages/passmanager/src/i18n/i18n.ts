import type {Lang} from '@statx/i18n'
import {createI18n} from '@statx/i18n'

import data from './data.json'

const localStorageKey = 'current-lang'

export const {i18n, setLang, getLang, langState} = createI18n(
  data,
  (globalThis.localStorage?.getItem(localStorageKey) as Lang) ?? 'en',
)
export const lang = {
  localStorageKey,
}
