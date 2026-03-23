import {
  CVAccordion,
  CVAccordionItem,
  CVBadge,
  CVCallout,
  CVButton,
  CVDialog,
  CVDrawer,
  CVIcon,
  CVInput,
  CVMenuButton,
  CVMenuItem,
  CVNumber,
  CVProgress,
  CVProgressRing,
  CVSelect,
  CVSelectOption,
  CVSpinner,
  CVSwitch,
  CVTab,
  CVTabPanel,
  CVTabs,
  CVTextarea,
  CVToolbar,
  CVToolbarItem,
  CVTooltip,
  setIconBasePath,
} from '@chromvoid/uikit'

import {ChromVoidApp} from './pages'
import {FileAppShell} from './features/shell/components/file-app-shell'
import {initToastManager} from './shared/services/toast-manager'
import {validateCssTokens} from './utils/validate-css-tokens'
// Инициализация сервиса диалогов
import './shared/services/dialog'

// Настройка путей к иконкам Lucide
setIconBasePath('/assets/icons/lucide')

initToastManager()
CVAccordionItem.define()
CVAccordion.define()
CVBadge.define()
CVCallout.define()
CVButton.define()
CVDialog.define()
CVDrawer.define()
CVIcon.define()
CVInput.define()
CVMenuItem.define()
CVMenuButton.define()
CVNumber.define()
CVProgress.define()
CVProgressRing.define()
CVSelect.define()
CVSelectOption.define()
CVSpinner.define()
CVSwitch.define()
CVTab.define()
CVTabPanel.define()
CVTabs.define()
CVTextarea.define()
CVToolbarItem.define()
CVToolbar.define()
CVTooltip.define()
ChromVoidApp.define()
FileAppShell.define()

// Запускаем регистрацию Service Worker
registerImageCacheSW()

// Expose + optionally run a lightweight token audit.
// It only logs when something is actually missing.
window.__chromvoidValidateCssTokens = validateCssTokens
window.addEventListener('load', () => {
  // Always validate on localhost to catch regressions early.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    validateCssTokens()
  }
})

// Регистрация Service Worker (кэширование same-origin изображений)
function registerImageCacheSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        // Регистрируем корневой sw.js (Parcel/Vite корректно резолвят URL)
        const registration = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url))

        console.log('[SW] registered:', registration.scope)

        // Проверка ready и controller
        navigator.serviceWorker.ready.then((reg) => {
          console.log('[SW] ready at scope:', reg.scope)
        })
        if (navigator.serviceWorker.controller) {
          console.log('[SW] controller is active')
        } else {
          console.log('[SW] no active controller yet (first install or reload needed)')
        }

        // Обновляем SW если доступна новая версия
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Новая версия установлена, можно уведомить пользователя
                console.log('[SW] updated')
              }
            })
          }
        })

      } catch (error) {
        console.warn('[SW] registration failed:', error)
      }
    })
  } else {
    console.warn('[SW] not supported in this browser')
  }
}
