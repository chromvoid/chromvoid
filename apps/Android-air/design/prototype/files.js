import {html} from '../../../../packages/uikit/src/reatom-lit/index.ts'

import {model as m} from './model.js'
import {
  backBar,
  button,
  field,
  formError,
  heading,
  icon,
  iconButton,
  readonlyNotice,
  row,
  submit,
  unavailable,
} from './ui.js'

export function fileCatalog() {
  return html`<div class="app-toolbar brand-toolbar">
      <div class="wordmark"><img src="/brand.svg" alt="" />ChromVoid</div>
      ${iconButton('Закрыть хранилище', 'lock', '', 'lock')}
    </div>
    <div class="content catalog-content">
      ${heading('Файлы', 'Важное остаётся с вами.')}<label class="search-box"
        >${icon('search')}<input
          type="search"
          data-input="fileQuery"
          aria-label="Найти файл"
          placeholder="Найти файл или заметку"
          .value=${m.fileQuery()}
      /></label>
      <div class="category-tabs">
        ${[
          ['all', 'Все'],
          ['note', 'Заметки'],
          ['pdf', 'Документы'],
          ['image', 'Фото'],
        ].map(
          ([value, label]) =>
            html`<button
              data-action="file-category"
              data-value=${value}
              aria-pressed=${m.fileCategory() === value}
            >
              ${label}
            </button>`,
        )}
      </div>
      ${readonlyNotice()}
      <div class="list-toolbar">
        <span>На этом устройстве</span>${button('Импорт', 'start-import', '', 'download', 'text-button')}
      </div>
      ${unavailable(
        html`<div class="file-list">
          ${m.visibleFiles().length
            ? m.visibleFiles().map((file) => row(file.title, file.meta, file.icon, 'file', file.id))
            : html`<section class="empty-state">
                ${icon('folder')}
                <h2>Здесь пока пусто</h2>
                <p>
                  ${m.fileQuery()
                    ? 'Измените поисковый запрос.'
                    : 'Сохраните документ или начните с заметки.'}
                </p>
                ${button('Новая заметка', 'note', 'new', 'plus', 'button primary')}
              </section>`}
        </div>`,
      )}
      <div class="file-footnote">
        ${icon('lock')}<span
          >Чтение и заметки внутри хранилища.<br />Внешняя копия — только по вашему действию.</span
        >
      </div>
    </div>
    <div class="creation-dock">${button('Создать', 'sheet', 'file-create', 'plus', 'button primary')}</div>`
}

export function document() {
  const file = m.file()
  if (!file)
    return html`${backBar()}
      <section class="state-view">
        <h2>Файл недоступен</h2>
        ${button('К файлам', 'go', 'files')}
      </section>`
  return html`${backBar(
      file.type === 'note' ? 'Заметка' : 'Документ',
      file.type === 'note'
        ? button('Изменить', 'note', '', '', 'text-button')
        : iconButton('Экспортировать', 'export', '', 'upload'),
    )}
    <div class="content document-content">
      ${heading(file.title, file.meta)}${readonlyNotice()}${unavailable(
        html`<article class="document-paper">
          <p class="document-date">ЛИЧНОЕ / СЕНТЯБРЬ 2026</p>
          <div class="preserve-text">${file.text}</div>
        </article>`,
      )}
      <div class="button-row">
        ${button('Внешняя копия', 'export', '', 'upload', 'button secondary')}${iconButton(
          'Удалить файл',
          'delete-file',
          '',
          'trash-2',
        )}
      </div>
    </div>`
}

export function note() {
  return html`${backBar(m.editingId() ? 'Изменить заметку' : 'Новая заметка')}
    <div class="content">
      ${heading('Мысль, которую стоит оставить')}${readonlyNotice()}
      <form novalidate>
        ${field('title', 'Название', 'text', '', true)}<label class="field"
          ><span>Текст заметки</span
          ><textarea
            class="note-editor"
            name="notes"
            .value=${m.form.fields.notes()}
            rows="12"
            placeholder="Начните писать…"
          ></textarea></label
        >${formError()}${submit('Сохранить заметку')}
      </form>
    </div>`
}

export function media() {
  const file = m.file()
  return html`${backBar('Просмотр')}
    <div class="content media-content">
      ${heading(file?.title ?? 'Медиа', file?.meta ?? '')}
      <div class="media-art" role="img" aria-label="Вымышленная открытка: море и солнце">
        <svg viewBox="0 0 400 360" aria-hidden="true">
          <rect width="400" height="360" fill="var(--app-air-accent-container)" />
          <circle cx="298" cy="96" r="42" fill="var(--app-air-surface)" />
          <path d="M0 205Q100 180 200 215T400 205V360H0Z" fill="var(--app-air-accent)" />
          <path d="M0 280Q120 260 220 305T400 288V360H0Z" fill="var(--app-air-surface-secondary)" /></svg
        ><span>Демонстрационная открытка</span>
      </div>
      ${file?.type === 'audio'
        ? html`<div class="player">
            <input
              type="range"
              min="0"
              max="138"
              data-input="position"
              .value=${m.mediaPosition()}
              aria-label="Позиция воспроизведения"
            />
            <div>
              ${button(
                m.mediaPlaying() ? 'Пауза' : 'Воспроизвести',
                'play',
                '',
                'play',
                'button primary',
              )}<small>02:18</small>
            </div>
          </div>`
        : ''}
      <p class="quiet-note">
        ${file?.type === 'audio'
          ? 'Управление показано на вымышленной записи.'
          : 'Изображение открыто внутри хранилища.'}
      </p>
      ${button('Сохранить внешнюю копию', 'export', '', 'upload', 'button secondary full')}
    </div>`
}

export function importFiles() {
  return html`${backBar('Импорт')}
    <div class="content">
      ${heading(
        m.importDone() ? 'Файлы на месте' : 'Добавить в хранилище',
        m.importDone() ? '1 файл добавлен, 1 пропущен.' : 'Проверьте выбранные файлы перед добавлением.',
      )}
      <section class="field-group">
        <div class="result-row">
          ${icon(m.importDone() ? 'check' : 'file-text')}<span
            ><strong>Билеты.pdf</strong
            ><small>${m.importDone() ? 'Добавлен в файлы' : '240 КБ · готов к добавлению'}</small></span
          >
        </div>
        <div class="result-row">
          ${icon('circle-help')}<span
            ><strong>Архив.zip</strong
            ><small>${m.importDone() ? 'Пропущен: файл недоступен' : 'Недоступен для чтения'}</small></span
          >
        </div>
      </section>
      <p class="quiet-note">
        ${m.importDone()
          ? 'Недоступный файл не был добавлен. Выберите его снова, когда он станет доступен.'
          : 'Добавляем только доступные файлы. Исходники останутся на своём месте.'}
      </p>
      ${m.importDone()
        ? button('Открыть файлы', 'go', 'files', 'folder', 'button primary full')
        : html`<button class="button primary full" data-action="import" ?disabled=${m.readonly()}>
            Добавить 1 файл${icon('download')}
          </button>`}
    </div>`
}
