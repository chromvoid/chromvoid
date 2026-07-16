import {beforeEach, describe, expect, it} from 'vitest'

import {
  directionState,
  getLang,
  lang,
  langsAvailable,
  resolveSupportedLanguage,
  setLang,
} from '../../src/i18n'

describe('WebView language availability', () => {
  beforeEach(async () => {
    setLang('en')
    await Promise.resolve()
  })

  it('exposes only languages with complete WebView translations', () => {
    expect(langsAvailable).toEqual([
      ['en', 'English'],
      ['ar', 'العربية'],
      ['cs', 'Čeština'],
      ['de', 'Deutsch'],
      ['es', 'Español'],
      ['fr', 'Français'],
      ['hi', 'हिन्दी'],
      ['id', 'Bahasa Indonesia'],
      ['it', 'Italiano'],
      ['ja', '日本語'],
      ['ko', '한국어'],
      ['nl', 'Nederlands'],
      ['pl', 'Polski'],
      ['pt-BR', 'Português (Brasil)'],
      ['pt-PT', 'Português (Portugal)'],
      ['ru', 'Русский'],
      ['th', 'ไทย'],
      ['tr', 'Türkçe'],
      ['uk', 'Українська'],
      ['vi', 'Tiếng Việt'],
      ['zh', '简体中文'],
      ['zh-TW', '繁體中文'],
    ])
    expect(lang.langs).toEqual(langsAvailable)
    expect(lang.available).toEqual([
      'en',
      'ar',
      'cs',
      'de',
      'es',
      'fr',
      'hi',
      'id',
      'it',
      'ja',
      'ko',
      'nl',
      'pl',
      'pt-BR',
      'pt-PT',
      'ru',
      'th',
      'tr',
      'uk',
      'vi',
      'zh',
      'zh-TW',
    ])
  })

  it('falls back from unsupported locales and rejects selecting them', () => {
    expect(resolveSupportedLanguage('fa')).toBe('en')
    expect(resolveSupportedLanguage('ru')).toBe('ru')

    expect(setLang('fa')).toBe(false)
    expect(getLang()).toBe('en')
  })

  it('accepts a fully translated locale', () => {
    expect(resolveSupportedLanguage('de')).toBe('de')
    expect(setLang('de')).toBe(true)
    expect(getLang()).toBe('de')
  })

  it('updates the reactive direction and document contract for an RTL locale', async () => {
    expect(setLang('ar')).toBe(true)
    await Promise.resolve()

    expect(getLang()).toBe('ar')
    expect(directionState()).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(localStorage.getItem(lang.localStorageKey)).toBe('ar')

    expect(setLang('en')).toBe(true)
    await Promise.resolve()
    expect(directionState()).toBe('ltr')
    expect(document.documentElement.dir).toBe('ltr')
  })
})
