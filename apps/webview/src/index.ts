import {markStartupTimeline} from './app/bootstrap/startup-timeline'
import './app/debug/webmcp-debug'
import './setup/reatom-logging'

import {CVAccordion} from '@chromvoid/uikit/components/cv-accordion'
import {CVAccordionItem} from '@chromvoid/uikit/components/cv-accordion-item'
import {CVBadge} from '@chromvoid/uikit/components/cv-badge'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVCallout} from '@chromvoid/uikit/components/cv-callout'
import {CVCombobox} from '@chromvoid/uikit/components/cv-combobox'
import {CVComboboxOption} from '@chromvoid/uikit/components/cv-combobox-option'
import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {CVDisclosure} from '@chromvoid/uikit/components/cv-disclosure'
import {CVDrawer} from '@chromvoid/uikit/components/cv-drawer'
import {CVGuidanceAnchor} from '@chromvoid/uikit/components/cv-guidance-anchor'
import {CVGuidancePanel} from '@chromvoid/uikit/components/cv-guidance-panel'
import {CVIcon, registerIconCollection, setIconBasePath} from '@chromvoid/uikit/components/cv-icon'
import {CVInput} from '@chromvoid/uikit/components/cv-input'
import {CVMenuButton} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {CVNumber} from '@chromvoid/uikit/components/cv-number'
import {CVPopover} from '@chromvoid/uikit/components/cv-popover'
import {CVProgress} from '@chromvoid/uikit/components/cv-progress'
import {CVProgressRing} from '@chromvoid/uikit/components/cv-progress-ring'
import {CVRadio} from '@chromvoid/uikit/components/cv-radio'
import {CVRadioGroup} from '@chromvoid/uikit/components/cv-radio-group'
import {CVSelect} from '@chromvoid/uikit/components/cv-select'
import {CVSelectOption} from '@chromvoid/uikit/components/cv-select-option'
import {CVSlider} from '@chromvoid/uikit/components/cv-slider'
import {CVSpinner} from '@chromvoid/uikit/components/cv-spinner'
import {CVSwitch} from '@chromvoid/uikit/components/cv-switch'
import {CVTab} from '@chromvoid/uikit/components/cv-tab'
import {CVTabPanel} from '@chromvoid/uikit/components/cv-tab-panel'
import {CVTabs} from '@chromvoid/uikit/components/cv-tabs'
import {CVTextarea} from '@chromvoid/uikit/components/cv-textarea'
import {CVToolbar} from '@chromvoid/uikit/components/cv-toolbar'
import {CVToolbarItem} from '@chromvoid/uikit/components/cv-toolbar-item'
import {CVTooltip} from '@chromvoid/uikit/components/cv-tooltip'

import {readInitialSurface} from './app/navigation/initial-surface'
import {ChromVoidApp} from './pages'
import {initToastManager} from './shared/services/toast-manager'
import {validateCssTokens} from './utils/validate-css-tokens'
// Initialization of dialogue service
import './shared/services/dialog'

const SPLASH_MIN_VISIBLE_MS = 1_600
const SPLASH_IMPORT_WATCHDOG_MS = 2_800

markStartupTimeline('web.index.module-start', {
  loading: document.documentElement.hasAttribute('loading'),
  readyState: document.readyState,
})
startStartupSplash()

// Setting up paths to Lucide icons
setIconBasePath('/assets/icons/lucide')
registerIconCollection('octicons', '/assets/icons/octicons')

const initialSurface = readInitialSurface()
const deferNonCriticalStartup = initialSurface === 'passwords'

initToastManager()
CVAccordionItem.define()
CVAccordion.define()
CVBadge.define()
CVBottomSheet.define()
CVCallout.define()
CVButton.define()
CVComboboxOption.define()
CVCombobox.define()
CVDialog.define()
CVDisclosure.define()
CVDrawer.define()
CVGuidanceAnchor.define()
CVGuidancePanel.define()
CVIcon.define()
CVInput.define()
CVMenuItem.define()
CVMenuButton.define()
CVNumber.define()
CVPopover.define()
CVProgress.define()
CVProgressRing.define()
CVRadio.define()
CVRadioGroup.define()
CVSelect.define()
CVSelectOption.define()
CVSlider.define()
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
markStartupTimeline('web.index.custom-elements-defined', {initialSurface})

loadVendoredFonts(deferNonCriticalStartup)
cleanupLegacyImageServiceWorker()
markStartupTimeline('web.index.bootstrap-complete', {deferNonCriticalStartup})

// Expose + optionally run a lightweight token audit.
// It only logs when something is actually missing.
window.__chromvoidValidateCssTokens = validateCssTokens
window.addEventListener('load', () => {
  markStartupTimeline('web.window.load', {
    loading: document.documentElement.hasAttribute('loading'),
    startupReady: document.documentElement.dataset['startupContentReady'] === 'true',
  })
  // Always validate on localhost to catch regressions early.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    const runValidation = () => validateCssTokens()
    if (deferNonCriticalStartup) {
      scheduleNonCritical(runValidation, 2_000)
    } else {
      runValidation()
    }
  }
})

function cleanupLegacyImageServiceWorker() {
  const legacyCacheNames = [
    'kp-image-cache-v2',
    'pm-image-cache-v1',
    'pm-favicon-cache-v1',
    'kp-favicon-cache-v2',
    'kp-favicon-meta-v2',
  ]

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        const appOrigin = window.location.origin
        return Promise.all(
          registrations
            .filter((registration) => {
              try {
                return new URL(registration.scope).origin === appOrigin
              } catch {
                return false
              }
            })
            .map((registration) => registration.unregister()),
        )
      })
      .catch((error) => {
        console.warn('[SW] legacy unregister failed:', error)
      })
  }

  if ('caches' in globalThis) {
    void Promise.all(legacyCacheNames.map((name) => globalThis.caches.delete(name))).catch((error) => {
      console.warn('[SW] legacy cache cleanup failed:', error)
    })
  }
}

function loadVendoredFonts(deferLoad: boolean) {
  const id = 'chromvoid-vendored-fonts'
  if (document.getElementById(id)) {
    return
  }

  const attach = () => {
    if (document.getElementById(id)) {
      return
    }
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = new URL(/* @vite-ignore */ './assets/fonts.vendored.css', import.meta.url).toString()
    document.head.append(link)
  }

  if (deferLoad) {
    scheduleNonCritical(attach, 750)
    return
  }

  attach()
}

function scheduleNonCritical(task: () => void, delayMs = 0) {
  const enqueue = () => {
    const run = () => {
      if ('requestIdleCallback' in globalThis) {
        ;(globalThis as typeof globalThis & {
          requestIdleCallback?: (callback: () => void, options?: {timeout: number}) => number
        }).requestIdleCallback?.(() => task(), {timeout: 2_000})
        return
      }
      window.setTimeout(task, 0)
    }

    if (delayMs > 0) {
      window.setTimeout(run, delayMs)
      return
    }

    run()
  }

  if (document.readyState === 'complete') {
    enqueue()
    return
  }

  window.addEventListener('load', enqueue, {once: true})
}

function startStartupSplash() {
  if (!document.documentElement.hasAttribute('loading')) {
    markStartupTimeline('web.splash.skip-no-loading')
    return
  }

  markStartupTimeline('web.splash.import-start', {
    watchdogMs: SPLASH_IMPORT_WATCHDOG_MS,
  })
  const watchdogId = window.setTimeout(() => releaseSplashLoadingFallback(), SPLASH_IMPORT_WATCHDOG_MS)
  void import('./app/splash/SplashLogo')
    .then(({startSplashLogo}) => {
      window.clearTimeout(watchdogId)
      markStartupTimeline('web.splash.import-ready')
      startSplashLogo({minVisibleMs: SPLASH_MIN_VISIBLE_MS, startedAt: 0})
    })
    .catch((error) => {
      window.clearTimeout(watchdogId)
      markStartupTimeline('web.splash.import-failed', {error: String(error)})
      console.warn('[splash] startup splash failed:', error)
      releaseSplashLoadingFallback()
    })
}

function releaseSplashLoadingFallback() {
  const delay = Math.max(0, SPLASH_MIN_VISIBLE_MS - performance.now())
  markStartupTimeline('web.splash.fallback-release-scheduled', {delayMs: Math.round(delay)})
  window.setTimeout(() => {
    markStartupTimeline('web.splash.fallback-release-run')
    notifyNativeStartupSplashReady()
    document.documentElement.removeAttribute('loading')
  }, delay)
}

function notifyNativeStartupSplashReady() {
  markStartupTimeline('web.splash.notify-native-release-fallback')
  try {
    window.ChromVoidSplash?.domReady?.()
  } catch (error) {
    console.warn('[splash] native splash bridge failed:', error)
  }

  void notifyTauriStartupSplashReady()
}

async function notifyTauriStartupSplashReady(): Promise<void> {
  if (!hasTauriInvoke()) {
    return
  }

  try {
    const {invoke} = await import('@tauri-apps/api/core')
    await invoke('frontend_splash_ready')
  } catch (error) {
    console.warn('[splash] Tauri splash handoff failed:', error)
  }
}

function hasTauriInvoke(): boolean {
  const internals = (globalThis as {__TAURI_INTERNALS__?: {invoke?: unknown}}).__TAURI_INTERNALS__
  return typeof internals?.invoke === 'function'
}
