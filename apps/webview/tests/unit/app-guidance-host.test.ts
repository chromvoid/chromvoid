import {atom} from '@reatom/core'
import {render} from 'lit'
import {afterEach, describe, expect, it} from 'vitest'

import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVGuidancePanel} from '@chromvoid/uikit/components/cv-guidance-panel'
import {CVPopover} from '@chromvoid/uikit/components/cv-popover'

import {AppGuidanceHost} from '../../src/features/guidance/app-guidance-host'
import {renderGuidanceInline} from '../../src/features/guidance/render-guidance-inline'
import {
  GUIDANCE_ANCHOR_REGISTER_EVENT,
  GUIDANCE_ANCHOR_UNREGISTER_EVENT,
} from '../../src/core/guidance/guidance.constants'
import {guidanceModel} from '../../src/core/guidance/guidance.model'
import type {GuidanceDefinition} from '../../src/core/guidance/guidance.types'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

AppGuidanceHost.define()
CVBottomSheet.define()
CVGuidancePanel.define()
CVPopover.define()

function definition(input: Partial<GuidanceDefinition> = {}): GuidanceDefinition {
  return {
    id: 'files.discovery',
    surface: 'files',
    anchorId: 'files.create-or-upload',
    trigger: 'feature_discovery',
    presentation: 'popover',
    titleKey: 'guidance:files.empty-state:title',
    bodyKey: 'guidance:files.empty-state:body',
    completion: {kind: 'product_state', key: 'files.has_items'},
    priority: 10,
    owner: 'test',
    version: 1,
    ...input,
  }
}

function setupContext(layout: 'desktop' | 'mobile' = 'desktop') {
  const route = atom<'dashboard' | 'welcome'>('dashboard')
  const layoutMode = atom(layout)
  initAppContext(
    createMockAppContext({
      router: {route, isLoading: atom(false)} as never,
      store: {layoutMode} as never,
    }),
  )
  return {route, layoutMode}
}

async function settle(host: AppGuidanceHost) {
  await host.updateComplete
  await Promise.resolve()
  await host.updateComplete
}

function resetGuidanceModel() {
  guidanceModel.disconnect()
  guidanceModel.definitions.set([])
  guidanceModel.progress.set([])
  guidanceModel.anchors.set({})
  guidanceModel.productStates.set(new Set())
  guidanceModel.completedDomainEvents.set(new Set())
  guidanceModel.manualHelpRequest.set(null)
  guidanceModel.blockedActionRequest.set(null)
  guidanceModel.setRoute('loading')
  localStorage.clear()
}

function dispatchAnchorRegister(element: HTMLElement, anchorId = 'files.create-or-upload') {
  element.dispatchEvent(
    new CustomEvent(GUIDANCE_ANCHOR_REGISTER_EVENT, {
      detail: {
        anchorId,
        surface: 'files',
        owner: 'test',
        element,
      },
      bubbles: true,
      composed: true,
    }),
  )
}

afterEach(() => {
  document.body.innerHTML = ''
  resetGuidanceModel()
  clearAppContext()
})

describe('app-guidance-host', () => {
  it('does not render a random overlay while active guidance is waiting for an anchor', async () => {
    setupContext()
    guidanceModel.definitions.set([definition()])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    document.body.append(host)
    await settle(host)

    expect(guidanceModel.activeGuidance().kind).toBe('waiting_for_anchor')
    expect(host.shadowRoot?.querySelector('cv-popover')).toBeNull()
    expect(host.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
  })

  it('renders desktop anchored guidance through cv-popover from composed anchor events', async () => {
    setupContext()
    guidanceModel.definitions.set([definition()])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    const anchor = document.createElement('button')
    document.body.append(host, anchor)
    await settle(host)

    dispatchAnchorRegister(anchor)
    await settle(host)

    const popover = host.shadowRoot?.querySelector('cv-popover') as CVPopover | null
    expect(popover).not.toBeNull()
    expect(popover?.sourceEl).toBe(anchor)
    expect(host.shadowRoot?.querySelector('.guidance-backdrop')).not.toBeNull()
    expect(host.shadowRoot?.querySelector('cv-guidance-panel')).not.toBeNull()
  })

  it('anchors popovers to the child element inside display-contents guidance anchors', async () => {
    setupContext()
    guidanceModel.definitions.set([definition()])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    const wrapper = document.createElement('cv-guidance-anchor')
    const anchor = document.createElement('button')
    wrapper.append(anchor)
    document.body.append(host, wrapper)
    await settle(host)

    wrapper.dispatchEvent(
      new CustomEvent(GUIDANCE_ANCHOR_REGISTER_EVENT, {
        detail: {
          anchorId: 'files.create-or-upload',
          surface: 'files',
          owner: 'test',
          element: wrapper,
        },
        bubbles: true,
        composed: true,
      }),
    )
    await settle(host)

    const popover = host.shadowRoot?.querySelector('cv-popover') as CVPopover | null
    expect(popover?.sourceEl).toBe(anchor)
  })

  it('renders manual acknowledgement as one primary action plus an icon close control', async () => {
    setupContext()
    guidanceModel.definitions.set([
      definition({
        trigger: 'manual_help',
        completion: {kind: 'manual_ack'},
      }),
    ])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    const anchor = document.createElement('button')
    document.body.append(host, anchor)
    await settle(host)

    dispatchAnchorRegister(anchor)
    guidanceModel.openManualHelp('files', 'files.create-or-upload')
    await settle(host)

    const primary = host.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[data-guidance-action="primary"]',
    )
    const close = host.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[data-guidance-action="close"]',
    )

    expect(primary?.textContent?.trim()).toBe('Got it')
    expect(close).not.toBeNull()
    expect(host.shadowRoot?.querySelector('button[data-guidance-action="secondary"]')).toBeNull()
    expect(host.shadowRoot?.textContent).not.toContain('Dismiss')
  })

  it('dismisses anchored guidance through the popover composed outside pointer path', async () => {
    setupContext()
    guidanceModel.definitions.set([definition()])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    const anchor = document.createElement('button')
    document.body.append(host, anchor)
    await settle(host)

    dispatchAnchorRegister(anchor)
    await settle(host)

    const popover = host.shadowRoot?.querySelector('cv-popover') as CVPopover | null
    expect(popover).not.toBeNull()
    await popover?.updateComplete

    document.body.dispatchEvent(new Event('pointerdown', {bubbles: true, composed: true}))
    await settle(host)

    expect(guidanceModel.activeGuidance().kind).toBe('hidden')
    expect(document.activeElement).toBe(anchor)
  })

  it('dismisses anchored guidance through the backdrop', async () => {
    setupContext()
    guidanceModel.definitions.set([definition()])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    const anchor = document.createElement('button')
    document.body.append(host, anchor)
    await settle(host)

    dispatchAnchorRegister(anchor)
    await settle(host)

    const backdrop = host.shadowRoot?.querySelector<HTMLButtonElement>('.guidance-backdrop')
    expect(backdrop).not.toBeNull()

    backdrop?.click()
    await settle(host)

    expect(guidanceModel.activeGuidance().kind).toBe('hidden')
  })

  it('renders mobile anchored guidance through cv-popover', async () => {
    setupContext('mobile')
    guidanceModel.definitions.set([definition()])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    const anchor = document.createElement('button')
    document.body.append(host, anchor)
    await settle(host)

    dispatchAnchorRegister(anchor)
    await settle(host)

    expect(host.shadowRoot?.querySelector('cv-popover')).not.toBeNull()
    expect(host.shadowRoot?.querySelector('.guidance-backdrop')).not.toBeNull()
    expect(host.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
  })

  it('renders explicit bottom sheet guidance through cv-bottom-sheet', async () => {
    setupContext('mobile')
    guidanceModel.definitions.set([definition({presentation: 'bottom_sheet'})])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    document.body.append(host)
    await settle(host)

    expect(host.shadowRoot?.querySelector('cv-bottom-sheet')).not.toBeNull()
    expect(host.shadowRoot?.querySelector('cv-popover')).toBeNull()
  })

  it('unregisters anchors from composed unregister events and restores focus on dismiss', async () => {
    setupContext()
    guidanceModel.definitions.set([definition()])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    const anchor = document.createElement('button')
    document.body.append(host, anchor)
    await settle(host)
    dispatchAnchorRegister(anchor)
    await settle(host)

    const dismissButton = Array.from(host.shadowRoot!.querySelectorAll('button')).at(-1) as HTMLButtonElement
    dismissButton.click()
    await settle(host)

    expect(guidanceModel.activeGuidance().kind).toBe('hidden')
    expect(document.activeElement).toBe(anchor)

    anchor.dispatchEvent(
      new CustomEvent(GUIDANCE_ANCHOR_UNREGISTER_EVENT, {
        detail: {
          anchorId: 'files.create-or-upload',
          surface: 'files',
          owner: 'test',
          element: anchor,
        },
        bubbles: true,
        composed: true,
      }),
    )

    expect(Object.keys(guidanceModel.anchors())).toEqual([])
  })

  it('keeps route state synchronized with the app router subscription', async () => {
    const {route} = setupContext()
    guidanceModel.definitions.set([])
    const host = document.createElement('app-guidance-host') as AppGuidanceHost
    document.body.append(host)
    await settle(host)

    route.set('welcome')
    await settle(host)

    expect(guidanceModel.route()).toBe('welcome')
  })
})

describe('renderGuidanceInline', () => {
  it('renders model-provided inline hints without local eligibility logic', () => {
    setupContext()
    guidanceModel.setRoute('dashboard')
    guidanceModel.definitions.set([
      definition({
        id: 'files.inline',
        trigger: 'empty_state',
        presentation: 'inline_hint',
      }),
    ])
    const container = document.createElement('div')

    render(renderGuidanceInline('files.create-or-upload', 'files'), container)

    expect(container.querySelector('cv-guidance-panel')).not.toBeNull()
  })
})
