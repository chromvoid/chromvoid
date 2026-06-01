import {atom} from '@reatom/core'
import {render} from 'lit'
import {afterEach, describe, expect, it} from 'vitest'

import {CVGuidancePanel} from '@chromvoid/uikit/components/cv-guidance-panel'

import {renderGuidanceInline} from '../../src/features/guidance/render-guidance-inline'
import {guidanceModel} from '../../src/core/guidance/guidance.model'
import type {GuidanceDefinition} from '../../src/core/guidance/guidance.types'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

CVGuidancePanel.define()

function definition(input: Partial<GuidanceDefinition> = {}): GuidanceDefinition {
  return {
    id: 'files.inline',
    surface: 'files',
    anchorId: 'files.create-or-upload',
    trigger: 'empty_state',
    presentation: 'inline_hint',
    titleKey: 'guidance:files.empty-state:title',
    bodyKey: 'guidance:files.empty-state:body',
    completion: {kind: 'product_state', key: 'files.has_items'},
    priority: 10,
    owner: 'test',
    version: 1,
    ...input,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  guidanceModel.disconnect()
  guidanceModel.definitions.set([])
  guidanceModel.progress.set([])
  guidanceModel.anchors.set({})
  guidanceModel.productStates.set(new Set())
  guidanceModel.completedDomainEvents.set(new Set())
  guidanceModel.manualHelpRequest.set(null)
  guidanceModel.blockedActionRequest.set(null)
  guidanceModel.setRoute('loading')
  clearAppContext()
})

describe('renderGuidanceInline', () => {
  it('renders the matching model-provided hint', () => {
    initAppContext(
      createMockAppContext({
        router: {route: atom('dashboard'), isLoading: atom(false)} as never,
        store: {layoutMode: atom('desktop')} as never,
      }),
    )
    guidanceModel.setRoute('dashboard')
    guidanceModel.definitions.set([definition()])
    const container = document.createElement('div')

    render(renderGuidanceInline('files.create-or-upload', 'files'), container)

    const panel = container.querySelector('cv-guidance-panel')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('variant')).toBe('hint')
  })

  it('renders nothing for non-matching anchors', () => {
    initAppContext(
      createMockAppContext({
        router: {route: atom('dashboard'), isLoading: atom(false)} as never,
        store: {layoutMode: atom('desktop')} as never,
      }),
    )
    guidanceModel.setRoute('dashboard')
    guidanceModel.definitions.set([definition()])
    const container = document.createElement('div')

    render(renderGuidanceInline('files.other', 'files'), container)

    expect(container.querySelector('cv-guidance-panel')).toBeNull()
  })

})
