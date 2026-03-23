import {passmanagerNavigationController} from 'root/features/passmanager/passmanager-navigation.controller'
import {stageAndroidPasswordSavePrefill, type AndroidPasswordSavePrefill} from 'root/features/passmanager/models/android-password-save-prefill'

type WindowWithAndroidPasswordSave = Window & {
  __chromvoidPendingAndroidPasswordSave?: unknown
}

function readPendingPrefill(): AndroidPasswordSavePrefill | null {
  const win = window as WindowWithAndroidPasswordSave
  const raw = win.__chromvoidPendingAndroidPasswordSave
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const value = raw as Record<string, unknown>
  win.__chromvoidPendingAndroidPasswordSave = undefined

  const title = typeof value['title'] === 'string' ? value['title'] : ''
  const username = typeof value['username'] === 'string' ? value['username'] : ''
  const password = typeof value['password'] === 'string' ? value['password'] : ''
  const urls = typeof value['urls'] === 'string' ? value['urls'] : ''

  if (!password.trim()) {
    return null
  }

  return {
    token: typeof value['token'] === 'string' ? value['token'].trim() : '',
    title: title.trim(),
    username: username.trim(),
    password,
    urls: urls.trim(),
  }
}

function handlePendingPasswordSave(): void {
  const prefill = readPendingPrefill()
  if (!prefill) {
    return
  }
  if (!prefill.token) {
    return
  }

  stageAndroidPasswordSavePrefill(prefill)

  if (window.passmanager) {
    passmanagerNavigationController.openCreateEntry()
  }
}

export function setupAndroidPasswordSaveHandoff(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.addEventListener('chromvoid:android-password-save-request', handlePendingPasswordSave)
  handlePendingPasswordSave()
}
