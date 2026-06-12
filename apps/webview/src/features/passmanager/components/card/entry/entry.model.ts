import {action, atom, wrap, type Atom} from '@reatom/core'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {DEFAULT_CLIPBOARD_WIPE_MS, copyWithAutoWipe} from '@project/passmanager/password-utils'
import {formatLink} from '@project/passmanager/urls'
import {defaultLogger} from 'root/core/logger'
import {getAppContext} from 'root/shared/services/app-context'
import {openExternalBrowserUrl} from 'root/shared/services/external-browser'
import type {PMDesktopToolbarActionSpec} from '../../desktop-toolbar'
import type {PMWorkspaceContextItem} from '../pm-workspace-header'
import {pmEntryEditorModel} from '../../../models/pm-entry-editor.model'
import {pmDeleteMotionModel} from '../../../models/pm-delete-motion.model'
import {pmEntryMoveModel} from '../../../models/pm-entry-move-model'
import {
  getPassmanagerRoot,
  getPassmanagerShowElement,
  isPassmanagerReadOnlyOrMissing,
} from '../../../models/pm-root.adapter'
import type {PaymentCardBrand} from '@project/passmanager/types'
import {openPassmanagerMoveDialog} from '../../../service/passmanager-move-dialog'
import {
  PMEntrySessionModel,
  type PMEntrySessionActions,
  type PMEntrySessionController,
  type PMEntrySessionState,
} from './entry-session.model'

export type PMEntryActionUrl = {
  value: string
  openable: boolean
  href: string
}

export type PMEntryHeaderBadge = {
  variant: 'success' | 'primary' | 'warning' | 'neutral'
  icon: string
  text: string
}

export type PMEntryRenderData = {
  entryType: 'login' | 'payment_card'
  contextLabel: string
  contextItems: PMWorkspaceContextItem[]
  entryTitleText: string
  entryAvatarLetter: string
  avatarBg: string
  headerBadges: PMEntryHeaderBadge[]
  hasOtps: boolean
  visibleUrls: PMEntryActionUrl[]
  hasUrls: boolean
  paymentCardBrandLabel: string
  paymentCardholderName: string
  paymentCardLast4: string
  paymentCardExpiryLabel: string
  hasPaymentCardCvv: boolean
  tags: string[]
  hasTags: boolean
}

export interface PMEntryState extends PMEntrySessionState {
  readonly isNoteDetailsOpen: Atom<boolean>
  readonly isCardCvvRevealed: Atom<boolean>
}

export interface PMEntryActions extends PMEntrySessionActions {
  attach(entry: Entry): void
  detach(): void
  disconnect(): void
  setNoteDetailsOpen(next: boolean): void
  setCardCvvRevealed(next: boolean): void
  toggleCardCvvRevealed(): void
  onEditEnd(): void
  moveCard(entry: Entry): Promise<void>
  copyAll(entry: Entry): Promise<void>
  copyUsername(entry: Entry): Promise<void>
  copyPassword(entry: Entry): Promise<void>
  copyCardCvv(entry: Entry): Promise<void>
  copyOTP(entry: Entry): Promise<void>
  startEdit(): void
  removeEntry(entry: Entry): void
  openUrl(href: string): void
  openFirstUrl(entry: Entry): void
  onKeyDown(entry: Entry, event: KeyboardEvent): void
  closeAllDetails(): void
  onNoteToggle(event: Event): void
}

export interface PMEntryContracts<TEntryData = PMEntryRenderData> {
  getEntryData(entry: Entry): TEntryData
}

export type PMEntryDesktopToolbarAction = 'edit-entry' | 'move-entry' | 'delete-entry'

function formatPaymentCardBrand(brand: PaymentCardBrand | undefined): string {
  switch (brand) {
    case 'visa':
      return 'Visa'
    case 'mastercard':
      return 'Mastercard'
    case 'amex':
      return 'AmEx'
    case 'mir':
      return 'MIR'
    case 'unionpay':
      return 'UnionPay'
    default:
      return 'Card'
  }
}

function formatPaymentCardExpiry(entry: Entry): string {
  const paymentCard = entry.paymentCard
  if (!paymentCard) return '—'

  return `${String(paymentCard.expMonth).padStart(2, '0')}/${String(paymentCard.expYear).slice(-2)}`
}

export class PMEntryModel implements PMEntrySessionController {
  private readonly logger = defaultLogger
  private readonly session = new PMEntrySessionModel()
  private readonly isNoteDetailsOpenAtom = atom(false, 'passmanager.entry.isNoteDetailsOpen')
  private readonly isCardCvvRevealedAtom = atom(false, 'passmanager.entry.isCardCvvRevealed')
  private readonly attachedEntryIdAtom = atom<string | undefined>(undefined, 'passmanager.entry.attachedEntryId')

  state: PMEntryState = {
    ...this.session.state,
    isNoteDetailsOpen: this.isNoteDetailsOpenAtom,
    isCardCvvRevealed: this.isCardCvvRevealedAtom,
  }

  startEntryEdit(): void {
    const current = getPassmanagerShowElement()
    if (!(current instanceof Entry)) {
      return
    }

    pmEntryEditorModel.openSurface(current.id, current.entryType === 'payment_card' ? 'payment-card' : 'entry')
  }

  deleteEntryCard(entry: Entry): void {
    pmDeleteMotionModel.markPending([entry])
    void this.finishEntryDelete(entry)
  }

  private async finishEntryDelete(entry: Entry): Promise<void> {
    try {
      await wrap(entry.remove())
    } catch (error) {
      this.logger.warn('[PassManager][Entry] delete failed', {
        errorName: error instanceof Error ? error.name : typeof error,
      })
    }

    const root = getPassmanagerRoot()
    if (root?.getCardByID?.(entry.id) === entry) {
      pmDeleteMotionModel.clearPending([entry.id])
    }
  }

  isDesktopToolbarAction(value: string | undefined): value is PMEntryDesktopToolbarAction {
    return value === 'edit-entry' || value === 'move-entry' || value === 'delete-entry'
  }

  getDesktopToolbarActions(): PMDesktopToolbarActionSpec<PMEntryDesktopToolbarAction>[] {
    const isReadOnly = isPassmanagerReadOnlyOrMissing()

    return [
      {
        id: 'edit-entry',
        icon: 'pencil-square',
        label: i18n('button:edit'),
        disabled: isReadOnly,
        iconOnly: true,
        appearance: 'ghost',
      },
      {
        id: 'move-entry',
        icon: 'folder-symlink',
        label: i18n('button:move'),
        disabled: isReadOnly,
        iconOnly: true,
      },
      {
        id: 'delete-entry',
        icon: 'trash',
        label: i18n('button:remove'),
        disabled: isReadOnly,
        danger: true,
        iconOnly: true,
      },
    ]
  }

  executeDesktopToolbarAction(action: PMEntryDesktopToolbarAction, entry: Entry): void {
    switch (action) {
      case 'edit-entry':
        this.startEntryEdit()
        return
      case 'move-entry':
        void this.moveEntryCard(entry)
        return
      case 'delete-entry':
        this.deleteEntryCard(entry)
        return
    }
  }

  async moveEntryCard(entry: Entry): Promise<void> {
    if (isPassmanagerReadOnlyOrMissing()) return

    const sourceTargetId = pmEntryMoveModel.getEntryParentTargetId(entry)
    const firstAllowedTarget = pmEntryMoveModel.listTargets().find((target) => target.id !== sourceTargetId)
    await openPassmanagerMoveDialog({
      entryId: entry.id,
      onConfirm: (targetId) => pmEntryMoveModel.moveEntry(entry, targetId),
      selectedId: firstAllowedTarget?.id ?? sourceTargetId,
      useMobilePicker: this.shouldUseMobileMovePicker(),
    })
  }

  actions: PMEntryActions = {
    ...this.session.actions,
    attach: action((entry: Entry) => {
      const previousEntryId = this.attachedEntryIdAtom()
      this.session.actions.attach(entry)
      this.attachedEntryIdAtom.set(entry.id)
      if (previousEntryId !== entry.id) {
        this.isCardCvvRevealedAtom.set(false)
      }
    }, 'passmanager.entry.attach'),

    detach: action(() => {
      this.attachedEntryIdAtom.set(undefined)
      this.isCardCvvRevealedAtom.set(false)
      this.session.actions.detach()
    }, 'passmanager.entry.detach'),

    disconnect: action(() => {
      this.attachedEntryIdAtom.set(undefined)
      this.isCardCvvRevealedAtom.set(false)
      this.session.actions.disconnect()
    }, 'passmanager.entry.disconnect'),

    setNoteDetailsOpen: action((next: boolean) => {
      this.isNoteDetailsOpenAtom.set(next)
    }, 'passmanager.entry.setNoteDetailsOpen'),

    setCardCvvRevealed: action((next: boolean) => {
      if (!next) {
        this.isCardCvvRevealedAtom.set(false)
        return
      }

      const cardCvvResource = this.state.cardCvvResource()
      if (cardCvvResource.status === 'ready' && cardCvvResource.value) {
        this.isCardCvvRevealedAtom.set(true)
      }
    }, 'passmanager.entry.setCardCvvRevealed'),

    toggleCardCvvRevealed: action(() => {
      this.actions.setCardCvvRevealed(!this.isCardCvvRevealedAtom())
    }, 'passmanager.entry.toggleCardCvvRevealed'),

    onEditEnd: action(() => {
      const current = getPassmanagerShowElement()
      if (current instanceof Entry) {
        pmEntryEditorModel.closeSurface(current.id)
        return
      }

      pmEntryEditorModel.closeSurface()
    }, 'passmanager.entry.onEditEnd'),

    moveCard: action(async (entry: Entry) => {
      await this.moveEntryCard(entry)
    }, 'passmanager.entry.moveCard'),

    copyAll: action(async (entry: Entry) => {
      if (entry.entryType === 'payment_card') {
        const cardPan = await this.readCardPan(entry)
        const cardCvv = await this.readCardCvv(entry)
        const parts: string[] = []
        parts.push(`[${i18n('title')}] ${entry.title || '-'}`)
        parts.push(`[${i18n('payment-card:copy-cardholder')}] ${entry.paymentCard?.cardholderName || '-'}`)
        parts.push(`[${i18n('payment-card:copy-number')}] ${cardPan || '—'}`)
        parts.push(`[${i18n('payment-card:copy-expiry')}] ${formatPaymentCardExpiry(entry)}`)
        if (cardCvv) {
          parts.push(`[CVV] ${cardCvv}`)
        }
        await this.copyText(parts.join('\n'), 'copyAll')
        return
      }

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
      await this.copyText(parts.join('\n'), 'copyAll')
    }, 'passmanager.entry.copyAll'),

    copyUsername: action(async (entry: Entry) => {
      if (!entry.username) return
      await this.copyText(entry.username, 'copyUsername')
    }, 'passmanager.entry.copyUsername'),

    copyPassword: action(async (entry: Entry) => {
      if (entry.entryType === 'payment_card') {
        const cardPan = this.state.cardPan() ?? await this.readCardPan(entry)
        if (!cardPan) return
        await this.copyText(cardPan, 'copyPassword.cardPan')
        return
      }

      const password = this.state.password() ?? await this.readPassword(entry)
      if (!password) return
      await this.copyText(password, 'copyPassword')
    }, 'passmanager.entry.copyPassword'),

    copyCardCvv: action(async (entry: Entry) => {
      if (entry.entryType !== 'payment_card') return

      const cardCvv = await this.readCardCvv(entry)
      if (!cardCvv) return
      await this.copyText(cardCvv, 'copyCardCvv')
    }, 'passmanager.entry.copyCardCvv'),

    copyOTP: action(async (entry: Entry) => {
      const otps = entry.otps()
      const firstOtp = otps.length > 0 ? otps[0] : undefined
      if (!firstOtp) return

      try {
        const code = await firstOtp.loadCode()
        if (code) {
          await this.copyText(code, 'copyOtp')
        }
      } catch {}
    }, 'passmanager.entry.copyOtp'),

    startEdit: action(() => {
      this.startEntryEdit()
    }, 'passmanager.entry.startEdit'),

    removeEntry: action((entry: Entry) => {
      this.deleteEntryCard(entry)
    }, 'passmanager.entry.removeEntry'),

    openUrl: action((href: string) => {
      void Promise.resolve(openExternalBrowserUrl(href)).catch((error: unknown) => {
        this.logger.warn('[PassManager][Entry] external URL open failed', {
          errorName: error instanceof Error ? error.name : typeof error,
        })
      })
    }, 'passmanager.entry.openUrl'),

    openFirstUrl: action((entry: Entry) => {
      const first = entry.urls.find((rule) => rule.match !== 'never' && rule.match !== 'regex')?.value
      if (!first) return

      this.actions.openUrl(formatLink(first))
    }, 'passmanager.entry.openFirstUrl'),

    onKeyDown: action((entry: Entry, event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'e':
            event.preventDefault()
            this.actions.startEdit()
            break
          case 'c':
            event.preventDefault()
            void this.actions.copyPassword(entry)
            break
          case 'u':
            event.preventDefault()
            this.actions.copyUsername(entry)
            break
          case 'o':
            event.preventDefault()
            this.actions.openFirstUrl(entry)
            break
        }
      }

      if (event.key === 'Escape') {
        this.actions.closeAllDetails()
      }
    }, 'passmanager.entry.onKeyDown'),

    closeAllDetails: action(() => {
      if (this.state.isNoteDetailsOpen()) {
        this.isNoteDetailsOpenAtom.set(false)
      }
      if (this.state.isCardCvvRevealed()) {
        this.isCardCvvRevealedAtom.set(false)
      }
    }, 'passmanager.entry.closeAllDetails'),

    onNoteToggle: action((event: Event) => {
      event.preventDefault()
    }, 'passmanager.entry.onNoteToggle'),
  }

  contracts: PMEntryContracts = {
    getEntryData: (entry: Entry) => this.buildEntryData(entry),
  }

  protected buildEntryData(card: Entry): PMEntryRenderData {
    const entryTitleText = card.title || i18n('no_title')
    const groupSegments = card.groupPath?.split('/').filter(Boolean) ?? []
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
    const headerBadges: PMEntryHeaderBadge[] = [
      {
        variant: 'success',
        icon: 'lock',
        text: i18n('entry:badge:encrypted'),
      },
    ]

    if (card.entryType === 'payment_card') {
      headerBadges.push({
        variant: 'primary',
        icon: 'credit-card',
        text: formatPaymentCardBrand(card.paymentCard?.brand),
      })

      if (card.paymentCard?.last4) {
        headerBadges.push({
          variant: 'neutral',
          icon: '123',
          text: `•••• ${card.paymentCard.last4}`,
        })
      }
    } else {
      if (card.otps().length > 0) {
        headerBadges.push({
          variant: 'primary',
          icon: 'shield-check',
          text: i18n('entry:badge:two_factor'),
        })
      }

      if (card.sshKeys.length > 0) {
        headerBadges.push({
          variant: 'warning',
          icon: 'key',
          text: i18n('ssh:short'),
        })
      }

      if (visibleUrls.length > 0) {
        headerBadges.push({
          variant: 'neutral',
          icon: 'globe',
          text: String(visibleUrls.length),
        })
      }
    }

    return {
      entryType: card.entryType,
      contextLabel: card.groupPath || i18n('group:scope-root'),
      contextItems: [
        {label: i18n('root:title-short'), value: ''},
        ...groupSegments.map((segment, index) => ({
          label: segment,
          value: groupSegments.slice(0, index + 1).join('/'),
        })),
        {label: entryTitleText, value: `entry:${card.id}`, current: true},
      ],
      entryTitleText,
      entryAvatarLetter: (entryTitleText.trim().charAt(0) || '?').toUpperCase(),
      avatarBg: this.getAvatarBg(entryTitleText),
      headerBadges,
      hasOtps: card.otps().length > 0,
      visibleUrls,
      hasUrls: visibleUrls.length > 0,
      paymentCardBrandLabel: formatPaymentCardBrand(card.paymentCard?.brand),
      paymentCardholderName: card.paymentCard?.cardholderName || '—',
      paymentCardLast4: card.paymentCard?.last4 || '',
      paymentCardExpiryLabel: formatPaymentCardExpiry(card),
      hasPaymentCardCvv: Boolean(this.state.cardCvv()),
      tags: card.tags,
      hasTags: card.tags.length > 0,
    }
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

  private async readCardPan(entry: Entry): Promise<string> {
    await entry.flushPendingPersistence()
    return (await entry.cardPan()) ?? ''
  }

  private async readCardCvv(entry: Entry): Promise<string> {
    await entry.flushPendingPersistence()
    return (await entry.cardCvv()) ?? ''
  }

  private async copyText(text: string, context: string): Promise<boolean> {
    if (!text) return false

    try {
      await copyWithAutoWipe(text, DEFAULT_CLIPBOARD_WIPE_MS)
      return true
    } catch (error) {
      this.logger.warn('[PassManager][Entry] copy failed', {
        context,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      return false
    }
  }
}
