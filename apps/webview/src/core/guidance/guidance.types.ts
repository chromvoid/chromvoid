import type {Routes} from 'root/app/router/router'
import type {ModuleAccessStatus, ProFeatureKey} from 'root/core/pro/module-access.model'
import type {RuntimeCapabilityKey} from 'root/core/runtime/runtime-capabilities'
import type i18nData from 'root/i18n/data.json'

import type {
  GUIDANCE_PLATFORM_IDS,
  GUIDANCE_PRESENTATION_IDS,
  GUIDANCE_SURFACE_IDS,
  GUIDANCE_TRIGGER_IDS,
} from './guidance.constants'

export type GuidanceSurfaceId = (typeof GUIDANCE_SURFACE_IDS)[number]
export type GuidanceTrigger = (typeof GUIDANCE_TRIGGER_IDS)[number]
export type GuidancePresentation = (typeof GUIDANCE_PRESENTATION_IDS)[number]
export type GuidancePlatform = (typeof GUIDANCE_PLATFORM_IDS)[number]
export type GuidanceI18nKey = keyof typeof i18nData

export type GuidanceCompletion =
  | {kind: 'product_state'; key: string}
  | {kind: 'domain_event'; event: string}
  | {kind: 'manual_ack'}

export type GuidanceDefinition = {
  id: string
  surface: GuidanceSurfaceId
  anchorId: string
  trigger: GuidanceTrigger
  platforms?: readonly GuidancePlatform[]
  capabilityGate?: Partial<Record<RuntimeCapabilityKey, boolean>>
  moduleAccessGate?: {
    feature: ProFeatureKey
    statuses: readonly ModuleAccessStatus[]
  }
  titleKey: GuidanceI18nKey
  bodyKey: GuidanceI18nKey
  bodyKeyByModuleAccessStatus?: Partial<Record<ModuleAccessStatus, GuidanceI18nKey>>
  primaryActionKey?: GuidanceI18nKey
  secondaryActionKey?: GuidanceI18nKey
  presentation: GuidancePresentation
  completion: GuidanceCompletion
  priority: number
  owner: string
  version: number
  dismissible?: boolean
}

export type GuidanceProgressState = 'seen' | 'dismissed' | 'snoozed' | 'completed'

export type GuidanceProgress = {
  id: string
  version: number
  state: GuidanceProgressState
  seenAt?: number
  dismissedAt?: number
  snoozedUntil?: number
  completedAt?: number
}

export type GuidanceAnchorRegistration = {
  surface: GuidanceSurfaceId
  anchorId: string
  owner: string
  element: HTMLElement
}

export type GuidanceAnchorState = GuidanceAnchorRegistration & {
  registeredAt: number
}

export type GuidanceAction =
  | {kind: 'dismiss'; id: string}
  | {kind: 'snooze'; id: string; until: number}
  | {kind: 'acknowledge'; id: string}
  | {kind: 'open_manual_help'; surface?: GuidanceSurfaceId; anchorId?: string}

export type GuidanceActiveState =
  | {kind: 'hidden'}
  | {kind: 'waiting_for_anchor'; definition: GuidanceDefinition}
  | {kind: 'anchored'; definition: GuidanceDefinition; anchor: GuidanceAnchorState}
  | {kind: 'bottom_sheet'; definition: GuidanceDefinition; anchor?: GuidanceAnchorState}
  | {kind: 'inline'; definition: GuidanceDefinition; anchor?: GuidanceAnchorState}

export type GuidanceRouteContext = {
  route: Routes
  surface?: GuidanceSurfaceId
}
