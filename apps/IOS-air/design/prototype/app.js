import {journeyScreens, renderJourney, journeyActions, submitJourney} from './journeys.js'
// Synthetic, in-memory UX study. No storage, clipboard, network or product API calls.
const icons = {
  key: '<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-3-3 3-3m-6 0 3-3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  eye: '<path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11H3Z"/>',
  link: '<path d="m10 14 4-4m-7 5-1 1a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0m2 3 1-1a3.5 3.5 0 0 1 5 5l-5 5a3.5 3.5 0 0 1-5 0" transform="translate(2 1)"/>',
  settings:
    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z"/><path d="m8 11 3 3 5-5"/>',
  device: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
  computer: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10"/>',
  file: '<path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8m-8 4h6"/>',
  code: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3"/><circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/>',
  warning: '<path d="m12 3 10 18H2Zm0 6v5m0 3v1"/>',
  wallet: '<path d="M3 6h17v15H3Zm0 0V3h14v3m-1 6h6v5h-6Z"/>',
}
const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.file}</svg>`
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c],
  )
const screenInfo = {
  ...journeyScreens,
  welcome: [
    'S01',
    'Первое знакомство',
    'Одна короткая вводная. Никаких разрешений до того, как они понадобятся.',
    'Перейдите к настройке. Административный пароль и пароль хранилища — отдельные понятия.',
  ],
  setup: [
    'S02',
    'Настройка защиты',
    'Административный секрет используется только для обслуживания хранилища.',
    'Отправьте пустую форму, затем введите одинаковые вымышленные значения.',
  ],
  unlock: [
    'S03',
    'Открыть хранилище',
    'Обычный вход по паролю. Face ID не заменяет этот шаг.',
    'Пустое поле даёт ошибку. Любое непустое демозначение открывает вымышленные записи.',
  ],
  vault: [
    'S04',
    'Хранилище',
    'Поиск и часто используемые записи сразу под рукой. Никакой декоративной сводки.',
    'Найдите «Proton», откройте запись, затем попробуйте изменение и блокировку.',
  ],
  detail: [
    'S05',
    'Карточка записи',
    'Значения скрыты до явного действия. Copy и reveal — самостоятельные controls.',
    'Раскройте демопароль, затем смените раздел: reveal не должен сохраниться.',
  ],
  edit: [
    'S06',
    'Редактирование',
    'Обычная форма с понятными полями, Save и Cancel.',
    'Сотрите название и сохраните. Затем исправьте ошибку. При отмене изменений появится подтверждение.',
  ],
  otp: [
    'S07',
    'Одноразовые коды',
    'Код читается быстро; действие копирования явно подписано. В макете время фиксировано.',
    'Попробуйте добавление кода. Разрешение на камеру запрашивается только по действию Scan.',
  ],
  passkeys: [
    'S08',
    'Ключи доступа',
    'Показываем метаданные, а не private key. Системный provider — отдельный сценарий.',
    'Откройте сведения о passkey. Создание не подменяется произвольной генерацией в приложении.',
  ],
  files: [
    'S09',
    'Файлы',
    'Простой список папок и документов. Привычный поиск и явный импорт.',
    'Откройте «Маршрут поездки» или экран импорта. Попробуйте пустое состояние.',
  ],
  document: [
    'S10',
    'Документ',
    'Контент занимает основное место. Редактирование и экспорт доступны отдельно.',
    'Откройте редактор, сохраните демотекст. Экспорт только моделируется.',
  ],
  note: [
    'S11',
    'Редактор заметки',
    'Заметка остаётся файлом в общем хранилище.',
    'Сохранение возвращает к документу. Блокировка уничтожает несохранённый draft.',
  ],
  import: [
    'S12',
    'Импорт',
    'Перед сохранением видно, что именно будет добавлено. Ошибки отдельных файлов не прячутся.',
    'Добавление создаёт только вымышленную строку в памяти макета.',
  ],
  connections: [
    'S13',
    'Подключения',
    'Этот iPhone — host. Состояние сети отдельно от доступа к vault.',
    'Start/Stop, добавление компьютера, revoke. Открытие страницы не запускает host.',
  ],
  pairing: [
    'S14',
    'Доверенный компьютер',
    'Подтверждение сопряжения — явный шаг; никакого автоматического доверия.',
    'Сверьте вымышленный код и подтвердите. Код в макете не создаёт настоящее соединение.',
  ],
  settings: [
    'S15',
    'Настройки',
    'Параметры сгруппированы по задаче, а не по внутреннему устройству приложения.',
    'Откройте AutoFill. Face ID — дополнительная проверка доступа, default off.',
  ],
  autofill: [
    'S16',
    'AutoFill',
    'Честное объяснение возможностей и ограничения текущей политики.',
    'Откройте пример системного запроса. Выдача секрета не обещана при background lock.',
  ],
  provider: [
    'S17',
    'Provider недоступен',
    'Extension безопасно отказывает при locked/unavailable runtime.',
    'Отмена возвращает в настройки. Здесь нет обхода блокировки и автоматического unlock.',
  ],
  storage: [
    'S18',
    'Нет доступа к ключу',
    'Ошибка Keychain не должна превращаться в кнопку сброса данных.',
    'Доступны retry и помощь. Стирание/создание нового vault не предлагаются.',
  ],
  empty: [
    'S19',
    'Пустое хранилище',
    'Пустой результат не означает неверный пароль.',
    'Добавьте запись или перейдите к импорту.',
  ],
  backup: [
    'S20',
    'Обслуживание',
    'Резервная копия, восстановление и смена пароля имеют разные последствия.',
    'Просмотрите review перед операцией. Реальные данные не читаются.',
  ],
  wallet: [
    'S21',
    'Wallet',
    'Обзор активов и операций без новой финансовой логики.',
    'Детали перевода показываются до подтверждения. Макет ничего не отправляет.',
  ],
  privacy: [
    'S22',
    'Хранилище закрыто',
    'При возврате нет старых названий, previews или раскрытых значений.',
    'Вернитесь к обычному входу. Состояние предыдущей карточки уже очищено.',
  ],
}
const groups = [
  ['ДОСТУП', ['welcome', 'setup', 'unlock']],
  [
    'ПОВСЕДНЕВНЫЕ ЗАДАЧИ',
    ['vault', 'detail', 'edit', 'otp', 'passkeys', 'files', 'document', 'note', 'import'],
  ],
  ['СИСТЕМА И ДОВЕРИЕ', ['connections', 'pairing', 'settings', 'autofill', 'provider', 'backup', 'wallet']],
  ['РАБОТА С ДАННЫМИ', Object.keys(journeyScreens)],
  ['ГРАНИЦЫ ДОСТУПА', ['privacy', 'storage', 'empty']],
]
const roots = [
  ['vault', 'key', 'Хранилище'],
  ['files', 'folder', 'Файлы'],
  ['connections', 'link', 'Подключения'],
  ['settings', 'settings', 'Настройки'],
]
const initialEntries = () => [
  {
    id: 1,
    title: 'Proton',
    login: 'alex@example.com',
    website: 'account.proton.me',
    password: 'demo-only-orbit-729',
    letter: 'P',
    tone: 'accent',
    group: 'Личное',
    tags: 'Личное',
  },
  {
    id: 2,
    title: 'GitHub',
    login: 'alex-demo',
    website: 'github.com',
    password: 'demo-only-coast-184',
    letter: 'G',
    tone: '',
    group: 'Работа',
    tags: 'Работа',
  },
  {
    id: 3,
    title: 'Figma',
    login: 'alex@example.com',
    website: 'figma.com',
    password: 'demo-only-field-613',
    letter: 'F',
    tone: 'brand',
    group: 'Работа',
    tags: 'Работа',
  },
  {
    id: 4,
    title: 'Личный кабинет',
    login: 'alex@example.com',
    website: 'service.example',
    password: 'demo-only-sky-842',
    letter: 'Л',
    tone: '',
  },
]
const initialNotes = () => ({
  'Маршрут поездки':
    'Перед поездкой\n\nСохранить маршрут, проверить документы и поделиться нужными файлами с близкими.',
})
const initialScreen = new URLSearchParams(location.search).get('screen')
const model = {
  screen: Object.hasOwn(screenInfo, initialScreen) ? initialScreen : 'vault',
  state: 'normal',
  unlocked: !['welcome', 'setup', 'unlock', 'privacy', 'storage', 'provider'].includes(initialScreen),
  readOnly: false,
  history: [],
  tabRoutes: {},
  fileKind: 'all',
  selectedFile: 'Маршрут поездки',
  otpAdded: false,
  passkeyDeleted: false,
  pairingExpired: false,
  maintenance: 'backup',
  transaction: null,
  query: '',
  fileQuery: '',
  group: '',
  groups: ['Личное', 'Работа'],
  sort: 'name',
  selected: 1,
  entries: initialEntries(),
  folder: '',
  revealed: false,
  host: false,
  paired: false,
  biometric: false,
  notes: initialNotes(),
  creatingNote: false,
  note: 'Перед поездкой\n\nСохранить маршрут, проверить документы и поделиться нужными файлами с близкими.',
  imported: false,
  editingNew: false,
}
const app = document.querySelector('#app')
const activeRoot = () =>
  ['files', 'document', 'note', 'import', 'file-tools', 'media'].includes(model.screen)
    ? 'files'
    : ['connections', 'pairing'].includes(model.screen)
      ? 'connections'
      : ['settings', 'autofill', 'provider', 'backup', 'preferences', 'help', 'maintenance-review'].includes(
            model.screen,
          )
        ? 'settings'
        : 'vault'
const current = () => model.entries.find((entry) => entry.id === model.selected)
const action = (name, label, symbol, cls = '') =>
  `<button type="button" data-action="${name}" class="${cls}" aria-label="${esc(label)}">${symbol ? icon(symbol) : esc(label)}</button>`
const goButton = (screen, label, cls = 'primary') =>
  `<button type="button" class="${cls}" data-go="${screen}">${esc(label)}</button>`
function toolbar({back, title = '', end = 'lock'} = {}) {
  const leading = back
    ? `<button data-action="back" aria-label="Назад">${icon('back')}Назад</button>`
    : end === 'add'
      ? action('lock', 'Закрыть хранилище', 'lock')
      : `<span class="muted">${icon('shield')}</span>`
  const trailing =
    end === 'add'
      ? action('add', 'Добавить запись', 'plus')
      : end === 'edit'
        ? `<span class="toolbar-actions">${action('edit', 'Изменить')}${action('lock', 'Закрыть хранилище', 'lock')}</span>`
        : end === 'none'
          ? '<span class="spacer"></span>'
          : action('lock', 'Закрыть хранилище', 'lock')
  return `<div class="toolbar">${leading}<span class="toolbar-title">${esc(title)}</span>${trailing}</div>`
}
const tabs = () =>
  `<nav class="tabs" aria-label="Разделы">${roots.map(([screen, symbol, label]) => `<button data-tab="${screen}" ${activeRoot() === screen ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('')}</nav>`
const row = (title, sub, symbol, target, tone = '') =>
  `<button class="row" data-go="${target}"><span class="avatar ${tone}">${icon(symbol)}</span><span class="row-main"><span class="row-title">${esc(title)}</span><span class="row-sub">${esc(sub)}</span></span>${icon('next', 'chevron')}</button>`
const field = (label, name, value = '', type = 'text', extra = '') =>
  `<label class="form-field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" autocomplete="off" ${extra}></label>`
const emptyState = (title, body, symbol = 'folder', button = '') =>
  `<div class="empty-state">${icon(symbol)}<h3>${esc(title)}</h3><p>${esc(body)}</p>${button}</div>`
const routeKeys = ['screen', 'query', 'fileQuery', 'group', 'folder', 'fileKind', 'selected', 'selectedFile']
const safeRoutes = [
  'welcome',
  'setup',
  'unlock',
  'privacy',
  'storage',
  'connections',
  'pairing',
  'settings',
  'autofill',
  'provider',
  'preferences',
  'help',
  'backup',
  'maintenance-review',
]
const routeSnapshot = () => ({
  ...Object.fromEntries(routeKeys.map((key) => [key, model[key]])),
  scrollTop: app.querySelector('.content')?.scrollTop || 0,
})
function navigate(screen, mode = 'push') {
  if (!Object.hasOwn(screenInfo, screen)) return
  if (!model.unlocked && !safeRoutes.includes(screen)) screen = 'unlock'
  if (mode === 'push' && model.screen !== screen) model.history.push(routeSnapshot())
  model.screen = screen
  model.state = model.readOnly ? 'readonly' : 'normal'
  model.revealed = false
  document.querySelector('#state').value = model.state
  const next = new URL(location.href)
  next.searchParams.set('screen', screen)
  history.replaceState(null, '', next)
  render()
  app.querySelector('h2')?.setAttribute('tabindex', '-1')
  app.querySelector('h2')?.focus({preventScroll: true})
}
function back() {
  const previous = model.history.pop()
  if (previous) Object.assign(model, previous)
  navigate(
    previous?.screen ||
      {
        setup: 'welcome',
        unlock: 'welcome',
        provider: 'autofill',
        pairing: 'connections',
        import: 'files',
        note: 'document',
        edit: 'detail',
        'passkey-detail': 'passkeys',
        'wallet-review': 'wallet-send',
      }[model.screen] ||
      (model.unlocked ? activeRoot() : 'unlock'),
    'replace',
  )
  app.querySelector('.content').scrollTop = previous?.scrollTop || 0
}
function switchTab(screen) {
  if (screen === activeRoot()) return
  model.tabRoutes[activeRoot()] = {route: routeSnapshot(), history: [...model.history]}
  const saved = model.tabRoutes[screen]
  model.history = saved ? [...saved.history] : []
  if (saved) Object.assign(model, saved.route)
  navigate(saved?.route.screen || screen, 'replace')
  app.querySelector('.content').scrollTop = saved?.route.scrollTop || 0
}
function leave(action) {
  const forms = [...app.querySelectorAll('form[data-form]')]
  const dirty = forms.some(
    (form) =>
      !['setup', 'unlock'].includes(form.dataset.form) &&
      new URLSearchParams(new FormData(form)).toString() !== model.formBaselines?.[form.dataset.form],
  )
  if (dirty) notice('Отменить изменения?', 'Несохранённые изменения будут удалены.', 'Не сохранять', action)
  else action()
}
function lock() {
  Object.assign(model, {
    unlocked: false,
    readOnly: false,
    query: '',
    fileQuery: '',
    group: '',
    folder: '',
    fileKind: 'all',
    selected: null,
    selectedFile: '',
    creatingNote: false,
    revealed: false,
    history: [],
    tabRoutes: {},
    transaction: null,
    host: false,
    pairingExpired: true,
  })
  document.querySelector('#notice').close()
  navigate('privacy', 'replace')
}
function preview(screen) {
  model.unlocked = !['welcome', 'setup', 'unlock', 'privacy', 'storage', 'provider'].includes(screen)
  model.readOnly = false
  model.history = []
  model.tabRoutes = {}
  model.query = ''
  model.fileQuery = ''
  model.selected = model.entries[0]?.id
  model.selectedFile = 'Маршрут поездки'
  model.editingNew = false
  navigate(screen, 'replace')
}
function notice(title, body, confirmLabel, onConfirm) {
  const dialog = document.querySelector('#notice')
  document.querySelector('#notice-title').textContent = title
  document.querySelector('#notice-body').textContent = body
  const actions = document.querySelector('#notice-actions')
  actions.replaceChildren()
  if (confirmLabel) {
    const cancel = document.createElement('button')
    cancel.textContent = 'Отмена'
    actions.append(cancel)
  }
  const confirm = document.createElement('button')
  confirm.textContent = confirmLabel || 'Понятно'
  confirm.type = 'button'
  confirm.addEventListener(
    'click',
    () => {
      dialog.close()
      onConfirm?.()
    },
    {once: true},
  )
  actions.append(confirm)
  dialog.showModal()
}
function toast(message) {
  app.querySelector('.toast')?.remove()
  const element = document.createElement('div')
  element.className = 'toast'
  element.setAttribute('role', 'status')
  element.textContent = message
  app.append(element)
  setTimeout(() => element.remove(), 2600)
}
function categoryBar(selected = 'vault') {
  return `<div class="categories" aria-label="Категории">${[
    ['vault', 'Пароли'],
    ['otp', 'Коды'],
    ['passkeys', 'Passkeys'],
  ]
    .map(
      ([screen, label]) =>
        `<button data-go="${screen}" class="${selected === screen ? 'active' : ''}">${label}</button>`,
    )
    .join('')}</div>`
}
function entryRows() {
  const filtered = model.entries
    .filter(
      (e) =>
        (!model.group || e.group === model.group) &&
        `${e.title} ${e.login} ${e.website} ${e.tags || ''}`
          .toLocaleLowerCase()
          .includes(model.query.toLocaleLowerCase()),
    )
    .sort((a, b) => (model.sort === 'name' ? a.title.localeCompare(b.title, 'ru') : b.id - a.id))
  return filtered.length
    ? filtered
        .map(
          (entry) =>
            `<div class="row credential-row"><button class="entry-open" data-entry="${entry.id}"><span class="avatar ${entry.tone}">${esc(entry.letter)}</span><span class="row-main"><span class="row-title">${esc(entry.title)}</span><span class="row-sub">${esc(entry.login)}</span></span></button><button class="quick-copy" data-action="copy" aria-label="Скопировать пароль ${esc(entry.title)}">${icon('copy')}</button></div>`,
        )
        .join('')
    : emptyState('Ничего не найдено', 'Попробуйте другое название или логин.', 'search')
}
function statusContent() {
  if (model.state === 'loading')
    return emptyState(
      'Загружаем данные',
      'Навигация остаётся доступной. Можно вернуться назад.',
      'code',
      action('ready', 'Завершить загрузку в макете', null, 'secondary'),
    )
  if (model.state === 'error')
    return emptyState(
      'Не удалось загрузить',
      'Данные не изменены. Попробуйте ещё раз.',
      'warning',
      action('ready', 'Повторить', null, 'primary'),
    )
  if (model.state === 'empty')
    return emptyState(
      'Здесь пока ничего нет',
      'Добавьте первую запись или выберите другой раздел.',
      'folder',
      goButton('vault', 'Вернуться к хранилищу', 'secondary'),
    )
  return ''
}
function content() {
  const entry = current()
  const readOnly =
    model.state === 'readonly'
      ? '<div class="notice-inline"><strong>Только чтение</strong><br>Изменение недоступно в этом контексте. Просмотр разрешённых данных сохранён.</div>'
      : ''
  const extra = renderJourney(model, {icon, esc, action, goButton, field, row, readOnly})
  if (extra !== null) return extra
  switch (model.screen) {
    case 'welcome':
      return `<div class="access welcome"><img class="brand-emblem" src="/apps/webview/src/assets/chromvoid-icon.svg" alt=""><p class="brand-caption">CHROMVOID / AIR</p><h2>Всё своё.<br>Под рукой.</h2><p class="small-copy">Пароли, коды и файлы в личном хранилище ChromVoid.</p><div class="feature-lines"><div class="feature-line">${icon('key')}Доступ по паролю хранилища</div><div class="feature-line">${icon('device')}Данные на вашем устройстве</div><div class="feature-line">${icon('link')}Только доверенные подключения</div></div>${goButton('setup', 'Настроить ChromVoid')}${goButton('unlock', 'Настройка уже выполнена', 'secondary')}<p class="small-copy">Разрешения запрашиваются, когда вы решите использовать соответствующую функцию.</p></div>`
    case 'setup':
      return `<div class="access"><div class="access-mark">${icon('shield')}</div><h2>Защита управления</h2><p class="small-copy">Административный пароль нужен для обслуживания и стирания хранилища. Для доступа к записям используется отдельный пароль хранилища.</p><form data-form="setup" novalidate>${field('Административный пароль', 'admin', '', 'password')}${field('Повторите пароль', 'confirm', '', 'password')}<p class="error-copy" role="alert" id="form-error"></p><button class="primary">Продолжить</button></form></div>`
    case 'unlock':
      return `<div class="access"><div class="access-mark">${icon('lock')}</div><h2>Откройте<br>хранилище</h2><p class="small-copy">Введите пароль, чтобы получить доступ к вашим записям и файлам на этом iPhone.</p><form data-form="unlock" novalidate>${field('Пароль хранилища', 'password', '', 'password', 'placeholder="Введите пароль"')}<p class="error-copy" role="alert" id="form-error"></p><button class="primary">Открыть хранилище</button></form><p class="small-copy">Пароль хранилища определяет доступные вам данные.</p>${goButton('connections', 'Подключения этого iPhone', 'text-button')}${goButton('settings', 'Настройки и помощь', 'text-button')}</div>`
    case 'vault':
      return `<div class="vault-heading"><div><p class="brand-caption">CHROMVOID / AIR</p><h2>${esc(model.group || 'Хранилище')}</h2></div><img src="/apps/webview/src/assets/chromvoid-icon.svg" alt=""></div><p class="subtitle">На этом iPhone · доступ открыт</p><label class="search-box">${icon('search')}<input type="search" id="search" aria-label="Поиск паролей" placeholder="Название или логин" value="${esc(model.query)}"></label>${categoryBar()}<div class="list-tools">${goButton('collections', model.group || 'Группы и фильтры', 'text-button')}${model.group || model.query ? action('clear-filter', 'Сбросить', null, 'text-button') : goButton('credential-import', 'Импорт', 'text-button')}</div>${readOnly}<div class="section-label">Записи</div><div class="rows" id="entry-rows">${entryRows()}</div><div class="section-label">Также в хранилище</div>${row('Wallet', 'Аккаунты и история операций', 'wallet', 'wallet')}`
    case 'detail':
      return entry
        ? `<div class="detail-header"><div class="avatar big ${entry.tone}">${esc(entry.letter)}</div><h2>${esc(entry.title)}</h2><p class="subtitle">${esc(entry.group || 'Без группы')} · пароль</p></div>${readOnly}<div class="field-group"><div class="field-display"><div><div class="field-caption">Логин</div><div class="field-value">${esc(entry.login)}</div></div>${action('copy', 'Скопировать логин', 'copy')}</div><div class="field-display"><div><div class="field-caption">Пароль</div><div class="field-value monospace">${model.revealed ? esc(entry.password) : '••••••••••••'}</div></div>${action('reveal', model.revealed ? 'Скрыть пароль' : 'Показать пароль', 'eye')}${action('copy', 'Скопировать пароль', 'copy')}</div><div class="field-display"><div><div class="field-caption">Веб-сайт</div><div class="field-value">${esc(entry.website)}</div></div>${action('website', 'Открыть веб-сайт', 'next')}</div></div><div class="section-label">Заметка</div><p class="small-copy">Личный аккаунт. Все значения в этом макете вымышлены.</p><div class="list-tools">${action('copy', 'Скопировать все поля', null, 'text-button')}${goButton('collections', 'Переместить', 'text-button')}</div>${action('delete', 'Удалить запись', null, 'danger-button')}`
        : emptyState('Запись удалена', 'Вернитесь к списку.', 'key', goButton('vault', 'К списку'))
    case 'edit': {
      const draft = model.editingNew
        ? {title: '', login: '', website: '', password: ''}
        : entry || {title: '', login: '', website: '', password: ''}
      return `<h2>${model.editingNew ? 'Новая запись' : 'Изменить запись'}</h2>${readOnly}<form data-form="entry" novalidate>${field('Название', 'title', draft.title)}${field('Логин', 'login', draft.login)}${field('Пароль', 'password', draft.password, 'password')}${action('generate', 'Предложить демопароль', null, 'text-button')}${field('Веб-сайт', 'website', draft.website)}<label class="form-field">Группа<select name="group"><option value="">Без группы</option>${model.groups.map((group) => `<option ${group === (draft.group || model.group) ? 'selected' : ''}>${esc(group)}</option>`).join('')}</select></label>${field('Теги', 'tags', draft.tags || '')}<p id="form-error" class="error-copy" role="alert"></p><button class="primary" ${model.state === 'readonly' ? 'disabled' : ''}>Сохранить</button>${action('cancel-edit', 'Отменить', null, 'secondary')}</form>`
    }
    case 'otp':
      return `<h2>Коды</h2><p class="subtitle">Одноразовые коды доступа</p>${categoryBar('otp')}<div class="otp-box"><div class="row"><span class="avatar accent">P</span><span class="row-main"><span class="row-title">Proton</span><span class="row-sub">alex@example.com</span></span>${action('copy', 'Скопировать код Proton', 'copy')}</div><div class="otp-code monospace">482 901</div><p class="small-copy">Новый код через 18 секунд · демозначение</p></div><div class="otp-box"><div class="row"><span class="avatar">G</span><span class="row-main"><span class="row-title">GitHub</span><span class="row-sub">alex-demo</span></span>${action('copy', 'Скопировать код GitHub', 'copy')}</div><div class="otp-code monospace">736 204</div><p class="small-copy">Новый код через 18 секунд · демозначение</p></div>${model.otpAdded ? `<div class="notice-inline">Демокод добавлен: ${esc(model.otpTitle || 'Новый код')}</div>` : ''}${action('add-otp', 'Добавить код', null, 'secondary')}`
    case 'passkeys':
      return `<h2>Ключи доступа</h2><p class="subtitle">Вход без передачи пароля сайту</p>${categoryBar('passkeys')}${model.passkeyDeleted ? '<p class="small-copy">Ключей доступа пока нет.</p>' : row('example.com', 'alex@example.com · ключ доступа', 'key', 'passkey-detail', 'brand')}<p class="small-copy">Ключи создаются при регистрации на поддерживаемом сайте через системный provider. Секретный ключ не показывается.</p>`
    case 'files':
      return `<h2>${esc(model.folder || 'Файлы')}</h2><p class="subtitle">Личное хранилище${model.folder ? ' / Файлы' : ''}</p><label class="search-box">${icon('search')}<input id="file-search" type="search" aria-label="Поиск файлов" placeholder="Поиск в файлах" value="${esc(model.fileQuery)}"></label>${readOnly}<div class="list-tools">${action('files-all', 'Все файлы', null, 'text-button')}${action('files-notes', 'Заметки', null, 'text-button')}${goButton('file-tools', 'Действия', 'text-button')}</div><div id="file-rows"><div class="section-label">Документы</div>${row('Маршрут поездки', 'Markdown · 2 КБ', 'file', 'document', 'brand')}${model.folder || model.fileKind === 'notes' ? '' : ['Личные документы', 'Заметки'].map((name) => `<button class="row" data-folder="${name}"><span class="avatar">${icon('folder')}</span><span class="row-main"><span class="row-title">${name}</span><span class="row-sub">Папка · 1 файл</span></span>${icon('next', 'chevron')}</button>`).join('')}${model.fileKind === 'notes' ? '' : row('Фото и видео', 'Просмотр без внешней копии', 'file', 'media')}${Object.keys(
        model.notes,
      )
        .filter((name) => name !== 'Маршрут поездки')
        .map((name) => row(name, 'Markdown · заметка', 'file', 'document'))
        .join(
          '',
        )}${model.imported ? row('Список вещей.md', 'Только что добавлен · демофайл', 'file', 'document') : ''}</div><p id="files-no-match" class="small-copy" hidden>Ничего не найдено. Попробуйте другое название.</p>${goButton('import', 'Импортировать файлы', 'secondary')}<p class="small-copy">Файлы доступны, пока хранилище открыто.</p>`
    case 'document':
      return `<h2>${esc(model.selectedFile || 'Маршрут поездки')}</h2><p class="subtitle">Markdown · личное хранилище</p><article class="document"><p class="eyebrow">ЛИЧНАЯ ЗАМЕТКА</p><h3>Небольшое путешествие</h3><p>${esc(model.note).replace(/\n/g, '<br>')}</p><h4>Перед выходом</h4><ul><li>Документы и билеты</li><li>Зарядное устройство</li><li>Адрес и время заселения</li></ul></article>${goButton('note', 'Редактировать заметку', 'secondary')}${action('export', 'Экспортировать копию', null, 'text-button')}`
    case 'note':
      return `<h2>Заметка</h2><p class="subtitle">${esc(model.selectedFile || 'Маршрут поездки')}</p><form data-form="note"><label class="form-field">Текст<textarea name="note">${esc(model.creatingNote ? '' : model.note)}</textarea></label><button class="primary">Сохранить</button>${action('cancel-note', 'Отменить', null, 'secondary')}</form><p class="small-copy">Изменения остаются в памяти до сохранения. При блокировке несохранённый текст удаляется.</p>`
    case 'import':
      return `<h2>Добавить файлы</h2><p class="subtitle">Просмотр перед импортом</p><div class="rows">${row('Список вещей.md', 'Markdown · 1 КБ · демофайл', 'file', 'document', 'brand')}</div><div class="notice-inline">Будет добавлен 1 файл в открытое хранилище. Оригинал останется на прежнем месте.</div>${action('import', 'Импортировать 1 файл', null, 'primary')}${action('back', 'Отменить', null, 'secondary')}<p class="small-copy">В приложении выбор файлов откроется системным диалогом iOS.</p>`
    case 'connections':
      return `<h2>Подключения</h2><p class="subtitle">Доступ к этому iPhone</p><div class="host-hero">${icon('device')}<h3>Этот iPhone</h3><div class="status-line"><span class="status-dot ${model.host ? '' : 'off'}"></span>${model.host ? 'Ожидает подключения' : 'Подключения остановлены'}</div><p class="small-copy">Разрешите доверенному компьютеру подключаться к вашему хранилищу, пока приложение доступно.</p><p class="small-copy">Хранилище ${model.unlocked ? 'открыто' : 'закрыто · данные недоступны'}</p>${action('host', model.host ? 'Остановить' : 'Начать подключения', null, model.host ? 'secondary' : 'primary')}</div><div class="section-label">Доверенные компьютеры</div>${model.paired ? `<div class="rows">${row('MacBook Air', 'Сопряжён · сейчас не подключён', 'computer', 'pairing')}</div>${action('revoke', 'Отозвать доступ MacBook Air', null, 'text-button')}` : '<p class="small-copy">Пока нет сопряжённых компьютеров.</p>'}${action('start-pairing', 'Добавить компьютер', null, 'secondary')}<p class="small-copy">При уходе в фон хранилище закрывается. Это не постоянный фоновый сервер.</p>`
    case 'pairing':
      return `<div class="access"><div class="access-mark">${icon('computer')}</div><h2>Доверять этому<br>компьютеру?</h2><p class="small-copy">${model.pairingExpired ? 'Код истёк. Создайте новое сопряжение.' : 'Сравните код с тем, который показан на MacBook Air.'}</p><div class="otp-box"><p class="field-caption">Код подтверждения · макет</p><div class="otp-code monospace">482 901</div></div><p class="small-copy">Подтверждайте только подключение, которое начали сами.</p>${model.pairingExpired ? action('renew-pairing', 'Начать снова', null, 'primary') : action('pair', 'Коды совпадают', null, 'primary')}${action('back', 'Отменить', null, 'secondary')}${action('expire', 'Показать истёкший код', null, 'text-button')}</div>`
    case 'settings':
      return `<h2>Настройки</h2><p class="subtitle">ChromVoid Air</p><div class="section-label">Доступ</div><label class="setting-row"><span>Проверять доступ<br><small class="small-copy">Face ID / Touch ID</small></span><input type="checkbox" id="biometric" ${model.biometric ? 'checked' : ''}></label><p class="small-copy">Дополнительная проверка присутствия. Для открытия хранилища всё равно нужен его пароль.</p>${row('Автозаполнение', 'Возможности и системная настройка', 'key', 'autofill', 'brand')}<div class="section-label">Управление</div>${row('Хранилище', 'Копии, восстановление, пароли', 'shield', 'backup')}${row('Подключения', 'Доверенные компьютеры', 'computer', 'connections')}<div class="section-label">Приложение</div>${goButton('preferences', 'Оформление и поведение', 'text-button')}${goButton('help', 'Помощь', 'text-button')}${goButton('credential-import', 'Импорт паролей', 'text-button')}<p class="small-copy">Исследование интерфейса · 01<br>Вымышленные данные, без аналитики и сетевых запросов.</p>`
    case 'autofill':
      return `<h2>Автозаполнение</h2><p class="subtitle">Пароли и ключи доступа</p><div class="host-hero">${icon('key')}<h3>В приложениях и Safari</h3><p class="small-copy">Системный provider может предложить подходящую запись, когда текущая политика доступа разрешает её выдать.</p></div><div class="notice-inline"><strong>Есть ограничение</strong><br>При уходе ChromVoid в фон хранилище закрывается. В таком состоянии автозаполнение не выдаёт секреты. Возврат в Safari не гарантирует доступность provider.</div>${action('autofill-settings', 'Как включить в iOS', null, 'secondary')}${goButton('provider', 'Пример запроса без доступа', 'text-button')}`
    case 'provider':
      return emptyState(
        'Сейчас недоступно',
        'Хранилище закрыто или приложение недоступно. Автозаполнение не может открыть его в фоне.',
        'lock',
        `${action('back', 'Отменить', null, 'primary')}<p>Откройте ChromVoid для обычного входа. Доступность следующего запроса зависит от состояния приложения.</p>`,
      )
    case 'storage':
      return emptyState(
        'Нет доступа к ключу',
        'Не удалось получить ключ хранилища из защищённого хранилища устройства. Ваши данные не изменены.',
        'shield',
        `${action('retry-storage', 'Повторить', null, 'primary')}${action('storage-help', 'Что можно сделать', null, 'secondary')}${goButton('unlock', 'Вернуться ко входу', 'text-button')}`,
      )
    case 'empty':
      return emptyState(
        'Здесь пока нет записей',
        'Добавьте первую запись в это хранилище.',
        'key',
        `${action('add', 'Добавить запись', null, 'primary')}${goButton('import', 'Импортировать файлы', 'secondary')}`,
      )
    case 'backup':
      return `<h2>Управление<br>хранилищем</h2><p class="subtitle">Операции с вашими данными</p><div class="section-label">Резервные копии</div>${action('backup', 'Создать резервную копию', null, 'secondary')}${action('restore', 'Восстановить из копии', null, 'secondary')}<p class="small-copy">Восстановление требует проверки совместимости и административной авторизации.</p><div class="section-label">Пароли</div>${action('rekey', 'Изменить пароль хранилища', null, 'secondary')}<div class="section-label">Удаление данных</div>${action('erase', 'Стереть хранилище', null, 'danger-button')}<p class="small-copy">Это отдельная операция с подтверждением и административным паролем.</p>`
    case 'wallet':
      return `<h2>Wallet</h2><p class="subtitle">Аккаунты в вашем хранилище</p><div class="host-hero">${icon('wallet')}<h3>Личный аккаунт</h3><div class="otp-code monospace">0.024 BTC</div><p class="small-copy">Вымышленный баланс · данные макета</p></div><div class="list-tools">${action('receive', 'Получить', null, 'text-button')}${goButton('wallet-send', 'Отправить', 'text-button')}</div>${action('wallet-manage', 'Кошельки и аккаунты', null, 'secondary')}<div class="section-label">История</div><p class="small-copy">В этом демосценарии нет операций. Доступные сети и действия определяются возможностями существующего ядра.</p>`
    case 'privacy':
      return `<div class="access"><div class="access-mark">${icon('lock')}</div><h2>Хранилище<br>закрыто</h2><p class="small-copy">Введите пароль, чтобы продолжить. Несохранённые изменения удалены. Сохранённые данные останутся в хранилище.</p><form data-form="unlock" novalidate>${field('Пароль хранилища', 'password', '', 'password')}<p class="error-copy" role="alert" id="form-error"></p><button class="primary">Открыть хранилище</button></form><p class="small-copy">${model.biometric ? 'В приложении сначала будет отдельная проверка присутствия. Она не открывает хранилище.' : 'Доступ закрыт после сворачивания приложения.'}</p></div>`
    default:
      return ''
  }
}
function render() {
  const [id, title, description, check] = screenInfo[model.screen]
  for (const [selector, value] of [
    ['#screen-id', `${id} / ЭКРАН`],
    ['#screen-title', title],
    ['#screen-description', description],
    ['#screen-check', check],
  ])
    document.querySelector(selector).textContent = value
  document.querySelector('#screen-nav').innerHTML = groups
    .map(
      ([group, screens]) =>
        `<p class="nav-group">${group}</p>${screens.map((screen) => `<button class="screen-link" data-go="${screen}" ${screen === model.screen ? 'aria-current="page"' : ''}><span>${screenInfo[screen][0].slice(1)}</span>${screenInfo[screen][1]}</button>`).join('')}`,
    )
    .join('')
  const safeScreen =
    !model.unlocked || ['welcome', 'setup', 'unlock', 'privacy', 'storage', 'provider'].includes(model.screen)
  document.querySelector('#ipad-nav').innerHTML = safeScreen
    ? `<h2>ChromVoid</h2><p class="small-copy">Личное хранилище</p>`
    : `<h2>ChromVoid</h2>${roots.map(([screen, symbol, label]) => `<button data-tab="${screen}" ${activeRoot() === screen ? 'aria-current="page"' : ''}>${icon(symbol)}${label}</button>`).join('')}`
  const fallbackBack = {
    setup: 'welcome',
    unlock: 'welcome',
    detail: 'vault',
    edit: 'detail',
    files: model.folder ? 'files' : undefined,
    document: 'files',
    note: 'document',
    import: 'files',
    pairing: 'connections',
    autofill: 'settings',
    provider: 'autofill',
    backup: 'settings',
    wallet: 'vault',
  }[model.screen]
  const bar = toolbar({
    back: model.history.length ? model.history.at(-1).screen : fallbackBack,
    title: ['detail', 'edit', 'note'].includes(model.screen) ? 'Хранилище' : '',
    end: safeScreen ? 'none' : model.screen === 'vault' ? 'add' : model.screen === 'detail' ? 'edit' : 'lock',
  })
  const replacementState = statusContent()
  app.innerHTML = `${bar}<section class="content" aria-label="${esc(title)}">${replacementState || content()}</section>${safeScreen ? '' : tabs()}`
  if (model.screen === 'preferences' && !replacementState)
    app.querySelector('#app-theme').value = document.documentElement.dataset.theme
  if (model.screen === 'files' && !replacementState) filterFiles()
  model.formBaselines = Object.fromEntries(
    [...app.querySelectorAll('form[data-form]')].map((form) => [
      form.dataset.form,
      new URLSearchParams(new FormData(form)).toString(),
    ]),
  )
}
function invalid(form, name, text) {
  form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'))
  const input = form.elements.namedItem(name)
  input.setAttribute('aria-invalid', 'true')
  input.setAttribute('aria-describedby', 'form-error')
  form.querySelector('#form-error').textContent = text
  input.focus()
}
document.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return
  event.preventDefault()
  const data = new FormData(form)
  if (model.readOnly && !['setup', 'unlock', 'collection'].includes(form.dataset.form))
    return toast('Изменение недоступно: только чтение')
  if (submitJourney(form, data, model, {invalid, navigate, back, toast, render})) return
  if (form.dataset.form === 'unlock') {
    if (!data.get('password').trim()) return invalid(form, 'password', 'Введите пароль хранилища.')
    form.reset()
    model.unlocked = true
    model.history = []
    model.selected = model.entries[0]?.id
    navigate('vault', 'replace')
  } else if (form.dataset.form === 'setup') {
    if (!data.get('admin').trim()) return invalid(form, 'admin', 'Введите административный пароль.')
    if (data.get('admin') !== data.get('confirm'))
      return invalid(form, 'confirm', 'Значения не совпадают. Повторите пароль.')
    form.reset()
    navigate('unlock')
  } else if (form.dataset.form === 'entry') {
    if (model.state === 'readonly') return
    if (!data.get('title').trim()) return invalid(form, 'title', 'Укажите название записи.')
    const values = Object.fromEntries(data)
    if (model.editingNew) {
      const id = Math.max(0, ...model.entries.map((e) => e.id)) + 1
      model.entries.push({...values, id, letter: values.title.charAt(0).toUpperCase(), tone: 'brand'})
      model.selected = id
    } else Object.assign(current(), values)
    model.editingNew = false
    navigate('detail', 'replace')
    toast('Запись сохранена в демоданных')
  } else if (form.dataset.form === 'note') {
    model.note = data.get('note')
    model.notes[model.selectedFile] = model.note
    model.creatingNote = false
    navigate('document', 'replace')
    toast('Демозаметка сохранена')
  }
})
document.addEventListener('input', (event) => {
  if (event.target.id === 'search') {
    model.query = event.target.value
    document.querySelector('#entry-rows').innerHTML = entryRows()
  }
  if (event.target.id === 'file-search') {
    model.fileQuery = event.target.value
    filterFiles()
  }
})
function filterFiles() {
  const query = model.fileQuery.toLocaleLowerCase()
  document.querySelectorAll('#file-rows .row').forEach((element) => {
    element.hidden = !element.textContent.toLocaleLowerCase().includes(query)
  })
  document.querySelector('#files-no-match').hidden = Boolean(
    document.querySelector('#file-rows .row:not([hidden])'),
  )
}

const handlers = {
  ...journeyActions(model, {navigate, back, toast, render, notice}),
  back() {
    leave(back)
  },
  lock,
  'clear-filter'() {
    model.group = ''
    model.query = ''
    render()
  },
  add() {
    model.editingNew = true
    navigate('edit')
  },
  edit() {
    if (model.state === 'readonly') return toast('Изменение недоступно: только чтение')
    model.editingNew = false
    navigate('edit')
  },
  copy() {
    toast('Копирование показано в макете. Буфер обмена не изменён.')
  },
  reveal() {
    model.revealed = !model.revealed
    render()
  },
  ready() {
    model.state = 'normal'
    document.querySelector('#state').value = 'normal'
    render()
  },
  website() {
    notice('Открыть сайт', 'В приложении это явный переход в браузер. Макет не открывает внешние сайты.')
  },
  delete() {
    if (model.state === 'readonly') return toast('Удаление недоступно: только чтение')
    notice('Удалить демозапись?', 'Удалится только запись из памяти этого макета.', 'Удалить', () => {
      model.entries = model.entries.filter((e) => e.id !== model.selected)
      navigate(model.entries.length ? 'vault' : 'empty')
    })
  },
  generate() {
    app.querySelector('input[name="password"]').value = 'demo-only-generated-673'
    toast('Предложен вымышленный пароль')
  },
  'cancel-edit'() {
    leave(back)
  },
  'cancel-note'() {
    leave(back)
  },
  'add-otp'() {
    navigate('otp-edit')
  },
  import() {
    model.imported = true
    back()
    toast('Добавлен вымышленный файл. Диск не изменён.')
  },
  export() {
    notice(
      'Экспортировать копию',
      'В приложении выбранный документ передаётся системному меню экспорта и появляется за пределами vault. Этот макет файлы не создаёт.',
    )
  },
  host() {
    model.host = !model.host
    render()
  },
  pair() {
    if (model.pairingExpired) return toast('Код истёк. Начните снова.')
    model.paired = true
    back()
    toast('Демокомпьютер добавлен')
  },
  revoke() {
    notice(
      'Отозвать доступ?',
      'MacBook Air потеряет доверенное сопряжение в демосценарии.',
      'Отозвать',
      () => {
        model.paired = false
        render()
      },
    )
  },
  'start-pairing'() {
    if (!model.host)
      return notice(
        'Включить подключения?',
        'Для сопряжения iPhone должен ожидать подключение. Доступ к данным по-прежнему требует открытого хранилища.',
        'Включить',
        () => {
          model.host = true
          model.pairingExpired = false
          navigate('pairing')
        },
      )
    model.pairingExpired = false
    navigate('pairing')
  },
  'renew-pairing'() {
    model.pairingExpired = false
    render()
  },
  expire() {
    model.pairingExpired = true
    render()
  },

  'autofill-settings'() {
    notice(
      'Включение в iOS',
      'Выберите ChromVoid среди поставщиков автозаполнения в системных настройках. Название и расположение раздела зависят от версии iOS. Нативная сборка проверит разрешённый способ перехода.',
    )
  },
  'retry-storage'() {
    toast('Демонстрация: ключ всё ещё недоступен. Данные не изменены.')
  },
  'storage-help'() {
    notice(
      'Данные остаются на месте',
      'Проверьте доступность защищённых данных устройства и повторите попытку. Не удаляйте приложение и не создавайте новое хранилище поверх существующего. Макет не выполняет восстановление.',
    )
  },
  backup() {
    model.maintenance = 'backup'
    navigate('maintenance-review')
  },
  restore() {
    model.maintenance = 'restore'
    navigate('maintenance-review')
  },
  rekey() {
    model.maintenance = 'rekey'
    navigate('maintenance-review')
  },
  erase() {
    model.maintenance = 'erase'
    navigate('maintenance-review')
  },
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button || button.disabled) return
  if (button.closest('#screen-nav') && button.dataset.go) return preview(button.dataset.go)
  const mutationScreens = [
    'edit',
    'note',
    'import',
    'otp-edit',
    'wallet-send',
    'maintenance-review',
    'credential-import',
  ]
  const mutationActions = [
    'add',
    'edit',
    'delete',
    'generate',
    'import',
    'add-otp',
    'passkey-delete',
    'create-note',
    'create-folder',
    'move-entry',
    'create-group',
    'erase',
    'restore',
    'rekey',
    'backup',
  ]
  if (
    model.readOnly &&
    (mutationScreens.includes(button.dataset.go) || mutationActions.includes(button.dataset.action))
  )
    return toast('Это состояние доступно только для чтения.')
  if (button.dataset.tab) return leave(() => switchTab(button.dataset.tab))
  if (button.dataset.folder) {
    model.history.push(routeSnapshot())
    model.folder = button.dataset.folder
    model.fileQuery = ''
    navigate('files', 'replace')
    return
  }
  if (button.dataset.entry) {
    model.history.push(routeSnapshot())
    model.selected = Number(button.dataset.entry)
    navigate('detail', 'replace')
    return
  }
  if (button.dataset.go) {
    if (button.dataset.go === 'document') {
      model.selectedFile = button.querySelector('.row-title')?.textContent || model.selectedFile
      model.creatingNote = false
      model.note = model.notes[model.selectedFile] ?? ''
    }
    return leave(() => navigate(button.dataset.go))
  }
  if (button.dataset.action) handlers[button.dataset.action]?.(button)
})
document.querySelector('#state').addEventListener('change', (event) => {
  model.state = event.target.value
  model.readOnly = model.state === 'readonly'
  render()
})
document.querySelector('#theme').addEventListener('change', (event) => {
  document.documentElement.dataset.theme = event.target.value
})
function updateDevice() {
  document.querySelector('#device-frame').className =
    `device ${document.querySelector('#device').value} ${document.querySelector('#text-size').value}`
}
document.querySelector('#device').addEventListener('change', updateDevice)
document.querySelector('#text-size').addEventListener('change', updateDevice)
document.addEventListener('change', (event) => {
  if (event.target.id === 'app-theme') {
    document.documentElement.dataset.theme = event.target.value
    document.querySelector('#theme').value = event.target.value
  }
  if (event.target.id === 'biometric') {
    model.biometric = event.target.checked
    toast(model.biometric ? 'Проверка присутствия включена в макете' : 'Проверка присутствия выключена')
  }
})
document.querySelector('#simulate-lock').addEventListener('click', lock)
document.querySelector('#reset').addEventListener('click', () => {
  Object.assign(model, {
    entries: initialEntries(),
    folder: '',
    selected: 1,
    paired: false,
    host: false,
    biometric: false,
    imported: false,
    editingNew: false,
  })
  model.note =
    'Перед поездкой\n\nСохранить маршрут, проверить документы и поделиться нужными файлами с близкими.'
  model.groups = ['Личное', 'Работа']
  model.notes = initialNotes()
  model.creatingNote = false
  model.group = ''
  model.otpAdded = false
  model.passkeyDeleted = false
  preview('welcome')
})
render()
