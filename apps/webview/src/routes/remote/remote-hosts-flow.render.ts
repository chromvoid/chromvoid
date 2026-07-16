import type {TemplateResult} from 'lit'

import {renderRemoteHostsPanel} from './remote-hosts-flow.render.hosts'
import {
  renderMobileHostPanel,
  renderRemotePairPanel,
  renderRemoteWaitPanel,
} from './remote-hosts-flow.render.pair'
import {createRenderContext, type RemoteHostsFlowPanelOptions} from './remote-hosts-flow.render.shared'
import {renderUsbMobilePanel} from './remote-hosts-flow.render.usb'

export type {
  RemoteHostsFlowBackLink,
  RemoteHostsFlowPanelActions,
  RemoteHostsFlowPanelOptions,
  RemoteHostsFlowPanelUI,
} from './remote-hosts-flow.render.shared'
export {renderRemoteHostsPanel, renderRemotePairPanel, renderRemoteWaitPanel}

export function renderRemoteHostsFlowPanel(options: RemoteHostsFlowPanelOptions): TemplateResult {
  const ctx = createRenderContext(options)

  if (ctx.model.isMobileHostRuntime()) {
    return renderMobileHostPanel(ctx)
  }

  if (ctx.model.view() === 'pair-ios') {
    return renderRemotePairPanel(options)
  }

  if (ctx.model.view() === 'wait') {
    return renderRemoteWaitPanel(options)
  }

  if (ctx.model.view() === 'usb-mobile') {
    return renderUsbMobilePanel(ctx)
  }

  return renderRemoteHostsPanel(options)
}
