import {SURFACE_IDS} from 'root/app/navigation/navigation.types'
import {
  MODULE_ACCESS_STATUSES,
  PRO_FEATURE_KEYS,
} from 'root/core/pro/module-access.model'
import {RUNTIME_CAPABILITY_KEYS} from 'root/core/runtime/runtime-capabilities'

import {GUIDANCE_SURFACE_IDS} from './guidance.constants'
import type {KnownGuidanceAnchor} from './guidance.anchors'
import type {GuidanceDefinition} from './guidance.types'

export type GuidanceValidationInput = {
  definitions: readonly GuidanceDefinition[]
  anchors: readonly KnownGuidanceAnchor[]
  hasI18nKey?: (key: string) => boolean
}

export type GuidanceValidationResult = {
  ok: boolean
  errors: string[]
}

const SELECTOR_LIKE_ANCHOR = /^(?:[.#]|\[|\/html\b|body\s*>|.+\s>\s.+)/

const validSurfaces = new Set<string>(GUIDANCE_SURFACE_IDS)
const validCapabilities = new Set<string>(RUNTIME_CAPABILITY_KEYS)
const validFeatures = new Set<string>(PRO_FEATURE_KEYS)
const validStatuses = new Set<string>(MODULE_ACCESS_STATUSES)
const dashboardSurfaces = new Set<string>(SURFACE_IDS)

export function validateGuidanceRegistry(input: GuidanceValidationInput): GuidanceValidationResult {
  const errors: string[] = []
  const definitionIds = new Set<string>()
  const anchorsByKey = new Map<string, KnownGuidanceAnchor>()

  for (const anchor of input.anchors) {
    anchorsByKey.set(`${anchor.surface}:${anchor.id}`, anchor)
  }

  for (const definition of input.definitions) {
    if (definitionIds.has(definition.id)) {
      errors.push(`Duplicate guidance definition id: ${definition.id}`)
    }
    definitionIds.add(definition.id)

    if (!validSurfaces.has(definition.surface)) {
      errors.push(`Unknown guidance surface for ${definition.id}: ${definition.surface}`)
    }

    if (definition.surface !== 'welcome' && !dashboardSurfaces.has(definition.surface)) {
      errors.push(`Guidance surface is not a dashboard surface or welcome for ${definition.id}: ${definition.surface}`)
    }

    if (SELECTOR_LIKE_ANCHOR.test(definition.anchorId)) {
      errors.push(`Selector-like anchor id is not allowed for ${definition.id}: ${definition.anchorId}`)
    }

    const knownAnchor = anchorsByKey.get(`${definition.surface}:${definition.anchorId}`)
    if (!knownAnchor?.dynamic && !knownAnchor) {
      errors.push(`Unknown guidance anchor for ${definition.id}: ${definition.surface}:${definition.anchorId}`)
    }

    for (const key of Object.keys(definition.capabilityGate ?? {})) {
      if (!validCapabilities.has(key)) {
        errors.push(`Unknown runtime capability for ${definition.id}: ${key}`)
      }
    }

    if (definition.moduleAccessGate) {
      if (!validFeatures.has(definition.moduleAccessGate.feature)) {
        errors.push(`Unknown Pro feature for ${definition.id}: ${definition.moduleAccessGate.feature}`)
      }

      for (const status of definition.moduleAccessGate.statuses) {
        if (!validStatuses.has(status)) {
          errors.push(`Unknown module access status for ${definition.id}: ${status}`)
        }
      }
    }

    if (!definition.owner) {
      errors.push(`Missing owner for ${definition.id}`)
    }

    if (!Number.isFinite(definition.priority)) {
      errors.push(`Missing priority for ${definition.id}`)
    }

    if (!Number.isFinite(definition.version) || definition.version < 1) {
      errors.push(`Invalid version for ${definition.id}`)
    }

    const completion = (definition as Partial<GuidanceDefinition>).completion
    if (!completion) {
      errors.push(`Missing completion for ${definition.id}`)
    } else if (
      (definition.trigger === 'first_run' ||
        definition.trigger === 'empty_state' ||
        definition.trigger === 'feature_discovery') &&
      completion.kind === 'manual_ack'
    ) {
      errors.push(`Automatic guidance must not use manual_ack completion: ${definition.id}`)
    }

    if (input.hasI18nKey) {
      const textKeys = [
        definition.titleKey,
        definition.bodyKey,
        definition.primaryActionKey,
        definition.secondaryActionKey,
        ...Object.values(definition.bodyKeyByModuleAccessStatus ?? {}),
      ]
      for (const key of textKeys) {
        if (key && !input.hasI18nKey(key)) {
          errors.push(`Missing i18n key for ${definition.id}: ${key}`)
        }
      }
    }
  }

  return {ok: errors.length === 0, errors}
}
