import type {Lang, LocaleStore, TransStore, TransStoreFromLocales} from './types'

export const hasCompleteTranslations = <T extends TransStore>(data: T, lang: Lang): boolean =>
  Object.values(data).every((unit) => {
    const translation = unit[lang]
    return typeof translation === 'string' && translation.trim().length > 0
  })

export const createTranslationStore = <const T extends LocaleStore>(
  locales: T,
): TransStoreFromLocales<T> => {
  const translations: Record<string, Record<string, string>> = {}

  for (const [lang, locale] of Object.entries(locales)) {
    for (const [key, value] of Object.entries(locale)) {
      const translation = (translations[key] ??= {})
      translation[lang] = value
    }
  }

  return translations as TransStoreFromLocales<T>
}
