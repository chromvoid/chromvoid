import {html} from '../../../../packages/uikit/src/reatom-lit/index.ts'
import {unsafeSVG} from 'lit/directives/unsafe-svg.js'

import {icons} from './icons.js'
import {model as m} from './model.js'

export const icon = (name) =>
  html`<span class="icon" aria-hidden="true">${unsafeSVG(icons[name] ?? icons['circle-help'])}</span>`
export const button = (label, command, value = '', glyph = '', className = 'button') =>
  html`<button type="button" class=${className} data-action=${command} data-value=${value}>
    ${glyph ? icon(glyph) : ''}${label}
  </button>`
export const iconButton = (label, command, value, glyph) =>
  html`<button
    type="button"
    class="icon-button"
    aria-label=${label}
    title=${label}
    data-action=${command}
    data-value=${value}
  >
    ${icon(glyph)}
  </button>`
export const row = (title, subtitle, glyph, command, value = '') =>
  html`<button type="button" class="option-row" data-action=${command} data-value=${value}>
    <span class="row-symbol">${icon(glyph)}</span
    ><span class="row-copy"><strong>${title}</strong><small>${subtitle}</small></span
    >${icon('chevron-right')}
  </button>`
export const heading = (title, subtitle = '') =>
  html`<header class="page-heading">
    <h1 tabindex="-1">${title}</h1>
    ${subtitle ? html`<p>${subtitle}</p>` : ''}
  </header>`
export const backBar = (title = '', trailing = '') =>
  html`<div class="app-toolbar">
    ${iconButton('Назад', 'back', '', 'arrow-left')}<span>${title}</span>${trailing ||
    iconButton('Закрыть хранилище', 'lock', '', 'lock')}
  </div>`
export const field = (name, label, type = 'text', hint = '', required = false) => {
  const error = m.errors()[name]
  return html`<label class="field" for=${`field-${name}`}
    ><span>${label}${required ? ' *' : ''}</span
    ><input
      id=${`field-${name}`}
      name=${name}
      type=${type}
      .value=${m.form.fields[name]()}
      autocomplete="off"
      ?required=${required}
      aria-invalid=${error ? 'true' : 'false'}
      aria-describedby=${`hint-${name}`}
    /><small id=${`hint-${name}`} class=${error ? 'field-error' : ''}>${error || hint}</small></label
  >`
}
export const submit = (label) =>
  html`<button class="button primary full" type="submit" ?disabled=${m.readonly()}>
    ${label}${icon('arrow-up-right')}
  </button>`
export const formError = () =>
  m.formFailure() ? html`<p class="error-callout" role="alert">${m.formFailure()}</p>` : ''
export function unavailable(content) {
  if (m.screenState() === 'loading')
    return html`<section class="state-view" role="status">
      ${icon('files')}
      <h2>Читаем хранилище</h2>
      <p>Это может занять немного времени.</p>
      <progress aria-label="Загрузка"></progress>
    </section>`
  if (m.screenState() === 'error')
    return html`<section class="state-view" role="alert">
      ${icon('circle-help')}
      <h2>Не удалось прочитать данные</h2>
      <p>Хранилище не изменилось. Попробуйте ещё раз.</p>
      ${button('Повторить', 'retry', '', '', 'button primary')}
    </section>`
  return content
}
export const readonlyNotice = () =>
  m.readonly()
    ? html`<p class="read-only" role="status">Только чтение. Просмотр и копирование доступны.</p>`
    : ''
