// Reviewable native journey compositions. All values and effects are synthetic.
export const journeyScreens = {
  collections: [
    'S24',
    'Группы и фильтры',
    'Организация записей остаётся доступной из списка и карточки.',
    'Выберите группу, примените фильтр, откройте запись и вернитесь.',
  ],
  'otp-edit': [
    'S25',
    'Добавить код',
    'Ручной путь доступен независимо от разрешения на камеру.',
    'Пустая форма → ошибка; демозначения → сохранённый код.',
  ],
  'passkey-detail': [
    'S26',
    'Сведения о ключе',
    'Отдельная карточка метаданных без раскрытия private key.',
    'Назад возвращает к ключам; удаление имеет подтверждение.',
  ],
  'file-tools': [
    'S27',
    'Действия с файлами',
    'Создать, выбрать, переместить и экспортировать — разные задачи.',
    'Новая заметка ведёт в редактор; отмена возвращает в прежнюю папку.',
  ],
  'credential-import': [
    'S28',
    'Импорт паролей',
    'Парольный импорт не подменён файловым.',
    'Предпросмотр и результат показывают конфликт и частичный успех.',
  ],
  preferences: [
    'S29',
    'Оформление и поведение',
    'Настройки доступны из приложения, а не только из панели дизайна.',
    'Измените тему; настройки файлов и безопасности имеют свой смысл.',
  ],
  help: [
    'S30',
    'Помощь',
    'Встроенная справка открывается без сети и без входа в хранилище.',
    'Закрытое хранилище не мешает открыть помощь.',
  ],
  'wallet-send': [
    'S31',
    'Получатель и сумма',
    'Проверка данных предшествует подтверждению перевода.',
    'Пустая форма не проходит; заполнение открывает review; сеть не вызывается.',
  ],
  'wallet-review': [
    'S32',
    'Проверка перевода',
    'Сумма, получатель и комиссия вместе перед подтверждением.',
    'Назад сохраняет draft; подтверждение только завершает демонстрацию.',
  ],
  'maintenance-review': [
    'S33',
    'Проверка операции',
    'Разные последствия копии, восстановления, смены пароля и стирания.',
    'Незаполненная авторизация не завершается успехом.',
  ],
  media: [
    'S34',
    'Фото и видео',
    'Отдельный маршрут к preview с возвратом в исходную папку.',
    'Неподдержанный формат объясняется; экспорт явный.',
  ],
}
const operations = {
  backup: [
    'Резервная копия',
    'Будет создана копия по поддерживаемому формату. Экспорт создаёт файл за пределами приложения.',
  ],
  restore: [
    'Восстановление',
    'Выбранная демокопия должна пройти проверку совместимости. До подтверждения ничего не заменяется.',
  ],
  rekey: [
    'Изменить пароль',
    'Сохранённые данные должны остаться доступны по новому паролю. Не закрывайте приложение до результата.',
  ],
  erase: [
    'Стереть хранилище',
    'Будут удалены все данные выбранного хранилища. Это не удаление одной записи. Отменить завершённое стирание нельзя.',
  ],
}
export function renderJourney(m, h) {
  const {esc, action, goButton, field, readOnly} = h
  const formEnd = '<p id="form-error" class="error-copy" role="alert"></p>'
  switch (m.screen) {
    case 'collections':
      return `<h2>По своим местам</h2><p class="subtitle">Группы, теги и порядок записей</p>${readOnly}<form data-form="collection"><label class="form-field">Группа<select name="group"><option value="">Все записи</option>${m.groups.map((g) => `<option ${m.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label><label class="form-field">Порядок<select name="sort"><option value="name">По названию</option><option value="recent" ${m.sort === 'recent' ? 'selected' : ''}>Сначала добавленные</option></select></label>${field('Поиск по тегу или названию', 'query', m.query)}<button class="primary">Показать записи</button>${m.history.at(-1)?.screen === 'detail' ? action('move-entry', 'Переместить запись в выбранную группу', null, 'secondary') : ''}</form><div class="section-label">Новая группа</div><form data-form="new-group" novalidate>${field('Название группы', 'name')}${formEnd}<button class="secondary">Создать группу</button></form><p class="small-copy">Теги задаются в карточке записи. Массовое редактирование и расширенные фильтры описаны в маршрутах реализации.</p>`
    case 'otp-edit':
      return `<h2>Добавить код</h2><p class="subtitle">Два пути к одному результату</p>${action('scan-otp', 'Сканировать QR-код', null, 'secondary')}<form data-form="otp" novalidate>${field('Название сервиса', 'title')}${field('Логин', 'login')}${field('Секрет или otpauth URI', 'secret', '', 'password')}${formEnd}<button class="primary">Добавить код</button>${action('back', 'Отменить', null, 'text-button')}</form><p class="small-copy">Используйте только вымышленные значения. Настоящий код здесь не вычисляется.</p>`
    case 'passkey-detail':
      return `<div class="detail-header"><div class="avatar big brand">ex</div><h2>example.com</h2><p class="subtitle">Ключ доступа</p></div><div class="field-group"><div class="field-display"><div><div class="field-caption">Учётная запись</div><div class="field-value">alex@example.com</div></div></div><div class="field-display"><div><div class="field-caption">Сайт</div><div class="field-value">example.com</div></div></div><div class="field-display"><div><div class="field-caption">Создан</div><div class="field-value">4 сентября 2026 · демоданные</div></div></div></div><p class="small-copy">Закрытая часть ключа не показывается. Использование происходит через запрос сайта или приложения.</p>${goButton('autofill', 'Как работает автозаполнение', 'text-button')}${action('passkey-delete', 'Удалить ключ доступа', null, 'danger-button')}`
    case 'file-tools':
      return `<h2>Файлы</h2><p class="subtitle">${esc(m.folder || 'Корень хранилища')}</p><div class="section-label">Добавить</div>${action('create-note', 'Новая заметка', null, 'secondary')}${action('create-folder', 'Новая папка', null, 'secondary')}${goButton('import', 'Импортировать файлы', 'secondary')}<div class="section-label">Работа со списком</div>${action('file-selection', 'Выбрать несколько файлов', null, 'secondary')}<p class="small-copy">На нативном списке: «Выбрать» → количество выбранных → переместить, экспортировать или удалить. Те же действия доступны из карточки файла; долгий тап — дополнительный способ.</p>`
    case 'credential-import':
      return `<h2>Импорт паролей</h2><p class="subtitle">Проверка перед добавлением</p><div class="rows"><div class="row"><span class="row-main"><span class="row-title">mail.example</span><span class="row-sub">Новая запись · Личное</span></span></div><div class="row"><span class="row-main"><span class="row-title">GitHub</span><span class="row-sub">Совпадение · пропустить в этом примере</span></span></div></div><div class="notice-inline">2 строки: 1 новая, 1 пропущена. Формат и обработка совпадений должны соответствовать текущему импорту.</div>${action('import-credentials', 'Добавить 1 запись', null, 'primary')}${action('back', 'Отменить', null, 'secondary')}<p class="small-copy">Вымышленный предварительный просмотр. Файл не выбран и не прочитан.</p>`
    case 'preferences':
      return `<h2>Как вам удобно</h2><p class="subtitle">Оформление и поведение</p><label class="form-field">Тема<select id="app-theme"><option value="dark">Тёмная</option><option value="light">Светлая</option></select></label><div class="section-label">Безопасность</div>${action('auto-lock', 'Автоблокировка и активный экран', null, 'text-button')}<div class="section-label">Файлы и заметки</div>${action('file-preferences', 'Скрытые файлы и папка вложений', null, 'text-button')}<div class="section-label">Язык</div><p class="small-copy">Язык макета — русский. Native String Catalog сохраняет полный список поддерживаемых переводов.</p>`
    case 'help':
      return `<h2>Помощь</h2><p class="subtitle">ChromVoid Air · подготовка</p><div class="notice-inline">Справка встроена в приложение и работает без сети, в том числе при закрытом хранилище.</div>${action('access-help', 'Помощь с доступом', null, 'secondary')}<p class="small-copy">Версия и сборка приложения показаны в этом же разделе.</p>`
    case 'wallet-send': {
      const t = m.transaction || {}
      return `<h2>Отправить</h2><p class="subtitle">Личный аккаунт · Bitcoin · демосценарий</p><form data-form="wallet-send" novalidate>${field('Получатель', 'recipient', t.recipient || '')}${field('Сумма BTC', 'amount', t.amount || '', 'text', 'inputmode="decimal"')}${formEnd}<button class="primary">Проверить перевод</button>${action('back', 'Отменить', null, 'text-button')}</form><p class="small-copy">Ввод не отправляет перевод. Далее — комиссия и отдельное подтверждение.</p>`
    }
    case 'wallet-review': {
      const t = m.transaction || {recipient: 'demo-recipient', amount: '0.001'}
      return `<h2>Проверьте перевод</h2><p class="subtitle">Bitcoin · Личный аккаунт</p><div class="review-amount">${esc(t.amount)} <span>BTC</span></div><div class="field-group"><div class="field-display"><div><div class="field-caption">Получатель</div><div class="field-value monospace">${esc(t.recipient)}</div></div></div><div class="field-display"><div><div class="field-caption">Комиссия · демооценка</div><div class="field-value">0.00001 BTC</div></div></div></div><div class="notice-inline">Все значения вымышлены. После настоящей отправки операцию нельзя отменить. Изменение комиссии требует повторного review.</div>${action('confirm-transfer', 'Завершить демосценарий', null, 'primary')}${action('back', 'Изменить данные', null, 'secondary')}`
    }
    case 'maintenance-review': {
      const [title, description] = operations[m.maintenance]
      return `<h2>${title}</h2><p class="subtitle">Проверка операции · демосценарий</p><div class="notice-inline">${description}</div><form data-form="maintenance" novalidate>${field(m.maintenance === 'rekey' ? 'Текущий пароль хранилища' : 'Административный пароль', 'auth', '', 'password')}${m.maintenance === 'rekey' ? field('Новый пароль', 'next', '', 'password') + field('Повторите новый пароль', 'confirm', '', 'password') : ''}${formEnd}<button class="${m.maintenance === 'erase' ? 'danger-button' : 'primary'}">Проверить демоданные</button>${action('back', 'Отменить', null, 'secondary')}</form><p class="small-copy">Макет не доказывает авторизацию. В приложении решение принимает существующий runtime.</p>`
    }
    case 'media':
      return `<h2>Предпросмотр</h2><p class="subtitle">Выбранный медиафайл</p><div class="empty-state">${h.icon('file')}<h3>Формат не поддерживается</h3><p>Файл остаётся в хранилище. Можно вернуться к списку или явно экспортировать копию.</p></div>${action('export', 'Экспортировать копию', null, 'secondary')}${action('back', 'Вернуться к файлам', null, 'text-button')}`
    default:
      return null
  }
}
export function submitJourney(form, data, m, h) {
  const {invalid, navigate, back, toast, render} = h
  switch (form.dataset.form) {
    case 'collection': {
      const values = Object.fromEntries(data)
      // Applying a filter intentionally returns to the list, not the calling entry.
      m.history = []
      m.group = values.group
      m.query = values.query
      m.sort = values.sort
      navigate('vault', 'replace')
      return true
    }
    case 'new-group': {
      const name = data.get('name').trim()
      if (!name) invalid(form, 'name', 'Укажите название группы.')
      else if (m.groups.includes(name)) invalid(form, 'name', 'Такая группа уже есть.')
      else {
        m.groups.push(name)
        render()
        toast('Группа создана в демоданных')
      }
      return true
    }
    case 'otp':
      if (!data.get('title').trim()) invalid(form, 'title', 'Укажите название сервиса.')
      else if (!data.get('secret').trim()) invalid(form, 'secret', 'Введите секрет или URI.')
      else {
        m.otpTitle = data.get('title')
        m.otpAdded = true
        navigate('otp', 'replace')
        toast('Демокод добавлен')
      }
      return true
    case 'wallet-send':
      if (!data.get('recipient').trim()) invalid(form, 'recipient', 'Укажите получателя.')
      else if (!/^\d+(\.\d{1,8})?$/.test(data.get('amount')) || Number(data.get('amount')) <= 0)
        invalid(form, 'amount', 'Введите положительную сумму, например 0.001.')
      else {
        m.transaction = Object.fromEntries(data)
        navigate('wallet-review')
      }
      return true
    case 'maintenance':
      if (!data.get('auth').trim()) invalid(form, 'auth', 'Введите вымышленный пароль для демонстрации.')
      else if (
        m.maintenance === 'rekey' &&
        (!data.get('next').trim() || data.get('next') !== data.get('confirm'))
      )
        invalid(form, 'confirm', 'Новый пароль и подтверждение должны совпадать.')
      else {
        form.reset()
        back()
        toast('Демонстрация проверки завершена. Данные не изменены.')
      }
      return true
    default:
      return false
  }
}
export function journeyActions(m, {navigate, back, toast, render, notice}) {
  return {
    'move-entry'() {
      const group = document.querySelector('select[name="group"]').value
      const entry = m.entries.find((e) => e.id === m.selected)
      if (entry) entry.group = group
      back()
      toast('Запись перемещена в демоданных')
    },
    'scan-otp'() {
      notice(
        'Камера недоступна в макете',
        'Ручной ввод остаётся на этом экране. В приложении отказ камеры не прерывает добавление кода.',
      )
    },
    'passkey-delete'() {
      notice(
        'Удалить ключ example.com?',
        'Вход этим ключом станет недоступен. В макете удаляется только вымышленная строка.',
        'Удалить',
        () => {
          m.passkeyDeleted = true
          back()
        },
      )
    },
    'files-all'() {
      m.fileKind = 'all'
      m.fileQuery = ''
      render()
    },
    'files-notes'() {
      m.fileKind = 'notes'
      m.fileQuery = ''
      render()
    },
    'create-note'() {
      back()
      m.creatingNote = true
      m.selectedFile = 'Новая заметка'
      let suffix = 2
      while (Object.hasOwn(m.notes, m.selectedFile)) m.selectedFile = `Новая заметка ${suffix++}`
      navigate('note')
    },
    'create-folder'() {
      notice(
        'Новая папка',
        'Нативный путь: название → проверка совпадения → новая папка в текущем каталоге. Cancel оставляет исходный список.',
      )
    },
    'file-selection'() {
      notice(
        'Работа с несколькими файлами',
        'Выбрать элементы → действие с указанным количеством → результат по каждому файлу. После частичного отказа остаются выбранными только неуспешные элементы. Этот системный список подробно задан в route-audit.md.',
      )
    },
    'import-credentials'() {
      const id = Math.max(0, ...m.entries.map((e) => e.id)) + 1
      m.entries.push({
        id,
        title: 'mail.example',
        login: 'demo@example.com',
        website: 'mail.example',
        password: 'demo-only-import',
        letter: 'M',
        tone: 'brand',
        group: 'Личное',
        tags: '',
      })
      back()
      toast('Добавлена 1 демозапись. 1 совпадение пропущено.')
    },
    receive() {
      notice(
        'Получить Bitcoin',
        'В приложении: выбранный кошелёк → аккаунт → актуальный адрес / QR и явное копирование. Здесь действительного адреса нет.',
      )
    },
    'wallet-manage'() {
      notice(
        'Кошельки и аккаунты',
        'Переключить кошелёк / аккаунт; создать, восстановить или импортировать; получить адрес; открыть историю или recovery. Сеть и секреты остаются у существующего владельца.',
      )
    },
    'confirm-transfer'() {
      m.transaction = null
      m.history = []
      navigate('wallet', 'replace')
      toast('Демосценарий завершён. Транзакция не отправлена.')
    },
    'auto-lock'() {
      notice(
        'Автоблокировка',
        'Выбор поддерживаемого интервала не отменяет обязательную блокировку при уходе в фон. Удержание экрана активно только при открытом хранилище.',
      )
    },
    'file-preferences'() {
      notice(
        'Параметры файлов',
        'Скрытые файлы, подтверждение удаления и папка вложений Markdown сохраняются как существующие настройки. Автомонтирование зависит от платформы.',
      )
    },
    'access-help'() {
      notice(
        'Помощь с доступом',
        'Пароль хранилища и административный пароль решают разные задачи. Ошибка доступа к ключу устройства не предлагает удалить приложение или сбросить данные.',
      )
    },
  }
}
