import {action, atom, computed, peek, wrap} from '@reatom/core'

import {Entry, Group} from '@project/passmanager/core'

import {pmIconStore} from '../models/pm-icon-store'
import {subscribeToSignalChanges, type SubscribedSignal} from '../service/subscribed-signal'

export type PMAvatarItem = Entry | Group

export type PMAvatarErrorDetail = {
  src: string
  errorKey: string
}

export type PMAvatarIconRefSignal = SubscribedSignal<string | undefined>

export type PMAvatarIconRefSource = string | PMAvatarIconRefSignal

export type PMAvatarRenderState = {
  item: PMAvatarItem | undefined
  src: string
  backgroundColor: string
}

const DEFAULT_ICON = 'folder'

export class PMAvatarIconModel {
  private connected = false
  private iconStoreUnsubscribe: (() => void) | undefined
  private iconRefSourceUnsubscribe: (() => void) | undefined
  private itemIconRefUnsubscribe: (() => void) | undefined

  private readonly srcState = atom('', 'passmanager.avatar.src')
  private readonly altState = atom('', 'passmanager.avatar.alt')
  private readonly iconState = atom(DEFAULT_ICON, 'passmanager.avatar.icon')
  private readonly letterState = atom('', 'passmanager.avatar.letter')
  private readonly itemState = atom<PMAvatarItem | undefined>(undefined, 'passmanager.avatar.item')
  private readonly iconRefSourceState = atom<PMAvatarIconRefSource>('', 'passmanager.avatar.iconRef')
  private readonly errorKeyState = atom('', 'passmanager.avatar.errorKey')
  private readonly fallbackBgState = atom('', 'passmanager.avatar.fallbackBg')
  private readonly fallbackColorState = atom('', 'passmanager.avatar.fallbackColor')
  private readonly failedSrcState = atom('', 'passmanager.avatar.failedSrc')
  private readonly pendingIconRefState = atom('', 'passmanager.avatar.pendingIconRef')
  private readonly resolvedIconRefState = atom('', 'passmanager.avatar.resolvedIconRef')
  private readonly iconRefVersionState = atom(0, 'passmanager.avatar.iconRefVersion')
  private readonly iconStoreVersionState = atom(0, 'passmanager.avatar.iconStoreVersion')
  private readonly itemIconRefSignal = computed(
    () => this.normalizeString(this.itemState()?.iconRef ?? ''),
    'passmanager.avatar.itemIconRef',
  )

  readonly state = {
    src: this.srcState,
    alt: this.altState,
    icon: this.iconState,
    letter: this.letterState,
    item: this.itemState,
    iconRef: this.iconRefSourceState,
    errorKey: this.errorKeyState,
    fallbackBg: this.fallbackBgState,
    fallbackColor: this.fallbackColorState,
    failedSrc: this.failedSrcState,
    pendingIconRef: this.pendingIconRefState,
    resolvedIconRef: this.resolvedIconRefState,
    iconRefVersion: this.iconRefVersionState,
    iconStoreVersion: this.iconStoreVersionState,
    iconRefSourceValue: computed(() => this.resolveIconRefSource()),
    iconRefValue: computed(() => this.resolveIconRef()),
    iconSrcValue: computed(() => {
      this.iconStoreVersionState()
      const iconRef = this.normalizedResolvedIconRef()
      if (!iconRef) return ''
      return pmIconStore.getCachedUrl(iconRef) ?? ''
    }),
    renderState: computed((): PMAvatarRenderState => {
      this.iconStoreVersionState()
      const item = this.itemState()
      const manualSrc = this.normalizedSrc()
      if (manualSrc.length > 0) {
        return {item, src: manualSrc, backgroundColor: ''}
      }

      const iconRef = this.normalizedResolvedIconRef()
      const iconSrc = iconRef ? (pmIconStore.getCachedUrl(iconRef) ?? '') : ''
      const backgroundColor = iconRef ? (pmIconStore.getCachedBackgroundColor(iconRef) ?? '') : ''
      return {item, src: iconSrc, backgroundColor}
    }),
    letterValue: computed(() => this.resolveLetter()),
    fallbackIconValue: computed(() => this.resolveFallbackIcon()),
    fallbackBgValue: computed(() => this.resolveFallbackBg()),
    fallbackColorValue: computed(() => this.normalizedFallbackColor()),
  }

  readonly actions = {
    setSrc: action((value: string) => {
      const next = typeof value === 'string' ? value : ''
      if (next === this.srcState()) return
      this.srcState.set(next)
      this.resetImageState()
      this.scheduleIconLoad()
    }, 'passmanager.avatar.setSrc'),

    setAlt: action((value: string) => {
      const next = typeof value === 'string' ? value : ''
      if (next === this.altState()) return
      this.altState.set(next)
    }, 'passmanager.avatar.setAlt'),

    setIcon: action((value: string) => {
      const next = typeof value === 'string' ? value : ''
      if (next === this.iconState()) return
      this.iconState.set(next)
    }, 'passmanager.avatar.setIcon'),

    setLetter: action((value: string) => {
      const next = typeof value === 'string' ? value : ''
      if (next === this.letterState()) return
      this.letterState.set(next)
    }, 'passmanager.avatar.setLetter'),

    setItem: action((value: PMAvatarItem | undefined) => {
      const next = value instanceof Entry || value instanceof Group ? value : undefined
      if (next === this.itemState()) return
      this.itemState.set(next)
      this.refreshResolvedIconRef()
      this.resetImageState()
      this.scheduleIconLoad()
    }, 'passmanager.avatar.setItem'),

    setIconRef: action((value: PMAvatarIconRefSource) => {
      const next = typeof value === 'function' || typeof value === 'string' ? value : ''
      if (next === this.iconRefSourceState()) return
      this.teardownIconRefSourceSubscription()
      if (typeof next === 'function') {
        this.iconRefSourceState.set(() => next)
      } else {
        this.iconRefSourceState.set(next)
      }
      if (this.connected) {
        this.subscribeIconRefSource()
      }
      this.reconcileResolvedIconRef()
    }, 'passmanager.avatar.setIconRef'),

    setErrorKey: action((value: string) => {
      const next = typeof value === 'string' ? value : ''
      if (next === this.errorKeyState()) return
      this.errorKeyState.set(next)
    }, 'passmanager.avatar.setErrorKey'),

    setFallbackBg: action((value: string) => {
      const next = typeof value === 'string' ? value : ''
      if (next === this.fallbackBgState()) return
      this.fallbackBgState.set(next)
    }, 'passmanager.avatar.setFallbackBg'),

    setFallbackColor: action((value: string) => {
      const next = typeof value === 'string' ? value : ''
      if (next === this.fallbackColorState()) return
      this.fallbackColorState.set(next)
    }, 'passmanager.avatar.setFallbackColor'),

    handleImageError: action((src: string) => {
      const normalizedSrc = this.normalizeString(src)
      if (!normalizedSrc || this.failedSrcState() === normalizedSrc) return undefined

      this.failedSrcState.set(normalizedSrc)
      const errorKey = this.normalizedErrorKey()
      if (!errorKey) return undefined

      return {src: normalizedSrc, errorKey}
    }, 'passmanager.avatar.handleImageError'),
  }

  connect(): void {
    if (this.connected) return

    this.connected = true
    this.subscribeIconStore()
    this.subscribeIconRefSource()
    this.subscribeItemIconRef()
    this.refreshResolvedIconRef()
    this.scheduleIconLoad()
  }

  disconnect(): void {
    if (
      !this.connected &&
      !this.iconStoreUnsubscribe &&
      !this.iconRefSourceUnsubscribe &&
      !this.itemIconRefUnsubscribe
    ) {
      return
    }

    this.connected = false
    this.teardownIconRefSourceSubscription()
    this.teardownItemIconRefSubscription()
    this.iconStoreUnsubscribe?.()
    this.iconStoreUnsubscribe = undefined
  }

  resolveIconRefSource(): string {
    this.iconRefVersionState()
    const source = this.iconRefSourceState()
    if (typeof source === 'function') {
      const value = peek(source)
      return this.normalizeString(typeof value === 'string' ? value : '')
    }

    return this.normalizeString(typeof source === 'string' ? source : '')
  }

  resolveIconRef(item: PMAvatarItem | undefined = this.itemState()): string {
    const direct = this.resolveIconRefSource()
    if (direct.length > 0) return direct
    return item?.iconRef ?? ''
  }

  resolveFallbackSeed(item: PMAvatarItem | undefined): string {
    if (item instanceof Entry) return item.title || '?'
    if (item instanceof Group) return item.name || '?'
    return '?'
  }

  getAvatarBg(text: string): string {
    const seed = this.normalizeString(text).toLowerCase() || '?'
    let hash = 0
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(index)
      hash |= 0
    }
    const hue = Math.abs(hash) % 360
    return `oklch(0.65 0.15 ${hue})`
  }

  private subscribeIconStore() {
    if (this.iconStoreUnsubscribe) return

    this.iconStoreUnsubscribe = pmIconStore.subscribe(() => {
      this.iconStoreVersionState.set(this.iconStoreVersionState() + 1)
    })
  }

  private subscribeIconRefSource() {
    if (this.iconRefSourceUnsubscribe) return

    const source = this.iconRefSourceState()
    if (typeof source !== 'function') return

    this.iconRefSourceUnsubscribe = subscribeToSignalChanges(
      source,
      (nextResolvedIconRef) => {
        this.reconcileResolvedIconRef(nextResolvedIconRef)
      },
      {
        readSnapshot: () => this.resolveIconRef(),
      },
    )
  }

  private teardownIconRefSourceSubscription() {
    this.iconRefSourceUnsubscribe?.()
    this.iconRefSourceUnsubscribe = undefined
  }

  private subscribeItemIconRef() {
    if (this.itemIconRefUnsubscribe) return

    this.itemIconRefUnsubscribe = subscribeToSignalChanges(
      this.itemIconRefSignal,
      () => {
        this.reconcileResolvedIconRef()
      },
      {
        readSnapshot: () => this.normalizeString(this.resolveIconRef()),
      },
    )
  }

  private teardownItemIconRefSubscription() {
    this.itemIconRefUnsubscribe?.()
    this.itemIconRefUnsubscribe = undefined
  }

  private resetImageState() {
    this.failedSrcState.set('')
    this.pendingIconRefState.set('')
  }

  private scheduleIconLoad() {
    if (!this.connected) return
    void this.ensureIconRequested()
  }

  private async ensureIconRequested(): Promise<void> {
    if (this.normalizedSrc().length > 0) return

    const iconRef = this.resolveIconRef()
    if (!iconRef) return

    if (pmIconStore.getCachedUrl(iconRef)) {
      if (this.pendingIconRefState() === iconRef) {
        this.pendingIconRefState.set('')
      }
      return
    }

    if (this.pendingIconRefState() === iconRef) return

    this.pendingIconRefState.set(iconRef)
    const url = await wrap(pmIconStore.loadIconUrl(iconRef))
    if (url && this.connected && this.pendingIconRefState() === iconRef) {
      this.pendingIconRefState.set('')
    }
  }

  private normalizedSrc(): string {
    return this.normalizeString(this.srcState())
  }

  private normalizedResolvedIconRef(): string {
    return this.normalizeString(this.resolvedIconRefState())
  }

  private normalizedFallbackColor(): string {
    return this.normalizeString(this.fallbackColorState())
  }

  private normalizedErrorKey(): string {
    return this.normalizeString(this.errorKeyState())
  }

  private resolveLetter(): string {
    const explicit = this.normalizeString(this.letterState())
    if (explicit.length > 0) return explicit.charAt(0)

    const item = this.itemState()
    if (item instanceof Entry) {
      const title = this.normalizeString(item.title || '?')
      return (title.charAt(0) || '?').toUpperCase()
    }

    if (item instanceof Group) {
      const name = this.normalizeString(item.name || '?')
      return (name.charAt(0) || '?').toUpperCase()
    }

    return ''
  }

  private resolveFallbackIcon(): string {
    const explicit = this.normalizeString(this.iconState())
    if (explicit.length > 0) return explicit
    return this.itemState() instanceof Entry ? 'person-circle' : DEFAULT_ICON
  }

  private resolveFallbackBg(): string {
    const explicit = this.normalizeString(this.fallbackBgState())
    if (explicit.length > 0) return explicit

    const item = this.itemState()
    if (item instanceof Entry) {
      return this.getAvatarBg(this.resolveFallbackSeed(item))
    }

    return ''
  }

  private reconcileResolvedIconRef(next = this.resolveIconRef()) {
    const normalizedNext = this.normalizeString(next)
    if (normalizedNext === this.normalizedResolvedIconRef()) {
      return
    }

    this.iconRefVersionState.set(this.iconRefVersionState() + 1)
    this.resolvedIconRefState.set(normalizedNext)
    this.resetImageState()
    this.scheduleIconLoad()
  }

  private normalizeString(value: string): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  private refreshResolvedIconRef() {
    const next = this.resolveIconRef()
    if (next === this.resolvedIconRefState()) return
    this.resolvedIconRefState.set(next)
  }
}
