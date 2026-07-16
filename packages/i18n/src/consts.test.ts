import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_LANG,
  LANGUAGE_DEFINITIONS,
  LANGUAGES,
  isKnownLanguage,
  resolveTextDirection,
} from './consts'

test('derives the compatibility language map from canonical definitions', () => {
  assert.equal(DEFAULT_LANG, 'en')
  assert.equal(LANGUAGES.en, 'English')
  assert.equal(LANGUAGES.ar, 'Arabic')
  assert.equal(LANGUAGE_DEFINITIONS.ar.nativeName, 'العربية')
})

test('resolves known RTL languages and safely defaults unknown values to LTR', () => {
  assert.equal(isKnownLanguage('ar'), true)
  assert.equal(isKnownLanguage('ar-EG'), false)
  assert.equal(resolveTextDirection('ar'), 'rtl')
  assert.equal(resolveTextDirection('en'), 'ltr')
  assert.equal(resolveTextDirection('unknown'), 'ltr')
})
