export type TextDirection = 'ltr' | 'rtl'

export type LanguageDefinition = Readonly<{
  code: string
  direction: TextDirection
  englishName: string
  nativeName: string
}>

export const LANGUAGE_DEFINITIONS = {
  en: {
    code: 'en',
    direction: 'ltr',
    englishName: 'English',
    nativeName: 'English',
  },
  ar: {
    code: 'ar',
    direction: 'rtl',
    englishName: 'Arabic',
    nativeName: 'العربية',
  },
  cs: {
    code: 'cs',
    direction: 'ltr',
    englishName: 'Czech',
    nativeName: 'Čeština',
  },
  de: {
    code: 'de',
    direction: 'ltr',
    englishName: 'German',
    nativeName: 'Deutsch',
  },
  es: {
    code: 'es',
    direction: 'ltr',
    englishName: 'Spanish',
    nativeName: 'Español',
  },
  fr: {
    code: 'fr',
    direction: 'ltr',
    englishName: 'French',
    nativeName: 'Français',
  },
  hi: {
    code: 'hi',
    direction: 'ltr',
    englishName: 'Hindi',
    nativeName: 'हिन्दी',
  },
  id: {
    code: 'id',
    direction: 'ltr',
    englishName: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
  },
  it: {
    code: 'it',
    direction: 'ltr',
    englishName: 'Italian',
    nativeName: 'Italiano',
  },
  ja: {
    code: 'ja',
    direction: 'ltr',
    englishName: 'Japanese',
    nativeName: '日本語',
  },
  ko: {
    code: 'ko',
    direction: 'ltr',
    englishName: 'Korean',
    nativeName: '한국어',
  },
  nl: {
    code: 'nl',
    direction: 'ltr',
    englishName: 'Dutch',
    nativeName: 'Nederlands',
  },
  pl: {
    code: 'pl',
    direction: 'ltr',
    englishName: 'Polish',
    nativeName: 'Polski',
  },
  'pt-BR': {
    code: 'pt-BR',
    direction: 'ltr',
    englishName: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
  },
  'pt-PT': {
    code: 'pt-PT',
    direction: 'ltr',
    englishName: 'Portuguese (Portugal)',
    nativeName: 'Português (Portugal)',
  },
  ru: {
    code: 'ru',
    direction: 'ltr',
    englishName: 'Russian',
    nativeName: 'Русский',
  },
  th: {
    code: 'th',
    direction: 'ltr',
    englishName: 'Thai',
    nativeName: 'ไทย',
  },
  tr: {
    code: 'tr',
    direction: 'ltr',
    englishName: 'Turkish',
    nativeName: 'Türkçe',
  },
  uk: {
    code: 'uk',
    direction: 'ltr',
    englishName: 'Ukrainian',
    nativeName: 'Українська',
  },
  vi: {
    code: 'vi',
    direction: 'ltr',
    englishName: 'Vietnamese',
    nativeName: 'Tiếng Việt',
  },
  zh: {
    code: 'zh',
    direction: 'ltr',
    englishName: 'Chinese (Simplified)',
    nativeName: '简体中文',
  },
  'zh-TW': {
    code: 'zh-TW',
    direction: 'ltr',
    englishName: 'Chinese (Traditional)',
    nativeName: '繁體中文',
  },
} as const satisfies Record<string, LanguageDefinition>

export type KnownLang = keyof typeof LANGUAGE_DEFINITIONS
export type KnownLanguageDefinition = (typeof LANGUAGE_DEFINITIONS)[KnownLang]

const mapEnglishNames = <const T extends Record<string, LanguageDefinition>>(definitions: T) =>
  Object.fromEntries(
    Object.entries(definitions).map(([code, definition]) => [code, definition.englishName]),
  ) as {readonly [Code in keyof T]: T[Code]['englishName']}

/** @deprecated Prefer `LANGUAGE_DEFINITIONS` for labels and direction metadata. */
export const LANGUAGES = mapEnglishNames(LANGUAGE_DEFINITIONS)

export const DEFAULT_LANG = 'en' satisfies KnownLang

export const isKnownLanguage = (value: string): value is KnownLang =>
  Object.prototype.hasOwnProperty.call(LANGUAGE_DEFINITIONS, value)

export const resolveTextDirection = (value: string): TextDirection =>
  isKnownLanguage(value) ? LANGUAGE_DEFINITIONS[value].direction : 'ltr'
