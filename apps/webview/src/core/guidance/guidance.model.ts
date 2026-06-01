import {atom, computed} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import type {Routes} from 'root/app/router/router'
import {
  moduleAccessModel,
  type ModuleAccessStatus,
  type ProFeatureKey,
} from 'root/core/pro/module-access.model'
import {
  getRuntimeCapabilities,
  runtimeCapabilitiesAtom,
  type RuntimeCapabilities,
} from 'root/core/runtime/runtime-capabilities'
import {tryGetAppContext} from 'root/shared/services/app-context'

import {getGuidanceAnchorKey} from './guidance.anchors'
import {guidanceDefinitions} from './guidance.registry'
import {
  localGuidanceProgressStore,
  type GuidanceProgressStore,
} from './guidance.progress-store'
import type {
  GuidanceActiveState,
  GuidanceAnchorRegistration,
  GuidanceAnchorState,
  GuidanceDefinition,
  GuidanceI18nKey,
  GuidanceProgress,
  GuidanceSurfaceId,
} from './guidance.types'

type LayoutMode = 'desktop' | 'mobile'

type ManualHelpRequest = {
  surface?: GuidanceSurfaceId
  anchorId?: string
  requestedAt: number
}

type BlockedActionRequest = {
  feature?: ProFeatureKey
  surface?: GuidanceSurfaceId
  anchorId?: string
  reason?: ModuleAccessStatus
  requestedAt: number
}

type GuidanceModelOptions = {
  definitions?: readonly GuidanceDefinition[]
  progressStore?: GuidanceProgressStore
  now?: () => number
  readDashboardSurface?: () => GuidanceSurfaceId | undefined
  readLayoutMode?: () => LayoutMode
  readRuntimeCapabilities?: () => RuntimeCapabilities
  readModuleAccessStatus?: (feature: ProFeatureKey) => ModuleAccessStatus
}

function readAppLayoutMode(): LayoutMode {
  const mode = tryGetAppContext()?.store?.layoutMode?.()
  if (mode === 'mobile' || getRuntimeCapabilities().mobile) return 'mobile'
  return 'desktop'
}

function matchesPlatform(definition: GuidanceDefinition, capabilities: RuntimeCapabilities, layoutMode: LayoutMode): boolean {
  if (!definition.platforms?.length) return true
  return definition.platforms.some((platform) => {
    if (platform === 'desktop') return layoutMode === 'desktop' || capabilities.desktop
    if (platform === 'mobile') return layoutMode === 'mobile' || capabilities.mobile
    return capabilities.platform === platform
  })
}

function isCompletionSatisfied(
  definition: GuidanceDefinition,
  progress: readonly GuidanceProgress[],
  productStates: ReadonlySet<string>,
  completedDomainEvents: ReadonlySet<string>,
): boolean {
  const progressRecord = progress.find(
    (entry) => entry.id === definition.id && entry.version === definition.version,
  )
  if (progressRecord?.completedAt) return true

  if (definition.completion.kind === 'product_state') {
    return productStates.has(definition.completion.key)
  }

  if (definition.completion.kind === 'domain_event') {
    return completedDomainEvents.has(definition.completion.event)
  }

  return false
}

function isSuppressedByProgress(definition: GuidanceDefinition, progress: readonly GuidanceProgress[], now: number): boolean {
  const progressRecord = progress.find(
    (entry) => entry.id === definition.id && entry.version === definition.version,
  )
  if (!progressRecord) return false
  if (progressRecord.completedAt) return true
  if (progressRecord.dismissedAt) return true
  if (progressRecord.snoozedUntil && progressRecord.snoozedUntil > now) return true
  return false
}

function upsertProgress(
  progress: readonly GuidanceProgress[],
  next: GuidanceProgress,
): GuidanceProgress[] {
  const index = progress.findIndex((entry) => entry.id === next.id && entry.version === next.version)
  if (index === -1) return [...progress, next]
  const copy = [...progress]
  copy[index] = {...copy[index], ...next}
  return copy
}

export class GuidanceModel {
  readonly route = atom<Routes>('loading', 'guidance.route')
  readonly anchors = atom<Record<string, GuidanceAnchorState>>({}, 'guidance.anchors')
  readonly progress = atom<GuidanceProgress[]>([], 'guidance.progress')
  readonly productStates = atom<ReadonlySet<string>>(new Set<string>(), 'guidance.productStates')
  readonly completedDomainEvents = atom<ReadonlySet<string>>(new Set<string>(), 'guidance.completedDomainEvents')
  readonly manualHelpRequest = atom<ManualHelpRequest | null>(null, 'guidance.manualHelpRequest')
  readonly blockedActionRequest = atom<BlockedActionRequest | null>(null, 'guidance.blockedActionRequest')
  readonly definitions = atom<readonly GuidanceDefinition[]>(guidanceDefinitions, 'guidance.definitions')

  readonly activeSurface = computed<GuidanceSurfaceId | null>(() => {
    const route = this.route()
    if (route === 'welcome') return 'welcome'
    if (route === 'dashboard') return this.readDashboardSurface() ?? null
    return null
  }, 'guidance.activeSurface')

  readonly eligibleDefinitions = computed<readonly GuidanceDefinition[]>(() => {
    const manualRequest = this.manualHelpRequest()
    const blockedRequest = this.blockedActionRequest()
    const activeSurface = this.activeSurface()
    const targetSurface = manualRequest?.surface ?? blockedRequest?.surface ?? activeSurface
    if (!targetSurface) return []

    const capabilities = this.readRuntimeCapabilities()
    runtimeCapabilitiesAtom()
    const layoutMode = this.readLayoutMode()
    const now = this.now()
    const progress = this.progress()
    const productStates = this.productStates()
    const completedDomainEvents = this.completedDomainEvents()

    return this.definitions()
      .filter((definition) => definition.surface === targetSurface)
      .filter((definition) => matchesPlatform(definition, capabilities, layoutMode))
      .filter((definition) => this.matchesCapabilityGate(definition, capabilities))
      .filter((definition) => this.matchesModuleGate(definition))
      .filter((definition) => {
        if (manualRequest) {
          if (definition.trigger !== 'manual_help') return false
          return !manualRequest.anchorId || definition.anchorId === manualRequest.anchorId
        }

        if (blockedRequest) {
          if (definition.trigger !== 'blocked_action') return false
          if (blockedRequest.anchorId && definition.anchorId !== blockedRequest.anchorId) return false
          if (blockedRequest.feature && definition.moduleAccessGate?.feature !== blockedRequest.feature) return false
          if (blockedRequest.reason && !definition.moduleAccessGate?.statuses.includes(blockedRequest.reason)) {
            return false
          }
          if (isCompletionSatisfied(definition, progress, productStates, completedDomainEvents)) return false
          return true
        }

        if (isCompletionSatisfied(definition, progress, productStates, completedDomainEvents)) return false
        if (definition.trigger === 'manual_help' || definition.trigger === 'blocked_action') return false
        return !isSuppressedByProgress(definition, progress, now)
      })
      .sort((a, b) => b.priority - a.priority)
  }, 'guidance.eligibleDefinitions')

  readonly activeGuidance = computed<GuidanceActiveState>(() => {
    const selected = this.eligibleDefinitions().find((definition) => {
      if (this.manualHelpRequest() || this.blockedActionRequest()) return true
      return definition.presentation !== 'inline_hint'
    })

    if (!selected) return {kind: 'hidden'} as const
    return this.toActiveState(selected)
  }, 'guidance.activeGuidance')

  readonly inlineHints = computed<readonly GuidanceActiveState[]>(() =>
    this.eligibleDefinitions()
      .filter((definition) => definition.presentation === 'inline_hint')
      .map((definition) => this.toActiveState(definition)),
  )

  private readonly progressStore: GuidanceProgressStore
  private readonly now: () => number
  private readonly readDashboardSurface: () => GuidanceSurfaceId | undefined
  private readonly readLayoutMode: () => LayoutMode
  private readonly readRuntimeCapabilities: () => RuntimeCapabilities
  private readonly readModuleAccessStatus: (feature: ProFeatureKey) => ModuleAccessStatus
  private connected = false

  constructor(options: GuidanceModelOptions = {}) {
    this.progressStore = options.progressStore ?? localGuidanceProgressStore
    this.now = options.now ?? Date.now
    this.readDashboardSurface = options.readDashboardSurface ?? (() => navigationModel.currentSurface())
    this.readLayoutMode = options.readLayoutMode ?? readAppLayoutMode
    this.readRuntimeCapabilities = options.readRuntimeCapabilities ?? getRuntimeCapabilities
    this.readModuleAccessStatus =
      options.readModuleAccessStatus ?? ((feature) => moduleAccessModel.featureAccess(feature).status)

    if (options.definitions) {
      this.definitions.set(options.definitions)
    }
  }

  connect(): void {
    if (this.connected) return
    this.connected = true
    this.progress.set(this.progressStore.load())
  }

  disconnect(): void {
    this.connected = false
    this.manualHelpRequest.set(null)
    this.blockedActionRequest.set(null)
  }

  setRoute(route: Routes): void {
    this.route.set(route)
  }

  registerAnchor(registration: GuidanceAnchorRegistration): void {
    const key = getGuidanceAnchorKey(registration.surface, registration.anchorId)
    const current = this.anchors()[key]
    if (current?.element === registration.element && current.element.isConnected) return
    if (current?.element.isConnected && current.element !== registration.element) return

    this.anchors.set({
      ...this.anchors(),
      [key]: {
        ...registration,
        registeredAt: this.now(),
      },
    })
  }

  unregisterAnchor(anchorId: string, element?: HTMLElement): void {
    const next = {...this.anchors()}
    let changed = false
    for (const [key, anchor] of Object.entries(next)) {
      if (anchor.anchorId !== anchorId) continue
      if (element && anchor.element !== element) continue
      delete next[key]
      changed = true
    }
    if (changed) this.anchors.set(next)
  }

  markSeen(id: string): void {
    const definition = this.findDefinition(id)
    if (!definition) return
    this.setProgress({
      id,
      version: definition.version,
      state: 'seen',
      seenAt: this.now(),
    })
  }

  dismiss(id: string): void {
    const definition = this.findDefinition(id)
    if (!definition) return
    this.clearRequestsFor(id)
    this.setProgress({
      id,
      version: definition.version,
      state: 'dismissed',
      dismissedAt: this.now(),
    })
  }

  snooze(id: string, until: number): void {
    const definition = this.findDefinition(id)
    if (!definition) return
    this.clearRequestsFor(id)
    this.setProgress({
      id,
      version: definition.version,
      state: 'snoozed',
      snoozedUntil: until,
    })
  }

  complete(id: string): void {
    const definition = this.findDefinition(id)
    if (!definition) return
    this.clearRequestsFor(id)
    this.setProgress({
      id,
      version: definition.version,
      state: 'completed',
      completedAt: this.now(),
    })
  }

  completeProductState(key: string): void {
    const next = new Set(this.productStates())
    next.add(key)
    this.productStates.set(next)
  }

  clearProductState(key: string): void {
    const next = new Set(this.productStates())
    next.delete(key)
    this.productStates.set(next)
  }

  emitDomainEvent(event: string): void {
    const next = new Set(this.completedDomainEvents())
    next.add(event)
    this.completedDomainEvents.set(next)
  }

  clearBlockedActionRequest(): void {
    this.blockedActionRequest.set(null)
  }

  hasProgressForDefinition(id: string): boolean {
    const definition = this.findDefinition(id)
    if (!definition) return false
    return this.progress().some((entry) => entry.id === id && entry.version === definition.version)
  }

  openManualHelp(surface?: GuidanceSurfaceId, anchorId?: string): void {
    this.manualHelpRequest.set({surface: surface ?? this.activeSurface() ?? undefined, anchorId, requestedAt: this.now()})
    this.blockedActionRequest.set(null)
  }

  openBlockedAction(input: {
    feature?: ProFeatureKey
    surface?: GuidanceSurfaceId
    anchorId?: string
    reason?: ModuleAccessStatus
  }): void {
    this.blockedActionRequest.set({...input, surface: input.surface ?? this.activeSurface() ?? undefined, requestedAt: this.now()})
    this.manualHelpRequest.set(null)
  }

  resolveBodyKey(definition: GuidanceDefinition): GuidanceI18nKey {
    const request = this.blockedActionRequest()
    const reason = request?.reason
    if (definition.trigger !== 'blocked_action' || !reason) return definition.bodyKey
    if (request.feature && definition.moduleAccessGate?.feature !== request.feature) return definition.bodyKey
    return definition.bodyKeyByModuleAccessStatus?.[reason] ?? definition.bodyKey
  }

  acknowledgeManual(id: string): void {
    this.complete(id)
    this.clearRequestsFor(id)
  }

  private setProgress(next: GuidanceProgress): void {
    const progress = upsertProgress(this.progress(), next)
    this.progress.set(progress)
    this.progressStore.save(progress)
  }

  private findDefinition(id: string): GuidanceDefinition | undefined {
    return this.definitions().find((definition) => definition.id === id)
  }

  private clearRequestsFor(id: string): void {
    const current = this.activeGuidance()
    if (current.kind !== 'hidden' && current.definition.id === id) {
      this.manualHelpRequest.set(null)
      this.blockedActionRequest.set(null)
    }
  }

  private matchesCapabilityGate(
    definition: GuidanceDefinition,
    capabilities: RuntimeCapabilities,
  ): boolean {
    for (const [key, expected] of Object.entries(definition.capabilityGate ?? {})) {
      if (Boolean(capabilities[key as keyof RuntimeCapabilities]) !== expected) return false
    }
    return true
  }

  private matchesModuleGate(definition: GuidanceDefinition): boolean {
    const gate = definition.moduleAccessGate
    if (!gate) return true
    return gate.statuses.includes(this.readModuleAccessStatus(gate.feature))
  }

  private toActiveState(definition: GuidanceDefinition): GuidanceActiveState {
    const anchor = this.resolveAnchor(definition)

    if (definition.presentation === 'inline_hint') {
      return {kind: 'inline', definition, anchor}
    }

    if (definition.presentation === 'bottom_sheet') {
      return {kind: 'bottom_sheet', definition, anchor}
    }

    if (!anchor) {
      return {kind: 'waiting_for_anchor', definition}
    }

    return {kind: 'anchored', definition, anchor}
  }

  private resolveAnchor(definition: GuidanceDefinition): GuidanceAnchorState | undefined {
    const anchor = this.anchors()[getGuidanceAnchorKey(definition.surface, definition.anchorId)]
    if (!anchor?.element.isConnected) return undefined
    return anchor
  }
}

export const guidanceModel = new GuidanceModel()
