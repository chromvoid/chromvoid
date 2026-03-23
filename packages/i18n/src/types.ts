import type {Action, Atom} from '@reatom/core'

export interface ITranslationStorage {
  [key: string]: string | ITranslationStorage
}

export interface TValues {
  [key: string]: string | number | TValues
}

export interface IReplacers {
  [key: string]: (key: string) => string
}

type TranslationUnit = Partial<Record<Lang, string>>

export type ParseString<T extends string | undefined> = T extends undefined
  ? never
  : T extends `${infer _}\${${infer variable}}${infer rest}`
    ? variable | ParseString<rest>
    : T extends `${infer _}\${${infer variable}}`
      ? variable
      : T extends `\${${infer variable}}`
        ? variable
        : never

type StringifyValue<T> = T extends string | number ? `${T}` : never

type ReplaceString<
  T extends {[key: string]: string | number},
  Key extends string,
> = Key extends `${infer before}\${${infer variable}}${infer rest}`
  ? variable extends keyof T
    ? `${before}${StringifyValue<T[variable]>}${ReplaceString<T, rest>}`
    : `${before}\${${variable}}${ReplaceString<T, rest>}`
  : Key

export type TransStore = Readonly<{
  [key in string]: Readonly<TranslationUnit>
}>

export type PickValues<T extends TransStore, K extends keyof T, L extends Lang> = {
  [key in ParseString<T[K][L]>]: string | number
}

export type I18nResult<
  T extends TransStore,
  K extends keyof T,
  L extends Lang,
  Vals extends PickValues<T, K, L> | undefined = undefined,
> = T[K][L] extends string ? (Vals extends PickValues<T, K, L> ? ReplaceString<Vals, T[K][L]> : T[K][L]) : K

export type Lang = keyof typeof import('./consts').LANGUAGES | (string & {})

export interface CreateI18nOptions {
  fallbackLang?: Lang
  syncDocumentLang?: boolean
}

export interface I18nModel<T extends TransStore, L extends Lang> {
  store(): T
  getLang(): Lang
  langState: Atom<Lang>
  setLang: Action<[value: Lang], void>
  i18n<K extends keyof T, const V extends PickValues<T, K, L>>(key: K, values?: V): I18nResult<T, K, L, V>
}
