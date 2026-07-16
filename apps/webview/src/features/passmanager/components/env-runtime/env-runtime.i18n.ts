import {getLang, i18n} from '@project/passmanager/i18n'
import type {TranslationKey} from '@project/passmanager/i18n'

type EnvRuntimeTranslationKey = Extract<TranslationKey, `env-runtime:${string}`>
type StripEnvRuntimePrefix<Key extends string> = Key extends `env-runtime:${infer MessageKey}`
  ? MessageKey
  : never

export type EnvRuntimeMessageKey = StripEnvRuntimePrefix<EnvRuntimeTranslationKey>

export function getEnvRuntimeLocale(): ReturnType<typeof getLang> {
  return getLang()
}

export function envRuntimeI18n(
  key: EnvRuntimeMessageKey,
  values?: Readonly<Record<string, string | number>>,
): string {
  const translationKey = `env-runtime:${key}` as EnvRuntimeTranslationKey
  if (values === undefined) return i18n(translationKey) as string

  const replacements = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, String(value)]),
  )
  return i18n(translationKey, replacements as never) as string
}
