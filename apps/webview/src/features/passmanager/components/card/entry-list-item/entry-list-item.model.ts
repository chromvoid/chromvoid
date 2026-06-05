import {atom, computed, peek} from '@reatom/core'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {copyWithAutoWipe, DEFAULT_CLIPBOARD_WIPE_MS} from '@project/passmanager/password-utils'
import {credentialTagKey, normalizeCredentialTags} from '@project/passmanager/tags'
import {defaultLogger} from 'root/core/logger'
import {pmCredentialSecurityAuditModel} from '../../../models/pm-credential-security-audit.model'
import {pmEntryMoveModel} from '../../../models/pm-entry-move-model'
import {isPassmanagerReadOnlyOrMissing} from '../../../models/pm-root.adapter'
import {pmSelectionModeModel} from '../../../models/pm-selection-mode.model'
import {pmModel} from '../../../password-manager.model'

export type SwipeState = 'idle' | 'tracking' | 'open-left' | 'open-right'
type SwipeDirection = 'horizontal' | 'vertical' | null

export interface SwipeMoveResult {
  offset: number
  preventDefault: boolean
}

export interface SwipeFinishResult {
  state: SwipeState
  offset: number
  emitSwipeOpen: boolean
}

export type PMEntryListBadgeFamily = 'attribute' | 'risk' | 'meta'

export type PMEntryListBadgeSeverity = 'neutral' | 'warning' | 'critical'

export type PMEntryListBadge = {
  id: string
  family: PMEntryListBadgeFamily
  severity: PMEntryListBadgeSeverity
  label: string
  icon: string
  priority: number
}

export type PMEntryListEntryType = 'login' | 'payment_card'

export type PMEntryListPresentation = {
  entryType: PMEntryListEntryType
  title: string
  subtitle: string
  badges: PMEntryListBadge[]
  typeMarker: PMEntryListBadge | null
  visibleBadges: PMEntryListBadge[]
  overflowCount: number
  rowActionLabel: string
  rowActionIcon: string
}

export type PMEntryListMobilePresentation = PMEntryListPresentation & {
  statusBadges: PMEntryListBadge[]
  visibleTextBadges: PMEntryListBadge[]
  textOverflowCount: number
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

  readonly swipeOffsetX = atom(0, 'passmanager.entryListItem.swipeOffsetX')
  readonly swipeState = atom<SwipeState>('idle', 'passmanager.entryListItem.swipeState')
  readonly swipeSettling = atom(false, 'passmanager.entryListItem.swipeSettling')

  private swipeStartX = 0
  private swipeStartY = 0
  private swipeBaseOffset = 0
  private swipeDirection: SwipeDirection = null

  static readonly SWIPE_ACTION_WIDTH = 64
  static readonly SWIPE_SNAP_THRESHOLD = 28
  static readonly SWIPE_DRAG_FACTOR = 0.84
  private static readonly SWIPE_MOVE_GUARD = 10
  get isSwipeOpen() {
    return this.swipeState() === 'open-left' || this.swipeState() === 'open-right'
  }

  get isSwipeTracking() {
    return this.swipeState() === 'tracking'
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
    return this.isSelected() || this.areSecondaryActionsVisible() || this.shouldAlwaysShowActions()
  }

  getPresentation(entry: Entry): PMEntryListPresentation {
    const entryType = this.getEntryType(entry)
    const badges = this.getEntryBadges(entry)
    const typeMarker = this.getTypeMarker(entryType, badges)
    const {visibleBadges, overflowCount} = this.getVisibleBadges(badges)

    return {
      entryType,
      title: entry.title || i18n('no_title'),
      subtitle: this.getSubtitle(entry),
      badges,
      typeMarker,
      visibleBadges,
      overflowCount,
      rowActionLabel: i18n('button:more_actions'),
      rowActionIcon: 'more-vertical',
    }
  }

  getMobilePresentation(entry: Entry): PMEntryListMobilePresentation {
    const presentation = this.getPresentation(entry)
    const textBadges = presentation.badges.filter((badge) => badge.family === 'meta')
    const visibleTextBadgeLimit = presentation.entryType === 'payment_card' ? 1 : 2
    const visibleTextBadges = textBadges.slice(0, visibleTextBadgeLimit)

    return {
      ...presentation,
      statusBadges: presentation.badges.filter((badge) => {
        if (badge.family === 'meta') return false
        return presentation.typeMarker ? badge.id !== presentation.typeMarker.id : true
      }),
      visibleTextBadges,
      textOverflowCount: Math.max(0, textBadges.length - visibleTextBadges.length),
    }
  }

  private getEntryType(entry: Entry): PMEntryListEntryType {
    return entry.entryType === 'payment_card' ? 'payment_card' : 'login'
  }

  private getTypeMarker(entryType: PMEntryListEntryType, badges: PMEntryListBadge[]): PMEntryListBadge | null {
    if (entryType !== 'payment_card') return null
    return badges.find((badge) => badge.id === 'card') ?? null
  }

  getEntryBadges(entry: Entry): PMEntryListBadge[] {
    const tagBadges = this.getTagBadges(entry)

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
        ...tagBadges,
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

    badges.push(...tagBadges)

    return badges.sort((left, right) => left.priority - right.priority)
  }

  private getTagBadges(entry: Entry): PMEntryListBadge[] {
    return normalizeCredentialTags(entry.tags)
      .slice(0, 2)
      .map((tag, index) => ({
        id: `tag:${credentialTagKey(tag)}`,
        family: 'meta' as const,
        severity: 'neutral' as const,
        label: tag,
        icon: 'tag',
        priority: 80 + index,
      }))
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
      const cardPan = await entry.cardPan()
      if (cardPan != null) {
        await this.copyText(cardPan, 'copyPassword.cardPan')
      }
      return
    }

    const pwd = await entry.password()
    if (pwd != null) {
      await this.copyText(pwd, 'copyPassword')
    }
  }

  private async copyText(text: string, context: string): Promise<boolean> {
    if (!text) return false

    try {
      await copyWithAutoWipe(text, DEFAULT_CLIPBOARD_WIPE_MS)
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
    const touch = event.touches[0]
    if (!touch) return

    this.swipeStartX = touch.clientX
    this.swipeStartY = touch.clientY
    this.swipeDirection = null
    this.swipeBaseOffset = this.swipeOffsetX()

    if (this.isSwipeOpen) return
  }

  onTouchMove(event: TouchEvent): SwipeMoveResult | null {
    const touch = event.touches[0]
    if (!touch) return null

    const dx = touch.clientX - this.swipeStartX
    const dy = touch.clientY - this.swipeStartY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (
      this.swipeDirection === null &&
      (absDx > PMEntryListItemModel.SWIPE_MOVE_GUARD || absDy > PMEntryListItemModel.SWIPE_MOVE_GUARD)
    ) {
      this.swipeDirection = absDx > absDy ? 'horizontal' : 'vertical'

      if (this.swipeDirection === 'horizontal') {
        this.swipeBaseOffset = this.swipeOffsetX()
      }
    }

    if (this.swipeDirection !== 'horizontal') return null

    this.swipeState.set('tracking')
    this.swipeSettling.set(false)

    const W = PMEntryListItemModel.SWIPE_ACTION_WIDTH
    let offset = this.swipeBaseOffset + dx * PMEntryListItemModel.SWIPE_DRAG_FACTOR
    offset = Math.max(-W, Math.min(W, offset))
    this.swipeOffsetX.set(offset)

    return {offset, preventDefault: true}
  }

  shouldCancelLongPress(event: TouchEvent): boolean {
    const touch = event.touches[0]
    if (!touch) return false

    const dx = Math.abs(touch.clientX - this.swipeStartX)
    const dy = Math.abs(touch.clientY - this.swipeStartY)
    return dx > PMEntryListItemModel.SWIPE_MOVE_GUARD || dy > PMEntryListItemModel.SWIPE_MOVE_GUARD
  }

  onTouchEnd(): SwipeFinishResult | null {
    if (!this.isSwipeTracking) {
      this.swipeDirection = null
      return null
    }

    const W = PMEntryListItemModel.SWIPE_ACTION_WIDTH
    const T = PMEntryListItemModel.SWIPE_SNAP_THRESHOLD
    const offset = this.swipeOffsetX()

    if (offset < -T) {
      this.swipeOffsetX.set(-W)
      this.swipeState.set('open-left')
      this.swipeSettling.set(true)
      return {state: 'open-left', offset: -W, emitSwipeOpen: true}
    }

    if (offset > T) {
      this.swipeOffsetX.set(W)
      this.swipeState.set('open-right')
      this.swipeSettling.set(true)
      return {state: 'open-right', offset: W, emitSwipeOpen: true}
    }

    this.swipeOffsetX.set(0)
    this.swipeState.set('idle')
    this.swipeSettling.set(true)
    this.swipeDirection = null
    return {state: 'idle', offset: 0, emitSwipeOpen: false}
  }

  closeSwipe(): boolean {
    if (this.swipeState() === 'idle') return false

    this.swipeOffsetX.set(0)
    this.swipeBaseOffset = 0
    this.swipeState.set('idle')
    this.swipeSettling.set(true)
    this.swipeDirection = null
    return true
  }

  finishSwipeTransition(): void {
    this.swipeSettling.set(false)
  }

  dispose() {
    this.closeSwipe()
    this.areSecondaryActionsVisible.set(false)
    this.swipeStartX = 0
    this.swipeStartY = 0
    this.swipeDirection = null
    this.swipeSettling.set(false)
  }

  private shouldAlwaysShowActions(): boolean {
    try {
      return window.matchMedia('(hover: none) and (pointer: coarse)').matches
    } catch {
      return false
    }
  }
}
