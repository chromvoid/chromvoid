import {wrap} from '@reatom/core'
import {i18n} from '@project/passmanager/i18n'
import {html} from 'lit'

import {dialogService} from 'root/shared/services/dialog-service'
import {
  elementContainsDeepActiveElement,
  eventPathContainsElement,
  eventPathContainsTextEditor,
} from 'root/shared/keyboard/keyboard-event-guards'
import {pmComponentLoaderModel} from '../models/pm-component-loader.model'

type PassmanagerMovePickerElement = HTMLElement & {
  selectedId?: string
}

type PassmanagerMoveSheetElement = HTMLElement & {
  confirming: boolean
  disabledIds: string[]
  entryId: string
  open: boolean
  selectedId: string
}

export type PassmanagerMoveDialogOptions = {
  disabledIds?: string[]
  entryId?: string
  onConfirm?: (targetId: string) => Promise<boolean> | boolean
  selectedId: string
  useMobilePicker: boolean
}

function resolveSelectedId(picker: PassmanagerMovePickerElement | null, fallback: string): string {
  const next = picker?.selectedId
  return typeof next === 'string' && next.length > 0 ? next : fallback
}

async function resolveConfirmation(options: PassmanagerMoveDialogOptions, targetId: string): Promise<boolean> {
  try {
    return await wrap(Promise.resolve(options.onConfirm?.(targetId) ?? true))
  } catch {
    return false
  }
}

function shouldConfirmMoveDialogEnter(event: KeyboardEvent, cancelElement: Element | null): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false
  if (eventPathContainsTextEditor(event)) return false
  if (eventPathContainsElement(event, cancelElement)) return false
  if (elementContainsDeepActiveElement(cancelElement)) return false
  return true
}

function openDesktopMoveDialog(options: PassmanagerMoveDialogOptions): Promise<string | null> {
  let selectedId = options.selectedId
  const disabledIds = options.disabledIds ?? []
  const content = html`
    <pm-entry-move
      .entryId=${options.entryId ?? ''}
      .selectedId=${selectedId}
      .disabledIds=${disabledIds}
    ></pm-entry-move>
  `

  const footer = html`
    <cv-button variant="default" id="move-cancel-btn">${i18n('button:cancel')}</cv-button>
    <cv-button variant="primary" id="move-confirm-btn">${i18n('button:move')}</cv-button>
  `

  return dialogService.showCustomDialog<string>(
    {
      title: i18n('dialog:move:title'),
      content,
      footer,
      size: 'm',
      dialogClass: 'pm-move-sheet',
    },
    (dialog, resolve) => {
      const picker = dialog.querySelector('pm-entry-move') as PassmanagerMovePickerElement | null
      const confirmBtn = dialog.querySelector('#move-confirm-btn')
      const cancelBtn = dialog.querySelector('#move-cancel-btn')
      let settled = false
      let confirming = false

      const finish = (value: string | null) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      const confirmSelection = async () => {
        if (settled || confirming) return
        const nextSelectedId = resolveSelectedId(picker, selectedId)
        if (!nextSelectedId) return

        selectedId = nextSelectedId
        confirming = true
        const confirmed = await resolveConfirmation(options, nextSelectedId)
        confirming = false
        if (settled) return
        if (!confirmed) return

        finish(nextSelectedId)
      }

      const handleMoveSelected = (event: Event) => {
        const detail = (event as CustomEvent<{id?: string}>).detail
        if (!detail?.id) return
        selectedId = detail.id
      }

      const handleKeydown = (event: KeyboardEvent) => {
        if (!shouldConfirmMoveDialogEnter(event, cancelBtn)) return

        event.preventDefault()
        void confirmSelection()
      }

      picker?.addEventListener('move-selected', handleMoveSelected)
      confirmBtn?.addEventListener('click', () => {
        void confirmSelection()
      })
      cancelBtn?.addEventListener('click', () => finish(null))
      dialog.addEventListener('keydown', handleKeydown)
    },
  )
}

function openMobileMoveSheet(options: PassmanagerMoveDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const sheet = document.createElement('pm-entry-move-sheet') as PassmanagerMoveSheetElement
    let settled = false
    let confirming = false

    sheet.entryId = options.entryId ?? ''
    sheet.selectedId = options.selectedId
    sheet.disabledIds = options.disabledIds ?? []

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      sheet.open = false
      cleanup()
      resolve(value)
    }

    const confirmSelection = async (event: Event) => {
      if (settled || confirming) return
      const detail = (event as CustomEvent<{targetId?: string}>).detail
      const targetId = detail?.targetId || sheet.selectedId
      if (!targetId) return

      sheet.selectedId = targetId
      sheet.confirming = true
      confirming = true
      const confirmed = await resolveConfirmation(options, targetId)
      confirming = false
      if (settled) return
      sheet.confirming = false
      if (!confirmed) return

      finish(targetId)
    }

    const cancel = () => finish(null)

    function cleanup() {
      sheet.removeEventListener('pm-entry-move-sheet-confirm', confirmSelection)
      sheet.removeEventListener('pm-entry-move-sheet-cancel', cancel)
      sheet.removeEventListener('pm-entry-move-sheet-close', cancel)
      sheet.remove()
    }

    sheet.addEventListener('pm-entry-move-sheet-confirm', confirmSelection)
    sheet.addEventListener('pm-entry-move-sheet-cancel', cancel)
    sheet.addEventListener('pm-entry-move-sheet-close', cancel)

    document.body.append(sheet)
    sheet.open = true
  })
}

export async function openPassmanagerMoveDialog(
  options: PassmanagerMoveDialogOptions,
): Promise<string | null> {
  await pmComponentLoaderModel.ensureExtendedComponents()

  if (options.useMobilePicker) {
    return openMobileMoveSheet(options)
  }

  return openDesktopMoveDialog(options)
}
