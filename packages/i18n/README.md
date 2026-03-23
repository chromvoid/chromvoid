# @project/i18n

Minimal i18n package on Reatom v1000.

## Goals

- API close to `@statx/i18n` for easy migration.
- Reactive language state via Reatom atom.
- Template interpolation with `${name}` placeholders.
- Optional fallback language.

## API

```ts
import {createI18n} from '@project/i18n'

const data = {
  hello: {en: 'Hello', ru: 'Privet'},
  welcome: {en: 'Welcome ${name}', ru: 'Dobro pozhalovat ${name}'},
} as const

const {i18n, setLang, getLang, langState} = createI18n(data, 'en', {
  fallbackLang: 'en',
})

i18n('hello')
setLang('ru')
i18n('welcome', {name: 'Alice'})
langState.subscribe((lang) => {
  console.log('current lang', lang)
})
```

## Notes

- Missing translation returns the key.
- Document `<html lang>` is synchronized by default and can be disabled with `syncDocumentLang: false`.
