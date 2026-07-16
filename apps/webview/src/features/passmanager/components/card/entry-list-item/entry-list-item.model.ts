import {atom, computed, peek, wrap} from '@reatom/core'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {copyWithAutoWipe, DEFAULT_CLIPBOARD_WIPE_MS} from '@project/passmanager/password-utils'
import {credentialTagKey, normalizeCredentialTags, type CredentialTagColorId} from '@project/passmanager/tags'
import {defaultLogger} from 'root/core/logger'
import {pmCredentialTagsModel} from '../../../models/pm-credential-tags.model'
import {pmCredentialSecurityAuditModel} from '../../../models/pm-credential-security-audit.model'
import {pmEntryMoveModel} from '../../../models/pm-entry-move-model'
import {isPassmanagerReadOnlyOrMissing} from '../../../models/pm-root.adapter'
import {pmSelectionModeModel} from '../../../models/pm-selection-mode.model'
import {pmModel} from '../../../password-manager.model'
import {
  PMMobileRowSwipeModel,
  type PMMobileRowSwipeFinishResult,
  type PMMobileRowSwipeMoveResult,
  type PMMobileRowSwipeState,
} from '../../list/mobile-row-swipe.model'

export type SwipeState = PMMobileRowSwipeState
export type SwipeMoveResult = PMMobileRowSwipeMoveResult
export type SwipeFinishResult = PMMobileRowSwipeFinishResult

export type PMEntryListBadgeFamily = 'attribute' | 'risk' | 'meta'

export type PMEntryListBadgeSeverity = 'neutral' | 'warning' | 'critical'

export type PMEntryListBadge = {
  id: string
  family: PMEntryListBadgeFamily
  severity: PMEntryListBadgeSeverity
  label: string
  icon: string
  priority: number
  tagColorId?: CredentialTagColorId
}

export type PMEntryListEntryType = 'login' | 'payment_card'
export type PMEntryListItemViewMode = 'default' | 'compact' | 'dense' | 'workbench'

type PMEntryListTagSnippetPresentation = {
  mobile: {
    badges: PMEntryListBadge[]
    overflowCount: number
  }
  desktop: {
    badges: PMEntryListBadge[]
    narrowOverflowCount: number
    wideOverflowCount: number
  }
}

export type PMEntryListPresentation = {
  entryType: PMEntryListEntryType
  kindLabel: string
  title: string
  subtitle: string
  modifiedFormatted: string
  modifiedTimestamp: number
  badges: PMEntryListBadge[]
  typeMarker: PMEntryListBadge | null
  visibleBadges: PMEntryListBadge[]
  overflowCount: number
  tagSnippet: PMEntryListTagSnippetPresentation
  rowActionLabel: string
  rowActionIcon: string
}

export type PMEntryListMobilePresentation = PMEntryListPresentation & {
  statusBadges: PMEntryListBadge[]
}

export class PMEntryListItemModel {
  readonly entry = atom<Entry | undefined>(undefined)
  private readonly logger = defaultLogger

  readonly isSelected = computed(() => this.entry()?.isSelected() || false)
  readonly areSecondaryActionsVisible = atom(false)
  readonly activeRow = atom(false, 'passmanager.entryListItem.activeRow')
  readonly rowTabIndex = atom(0, 'passmanager.entryListItem.rowTabIndex')
  readonly manageActiveRowState = atom(false, 'passmanager.entryListItem.manageActiveRowState')
  readonly selectionStateManaged = atom(false, 'passmanager.entryListItem.selectionStateManaged')
  readonly selectionActive = atom(false, 'passmanager.entryListItem.selectionActive')
  readonly selectedInSelectionMode = atom(false, 'passmanager.entryListItem.selectedInSelectionMode')

  readonly isRowSelected = computed(() => {
    if (this.selectionStateManaged()) {
      return this.selectedInSelectionMode()
    }

    const entry = this.entry()
    if (pmSelectionModeModel.active() && entry) {
      return pmSelectionModeModel.isEntrySelected(entry.id)
    }

    return this.isSelected()
  }, 'passmanager.entryListItem.isRowSelected')

  readonly effectiveRowTabIndex = computed(() => {
    return this.manageActiveRowState() ? this.rowTabIndex() : 0
  }, 'passmanager.entryListItem.effectiveRowTabIndex')

  readonly effectiveActionTabIndex = computed(() => {
    return this.manageActiveRowState() ? (this.activeRow() ? 0 : -1) : 0
  }, 'passmanager.entryListItem.effectiveActionTabIndex')

  readonly hasUsername = computed(() => {
    const username = this.entry()?.username
    return Boolean(username && username.trim().length > 0)
  })

  readonly hasOtp = computed(() => (this.entry()?.otps().length ?? 0) > 0)

  readonly hasSshKeys = computed(() => (this.entry()?.sshKeys.length ?? 0) > 0)

  // ── Swipe state ──

  private readonly swipe = new PMMobileRowSwipeModel({
    atomPrefix: 'passmanager.entryListItem.swipe',
  })
  readonly swipeOffsetX = this.swipe.offsetX
  readonly swipeState = this.swipe.state
  readonly swipeSettling = this.swipe.settling

  get isSwipeOpen() {
    return this.swipe.isOpen
  }

  get isSwipeTracking() {
    return this.swipe.isTracking
  }

  setEntry(entry: Entry | undefined): void {
    this.entry.set(entry)
  }

  setSecondaryActionsVisible(visible: boolean): void {
    this.areSecondaryActionsVisible.set(visible)
  }

  setActiveRow(value: boolean): void {
    this.activeRow.set(Boolean(value))
  }

  setRowTabIndex(value: number): void {
    this.rowTabIndex.set(Number(value))
  }

  setManageActiveRowState(value: boolean): void {
    this.manageActiveRowState.set(Boolean(value))
  }

  setSelectionStateManaged(value: boolean): void {
    this.selectionStateManaged.set(Boolean(value))
  }

  setSelectionActive(value: boolean): void {
    this.selectionActive.set(Boolean(value))
  }

  setSelectedInSelectionMode(value: boolean): void {
    this.selectedInSelectionMode.set(Boolean(value))
  }

  shouldRenderSecondaryActions(): boolean {
    return this.isSelected() || this.areSecondaryActionsVisible()
  }

  getPresentation(entry: Entry): PMEntryListPresentation {
    const entryType = this.getEntryType(entry)
    const badges = this.getEntryBadges(entry)
    const typeMarker = this.getTypeMarker(entryType, badges)
    const {visibleBadges, overflowCount} = this.getVisibleBadges(badges)
    const tagSnippet = this.getTagSnippetPresentation(entry)

    return {
      entryType,
      kindLabel: this.getEntryTypeLabel(entryType),
      title: entry.title || i18n('no_title'),
      subtitle: this.getSubtitle(entry),
      modifiedFormatted: entry.updatedFormatted,
      modifiedTimestamp: entry.updatedTs,
      badges,
      typeMarker,
      visibleBadges,
      overflowCount,
      tagSnippet,
      rowActionLabel: i18n('button:more_actions'),
      rowActionIcon: 'more-vertical',
    }
  }

  getMobilePresentation(entry: Entry): PMEntryListMobilePresentation {
    const presentation = this.getPresentation(entry)

    return {
      ...presentation,
      statusBadges: presentation.badges.filter((badge) =>
        presentation.typeMarker ? badge.id !== presentation.typeMarker.id : true,
      ),
    }
  }

  private getEntryType(entry: Entry): PMEntryListEntryType {
    return entry.entryType === 'payment_card' ? 'payment_card' : 'login'
  }

  private getEntryTypeLabel(entryType: PMEntryListEntryType): string {
    return entryType === 'payment_card' ? i18n('entry:type:payment_card') : i18n('entry:type:login')
  }

  private getTypeMarker(
    entryType: PMEntryListEntryType,
    badges: PMEntryListBadge[],
  ): PMEntryListBadge | null {
    if (entryType !== 'payment_card') return null
    return badges.find((badge) => badge.id === 'card') ?? null
  }

  getEntryBadges(entry: Entry): PMEntryListBadge[] {
    if (entry.entryType === 'payment_card') {
      return [
        {
          id: 'card',
          family: 'attribute',
          severity: 'neutral',
          label: i18n('entry:badge:card'),
          icon: 'credit-card',
          priority: 32,
        },
      ]
    }

    const badges: PMEntryListBadge[] = []
    const auditState = pmCredentialSecurityAuditModel.getEntryState(entry)

    if (auditState?.weakPassword) {
      badges.push({
        id: 'weak_password',
        family: 'risk',
        severity: 'critical',
        label: i18n('entry:badge:weak_password'),
        icon: 'alert-triangle',
        priority: 10,
      })
    }

    if (auditState?.reusedPassword) {
      badges.push({
        id: 'reused_password',
        family: 'risk',
        severity: 'warning',
        label: i18n('entry:badge:reused_password'),
        icon: 'arrow-repeat',
        priority: 20,
      })
    }

    if (entry.otps().length > 0) {
      badges.push({
        id: 'two_factor',
        family: 'attribute',
        severity: 'neutral',
        label: i18n('entry:badge:two_factor'),
        icon: 'shield-check',
        priority: 30,
      })
    }

    if (entry.sshKeys.length > 0) {
      badges.push({
        id: 'ssh',
        family: 'attribute',
        severity: 'neutral',
        label: i18n('entry:badge:ssh'),
        icon: 'key',
        priority: 32,
      })
    }

    return badges.sort((left, right) => left.priority - right.priority)
  }

  private getTagSnippetPresentation(entry: Entry): PMEntryListTagSnippetPresentation {
    const tags = normalizeCredentialTags(entry.tags)
    const badges = tags.slice(0, 3).map((tag, index) => ({
      id: `tag:${credentialTagKey(tag)}`,
      family: 'meta' as const,
      severity: 'neutral' as const,
      label: tag,
      icon: 'tag',
      priority: 80 + index,
      tagColorId: pmCredentialTagsModel.resolveTagColorId(tag),
    }))

    return {
      mobile: {
        badges: badges.slice(0, 1),
        overflowCount: Math.max(0, tags.length - 1),
      },
      desktop: {
        badges,
        narrowOverflowCount: Math.max(0, tags.length - 2),
        wideOverflowCount: Math.max(0, tags.length - 3),
      },
    }
  }

  getVisibleBadges(badges: PMEntryListBadge[]): {visibleBadges: PMEntryListBadge[]; overflowCount: number} {
    const sorted = [...badges].sort((left, right) => left.priority - right.priority)
    const visibleBadges = sorted.slice(0, 2)
    return {
      visibleBadges,
      overflowCount: Math.max(0, sorted.length - visibleBadges.length),
    }
  }

  getSubtitle(entry: Entry): string {
    if (entry.entryType === 'payment_card') {
      const last4 = entry.paymentCard?.last4?.trim()
      return last4 ? `•••• ${last4}` : ''
    }

    return entry.username ?? ''
  }

  openEntry(event: Event): void {
    event.preventDefault()

    if (this.isSwipeOpen) {
      this.closeSwipe()
      return
    }

    const entry = peek(this.entry)
    if (!entry) {
      return
    }

    pmModel.openItem(entry)
  }

  async copyUsername(event: Event): Promise<void> {
    event.stopPropagation()

    const username = peek(this.entry)?.username
    if (!username) {
      return
    }

    await this.copyText(username, 'copyUsername')
  }

  showRowActions(event: Event): void {
    event.preventDefault()
    event.stopPropagation()
    this.setSecondaryActionsVisible(true)
  }

  async copyPassword(event: Event): Promise<void> {
    event.stopPropagation()

    const entry = peek(this.entry)
    if (!entry) {
      return
    }

    if (entry.entryType === 'payment_card') {
      const cardPan = await wrap(entry.cardPan())
      if (cardPan != null) {
        await this.copyText(cardPan, 'copyPassword.cardPan')
      }
      return
    }

    const pwd = await wrap(entry.password())
    if (pwd != null) {
      await this.copyText(pwd, 'copyPassword')
    }
  }

  private async copyText(text: string, context: string): Promise<boolean> {
    if (!text) return false

    try {
      await wrap(copyWithAutoWipe(text, DEFAULT_CLIPBOARD_WIPE_MS))
      return true
    } catch (error) {
      this.logger.warn('[PassManager][EntryListItem] copy failed', {
        context,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      return false
    }
  }

  isDragEnabled(entry: Entry): boolean {
    if (isPassmanagerReadOnlyOrMissing()) return false
    if (!pmEntryMoveModel.isDesktopDragEnabled()) return false

    return Boolean(entry.id)
  }

  startDrag(event: DragEvent): void {
    const entry = peek(this.entry)
    if (!(entry instanceof Entry)) {
      event.preventDefault()
      return
    }

    const target = event.target
    if (target instanceof HTMLElement && target.closest('.item-actions, .action-button')) {
      event.preventDefault()
      return
    }

    pmEntryMoveModel.startDrag(entry.id)
    pmEntryMoveModel.setDragData(event, entry.id)
  }

  endDrag(): void {
    pmEntryMoveModel.clearDragState()
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.openEntry(event)
    }
  }

  // ── Touch / swipe / long-press ──

  startTouch(event: TouchEvent) {
    this.swipe.startTouch(event)
  }

  onTouchMove(event: TouchEvent): SwipeMoveResult | null {
    return this.swipe.moveTouch(event)
  }

  shouldCancelLongPress(event: TouchEvent): boolean {
    return this.swipe.shouldCancelLongPress(event)
  }

  onTouchEnd(): SwipeFinishResult | null {
    return this.swipe.finishTouch()
  }

  closeSwipe(): boolean {
    return this.swipe.close()
  }

  finishSwipeTransition(): void {
    this.swipe.finishTransition()
  }

  dispose() {
    this.swipe.dispose()
    this.areSecondaryActionsVisible.set(false)
  }
}
