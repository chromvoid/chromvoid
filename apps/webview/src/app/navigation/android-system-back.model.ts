import {navigationModel} from './navigation.model'
import {markdownPreviewModel} from 'root/features/file-manager/models/markdown-preview.model'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {transientBackModel} from 'root/shared/services/transient-back.model'

function getDeepActiveElement(): HTMLElement | null {
  let active: Element | null = typeof document !== 'undefined' ? document.activeElement : null
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }
  return active instanceof HTMLElement ? active : null
}

function isEditableElement(el: HTMLElement | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el.isContentEditable) return true
  if (!(el instanceof HTMLInputElement)) return false

  const type = el.type.toLowerCase()
  return (
    type !== 'button' &&
    type !== 'submit' &&
    type !== 'reset' &&
    type !== 'checkbox' &&
    type !== 'radio' &&
    type !== 'range' &&
    type !== 'color' &&
    type !== 'file' &&
    type !== 'image'
  )
}

class AndroidSystemBackModel {
  registerGlobalHandler(): void {
    if (typeof window === 'undefined') return
    window.__chromvoidHandleAndroidBack = () => this.handleBack()
  }

  handleBack(): boolean {
    if (transientBackModel.consumeBack()) {
      return true
    }

    const document = navigationModel.resolvedDocument()
    if (
      document.kind === 'markdown' &&
      (markdownPreviewModel.dirty() || markdownPreviewModel.saving() || markdownPreviewModel.formatting())
    ) {
      return navigationModel.goBackFromUi()
    }

    const active = getDeepActiveElement()
    if (active && isEditableElement(active)) {
      active.blur()
      return true
    }

    if (navigationModel.goBackFromUi()) {
      return true
    }

    return tryGetAppContext()?.router?.route?.() === 'dashboard'
  }
}

export const androidSystemBackModel = new AndroidSystemBackModel()
