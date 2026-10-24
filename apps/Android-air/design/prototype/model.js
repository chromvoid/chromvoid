import {atom, computed, reatomForm} from '@reatom/core'

import {credentials, documents, journeys} from './fixtures.js'

const rootFor = (route) => {
  if (['files', 'document', 'note', 'media', 'import'].includes(route)) return 'files'
  if (['connections', 'pair', 'computer'].includes(route)) return 'connections'
  if (['settings', 'security', 'autofill', 'provider', 'maintenance', 'help'].includes(route))
    return 'settings'
  return 'vault'
}

// A synthetic design session, not a product domain model or authorization boundary.
export class DesignModel {
  route = atom('vault', 'air.route')
  theme = atom('light', 'air.theme')
  concept = atom('quiet', 'air.concept')
  platform = atom('android', 'air.platform')
  size = atom('phone', 'air.size')
  screenState = atom('normal', 'air.screenState')
  unlocked = atom(true, 'air.unlocked')
  entries = atom(structuredClone(credentials), 'air.entries')
  files = atom(structuredClone(documents), 'air.files')
  entryId = atom('proton', 'air.entryId')
  fileId = atom('trip', 'air.fileId')
  query = atom('', 'air.query')
  fileQuery = atom('', 'air.fileQuery')
  category = atom('all', 'air.category')
  fileCategory = atom('all', 'air.fileCategory')
  group = atom('Все группы', 'air.group')
  groups = atom(['Личное', 'Работа'], 'air.groups')
  sort = atom('default', 'air.sort')
  selected = atom([], 'air.selected')
  selecting = atom(false, 'air.selecting')
  revealed = atom(false, 'air.revealed')
  notice = atom('', 'air.notice')
  sheet = atom('', 'air.sheet')
  confirmation = atom(null, 'air.confirmation')
  history = atom([], 'air.history')
  tabs = atom({}, 'air.tabs')
  dirty = atom(false, 'air.dirty')
  editingId = atom(null, 'air.editingId')
  submitted = atom(false, 'air.submitted')
  formFailure = atom('', 'air.formFailure')
  form = reatomForm(
    {title: '', username: '', secret: '', confirm: '', notes: '', type: 'login', group: 'Личное'},
    {name: 'air.fixtureForm'},
  )
  host = atom(false, 'air.host')
  paired = atom(true, 'air.paired')
  pairingExpired = atom(false, 'air.pairingExpired')
  importDone = atom(false, 'air.importDone')
  mediaPlaying = atom(false, 'air.mediaPlaying')
  mediaPosition = atom('0', 'air.mediaPosition')
  providerConfigured = atom(false, 'air.providerConfigured')
  readonly = computed(() => this.screenState() === 'readonly', 'air.readonly')
  entry = computed(() => this.entries().find((item) => item.id === this.entryId()), 'air.entry')
  file = computed(() => this.files().find((item) => item.id === this.fileId()), 'air.file')
  root = computed(() => rootFor(this.route()), 'air.root')
  visibleEntries = computed(() => {
    if (!this.unlocked() || this.screenState() === 'empty') return []
    const query = this.query().toLocaleLowerCase()
    let entries = this.entries().filter(
      (item) =>
        `${item.title} ${item.username} ${item.site} ${item.tags}`.toLocaleLowerCase().includes(query) &&
        (this.category() === 'all' ||
          (this.category() === 'otp' ? !!item.otp : item.type === this.category())) &&
        (this.group() === 'Все группы' || item.group === this.group()),
    )
    if (this.sort() === 'name') entries = [...entries].sort((a, b) => a.title.localeCompare(b.title))
    return entries
  }, 'air.visibleEntries')
  visibleFiles = computed(
    () =>
      !this.unlocked() || this.screenState() === 'empty'
        ? []
        : this.files().filter(
            (item) =>
              item.title.toLocaleLowerCase().includes(this.fileQuery().toLocaleLowerCase()) &&
              (this.fileCategory() === 'all' || item.type === this.fileCategory()),
          ),
    'air.visibleFiles',
  )
  errors = computed(() => {
    if (!this.submitted()) return {}
    const f = this.form.fields
    if (['unlock', 'setup'].includes(this.route())) {
      return {
        secret: f.secret().trim() ? '' : 'Введите пароль',
        confirm: this.route() === 'setup' && f.secret() !== f.confirm() ? 'Пароли должны совпадать' : '',
      }
    }
    return {
      title: f.title().trim() ? '' : 'Укажите название',
      secret:
        this.route() === 'edit' && f.type() === 'otp' && !f.secret().trim()
          ? 'Введите секрет или otpauth-ссылку'
          : '',
    }
  }, 'air.errors')

  clearForm() {
    this.form.reset()
    this.submitted.set(false)
    this.dirty.set(false)
    this.editingId.set(null)
    this.formFailure.set('')
  }

  go(route, replace = false) {
    if (
      !this.unlocked() &&
      ![
        'welcome',
        'setup',
        'unlock',
        'connections',
        'pair',
        'computer',
        'settings',
        'help',
        'security',
        'autofill',
      ].includes(route)
    ) {
      this.route.set('unlock')
      return
    }
    if (this.dirty()) {
      this.confirmation.set({
        kind: 'navigate',
        route,
        replace,
        title: 'Не сохранять изменения?',
        body: 'Введённые изменения будут потеряны.',
        label: 'Не сохранять',
      })
      return
    }
    if (!replace) this.history.set([...this.history(), this.route()])
    else if (this.history().at(-1) === route) this.history.set(this.history().slice(0, -1))
    if (route !== this.route() && !this.readonly()) this.screenState.set('normal')
    this.route.set(route)
    this.sheet.set('')
    this.revealed.set(false)
    this.notice.set('')
    this.mediaPlaying.set(false)
  }

  navigateRoot(route) {
    if (this.dirty()) {
      this.confirmation.set({
        kind: 'tab',
        route,
        title: 'Не сохранять изменения?',
        body: 'Введённые изменения будут потеряны.',
        label: 'Не сохранять',
      })
      return
    }
    this.tabs.set({...this.tabs(), [this.root()]: {route: this.route(), history: this.history()}})
    const saved = this.tabs()[route]
    this.go(saved?.route ?? route, true)
    this.history.set(saved?.history ?? [])
  }

  back() {
    if (this.confirmation()) {
      this.confirmation.set(null)
      return
    }
    if (this.sheet()) {
      this.sheet.set('')
      return
    }
    const history = this.history()
    const destination = history.at(-1) ?? (this.unlocked() ? this.root() : 'unlock')
    this.go(destination, true)
    if (!this.confirmation()) this.history.set(history.slice(0, -1))
  }

  inspect(route) {
    if (!journeys.some(([id]) => id === route)) return
    this.clearForm()
    this.confirmation.set(null)
    this.sheet.set('')
    this.screenState.set('normal')
    this.unlocked.set(!['welcome', 'setup', 'unlock'].includes(route))
    this.history.set([])
    this.revealed.set(false)
    this.notice.set('')
    this.mediaPlaying.set(false)
    if (['detail', 'edit'].includes(route)) this.entryId.set(this.entries()[0]?.id ?? '')
    if (['document', 'note', 'media'].includes(route)) this.fileId.set(route === 'media' ? 'photo' : 'trip')
    if (['vault', 'codes'].includes(route)) this.category.set(route === 'codes' ? 'otp' : 'all')
    this.route.set(route === 'codes' ? 'vault' : route)
    if (route === 'edit') this.editEntry()
    if (route === 'note') this.editNote()
    if (route === 'import') this.importDone.set(false)
    if (route === 'pair') this.host.set(true)
  }

  lock() {
    this.unlocked.set(false)
    this.clearForm()
    this.query.set('')
    this.fileQuery.set('')
    this.group.set('Все группы')
    this.entryId.set('')
    this.fileId.set('')
    this.selected.set([])
    this.selecting.set(false)
    this.history.set([])
    this.tabs.set({})
    this.sheet.set('')
    this.confirmation.set(null)
    this.revealed.set(false)
    this.mediaPlaying.set(false)
    this.mediaPosition.set('0')
    this.route.set('unlock')
    this.notice.set('')
  }

  canWrite() {
    if (!this.unlocked() || this.readonly()) {
      this.notice.set('Изменения недоступны: хранилище закрыто или открыто только для чтения.')
      return false
    }
    return true
  }

  setState(value) {
    this.screenState.set(value)
    if (value === 'locked') this.lock()
  }

  openEntry(id) {
    if (!this.unlocked() || !this.entries().some((item) => item.id === id)) return
    this.entryId.set(id)
    this.go('detail')
  }

  openFile(id) {
    const file = this.files().find((item) => item.id === id)
    if (!this.unlocked() || !file) return
    this.fileId.set(id)
    this.go(['image', 'audio'].includes(file.type) ? 'media' : 'document')
  }

  startEntry(type = 'login') {
    if (!this.canWrite()) return
    this.clearForm()
    this.form.fields.type.set(type)
    this.go('edit')
  }

  editEntry() {
    if (!this.canWrite()) return
    const entry = this.entry()
    if (!entry) return
    this.clearForm()
    this.editingId.set(entry.id)
    for (const key of ['title', 'username', 'secret', 'type', 'group'])
      this.form.fields[key].set(entry[key] ?? '')
    this.form.fields.notes.set(entry.notes ?? '')
    this.go('edit', this.route() === 'edit')
  }

  editNote(create = false) {
    if (!this.canWrite()) return
    this.clearForm()
    const file = create ? null : this.file()
    this.editingId.set(file?.id ?? null)
    this.form.fields.title.set(file?.title ?? '')
    this.form.fields.notes.set(file?.text ?? '')
    this.go('note', this.route() === 'note')
  }

  input(name, value) {
    const field = this.form.fields[name]
    if (!field) return
    field.set(value)
    this.dirty.set(true)
    this.formFailure.set('')
  }

  submit() {
    this.submitted.set(true)
    const first = Object.entries(this.errors()).find(([, error]) => error)?.[0]
    if (first) return first
    if (this.screenState() === 'error') {
      this.formFailure.set(
        'Не удалось сохранить. Введённые данные остались в форме. Повторите после восстановления доступа.',
      )
      return null
    }
    if (['unlock', 'setup'].includes(this.route())) {
      const setup = this.route() === 'setup'
      this.clearForm()
      if (setup) {
        this.go('unlock', true)
        return null
      }
      this.unlocked.set(true)
      this.screenState.set('normal')
      this.go('vault', true)
      return null
    }
    if (!this.canWrite()) return null
    const values = Object.fromEntries(Object.entries(this.form.fields).map(([key, field]) => [key, field()]))
    const id = this.editingId() ?? `demo-${crypto.randomUUID()}`
    if (this.route() === 'note') {
      const file = {
        id,
        title: values.title.trim(),
        text: values.notes,
        type: 'note',
        meta: 'Заметка · только что',
        folder: 'Личное',
        icon: 'file-text',
      }
      this.files.set(
        this.editingId()
          ? this.files().map((item) => (item.id === id ? file : item))
          : [...this.files(), file],
      )
      this.fileId.set(id)
      this.clearForm()
      this.go('document', true)
    } else {
      const prior = this.entries().find((item) => item.id === id)
      const entry = {
        ...prior,
        id,
        ...values,
        title: values.title.trim(),
        tags: prior?.tags ?? '',
        site: prior?.site ?? '',
        icon: prior?.icon ?? values.title[0].toUpperCase(),
        ...(values.type === 'otp' && !prior?.otp ? {otp: {value: '529 104', remaining: 18, period: 30}} : {}),
      }
      this.entries.set(
        this.editingId()
          ? this.entries().map((item) => (item.id === id ? entry : item))
          : [...this.entries(), entry],
      )
      this.entryId.set(id)
      this.clearForm()
      this.go('detail', true)
    }
    this.notice.set('Сохранено в макете')
    return null
  }

  copy(label = 'Данные') {
    if (!this.unlocked()) return
    this.notice.set(`${label}: копирование показано в макете`)
  }

  confirm() {
    const confirmation = this.confirmation()
    if (!confirmation) return
    this.confirmation.set(null)
    if (confirmation.kind === 'navigate') {
      this.clearForm()
      this.go(confirmation.route, confirmation.replace)
      return
    }
    if (confirmation.kind === 'tab') {
      this.clearForm()
      this.navigateRoot(confirmation.route)
      return
    }
    if (confirmation.kind === 'revoke') {
      this.paired.set(false)
      this.go('connections', true)
      return
    }
    if (!this.canWrite() && confirmation.kind !== 'export') return
    if (confirmation.kind === 'delete') {
      this.entries.set(this.entries().filter((item) => !confirmation.ids.includes(item.id)))
      this.selected.set([])
      this.selecting.set(false)
      this.go('vault', true)
      this.notice.set('Записи удалены из макета')
    }
    if (confirmation.kind === 'delete-file') {
      this.files.set(this.files().filter((item) => item.id !== this.fileId()))
      this.go('files', true)
      this.notice.set('Файл удалён из макета')
    }
    if (confirmation.kind === 'export') this.notice.set('Внешняя копия показана в макете. Файл не создан.')
    if (confirmation.kind === 'maintenance')
      this.notice.set('Показан результат операции. Реальные данные не менялись.')
  }

  command(command, value = '') {
    switch (command) {
      case 'inspect':
        this.inspect(value)
        break
      case 'reset':
        this.reset()
        break
      case 'go':
        this.go(value)
        break
      case 'root':
        this.navigateRoot(value)
        break
      case 'back':
        this.back()
        break
      case 'lock':
        this.lock()
        break
      case 'dismiss':
        this.notice.set('')
        break
      case 'sheet':
        this.sheet.set(value)
        break
      case 'close-sheet':
        this.sheet.set('')
        break
      case 'entry':
        this.openEntry(value)
        break
      case 'file':
        this.openFile(value)
        break
      case 'new':
        this.startEntry(value)
        break
      case 'edit':
        this.editEntry()
        break
      case 'note':
        this.editNote(value === 'new')
        break
      case 'copy':
        this.copy(value)
        break
      case 'reveal':
        if (this.unlocked()) this.revealed.set(!this.revealed())
        break
      case 'category':
        this.category.set(value)
        this.selected.set([])
        this.selecting.set(false)
        if (this.route() !== 'vault') this.go('vault', true)
        break
      case 'file-category':
        this.fileCategory.set(value)
        break
      case 'clear-search':
        this.query.set('')
        this.category.set('all')
        this.group.set('Все группы')
        break
      case 'group':
        this.group.set(value)
        this.sheet.set('')
        if (this.route() !== 'vault') this.go('vault')
        break
      case 'tag':
        this.query.set(value)
        this.category.set('all')
        this.group.set('Все группы')
        this.go('vault')
        break
      case 'move':
        if (this.canWrite()) {
          this.entries.set(
            this.entries().map((item) => (item.id === this.entryId() ? {...item, group: value} : item)),
          )
          this.sheet.set('')
          this.notice.set('Группа изменена')
        }
        break
      case 'select-mode':
        this.selecting.set(!this.selecting())
        this.selected.set([])
        break
      case 'select':
        this.selected.set(
          this.selected().includes(value)
            ? this.selected().filter((id) => id !== value)
            : [...this.selected(), value],
        )
        break
      case 'delete':
        if (this.canWrite())
          this.confirmation.set({
            kind: 'delete',
            ids: value ? [value] : this.selected(),
            title: 'Удалить записи?',
            body: 'Выбранные записи будут удалены. Отменить удаление нельзя.',
            label: 'Удалить',
          })
        break
      case 'delete-file':
        if (this.canWrite())
          this.confirmation.set({
            kind: 'delete-file',
            title: 'Удалить файл?',
            body: this.file()?.title ?? '',
            label: 'Удалить',
          })
        break
      case 'confirm':
        this.confirm()
        break
      case 'cancel-confirm':
        this.confirmation.set(null)
        break
      case 'host':
        this.host.set(!this.host())
        break
      case 'pair':
        this.host.set(true)
        this.pairingExpired.set(false)
        this.go('pair')
        break
      case 'expire':
        this.pairingExpired.set(true)
        break
      case 'restart-pair':
        this.pairingExpired.set(false)
        break
      case 'approve-pair':
        if (!this.pairingExpired() && this.host()) {
          this.paired.set(true)
          this.go('computer', true)
        }
        break
      case 'revoke':
        this.confirmation.set({
          kind: 'revoke',
          title: 'Отозвать доступ MacBook?',
          body: 'Компьютер потеряет доверие. Для нового подключения понадобится повторное разрешение.',
          label: 'Отозвать',
        })
        break
      case 'start-import':
        if (this.canWrite()) {
          this.importDone.set(false)
          this.go('import')
        }
        break
      case 'credential-import':
        if (this.canWrite()) {
          this.entries.set([
            ...this.entries().filter((item) => item.id !== 'imported-login'),
            {
              id: 'imported-login',
              title: 'Личная почта',
              username: 'alex@example.net',
              secret: 'demo-imported',
              type: 'login',
              group: 'Личное',
              tags: '',
              site: '',
              icon: 'П',
            },
          ])
          this.sheet.set('')
          this.notice.set('Добавлена 1 запись, 1 дубликат пропущен')
        }
        break
      case 'import':
        if (this.canWrite() && !this.importDone()) {
          this.files.set([
            ...this.files().filter((item) => item.id !== 'imported'),
            {
              id: 'imported',
              title: 'Билеты.pdf',
              type: 'pdf',
              meta: 'PDF · только что',
              folder: 'Личное',
              text: 'Демонстрационный документ',
              icon: 'file-text',
            },
          ])
          this.importDone.set(true)
        }
        break
      case 'export':
        if (this.unlocked())
          this.confirmation.set({
            kind: 'export',
            title: 'Сохранить внешнюю копию?',
            body: 'Копия окажется вне хранилища. Приложение-получатель сможет сохранить её у себя.',
            label: 'Продолжить',
          })
        break
      case 'play':
        if (this.unlocked()) this.mediaPlaying.set(!this.mediaPlaying())
        break
      case 'theme':
        this.theme.set(value || (this.theme() === 'light' ? 'dark' : 'light'))
        break
      case 'retry':
        this.screenState.set('normal')
        this.formFailure.set('')
        break
      case 'provider-setup':
        this.providerConfigured.set(true)
        this.notice.set('Настройка Android показана в макете')
        break
      case 'provider-use':
        this.copy('Выбор записи для автозаполнения')
        break
      case 'generate':
        if (this.canWrite()) {
          this.input('secret', 'demo-river-stone-47')
          this.notice.set('Вставлен вымышленный пароль')
        }
        break
      case 'camera':
        this.notice.set('Камера недоступна в макете. Используйте ручной ввод.')
        break
      case 'maintenance':
        this.confirmation.set({
          kind: 'maintenance',
          title: 'Проверить операцию',
          body: {
            backup:
              'Резервная копия сохраняет данные в выбранном месте. Совместимость и доступ проверяет runtime.',
            restore:
              'Восстановление требует проверки формата и административной авторизации перед изменением данных.',
            rekey: 'Изменение пароля требует текущей авторизации и проверки нового пароля.',
            erase:
              'Очистка удаляет данные выбранного хранилища после отдельной административной авторизации.',
          }[value],
          label: 'Показать результат',
        })
        break
      default:
        break
    }
  }

  updateInput(name, input, value) {
    if (name) this.input(name, value)
    else if (input === 'query') this.query.set(value)
    else if (input === 'fileQuery') this.fileQuery.set(value)
    else if (input === 'position') this.mediaPosition.set(value)
  }

  updateControl(control, value) {
    if (control === 'theme') this.theme.set(value)
    if (control === 'concept' && ['quiet', 'archive', 'rhythm'].includes(value)) this.concept.set(value)
    if (control === 'platform' && ['android', 'ios', 'desktop'].includes(value)) this.platform.set(value)
    if (control === 'size' && ['phone', 'compact', 'tablet'].includes(value)) this.size.set(value)
    if (control === 'state') this.setState(value)
    if (control === 'sort') this.sort.set(value)
  }

  reset() {
    this.entries.set(structuredClone(credentials))
    this.files.set(structuredClone(documents))
    this.lock()
    this.unlocked.set(true)
    this.screenState.set('normal')
    this.entryId.set('proton')
    this.fileId.set('trip')
    this.route.set('vault')
    this.host.set(false)
    this.paired.set(true)
    this.pairingExpired.set(false)
    this.category.set('all')
    this.fileCategory.set('all')
    this.sort.set('default')
    this.importDone.set(false)
    this.providerConfigured.set(false)
  }
}

export const model = new DesignModel()
