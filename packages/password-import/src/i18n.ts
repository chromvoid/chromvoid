import {atom} from '@reatom/core'

type TranslationKey =
  | 'button:cancel'
  | 'import:dialog:title'
  | 'import:dialog:drop_zone'
  | 'import:dialog:supported_formats'
  | 'import:password:title'
  | 'import:password:description'
  | 'import:password:placeholder'
  | 'import:password:empty'
  | 'import:preview:title'
  | 'import:preview:new_entries'
  | 'import:preview:update_entries'
  | 'import:preview:import_button'
  | 'import:preview:total_entries'
  | 'import:progress:title'
  | 'import:progress:imported'
  | 'import:progress:updated'
  | 'import:progress:errors'
  | 'import:progress:cancel'
  | 'import:complete:title'
  | 'import:complete:title_errors'
  | 'import:complete:imported'
  | 'import:complete:updated'
  | 'import:complete:errors'
  | 'import:error:unsupported_format'
  | 'import:button:back'
  | 'import:button:decrypt'
  | 'import:button:close'
  | 'import:step:file'
  | 'import:step:preview'
  | 'import:step:import'

type Lang = 'en' | 'es' | 'fr' | 'id' | 'it' | 'ja' | 'ru' | 'tr' | 'uk' | 'vi' | 'zh' | (string & {})

const DEFAULT_LANG = 'en'
const LOCAL_STORAGE_KEY = 'current-lang'

const translations: Record<TranslationKey, Partial<Record<Lang, string>>> = {
  'button:cancel': {
    en: 'Cancel',
    ru: 'Отменить',
    uk: 'Скасувати',
    es: 'Cancelar',
    tr: 'İptal',
    fr: 'Annuler',
    it: 'Annulla',
    id: 'Batal',
    zh: '取消',
    ja: 'キャンセル',
    vi: 'Hủy bỏ',
  },
  'import:dialog:title': {en: 'Import Passwords', ru: 'Импорт паролей'},
  'import:dialog:drop_zone': {
    en: 'Drop your export file here or click to select',
    ru: 'Перетащите файл сюда или нажмите для выбора',
  },
  'import:dialog:supported_formats': {
    en: 'Supported: .kdbx (KeePass), .json (Bitwarden), .csv (LastPass, Generic), .1pux (1Password)',
    ru: 'Поддерживается: .kdbx (KeePass), .json (Bitwarden), .csv (LastPass, Generic), .1pux (1Password)',
  },
  'import:password:title': {en: 'Enter Master Password', ru: 'Введите мастер-пароль'},
  'import:password:description': {
    en: 'This KeePass database is encrypted. Enter the master password to decrypt it.',
    ru: 'Эта база данных KeePass зашифрована. Введите мастер-пароль для расшифровки.',
  },
  'import:password:placeholder': {en: 'Master password', ru: 'Мастер-пароль'},
  'import:password:empty': {en: 'Please enter the master password.', ru: 'Введите мастер-пароль.'},
  'import:preview:title': {en: 'Import Preview', ru: 'Предварительный просмотр'},
  'import:preview:new_entries': {en: 'New entries', ru: 'Новые записи'},
  'import:preview:update_entries': {en: 'To update', ru: 'К обновлению'},
  'import:preview:import_button': {en: 'Import', ru: 'Импортировать'},
  'import:preview:total_entries': {en: 'entries found', ru: 'записей найдено'},
  'import:progress:title': {en: 'Importing...', ru: 'Импорт...'},
  'import:progress:imported': {en: 'imported', ru: 'импортировано'},
  'import:progress:updated': {en: 'updated', ru: 'обновлено'},
  'import:progress:errors': {en: 'errors', ru: 'ошибки'},
  'import:progress:cancel': {en: 'Cancel Import', ru: 'Отменить импорт'},
  'import:complete:title': {en: 'Import Complete', ru: 'Импорт завершён'},
  'import:complete:title_errors': {
    en: 'Import Completed with Errors',
    ru: 'Импорт завершён с ошибками',
  },
  'import:complete:imported': {en: 'Imported', ru: 'Импортировано'},
  'import:complete:updated': {en: 'Updated', ru: 'Обновлено'},
  'import:complete:errors': {en: 'Errors', ru: 'Ошибки'},
  'import:error:unsupported_format': {
    en: 'Unsupported file format. Please select a .kdbx, .json, .csv, or .1pux file.',
    ru: 'Неподдерживаемый формат файла. Выберите файл .kdbx, .json, .csv или .1pux.',
  },
  'import:button:back': {en: 'Back', ru: 'Назад'},
  'import:button:decrypt': {en: 'Decrypt & Parse', ru: 'Расшифровать'},
  'import:button:close': {en: 'Close', ru: 'Закрыть'},
  'import:step:file': {en: 'File', ru: 'Файл'},
  'import:step:preview': {en: 'Preview', ru: 'Обзор'},
  'import:step:import': {en: 'Import', ru: 'Импорт'},
}

function readLang(): Lang {
  try {
    return (globalThis.localStorage?.getItem(LOCAL_STORAGE_KEY) as Lang) || DEFAULT_LANG
  } catch {
    return DEFAULT_LANG
  }
}

function syncDocumentLang(value: string) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = value
  }
}

export const langState = atom<Lang>(readLang())
syncDocumentLang(langState())

export function setLang(value: Lang) {
  langState.set(value)
  try {
    globalThis.localStorage?.setItem(LOCAL_STORAGE_KEY, value)
  } catch {
    // ignore storage failures
  }
  syncDocumentLang(value)
}

export function getLang(): Lang {
  return langState()
}

export function i18n(key: TranslationKey): string {
  const lang = langState()
  const unit = translations[key]
  return unit[lang] ?? unit[DEFAULT_LANG] ?? key
}
