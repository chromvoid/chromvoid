import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing} from 'lit'

import {guidanceModel} from 'root/core/guidance/guidance.model'
import type {GuidanceSurfaceId} from 'root/core/guidance/guidance.types'
import {i18n} from 'root/i18n'

export function renderGuidanceInline(anchorId: string, surface?: GuidanceSurfaceId) {
  const hint = guidanceModel.inlineHints().find((item) => {
    if (item.kind !== 'inline') return false
    if (item.definition.anchorId !== anchorId) return false
    return !surface || item.definition.surface === surface
  })

  if (!hint || hint.kind !== 'inline') return nothing

  const {definition} = hint
  return html`
    <cv-guidance-panel variant="hint" density="compact">
      <span slot="title">${i18n(definition.titleKey)}</span>
      <p>${i18n(definition.bodyKey)}</p>
    </cv-guidance-panel>
  `
}
