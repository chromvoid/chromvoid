import {wrap} from '@reatom/core'
import {html} from 'lit'

import {dialogService} from 'root/shared/services/dialog-service'
import {i18n} from 'root/i18n'
import {
  elementContainsDeepActiveElement,
  eventPathContainsElement,
  eventPathContainsTextEditor,
} from 'root/shared/keyboard/keyboard-event-guards'

import {FileMove, FileMoveSheet} from '../components/file-move'

type FileMovePickerElement = HTMLElement & {
  selectedPath?: string
}

type FileMoveSheetElement = HTMLElement & {
  confirming: boolean
  disabledPaths: string[]
  itemId: number | null
  open: boolean
  selectedPath: string
}

export type FileMoveDialogOptions = {
  disabledPaths?: string[]
  itemId?: number
  onConfirm?: (targetPath: string) => Promise<boolean> | boolean
  selectedPath: string
  useMobilePicker: boolean
}

function resolveSelectedPath(picker: FileMovePickerElement | null, fallback: string): string {
  const next = picker?.selectedPath
  return typeof next === 'string' && next.length > 0 ? next : fallback
}

async function resolveConfirmation(options: FileMoveDialogOptions, targetPath: string): Promise<boolean> {
  try {
    return await wrap(Promise.resolve(options.onConfirm?.(targetPath) ?? true))
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

function openDesktopMoveDialog(options: FileMoveDialogOptions): Promise<string | null> {
  FileMove.define()

  let selectedPath = options.selectedPath
  const disabledPaths = options.disabledPaths ?? []
  const content = html`
    <file-move
      .itemId=${options.itemId ?? null}
      .selectedPath=${selectedPath}
      .disabledPaths=${disabledPaths}
    ></file-move>
  `

  const footer = html`
    <cv-button variant="default" id="move-cancel-btn">${i18n('button:cancel')}</cv-button>
    <cv-button variant="primary" id="move-confirm-btn">${i18n('file-manager:move:action')}</cv-button>
  `

  return dialogService.showCustomDialog<string>(
    {
      title: i18n('file-manager:move:title'),
      content,
      footer,
      size: 'm',
      dialogClass: 'file-move-sheet',
    },
    (dialog, resolve) => {
      const picker = dialog.querySelector('file-move') as FileMovePickerElement | null
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
        const nextSelectedPath = resolveSelectedPath(picker, selectedPath)
        if (!nextSelectedPath) return

        selectedPath = nextSelectedPath
        confirming = true
        const confirmed = await resolveConfirmation(options, nextSelectedPath)
        confirming = false
        if (settled) return
        if (!confirmed) return

        finish(nextSelectedPath)
      }

      const handleMoveSelected = (event: Event) => {
        const detail = (event as CustomEvent<{path?: string}>).detail
        if (!detail?.path) return
        selectedPath = detail.path
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

function openMobileMoveSheet(options: FileMoveDialogOptions): Promise<string | null> {
  FileMoveSheet.define()

  return new Promise((resolve) => {
    const sheet = document.createElement(FileMoveSheet.elementName) as FileMoveSheetElement
    let settled = false
    let confirming = false

    sheet.itemId = options.itemId ?? null
    sheet.selectedPath = options.selectedPath
    sheet.disabledPaths = options.disabledPaths ?? []

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      sheet.open = false
      cleanup()
      resolve(value)
    }

    const confirmSelection = async (event: Event) => {
      if (settled || confirming) return
      const detail = (event as CustomEvent<{targetPath?: string}>).detail
      const targetPath = detail?.targetPath || sheet.selectedPath
      if (!targetPath) return

      sheet.selectedPath = targetPath
      sheet.confirming = true
      confirming = true
      const confirmed = await resolveConfirmation(options, targetPath)
      confirming = false
      if (settled) return
      sheet.confirming = false
      if (!confirmed) return

      finish(targetPath)
    }

    const cancel = () => finish(null)

    function cleanup() {
      sheet.removeEventListener('file-move-sheet-confirm', confirmSelection)
      sheet.removeEventListener('file-move-sheet-cancel', cancel)
      sheet.removeEventListener('file-move-sheet-close', cancel)
      sheet.remove()
    }

    sheet.addEventListener('file-move-sheet-confirm', confirmSelection)
    sheet.addEventListener('file-move-sheet-cancel', cancel)
    sheet.addEventListener('file-move-sheet-close', cancel)

    document.body.append(sheet)
    sheet.open = true
  })
}

export function openFileMoveDialog(options: FileMoveDialogOptions): Promise<string | null> {
  if (options.useMobilePicker) {
    return openMobileMoveSheet(options)
  }

  return openDesktopMoveDialog(options)
}
