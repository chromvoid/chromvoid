import {state} from '@statx/core'

import {html} from 'lit'

import {Entry} from '@project/passmanager'
import {
  DEFAULT_CLIPBOARD_WIPE_MS,
  copyWithAutoWipe,
  formatLink,
  i18n,
} from '@project/passmanager'
import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog-service'
import {pmEntryMoveModel} from '../../../models/pm-entry-move-model'
import type {PMEntryMove as PMEntryMoveType} from '../pm-entry-move'
import {PMEntrySessionModel} from './entry-session.model'

export type PMEntryActionUrl = {
  value: string
  openable: boolean
  href: string
}

export type PMEntryRenderData = {
  entryTitleText: string
  entryAvatarLetter: string
  avatarBg: string
  hasOtps: boolean
  visibleUrls: PMEntryActionUrl[]
  hasUrls: boolean
}

export class PMEntryModel extends PMEntrySessionModel {
  readonly isNoteDetailsOpen = state(false)

  getEntryData(card: Entry): PMEntryRenderData {
    const entryTitleText = card.title || i18n('no_title')
    const visibleUrls = card.urls
      .filter((rule) => rule.match !== 'never')
      .map((rule) => {
        const value = rule.value
        const openable = rule.match !== 'regex'
        return {
          value,
          openable,
          href: openable ? formatLink(value) : '',
        }
      })

    return {
      entryTitleText,
      entryAvatarLetter: (entryTitleText.trim().charAt(0) || '?').toUpperCase(),
      avatarBg: this.getAvatarBg(entryTitleText),
      hasOtps: card.otps().length > 0,
      visibleUrls,
      hasUrls: visibleUrls.length > 0,
    }
  }

  onEditEnd(): void {
    window.passmanager.isEditMode.set(false)
  }

  async moveCard(entry: Entry): Promise<void> {
    if (window.passmanager.isReadOnly()) return

    const sourceTargetId = pmEntryMoveModel.getEntryParentTargetId(entry)
    const firstAllowedTarget = pmEntryMoveModel.listTargets().find((target) => target.id !== sourceTargetId)
    let selectedId = firstAllowedTarget?.id ?? sourceTargetId

    const useMobileMovePicker = this.shouldUseMobileMovePicker()
    const pickerTag = useMobileMovePicker ? 'pm-entry-move-mobile' : 'pm-entry-move'

    const content = useMobileMovePicker
      ? html`<pm-entry-move-mobile .entryId=${entry.id} .selectedId=${selectedId}></pm-entry-move-mobile>`
      : html`<pm-entry-move .entryId=${entry.id} .selectedId=${selectedId}></pm-entry-move>`
    const footer = html`
      <cv-button variant="default" id="move-cancel-btn">${i18n('button:cancel')}</cv-button>
      <cv-button variant="primary" id="move-confirm-btn">${i18n('button:move')}</cv-button>
    `

    await dialogService.showCustomDialog<boolean>(
      {
        title: i18n('dialog:move:title'),
        content,
        footer,
        size: 'm',
        dialogClass: 'pm-move-sheet',
      },
      (dialog, resolve) => {
        const picker = dialog.querySelector(pickerTag) as PMEntryMoveType | null
        const confirmBtn = dialog.querySelector('#move-confirm-btn')
        const cancelBtn = dialog.querySelector('#move-cancel-btn')

        picker?.addEventListener('move-selected', (event: Event) => {
          const detail = (event as CustomEvent<{id: string}>).detail
          selectedId = detail.id
        })

        confirmBtn?.addEventListener('click', () => {
          if (!selectedId) return
          const moved = pmEntryMoveModel.moveEntry(entry, selectedId)
          if (moved) {
            resolve(true)
          }
        })

        cancelBtn?.addEventListener('click', () => resolve(false))

        dialog.addEventListener('keydown', (event: KeyboardEvent) => {
          if (event.key !== 'Enter' || event.shiftKey) return
          if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
          event.preventDefault()
          if (!selectedId) return
          const moved = pmEntryMoveModel.moveEntry(entry, selectedId)
          if (moved) {
            resolve(true)
          }
        })
      },
    )
  }

  async copyAll(entry: Entry): Promise<void> {
    const parts: string[] = []
    parts.push(`[${i18n('title')}] ${entry.title || '-'}`)
    parts.push(`[${i18n('username')}] ${entry.username || '-'}`)
    parts.push(`[${i18n('password')}] ${await this.readPassword(entry)}`)

    const otps = entry.otps()
    const firstOtp = otps.length > 0 ? otps[0] : undefined
    if (firstOtp) {
      try {
        const code = await firstOtp.loadCode()
        if (code) parts.push(`[${i18n('otp')}] ${code}`)
      } catch {}
    }

    const note = await this.readNote(entry)
    if (note) parts.push(`[${i18n('note:title')}] ${note}`)
    await copyWithAutoWipe(parts.join('\n'), DEFAULT_CLIPBOARD_WIPE_MS)
  }

  copyUsername(entry: Entry): void {
    if (!entry.username) return
    void copyWithAutoWipe(entry.username, DEFAULT_CLIPBOARD_WIPE_MS)
  }

  async copyPassword(entry: Entry): Promise<void> {
    const password = await this.readPassword(entry)
    if (!password) return
    await copyWithAutoWipe(password, DEFAULT_CLIPBOARD_WIPE_MS)
  }

  async copyOTP(entry: Entry): Promise<void> {
    const otps = entry.otps()
    const firstOtp = otps.length > 0 ? otps[0] : undefined
    if (!firstOtp) return

    try {
      const code = await firstOtp.loadCode()
      if (code) {
        await copyWithAutoWipe(code, DEFAULT_CLIPBOARD_WIPE_MS)
      }
    } catch {}
  }

  startEdit(): void {
    window.passmanager.isEditMode.set(true)
  }

  removeEntry(entry: Entry): void {
    void entry.remove()
  }

  openFirstUrl(entry: Entry): void {
    const first = entry.urls.find((rule) => rule.match !== 'never' && rule.match !== 'regex')?.value
    if (!first) return

    const link = formatLink(first)
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  onKeyDown(entry: Entry, event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'e':
          event.preventDefault()
          this.startEdit()
          break
        case 'c':
          event.preventDefault()
          void this.copyPassword(entry)
          break
        case 'u':
          event.preventDefault()
          this.copyUsername(entry)
          break
        case 'o':
          event.preventDefault()
          this.openFirstUrl(entry)
          break
      }
    }

    if (event.key === 'Escape') {
      this.closeAllDetails()
    }
  }

  closeAllDetails(): void {
    if (this.isNoteDetailsOpen()) {
      this.isNoteDetailsOpen.set(false)
    }
  }

  onNoteToggle(event: Event): void {
    event.preventDefault()
  }

  getPasswordValueProvider(entry: Entry): () => Promise<string> {
    return async () => this.readPassword(entry)
  }

  protected getAvatarBg(text: string): string {
    const seed = (text || '?').trim().toLowerCase()
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i)
      hash |= 0
    }
    const hue = Math.abs(hash) % 360
    return `oklch(0.65 0.15 ${hue})`
  }

  private shouldUseMobileMovePicker(): boolean {
    try {
      return getAppContext().store.layoutMode() === 'mobile'
    } catch {
      return window.matchMedia('(max-width: 720px)').matches
    }
  }

  private async readPassword(entry: Entry): Promise<string> {
    await entry.flushPendingPersistence()
    return (await entry.password()) ?? ''
  }

  private async readNote(entry: Entry): Promise<string> {
    await entry.flushPendingPersistence()
    return (await entry.note()) ?? ''
  }
}
