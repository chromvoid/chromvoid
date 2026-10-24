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

export function welcome() {
  return html`<div class="welcome-page">
    <div class="wordmark"><img src="/brand.svg" alt="" />ChromVoid</div>
    <div class="welcome-art" aria-hidden="true">
      <img src="/brand.svg" alt="" /><span class="orbit-label orbit-one">${icon('key-round')} Пароли</span
      ><span class="orbit-label orbit-two">${icon('file-text')} Личное</span
      ><span class="orbit-label orbit-three">${icon('folder')} Файлы</span>
    </div>
    <div class="welcome-copy">
      <p class="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</p>
      <h1>Личное.<br /><em>На своём месте.</em></h1>
      <p>Пароли, коды и файлы — на вашем устройстве. Открывайте нужное и выбирайте, кому дать доступ.</p>
    </div>
    <div class="welcome-actions">
      ${button('Начать', 'go', 'setup', 'arrow-up-right', 'button primary full')}${button(
        'Уже настроено? Открыть',
        'go',
        'unlock',
        '',
        'text-button full',
      )}
    </div>
  </div>`
}

export function access() {
  const setup = m.route() === 'setup'
  return html`${backBar('ChromVoid')}
    <div class="content access-page">
      <span class="access-symbol">${icon(setup ? 'shield-check' : 'lock')}</span>${heading(
        setup ? 'Настроим защиту' : 'С возвращением',
        setup
          ? 'Административный пароль нужен для обслуживания. Пароль хранилища вы введёте отдельно.'
          : 'Введите пароль вашего хранилища.',
      )}
      <form novalidate>
        ${field(
          'secret',
          setup ? 'Административный пароль' : 'Пароль хранилища',
          'password',
          '',
          true,
        )}${setup ? field('confirm', 'Повторите пароль', 'password', '', true) : ''}${formError()}${submit(
          setup ? 'Продолжить' : 'Открыть хранилище',
        )}
      </form>
      <p class="quiet-note">
        ${setup
          ? 'Сохраните административный пароль в надёжном месте.'
          : 'Пароль не отправляется на сервер для проверки.'}
      </p>
      ${button('Подключения', 'go', 'connections', 'link', 'text-button')}
    </div>`
}

export function catalog() {
  const entries = m.visibleEntries()
  return html`<div class="app-toolbar brand-toolbar">
      <div class="wordmark"><img src="/brand.svg" alt="" />ChromVoid</div>
      ${iconButton('Закрыть хранилище', 'lock', '', 'lock')}
    </div>
    <div class="content catalog-content">
      ${heading('Хранилище', 'Пароли и коды. Всегда под рукой.')}<label class="search-box"
        >${icon('search')}<input
          type="search"
          aria-label="Найти запись"
          data-input="query"
          placeholder="Название, логин или тег"
          .value=${m.query()}
      /></label>
      <div class="category-tabs" aria-label="Тип записи">
        ${[
          ['all', 'Все'],
          ['login', 'Пароли'],
          ['card', 'Карты'],
          ['otp', 'Коды'],
        ].map(
          ([value, label]) =>
            html`<button
              type="button"
              data-action="category"
              data-value=${value}
              aria-pressed=${m.category() === value}
            >
              ${label}
            </button>`,
        )}
      </div>
      <div class="list-toolbar">
        ${button(m.group(), 'sheet', 'filters', 'sliders-horizontal', 'text-button')}
        <div>
          ${iconButton('Группы и теги', 'go', 'organize', 'folder')}${iconButton(
            'Выбрать записи',
            'select-mode',
            '',
            'check',
          )}
        </div>
      </div>
      ${readonlyNotice()}${m.selecting()
        ? html`<div class="selection-bar">
            <strong>Выбрано: ${m.selected().length}</strong
            ><button
              class="text-button danger"
              data-action="delete"
              ?disabled=${!m.selected().length || m.readonly()}
            >
              Удалить
            </button>
          </div>`
        : ''}${unavailable(
        html`<div class="entry-list">
          ${entries.length
            ? entries.map(
                (item) =>
                  html`<div class="entry-row">
                    ${m.selecting()
                      ? html`<button
                          class="selection-check"
                          aria-label=${`Выбрать ${item.title}`}
                          aria-pressed=${m.selected().includes(item.id)}
                          data-action="select"
                          data-value=${item.id}
                        >
                          ${m.selected().includes(item.id) ? icon('check') : ''}
                        </button>`
                      : ''}<button
                      class="entry-main"
                      aria-current=${m.route() === 'detail' && m.entryId() === item.id ? 'true' : 'false'}
                      data-action="entry"
                      data-value=${item.id}
                    >
                      <span class="avatar ${item.type === 'card' ? 'card-avatar' : ''}"
                        >${item.icon.length > 1 ? icon(item.icon) : item.icon}</span
                      ><span class="row-copy"
                        ><strong>${item.title}</strong
                        ><small>${item.username || (item.type === 'otp' ? 'Одноразовый код' : '')}</small>
                        ${item.otp && item.type !== 'otp' && m.category() !== 'otp'
                          ? html`<small class="otp-hint">${icon('qr-code')} Есть одноразовый код</small>`
                          : ''}</span
                      ></button
                    >${item.type === 'otp' || m.category() === 'otp'
                      ? ''
                      : item.type !== 'passkey'
                        ? iconButton(`Копировать пароль ${item.title}`, 'copy', 'Пароль', 'copy')
                        : icon('fingerprint')}
                    ${item.otp && (m.category() === 'otp' || item.type === 'otp')
                      ? html`<div class="entry-code">${otpCode(item)}</div>`
                      : ''}
                  </div>`,
              )
            : html`<div class="empty-state">
                ${icon('key-round')}
                <h2>
                  ${m.query() || m.group() !== 'Все группы' ? 'Ничего не найдено' : 'Здесь начинается ваше'}
                </h2>
                <p>
                  ${m.query()
                    ? 'Попробуйте другое название или сбросьте фильтры.'
                    : 'Добавьте первую запись. Нужное будет легко найти.'}
                </p>
                ${m.query() || m.group() !== 'Все группы'
                  ? button('Сбросить поиск и фильтры', 'clear-search')
                  : button(
                      m.category() === 'otp' ? 'Добавить код' : 'Добавить запись',
                      'new',
                      m.category() === 'all' ? 'login' : m.category(),
                      'plus',
                      'button primary',
                    )}
              </div>`}
        </div>`,
      )}
      <div class="catalog-links">
        ${button('Ключи доступа', 'go', 'passkeys', 'fingerprint', 'text-button')}${button(
          'Проверка паролей',
          'go',
          'audit',
          'shield-check',
          'text-button',
        )}
      </div>
    </div>
    <div class="creation-dock">
      <button class="button primary" data-action="sheet" data-value="create" ?disabled=${m.readonly()}>
        ${icon('plus')}Добавить
      </button>
    </div>`
}

export function detail() {
  const item = m.entry()
  if (!item)
    return html`${backBar()}
      <div class="state-view">
        <h2>Запись недоступна</h2>
        ${button('К списку', 'go', 'vault')}
      </div>`
  return html`${backBar(
      'Запись',
      item.type === 'passkey'
        ? iconButton('Закрыть хранилище', 'lock', '', 'lock')
        : button('Изменить', 'edit', '', '', 'text-button'),
    )}
    <div class="content detail-content">
      <div class="object-header">
        <span class="avatar large">${item.icon.length > 1 ? icon(item.icon) : item.icon}</span>
        <p>
          ${item.type === 'passkey'
            ? 'Ключ доступа'
            : item.type === 'otp'
              ? 'Одноразовый код'
              : item.type === 'card'
                ? 'Платёжная карта'
                : 'Учётная запись'}
        </p>
        <h1 tabindex="-1">${item.title}</h1>
        <span class="muted">${item.site || item.group}</span>
      </div>
      ${readonlyNotice()}
      ${item.type !== 'otp'
        ? html`<section class="field-group">
            <div class="data-field">
              <span
                ><small>${item.type === 'card' ? 'Номер карты' : 'Логин'}</small
                ><strong>${item.username}</strong></span
              >${iconButton('Копировать логин', 'copy', 'Логин', 'copy')}
            </div>
            ${item.type === 'passkey'
              ? html`<div class="data-field">
                    <span><small>Сайт</small><strong>${item.site}</strong></span
                    >${icon('fingerprint')}
                  </div>
                  <p class="quiet-note">
                    Используется через системное автозаполнение. Закрытый ключ не показывается.
                  </p>`
              : html`<div class="data-field">
                  <span
                    ><small>${item.type === 'card' ? 'Код безопасности' : 'Пароль'}</small
                    ><strong class="secret">${m.revealed() ? item.secret : '•••• •••• ••••'}</strong></span
                  >
                  <div>
                    ${iconButton(
                      m.revealed() ? 'Скрыть пароль' : 'Показать пароль',
                      'reveal',
                      '',
                      'eye',
                    )}${iconButton('Копировать пароль', 'copy', 'Пароль', 'copy')}
                  </div>
                </div>`}
          </section>`
        : ''}
      ${item.otp
        ? html`<section class="detail-section otp-section" aria-label="Одноразовый код">
            <h2>Одноразовый код</h2>
            ${otpCode(item)}
          </section>`
        : ''}
      <section class="detail-section">
        <h2>Организация</h2>
        ${row(item.group, 'Группа', 'folder', 'sheet', 'move')}${row(
          item.tags || 'Без тегов',
          'Теги',
          'sliders-horizontal',
          'go',
          'organize',
        )}
      </section>
      ${item.notes
        ? html`<section class="detail-section">
            <h2>Заметка</h2>
            <p class="preserve-text">${item.notes}</p>
          </section>`
        : ''}${!['passkey', 'otp'].includes(item.type)
        ? button('Копировать все данные', 'copy', 'Все данные', 'copy', 'button secondary full')
        : ''}
      <div class="danger-zone">
        ${button('Удалить запись', 'delete', item.id, 'trash-2', 'text-button danger')}
      </div>
    </div>`
}

export function editor() {
  const type = m.form.fields.type()
  return html`${backBar(m.editingId() ? 'Изменение записи' : 'Новая запись')}
    <div class="content">
      ${heading(
        type === 'otp' ? 'Добавить код' : type === 'card' ? 'Платёжная карта' : 'Учётная запись',
        'Сохраните то, что нужно именно вам.',
      )}${readonlyNotice()}
      <form novalidate>
        ${field('title', 'Название', 'text', 'Например, личная почта', true)}${type !== 'otp'
          ? field('username', type === 'card' ? 'Номер карты' : 'Логин или email')
          : ''}${field(
          'secret',
          type === 'otp' ? 'Секрет или otpauth-ссылка' : type === 'card' ? 'Код безопасности' : 'Пароль',
          'password',
          type === 'otp' ? 'В макете используется только вымышленное значение' : '',
          type === 'otp',
        )}${type === 'otp'
          ? button('Сканировать QR-код', 'camera', '', 'qr-code', 'text-button')
          : type !== 'card'
            ? button('Предложить пароль', 'generate', '', 'key-round', 'text-button')
            : ''}<label class="field"
          ><span>Группа</span
          ><select name="group" .value=${m.form.fields.group()}>
            ${m.groups().map((group) => html`<option>${group}</option>`)}
          </select></label
        ><label class="field"
          ><span>Заметка</span
          ><textarea name="notes" rows="3" .value=${m.form.fields.notes()}></textarea></label
        >${formError()}${submit('Сохранить')}
      </form>
    </div>`
}

function otpCode(item) {
  return html`<div class="otp-code">
    <div class="code-value">
      <span>${item.otp.value}</span>
      <small>Ещё ${item.otp.remaining} с</small>
      ${iconButton(`Копировать код ${item.title}`, 'copy', 'Код', 'copy')}
    </div>
    <progress
      value=${item.otp.remaining}
      max=${item.otp.period}
      aria-label="Оставшееся время кода"
    ></progress>
  </div>`
}

export function organized() {
  if (m.route() === 'passkeys')
    return html`${backBar()}
      <div class="content">
        ${heading('Ключи доступа', 'Вход без передачи пароля сайту.')}${m
          .entries()
          .filter((item) => item.type === 'passkey')
          .map((item) => row(item.title, item.username, 'fingerprint', 'entry', item.id))}
        <p class="quiet-note">Новые ключи создаются в поддержанном системном сценарии.</p>
        ${button('Как настроить', 'go', 'autofill', '', 'button secondary')}
      </div>`
  if (m.route() === 'audit')
    return html`${backBar()}
      <div class="content">
        ${heading('Проверка паролей', 'Начните с записей, которым нужно внимание.')}
        <div class="summary-number">
          <strong>2</strong><span>записи для проверки<br /><small>Демонстрационный результат</small></span>
        </div>
        ${row('Proton', 'Пароль используется повторно', 'key-round', 'entry', 'proton')}${row(
          'GitHub',
          'Короткий пароль',
          'key-round',
          'entry',
          'github',
        )}
        <p class="quiet-note">
          Проверка указывает на конкретную причину. Исправьте пароль на сайте и обновите запись.
        </p>
      </div>`
  return html`${backBar()}
    <div class="content">
      ${heading('Всё на своих местах', 'Группы и теги помогают сузить поиск.')}
      <h2 class="section-title">Группы</h2>
      <section class="field-group">
        ${m
          .groups()
          .map((group) =>
            row(
              group,
              `${m.entries().filter((item) => item.group === group).length} записей`,
              'folder',
              'group',
              group,
            ),
          )}
      </section>
      <h2 class="section-title">Теги</h2>
      <div class="tag-list">
        ${['почта', 'разработка', 'дизайн', 'поездка'].map((tag) => button(tag, 'tag', tag, '', 'tag'))}
      </div>
      <p class="quiet-note">Группа задаёт место. Тег позволяет найти связанные записи в разных группах.</p>
    </div>`
}
