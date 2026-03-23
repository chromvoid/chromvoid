import assert from 'node:assert/strict'
import test from 'node:test'

import {createI18n} from './translation'

const translations = {
  title: {
    en: 'Title',
    ru: 'Zagolovok',
  },
  greeting: {
    en: 'Hello ${name}',
    ru: 'Privet ${name}',
  },
  total: {
    en: 'Total ${count}',
    ru: 'Itogo ${count}',
  },
  onlyEnglish: {
    en: 'Only English',
  },
} as const

test('translate by current language and switch language', async () => {
  const {getLang, i18n, langState, setLang} = createI18n(translations, 'en', {
    syncDocumentLang: false,
  })

  const updates: string[] = []
  const unsubscribe = langState.subscribe((value: string) => updates.push(value))

  try {
    assert.equal(getLang(), 'en')
    assert.equal(i18n('title'), 'Title')

    setLang('ru')
    await Promise.resolve()

    assert.equal(getLang(), 'ru')
    assert.equal(i18n('title'), 'Zagolovok')
    assert.deepEqual(updates, ['en', 'ru'])
  } finally {
    unsubscribe()
  }
})

test('interpolate string and numeric values', () => {
  const {i18n} = createI18n(translations, 'en', {
    syncDocumentLang: false,
  })

  assert.equal(i18n('greeting', {name: 'Alice'}), 'Hello Alice')
  assert.equal(i18n('total', {count: 0}), 'Total 0')
})

test('returns key when translation is missing', () => {
  const {i18n, setLang} = createI18n(translations, 'en', {
    syncDocumentLang: false,
  })

  setLang('de')
  assert.equal(i18n('title'), 'title')
})

test('uses fallback language when configured', () => {
  const {i18n} = createI18n(translations, 'ru', {
    fallbackLang: 'en',
    syncDocumentLang: false,
  })

  assert.equal(i18n('onlyEnglish'), 'Only English')
})

test('syncs document html lang attribute by default', () => {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const attrs: Record<string, string> = {}
  const fakeDocument = {
    querySelector(selector: string) {
      if (selector !== 'html') {
        return null
      }

      return {
        setAttribute(name: string, value: string) {
          attrs[name] = value
        },
      }
    },
  }

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: fakeDocument,
    writable: true,
  })

  try {
    const {setLang} = createI18n(translations, 'en')

    assert.equal(attrs['lang'], 'en')
    setLang('ru')
    assert.equal(attrs['lang'], 'ru')
  } finally {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, 'document', previousDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'document')
    }
  }
})
