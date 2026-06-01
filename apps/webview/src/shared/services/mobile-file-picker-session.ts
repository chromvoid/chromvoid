import {
  notifyMobileFilePickerLifecycleEnd,
  notifyMobileFilePickerLifecycleStart,
} from '@chromvoid/password-import/ui/mobile-file-picker-lifecycle'

export type MobileFilePickerSession = {
  end(): void
}

export function beginMobileFilePickerSession(timeoutMs?: number): MobileFilePickerSession {
  if (typeof window === 'undefined') {
    return {end: () => {}}
  }

  let active = true
  const end = () => {
    if (!active) return
    active = false
    window.removeEventListener('focus', handleWindowFocus)
    notifyMobileFilePickerLifecycleEnd()
  }
  const handleWindowFocus = () => end()

  window.addEventListener('focus', handleWindowFocus, {once: true})
  notifyMobileFilePickerLifecycleStart(timeoutMs)

  return {end}
}
