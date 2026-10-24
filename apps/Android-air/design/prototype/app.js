import {html, ReatomLitElement} from '../../../../packages/uikit/src/reatom-lit/index.ts'

import {computer, connections, pair} from './connections.js'
import {document as documentView, fileCatalog, importFiles, media, note} from './files.js'
import {journeys, roots, statesFor} from './fixtures.js'
import {model as m} from './model.js'
import {autofill, extra, maintenance, security, settings} from './settings.js'
import {button, icon, iconButton, row} from './ui.js'
import {access, catalog, detail, editor, organized, welcome} from './vault.js'

const views = {
  welcome,
  setup: access,
  unlock: access,
  vault: catalog,
  detail,
  edit: editor,
  passkeys: organized,
  organize: organized,
  audit: organized,
  files: fileCatalog,
  document: documentView,
  note,
  media,
  import: importFiles,
  connections,
  pair,
  computer,
  settings,
  security,
  autofill,
  provider: autofill,
  maintenance,
  wallet: extra,
  ssh: extra,
  help: extra,
}
const concepts = {
  quiet: ['01', 'Тихий сигнал', 'Спокойное пространство. Выразительное действие.'],
  archive: ['02', 'Личный архив', 'Редакционная типографика. Структура и собранность.'],
  rhythm: ['03', 'Живой ритм', 'Крупная форма. Энергия и тактильность.'],
}

function navigation() {
  return html`<nav class="product-nav" aria-label="Разделы приложения">
    ${roots
      .filter(([id]) => m.unlocked() || ['connections', 'settings'].includes(id))
      .map(
        ([id, glyph, label]) =>
          html`<button
            type="button"
            data-action="root"
            data-value=${id}
            aria-current=${m.root() === id ? 'page' : 'false'}
          >
            <span>${icon(glyph)}</span><small>${label}</small>
          </button>`,
      )}
  </nav>`
}

function sheet() {
  const mode = m.sheet()
  if (mode === 'create')
    return html`<h2 id="sheet-title">Что добавим?</h2>
      ${row('Учётная запись', 'Логин и пароль', 'key-round', 'new', 'login')}${row(
        'Платёжная карта',
        'Данные карты',
        'credit-card',
        'new',
        'card',
      )}${row('Одноразовый код', 'Дополнительная проверка входа', 'qr-code', 'new', 'otp')}${row(
        'Импорт записей',
        'Обзор существующего пути',
        'download',
        'sheet',
        'credential-import',
      )}${row('SSH-ключи', 'Связанные ключи', 'key-round', 'go', 'ssh')}${row(
        'Кошелёк',
        'Поддержанные операции',
        'credit-card',
        'go',
        'wallet',
      )}`
  if (mode === 'file-create')
    return html`<h2 id="sheet-title">Добавить в файлы</h2>
      ${row('Новая заметка', 'Оставьте важную мысль', 'file-text', 'note', 'new')}${row(
        'Импортировать',
        'Выбрать и проверить файлы',
        'download',
        'start-import',
      )}`
  if (mode === 'filters')
    return html`<h2 id="sheet-title">Группы и порядок</h2>
      <label class="field"
        ><span>Порядок</span
        ><select data-control="sort" .value=${m.sort()}>
          <option value="default">Порядок каталога</option>
          <option value="name">По названию</option>
        </select></label
      >${['Все группы', ...m.groups()].map((group) =>
        row(group, m.group() === group ? 'Выбрано' : '', 'folder', 'group', group),
      )}`
  if (mode === 'move')
    return html`<h2 id="sheet-title">Переместить запись</h2>
      <p>Выберите группу назначения.</p>
      ${m
        .groups()
        .map((group) =>
          row(group, m.entry()?.group === group ? 'Текущая группа' : '', 'folder', 'move', group),
        )}`
  if (mode === 'usb')
    return html`<h2 id="sheet-title">Телефон рядом</h2>
      <p>
        Поддержанная Android-сборка может предоставлять доступ по USB. На компьютере выберите телефон и
        подтвердите подключение по действующему протоколу.
      </p>
      <p>Кабель не открывает закрытое хранилище.</p>
      <p class="quiet-note">
        Это описание сценария. Проверка кабеля и устройств выполняется в нативной сборке.
      </p>`
  if (mode === 'language')
    return html`<h2 id="sheet-title">Язык</h2>
      <p>
        Русский используется для обсуждения дизайна. При переносе интерфейса сохраняется существующее покрытие
        переводов.
      </p>`
  if (mode === 'credential-import')
    return html`<h2 id="sheet-title">Импорт записей</h2>
      <p>Выберите источник, проверьте распознанные записи и дубликаты перед сохранением.</p>
      <div class="field-group">
        <div class="result-row">
          ${icon('key-round')}<span><strong>Личная почта</strong><small>Будет добавлена</small></span>
        </div>
        <div class="result-row">
          ${icon('circle-help')}<span
            ><strong>GitHub</strong><small>Возможный дубликат · пропустить</small></span
          >
        </div>
      </div>
      ${button('Добавить 1 запись', 'credential-import', '', '', 'button primary full')}`
  if (mode === 'receive')
    return html`<h2 id="sheet-title">Получить TON</h2>
      <p>Личный счёт · сеть TON</p>
      <div class="state-view">
        ${icon('qr-code')}<strong>Демонстрационный адрес</strong>
        <p>
          Здесь размещается QR и полный адрес выбранного счёта. Вымышленный QR не используется для перевода.
        </p>
      </div>`
  if (mode === 'send')
    return html`<h2 id="sheet-title">Проверить отправку</h2>
      <div class="status-line"><span>Сеть</span><strong>TON</strong></div>
      <div class="status-line"><span>Получатель</span><strong>Вымышленный адрес</strong></div>
      <div class="status-line"><span>Сумма</span><strong>1 TON</strong></div>
      <p>
        Перед подтверждением здесь показывается актуальная комиссия и полный адрес. В макете котировки и
        переводы отсутствуют.
      </p>
      ${button('Закрыть просмотр', 'close-sheet', '', '', 'button secondary full')}`
  return ''
}

class AirStudio extends ReatomLitElement {
  createRenderRoot() {
    return this
  }

  handleClick(event) {
    const target = event.target.closest('[data-action]')
    if (target && !target.disabled) m.command(target.dataset.action, target.dataset.value ?? '')
  }

  handleInput(event) {
    const target = event.target
    m.updateInput(target.name, target.dataset.input, target.value)
  }

  handleChange(event) {
    const target = event.target
    m.updateControl(target.dataset.control, target.value)
    if (target.name) m.input(target.name, target.value)
  }

  async handleSubmit(event) {
    event.preventDefault()
    const invalid = m.submit()
    if (invalid) {
      await this.updateComplete
      this.querySelector(`#field-${invalid}`)?.focus()
    }
  }

  handleDialogCancel(event) {
    event.preventDefault()
    m.command('back')
  }

  updated(properties) {
    super.updated(properties)
    const dialog = this.querySelector('dialog')
    if ((m.sheet() || m.confirmation()) && !dialog.open) dialog.showModal()
    else if (!m.sheet() && !m.confirmation() && dialog.open) dialog.close()
  }

  render() {
    const route = m.route()
    const scene = route === 'vault' && m.category() === 'otp' ? 'codes' : route
    const journey = journeys.find(([id]) => id === scene) ?? journeys[3]
    const concept = concepts[m.concept()]
    const isAccess = ['welcome', 'setup', 'unlock'].includes(route)
    const isWide = m.size() === 'tablet' || m.platform() === 'desktop'
    const split = isWide && m.unlocked() && ['vault', 'detail', 'files', 'document'].includes(route)
    const confirmation = m.confirmation()
    return html`<div
      class="air-design studio"
      data-theme=${m.theme()}
      data-concept=${m.concept()}
      @click=${this.handleClick}
      @input=${this.handleInput}
      @change=${this.handleChange}
      @submit=${this.handleSubmit}
    >
      <header class="studio-header">
        <a href="/" class="studio-brand"
          ><img src="/brand.svg" alt="" /><strong>CHROMVOID</strong><span>DESIGN STUDY / 01</span></a
        >
        <div class="studio-header-right">
          <span>ANDROID AIR</span><span class="edition">СЕНТЯБРЬ 2026</span>${iconButton(
            'Переключить тему',
            'theme',
            '',
            m.theme() === 'light' ? 'moon' : 'sun',
          )}
        </div>
      </header>
      <div class="studio-layout" data-wide=${isWide}>
        <aside class="studio-sidebar">
          <p class="eyebrow">НОВОЕ МОБИЛЬНОЕ НАПРАВЛЕНИЕ</p>
          <h2>Личное.<br />На своём<br /><em>месте.</em></h2>
          <p class="studio-description">Одна идентичность.<br />Знакомые привычки каждой платформы.</p>
          <label class="studio-select"
            ><span>Визуальное направление</span
            ><select data-control="concept" .value=${m.concept()}>
              ${Object.entries(concepts).map(
                ([key, value]) => html`<option value=${key}>${value[0]} — ${value[1]}</option>`,
              )}
            </select></label
          ><a class="gallery-link" href="/concepts">Сравнить три концепции ↗</a>
          <nav class="journey-nav" aria-label="Экраны макета">
            ${journeys.map(
              ([id, number, label]) =>
                html`<button
                  data-action="inspect"
                  data-value=${id}
                  aria-current=${scene === id ? 'page' : 'false'}
                >
                  <span>${number}</span>${label}
                </button>`,
            )}
          </nav>
          <p class="studio-footnote">Редактируемый прототип<br />Вымышленные данные</p>
        </aside>
        <main class="studio-main">
          <div class="stage-heading">
            <div>
              <span class="eyebrow"
                >${m.platform() === 'android'
                  ? 'ANDROID'
                  : m.platform() === 'ios'
                    ? 'iOS · АДАПТАЦИЯ'
                    : 'DESKTOP · АДАПТАЦИЯ'}</span
              >
              <p>${concept[1]} <span>/ ${journey[1]}</span></p>
            </div>
            <div class="stage-controls">
              <label
                ><span>Платформа</span
                ><select data-control="platform" .value=${m.platform()}>
                  <option value="android">Android</option>
                  <option value="ios">iOS</option>
                  <option value="desktop">Desktop</option>
                </select></label
              ><label
                ><span>${m.platform() === 'desktop' ? 'Окно · 1080' : 'Размер'}</span
                ><select data-control="size" ?disabled=${m.platform() === 'desktop'} .value=${m.size()}>
                  <option value="phone">Телефон · 390</option>
                  <option value="compact">Компактный · 360</option>
                  <option value="tablet">Планшет · 840</option>
                </select></label
              >
            </div>
          </div>
          <div class="device-stage">
            <div
              class="device"
              role="region"
              aria-label="Макет приложения"
              data-platform=${m.platform()}
              data-size=${m.size()}
              data-access=${isAccess}
              data-split=${split}
            >
              <div class="system-bar">
                <span>9:41</span><span class="camera-hole" aria-hidden="true"></span
                ><span class="system-icons" aria-label="Сеть и заряд">▰ ▰ 100%</span>
              </div>
              <div class="app-body">
                ${isWide && !isAccess ? navigation() : ''}
                <div class="app-workspace">
                  ${split
                    ? html`<div class="split-list">${m.root() === 'files' ? fileCatalog() : catalog()}</div>
                        <div class="split-detail">
                          ${route === 'detail'
                            ? detail()
                            : route === 'document'
                              ? documentView()
                              : html`<section class="split-empty">
                                  <img src="/brand.svg" alt="" />
                                  <h2>Нужное — рядом</h2>
                                  <p>
                                    Выберите ${m.root() === 'files' ? 'файл' : 'запись'}, чтобы открыть
                                    подробности.
                                  </p>
                                </section>`}
                        </div>`
                    : html`<div class="page" data-screen=${route}>${views[route]?.()}</div>`}
                </div>
                ${!isWide && !isAccess ? navigation() : ''}
              </div>
              <div class="gesture-area" aria-hidden="true"><span></span></div>
              ${m.notice()
                ? html`<div class="snackbar" role="status">
                    <span>${m.notice()}</span>${iconButton('Закрыть уведомление', 'dismiss', '', 'x')}
                  </div>`
                : ''}
            </div>
          </div>
          <div class="stage-caption">
            <span>CHROMVOID / ${concept[0]}</span>
            <p>${concept[2]}</p>
            <span>${m.theme() === 'light' ? 'LIGHT' : 'DARK'}</span>
          </div>
        </main>
        <aside class="studio-notes">
          <p class="eyebrow">${journey[1]} / СЦЕНАРИЙ</p>
          <h2>${journey[2]}</h2>
          <p>${journey[3]}</p>
          <label class="studio-select"
            ><span>Состояние</span
            ><select data-control="state" .value=${m.screenState()}>
              ${statesFor(route).map(([value, label]) => html`<option value=${value}>${label}</option>`)}
            </select></label
          >
          <div class="annotation">
            <span>ПРИНЦИП</span>
            <p>Данные — в центре.<br />Контроль — в действии.</p>
          </div>
          <div class="annotation">
            <span>ПРОВЕРИТЬ</span>
            <p>Пройдите задачу, вернитесь назад. Сохранился ли контекст? Понятен ли результат?</p>
          </div>
          <div class="studio-tools">
            ${button('Закрыть хранилище', 'lock', '', 'lock', 'button secondary full')}${route === 'pair'
              ? button('Код истёк', 'expire', '', '', 'button secondary full')
              : ''}${button('Сбросить демоданные', 'reset', '', '', 'text-button full')}
          </div>
          <p class="studio-footnote">
            Браузерный макет. Системные жесты, Autofill, USB, криптография и реальные операции проверяются
            отдельно в Android.
          </p>
        </aside>
      </div>
      <dialog class="sheet-dialog" aria-labelledby="sheet-title" @cancel=${this.handleDialogCancel}>
        <div class="sheet-heading">
          <span class="sheet-handle"></span>${iconButton(
            'Закрыть диалог',
            confirmation ? 'cancel-confirm' : 'close-sheet',
            '',
            'x',
          )}
        </div>
        ${confirmation
          ? html`<h2 id="sheet-title">${confirmation.title}</h2>
              <p>${confirmation.body}</p>
              <div class="dialog-actions">
                ${button('Отменить', 'cancel-confirm', '', '', 'button secondary')}${button(
                  confirmation.label,
                  'confirm',
                  '',
                  '',
                  'button primary',
                )}
              </div>`
          : sheet()}
      </dialog>
    </div>`
  }
}
customElements.define('air-studio', AirStudio)
