import {createI18n} from '@project/i18n'

const FALLBACK_LANG = 'en' as const

export type BrowserExtensionLang = 'en' | 'ru'

const resolveBrowserLang = (): BrowserExtensionLang => {
  if (typeof window === 'undefined') {
    return FALLBACK_LANG
  }
  return window.navigator?.language?.toLowerCase().startsWith('ru') ? 'ru' : FALLBACK_LANG
}

const data = {
  'app.title': {en: 'ChromVoid', ru: 'ChromVoid'},
  'app.ready': {en: 'Ready', ru: 'Готово'},
  'app.status.checking': {en: 'Checking', ru: 'Проверка'},
  'app.status.offline': {en: 'Offline', ru: 'Оффлайн'},
  'app.status.pairing': {en: 'Pairing needed', ru: 'Нужно сопряжение'},
  'app.status.disabled': {en: 'Disabled', ru: 'Выключено'},
  'app.status.locked': {en: 'Locked', ru: 'Заблокировано'},
  'app.status.error': {en: 'Error', ru: 'Ошибка'},
  'app.currentPage': {en: 'Current page', ru: 'Текущая страница'},
  'app.nonWebPage': {en: 'Browser page', ru: 'Страница браузера'},
  'app.back': {en: 'Back', ru: 'Назад'},

  'search.label': {en: 'Search all credentials', ru: 'Поиск по всем записям'},
  'search.placeholder': {en: 'Search all credentials', ru: 'Найти запись'},
  'search.hint': {
    en: 'Type to search your vault. Secrets stay locked to their saved site.',
    ru: 'Введите запрос для поиска. Секреты остаются привязаны к сохранённому сайту.',
  },
  'search.loading': {en: 'Searching…', ru: 'Ищем…'},

  'section.currentSite': {en: 'For this site', ru: 'Для этого сайта'},
  'section.searchResults': {en: 'Search results', ru: 'Результаты поиска'},
  'section.result.one': {en: '1 result', ru: '1 результат'},
  'section.result.many': {en: '${count} results', ru: '${count} результатов'},

  'empty.siteTitle': {en: 'No credentials for this site', ru: 'Для этого сайта записей нет'},
  'empty.siteBody': {
    en: 'Search the whole vault or save a login in ChromVoid.',
    ru: 'Поищите во всём хранилище или сохраните вход в ChromVoid.',
  },
  'empty.searchTitle': {en: 'No matching credentials', ru: 'Совпадений нет'},
  'empty.searchBody': {
    en: 'Try another label, username, or domain.',
    ru: 'Попробуйте другое имя, логин или домен.',
  },
  'empty.nonWebTitle': {en: 'Autofill is unavailable here', ru: 'Здесь автозаполнение недоступно'},
  'empty.nonWebBody': {
    en: 'Open a website to see matching credentials, or search the vault above.',
    ru: 'Откройте сайт для подходящих записей или воспользуйтесь поиском выше.',
  },

  'credential.otp': {en: 'OTP', ru: 'OTP'},
  'credential.currentSite': {en: 'This site', ru: 'Этот сайт'},
  'credential.otherSite': {en: 'Saved for another site', ru: 'Сохранено для другого сайта'},
  'credential.unknownDomain': {en: 'No saved domain', ru: 'Домен не указан'},
  'credential.username': {en: 'Username', ru: 'Логин'},
  'credential.password': {en: 'Password', ru: 'Пароль'},
  'credential.savedDomain': {en: 'Saved domain', ru: 'Сохранённый домен'},
  'credential.oneTimeCode': {en: 'One-time code', ru: 'Одноразовый код'},

  'action.details': {en: 'Details', ru: 'Подробнее'},
  'action.fill': {en: 'Fill', ru: 'Заполнить'},
  'action.fillPassword': {en: 'Fill login', ru: 'Заполнить вход'},
  'action.fillOtp': {en: 'Fill OTP', ru: 'Заполнить OTP'},
  'action.copyUsername': {en: 'Copy username', ru: 'Копировать логин'},
  'action.copyPassword': {en: 'Copy password', ru: 'Копировать пароль'},
  'action.copyOtp': {en: 'Copy OTP', ru: 'Копировать OTP'},
  'action.openSite': {en: 'Open saved site', ru: 'Открыть сохранённый сайт'},
  'action.retry': {en: 'Retry', ru: 'Повторить'},
  'action.working': {en: 'Working…', ru: 'Выполняем…'},

  'loading.checking': {en: 'Connecting to ChromVoid…', ru: 'Подключаемся к ChromVoid…'},
  'recovery.gatewayOfflineTitle': {en: 'Desktop Gateway is offline', ru: 'Desktop Gateway не запущен'},
  'recovery.gatewayOfflineBody': {
    en: 'Start the ChromVoid desktop app and enable its local Gateway.',
    ru: 'Запустите ChromVoid на компьютере и включите локальный Gateway.',
  },
  'recovery.unpairedTitle': {en: 'Pair this extension', ru: 'Сопрягите расширение'},
  'recovery.unpairedBody': {
    en: 'Start pairing in Desktop Gateway, then enter the six-digit PIN.',
    ru: 'Запустите сопряжение в Desktop Gateway и введите шестизначный PIN.',
  },
  'recovery.providerDisabledTitle': {
    en: 'Browser integration is off',
    ru: 'Интеграция с браузером выключена',
  },
  'recovery.providerDisabledBody': {
    en: 'Enable the credential provider in the ChromVoid desktop app.',
    ru: 'Включите провайдер учётных данных в приложении ChromVoid.',
  },
  'recovery.vaultLockedTitle': {en: 'Vault is locked', ru: 'Хранилище заблокировано'},
  'recovery.vaultLockedBody': {
    en: 'Unlock the vault in ChromVoid, then try again.',
    ru: 'Разблокируйте хранилище в ChromVoid и повторите попытку.',
  },
  'recovery.loadErrorTitle': {en: 'Could not load credentials', ru: 'Не удалось загрузить записи'},

  'pairing.pinLabel': {en: 'Pairing PIN', ru: 'PIN сопряжения'},
  'pairing.action': {en: 'Pair', ru: 'Сопрячь'},
  'pairing.progress': {en: 'Pairing…', ru: 'Сопрягаем…'},

  'feedback.usernameCopied': {en: 'Username copied', ru: 'Логин скопирован'},
  'feedback.passwordCopied': {en: 'Password copied', ru: 'Пароль скопирован'},
  'feedback.otpCopied': {en: 'OTP copied', ru: 'OTP скопирован'},
  'feedback.credentialsFilled': {en: 'Login filled', ru: 'Данные входа заполнены'},
  'feedback.otpFilled': {en: 'OTP filled', ru: 'OTP заполнен'},

  'error.gatewayUnauthorized': {
    en: 'Gateway is reachable, but extension is not paired or authorized',
    ru: 'Шлюз доступен, но расширение не сопряжено или не авторизовано',
  },
  'error.gatewayOffline': {en: 'No connection to Tauri gateway', ru: 'Нет соединения с Tauri шлюзом'},
  'error.providerDisabled': {
    en: 'Credential provider is disabled in desktop app',
    ru: 'Провайдер учетных данных отключен в desktop приложении',
  },
  'error.vaultLocked': {
    en: 'Vault is locked in desktop app',
    ru: 'Хранилище заблокировано в desktop приложении',
  },
  'error.pinInvalid': {
    en: 'Pairing PIN must contain exactly 6 digits',
    ru: 'PIN для сопряжения должен содержать ровно 6 цифр',
  },
  'error.pairingFailed': {
    en: 'Pairing failed. Make sure the PIN is still active, then retry.',
    ru: 'Не удалось выполнить сопряжение. Убедитесь, что PIN ещё активен, и повторите попытку.',
  },
  'error.gatewayUnreachable': {
    en: 'Cannot reach Desktop Gateway. Start ChromVoid and retry.',
    ru: 'Не удаётся подключиться к Desktop Gateway. Запустите ChromVoid и повторите попытку.',
  },
  'error.loadSiteData': {en: 'Failed to load site data', ru: 'Не удалось загрузить данные сайта'},
  'error.searchFailed': {en: 'Search failed. Try again.', ru: 'Поиск не выполнен. Попробуйте снова.'},
  'error.actionFailed': {en: 'Action failed. Try again.', ru: 'Не удалось выполнить действие.'},
  'error.currentSiteOnly': {
    en: 'Open the saved site before reading or filling its secret.',
    ru: 'Откройте сохранённый сайт, чтобы использовать его секрет.',
  },
  'error.tabChanged': {
    en: 'The active tab changed. Nothing was filled or copied.',
    ru: 'Активная вкладка изменилась. Данные не были вставлены или скопированы.',
  },
  'error.siteUnavailable': {
    en: 'This credential has no saved site.',
    ru: 'У этой записи нет сохранённого сайта.',
  },
  'error.otpUnavailable': {en: 'No OTP profile is available.', ru: 'Профиль OTP недоступен.'},

  'otp.fallbackLabel': {en: 'OTP ${index}', ru: 'OTP ${index}'},
} as const

export const {i18n, setLang, getLang, langState} = createI18n(data, resolveBrowserLang(), {
  fallbackLang: FALLBACK_LANG,
})
