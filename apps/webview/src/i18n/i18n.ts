import type {Lang} from '@statx/i18n'
import {createI18n} from '@statx/i18n'

import {setPasswordManagerLang} from '@project/passmanager'

import data from './data.json'

const localStorageKey = 'current-lang'

const langsUnsorted: [string, string][] = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['id', 'Indonesian'],
  ['it', 'Italian'],
  ['ja', 'Japanese'],
  ['ru', 'Russian'],
  ['tr', 'Turkish'],
  ['uk', 'Ukrainian'],
  ['vi', 'Vietnamese'],
  ['zh', 'Chinese'],
]
const langs = langsUnsorted.sort((a, b) => {
  if (a[0] === 'en') return -1
  if (b[0] === 'en') return 1
  if (a[1] < b[1]) return -1
  if (a[1] > b[1]) return 1
  return 0
})
const available = ['en', 'es', 'fr', 'id', 'it', 'ja', 'ru', 'tr', 'uk', 'vi', 'zh']

export const {i18n, setLang, getLang, langState} = createI18n(
  data,
  (localStorage.getItem(localStorageKey) as Lang) ?? 'en',
)
langState.subscribe((value) => {
  localStorage.setItem(localStorageKey, value)
  setPasswordManagerLang(value)
})

export const langsAvalable = langs.filter((item) => available.includes(item[0]!))

export const lang = {
  langs,
  available,
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
