import {createI18n} from '@project/i18n'

const FALLBACK_LANG = 'en' as const

type BrowserExtensionLang = 'en' | 'ru'

const resolveBrowserLang = (): BrowserExtensionLang => {
  if (typeof window === 'undefined') {
    return FALLBACK_LANG
  }

  const value = window.navigator?.language?.toLowerCase() ?? ''
  return value.startsWith('ru') ? 'ru' : FALLBACK_LANG
}

const data = {
  'app.currentPage': {
    en: 'Current page',
    ru: 'Текущая страница',
  },
  'app.entry.one': {
    en: '1 entry',
    ru: '1 запись',
  },
  'app.entry.many': {
    en: '${count} entries',
    ru: '${count} записей',
  },
  'app.loading': {
    en: 'Checking gateway and loading records...',
    ru: 'Проверяем шлюз и загружаем записи...',
  },
  'app.noRecords': {
    en: 'No records found for ${host}',
    ru: 'Для ${host} записи не найдены',
  },
  'app.title': {
    en: 'ChromVoid Autofill',
    ru: 'ChromVoid Автозаполнение',
  },

  'status.gateway': {
    en: 'Gateway',
    ru: 'Шлюз',
  },
  'status.vault': {
    en: 'Vault',
    ru: 'Хранилище',
  },
  'status.connected': {
    en: 'connected',
    ru: 'подключено',
  },
  'status.unauthorized': {
    en: 'unauthorized',
    ru: 'не авторизовано',
  },
  'status.offline': {
    en: 'offline',
    ru: 'оффлайн',
  },
  'status.unknown': {
    en: 'unknown',
    ru: 'неизвестно',
  },
  'status.na': {
    en: 'n/a',
    ru: 'н/д',
  },
  'status.open': {
    en: 'open',
    ru: 'открыто',
  },
  'status.locked': {
    en: 'locked',
    ru: 'заблокировано',
  },

  'pairing.hint': {
    en: 'Start pairing in Desktop Gateway and enter the 6-digit PIN.',
    ru: 'Запустите сопряжение в Desktop Gateway и введите 6-значный PIN.',
  },
  'pairing.action': {
    en: 'Pair',
    ru: 'Сопрячь',
  },
  'pairing.progress': {
    en: 'Pairing...',
    ru: 'Сопряжение...',
  },

  'record.credentialsForSite': {
    en: 'Credentials for this site',
    ru: 'Данные входа для этого сайта',
  },
  'record.otpReady': {
    en: 'OTP ready',
    ru: 'OTP готов',
  },
  'record.otpMissing': {
    en: 'OTP missing',
    ru: 'OTP отсутствует',
  },
  'record.otpProfiles': {
    en: '${count} OTP profiles',
    ru: '${count} OTP профилей',
  },
  'record.fillCredentials': {
    en: 'Fill credentials',
    ru: 'Заполнить данные входа',
  },
  'record.fillCredentialsHint': {
    en: 'Username + password',
    ru: 'Логин + пароль',
  },
  'record.fillOtpField': {
    en: 'Fill OTP field',
    ru: 'Заполнить поле OTP',
  },
  'record.username': {
    en: 'Username',
    ru: 'Логин',
  },
  'record.copyUsername': {
    en: 'Copy username',
    ru: 'Копировать логин',
  },
  'record.password': {
    en: 'Password',
    ru: 'Пароль',
  },
  'record.hiddenValue': {
    en: 'Hidden value',
    ru: 'Скрытое значение',
  },
  'record.copyPassword': {
    en: 'Copy password',
    ru: 'Копировать пароль',
  },
  'record.otpCode': {
    en: 'OTP code',
    ru: 'OTP код',
  },
  'record.copyCurrentOtp': {
    en: 'Copy current OTP',
    ru: 'Копировать текущий OTP',
  },
  'record.otpUnavailable': {
    en: 'OTP unavailable',
    ru: 'OTP недоступен',
  },
  'record.otpNotAvailable': {
    en: 'OTP not available',
    ru: 'OTP недоступен',
  },
  'record.feedback.usernameCopied': {
    en: 'Username copied',
    ru: 'Логин скопирован',
  },
  'record.feedback.passwordCopied': {
    en: 'Password copied',
    ru: 'Пароль скопирован',
  },
  'record.feedback.otpCopied': {
    en: 'OTP copied',
    ru: 'OTP скопирован',
  },
  'record.feedback.clipboardBlocked': {
    en: 'Clipboard blocked',
    ru: 'Буфер обмена недоступен',
  },
  'record.feedback.passwordUnavailable': {
    en: 'Password unavailable',
    ru: 'Пароль недоступен',
  },

  'error.gatewayUnauthorized': {
    en: 'Gateway is reachable, but extension is not paired or authorized',
    ru: 'Шлюз доступен, но расширение не сопряжено или не авторизовано',
  },
  'error.gatewayOffline': {
    en: 'No connection to Tauri gateway',
    ru: 'Нет соединения с Tauri шлюзом',
  },
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
    en: 'Pairing failed. Make sure pairing is active in Desktop Gateway and PIN has not expired, then retry',
    ru: 'Не удалось выполнить сопряжение. Убедитесь, что сопряжение активно в Desktop Gateway и PIN не истек, затем попробуйте снова',
  },
  'error.gatewayUnreachable': {
    en: 'Cannot reach Desktop Gateway. Start desktop app and enable Gateway, then retry',
    ru: 'Не удается подключиться к Desktop Gateway. Запустите desktop приложение, включите Gateway и повторите попытку',
  },
  'error.loadSiteData': {
    en: 'Failed to load site data',
    ru: 'Не удалось загрузить данные сайта',
  },

  'otp.fallbackLabel': {
    en: 'OTP ${index}',
    ru: 'OTP ${index}',
  },
} as const

export const {i18n, setLang, getLang, langState} = createI18n(data, resolveBrowserLang(), {
  fallbackLang: FALLBACK_LANG,
})
