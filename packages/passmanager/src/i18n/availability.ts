import type {Lang} from '@project/i18n'

import {locales} from './locales'

type LocaleName = keyof typeof locales
type TranslationKey = keyof (typeof locales)['en']
type Locale = Partial<Record<TranslationKey, string>>

const translationKeys = Object.keys(locales.en) as TranslationKey[]

export const hasCompletePasswordManagerTranslations = (value: Lang): boolean =>
  translationKeys.every((key) => {
    const translation = (locales[value as LocaleName] as Locale | undefined)?.[key]
    return typeof translation === 'string' && translation.trim().length > 0
  })
