import 'virtual:uno.css'
import '../src/theme/tokens.css'
import {unoUtilities} from '../src/styles/uno-utilities'
import {createToastController, registerUikit, setUnoUtilities} from '../src/index'

setUnoUtilities(unoUtilities)
registerUikit()

const toastController = createToastController()
const toastRegion = document.querySelector('#toast-region') as {controller: unknown} | null
const toastTrigger = document.querySelector('#toast-trigger')
const alertElement = document.querySelector('#inline-alert') as {
  show: (message: string) => void
  hide: () => void
} | null
const alertSuccessTrigger = document.querySelector('#alert-success-trigger')
const alertWarningTrigger = document.querySelector('#alert-warning-trigger')
const alertHideTrigger = document.querySelector('#alert-hide-trigger')
const selectElement = document.querySelector('cv-select')
const meterElement = document.querySelector('cv-meter')

if (toastRegion) {
  toastRegion.controller = toastController
}

toastTrigger?.addEventListener('click', () => {
  toastController.push({
    message: 'Toast from demo page',
    level: 'success',
    durationMs: 2200,
  })
})

alertSuccessTrigger?.addEventListener('click', () => {
  alertElement?.show('Configuration saved successfully')
})

alertWarningTrigger?.addEventListener('click', () => {
  alertElement?.show('Please check advanced diagnostics settings')
})

alertHideTrigger?.addEventListener('click', () => {
  alertElement?.hide()
})

selectElement?.addEventListener('cv-change', (event) => {
  const detail = (event as CustomEvent<{value: string | null}>).detail
  const selectedValue = detail.value ?? 'balanced'
  const meterByPreset: Record<string, number> = {
    silent: 24,
    balanced: 46,
    turbo: 78,
    locked: 46,
  }

  if (meterElement) {
    const nextValue = meterByPreset[selectedValue] ?? 46
    meterElement.setAttribute('value', String(nextValue))
  }
})
