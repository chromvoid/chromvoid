import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import type {MobileUsbRecoveryAction} from './remote.model'
import type {
  MobileUsbFlowState,
  MobileUsbPendingAction,
  MobileUsbScanClassificationKind,
} from './remote-usb-flow.model'
import {renderBackLink, type RemoteHostsFlowRenderContext} from './remote-hosts-flow.render.shared'

export function renderUsbMobilePanel(ctx: RemoteHostsFlowRenderContext): TemplateResult {
  const usb = ctx.model.usb
  const status = usb.status()
  const scanResults = usb.scannedHostViews()
  const pairedHosts = usb.pairedHostViews()
  const flowState = usb.flowState()
  const actionBusy = ctx.model.connectionOperationBusy()
  const pendingAction = usb.pendingAction()
  const errorCode = usb.activeErrorCode()
  const recoveryAction = usb.recoveryAction()
  const activeHost = status ? status.active_host : null
  const pairingApproval = usb.pairingApproval()
  const selectedTransport = status ? status.selected_transport : 'none'
  const availableTransports = usb.availableTransports()
  const transportFamily = status ? status.transport_family : 'usb_mobile'
  const fallbackAllowed = status ? status.fallback_allowed : false
  const sessionPanel = status
    ? html`
        <div class="remote-presence-panel" data-usb-section="session">
          <div class="remote-field-label">${i18n('remote:usb-mobile-session')}</div>
          <div class="remote-peer-badges">
            <span
              class="mode-badge status-${status.selected_transport === 'usb_mobile' ? 'success' : 'warning'}"
            >
              ${status.session_state}
            </span>
            <span
              class="mode-badge status-${status.selected_transport === 'usb_mobile' ? 'success' : 'warning'}"
              data-usb-selected-transport-badge=${status.selected_transport ?? 'none'}
            >
              ${formatUsbTransport(status.selected_transport)}
            </span>
          </div>
        </div>
      `
    : nothing

  const content = html`
    <div class="step active" data-usb-mobile-panel>
      <div class="step-title">${i18n('remote:usb-mobile-title')}</div>
      <div class="step-desc">${i18n('remote:usb-mobile-desc')}</div>

      <div class="remote-usb-overview-grid">
        <div class="remote-presence-panel" data-usb-flow-state=${flowState}>
          <div class="remote-field-label">${i18n('remote:usb-mobile-status')}</div>
          <div
            class="mode-badge status-${flowState === 'ready' || flowState === 'paired'
              ? 'success'
              : flowState === 'recovery' || flowState === 'error'
                ? 'danger'
                : 'warning'}"
            role="status"
            data-usb-selected-transport=${selectedTransport}
          >
            ${formatUsbFlowState(flowState)}
          </div>
        </div>

        <div
          class="remote-presence-panel"
          data-usb-transport-family=${transportFamily}
          data-usb-fallback-allowed=${String(fallbackAllowed)}
        >
          <div class="remote-field-label">${i18n('remote:transport-available')}</div>
          <div class="remote-peer-badges">
            ${availableTransports.length
              ? availableTransports.map(
                  (transport) => html`
                    <span class="mode-badge status-success" data-usb-available-transport=${transport}>
                      ${formatUsbTransport(transport)}
                    </span>
                  `,
                )
              : html`
                  <span class="mode-badge status-warning" data-usb-available-transport="none">
                    ${i18n('remote:transport-none')}
                  </span>
                `}
            <span class="mode-badge status-neutral" data-usb-network-fallback="disabled">
              ${fallbackAllowed
                ? i18n('remote:network-fallback-enabled')
                : i18n('remote:network-fallback-disabled')}
            </span>
          </div>
        </div>

        ${sessionPanel}
      </div>

      ${renderUsbDetectedDevicesPanel(ctx)}
      ${actionBusy
        ? html`<cv-callout variant="info" role="status">
            ${formatUsbPendingAction(pendingAction)}
          </cv-callout>`
        : nothing}
      ${usb.scanFoundNothing() && !scanResults.length && !actionBusy
        ? html`<cv-callout variant="info" role="status" data-usb-scan-empty>
            ${i18n('remote:usb-mobile-scan-empty')}
          </cv-callout>`
        : nothing}
      ${usb.errorText()
        ? html`<cv-callout variant="danger" role="alert">${usb.errorText()}</cv-callout>`
        : nothing}
      ${errorCode
        ? html`
            <cv-callout variant="danger" role="alert" data-usb-error-code=${errorCode}>
              ${i18n('remote:usb-mobile-error-code', {code: errorCode})}
              ${recoveryAction
                ? html`<span data-usb-recovery-action=${recoveryAction}>
                    ${formatUsbRecoveryAction(recoveryAction)}
                  </span>`
                : nothing}
            </cv-callout>
          `
        : nothing}
      ${pairingApproval
        ? html`
            <div
              class="remote-presence-panel"
              data-usb-section="pairing-approval"
              data-usb-pairing-attempt=${pairingApproval.attempt_id}
            >
              <div class="remote-field-label">${i18n('remote:usb-mobile-pairing-approval')}</div>
              <div class="remote-peer">
                <div class="remote-peer-main">
                  <div class="remote-peer-title">${pairingApproval.peer_label}</div>
                  <div class="remote-peer-meta">
                    ${i18n('remote:usb-mobile-pairing-fingerprint', {
                      fingerprint: pairingApproval.peer_fingerprint,
                    })}
                  </div>
                </div>
              </div>
              <div class="remote-form-grid">
                <label class="remote-field">
                  <span class="remote-field-label">${i18n('network-pair:pin')}</span>
                  <cv-input
                    type="text"
                    inputmode="numeric"
                    placeholder="123456"
                    .value=${usb.pairingApprovalPin()}
                    @cv-input=${ctx.actions.onUsbPairingPinInput}
                    data-usb-pairing-pin
                  ></cv-input>
                </label>
              </div>
              <div class="remote-peer-badges">
                <span class="mode-badge status-warning" data-usb-pairing-attempts>
                  ${i18n('remote:usb-mobile-pairing-attempts-left', {
                    count: String(pairingApproval.attempts_left),
                  })}
                </span>
              </div>
              <div class="remote-actions">
                <cv-button
                  variant="primary"
                  ?disabled=${!usb.canConfirmPairing()}
                  .loading=${pendingAction === 'pair_confirm'}
                  @click=${ctx.actions.onUsbConfirmPairing}
                  aria-label=${i18n('remote:usb-mobile-confirm-pairing')}
                  data-usb-confirm-pairing
                >
                  ${i18n('remote:usb-mobile-confirm-pairing')}
                </cv-button>
              </div>
            </div>
          `
        : nothing}
      ${activeHost
        ? html`
            <div class="remote-presence-panel" data-usb-section="active-host">
              <div class="remote-field-label">${i18n('remote:usb-mobile-active-host')}</div>
              <div class="remote-peer">
                <div class="remote-peer-main">
                  <div class="remote-peer-title">${activeHost.label || activeHost.host_id}</div>
                  <div class="remote-peer-meta">
                    ${activeHost.platform} · ${formatUsbBridgeKind(activeHost.bridge_kind)} ·
                    ${activeHost.host_id}
                  </div>
                </div>
              </div>
            </div>
          `
        : nothing}
      ${pairedHosts.length
        ? html`
            <div class="remote-presence-panel" data-usb-section="paired-hosts">
              <div class="remote-field-label">${i18n('remote:usb-mobile-paired-hosts')}</div>
              <div class="remote-peer-list">
                ${pairedHosts.map(
                  (host) => html`
                    <div class="remote-peer" data-usb-pairing-state=${host.pairingState}>
                      <div class="remote-peer-main">
                        <div class="remote-peer-title">${host.label}</div>
                        <div class="remote-peer-meta">
                          ${host.platform} · ${formatUsbBridgeKind(host.source.bridge_kind)} ·
                          ${formatUsbPairingState(host.pairingState)}
                        </div>
                      </div>
                      <div class="remote-peer-actions">
                        <cv-button
                          variant="primary"
                          ?disabled=${actionBusy || !host.canConnect}
                          .loading=${pendingAction === 'connect'}
                          @click=${() => ctx.actions.onUsbConnectPairedHost(host.source.host_id)}
                          aria-label=${i18n('remote:usb-mobile-connect-host', {label: host.label})}
                        >
                          ${i18n('button:connect')}
                        </cv-button>
                        ${host.canRemove
                          ? html`
                              <cv-button
                                variant="danger"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'remove'}
                                @click=${() => ctx.actions.onUsbRemovePairedHost(host.source.host_id)}
                                aria-label=${i18n('remote:usb-mobile-remove-host', {label: host.label})}
                              >
                                ${i18n('button:remove')}
                              </cv-button>
                            `
                          : nothing}
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
        : nothing}
      ${scanResults.length
        ? html`
            <div class="remote-presence-panel" data-usb-section="scan-results">
              <div class="remote-field-label">${i18n('remote:usb-mobile-scan-results')}</div>
              <div class="remote-peer-list">
                ${scanResults.map((result) => {
                  const pairedHostId = result.pairedHostId
                  const brokenHostId = result.brokenHostId

                  return html`
                    <div class="remote-peer" data-usb-scan-classification=${result.classification}>
                      <div class="remote-peer-main">
                        <div class="remote-peer-title">
                          ${result.label ?? i18n('remote:usb-mobile-device')}
                        </div>
                        <div class="remote-peer-meta">
                          ${result.platform} · ${formatUsbBridgeKind(result.source.scan.bridge_kind)} ·
                          ${formatUsbClassification(result.classification)}
                        </div>
                      </div>
                      <div class="remote-peer-actions">
                        ${result.canPair
                          ? html`
                              <cv-button
                                variant="primary"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'pair'}
                                @click=${() => ctx.actions.onUsbPairScannedHost(result.source)}
                                aria-label=${i18n('remote:usb-mobile-pair-device', {
                                  label: result.label ?? i18n('remote:usb-mobile-device'),
                                })}
                              >
                                ${i18n('remote:usb-mobile-pair')}
                              </cv-button>
                            `
                          : nothing}
                        ${result.canConnect && pairedHostId
                          ? html`
                              <cv-button
                                variant="primary"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'connect'}
                                @click=${() => ctx.actions.onUsbConnectPairedHost(pairedHostId)}
                                aria-label=${i18n('remote:usb-mobile-connect-host', {
                                  label: result.label ?? pairedHostId,
                                })}
                              >
                                ${i18n('button:connect')}
                              </cv-button>
                            `
                          : nothing}
                        ${result.canRemoveBroken && brokenHostId
                          ? html`
                              <cv-button
                                variant="danger"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'remove'}
                                @click=${() => ctx.actions.onUsbRemovePairedHost(brokenHostId)}
                                aria-label=${i18n('remote:usb-mobile-remove-host', {
                                  label: result.label ?? brokenHostId,
                                })}
                              >
                                ${i18n('button:remove')}
                              </cv-button>
                            `
                          : nothing}
                        ${result.canListPaired
                          ? html`
                              <cv-button
                                variant="ghost"
                                ?disabled=${actionBusy}
                                .loading=${pendingAction === 'load_paired'}
                                @click=${ctx.actions.onUsbLoadPaired}
                                aria-label=${i18n('remote:usb-mobile-list-paired')}
                              >
                                ${i18n('remote:usb-mobile-list-paired')}
                              </cv-button>
                            `
                          : nothing}
                      </div>
                    </div>
                  `
                })}
              </div>
            </div>
          `
        : nothing}

      <div class="remote-actions">
        <cv-button
          variant="primary"
          ?disabled=${actionBusy}
          .loading=${pendingAction === 'scan'}
          @click=${ctx.actions.onUsbScan}
          aria-label=${i18n('remote:usb-mobile-scan')}
        >
          ${i18n('remote:usb-mobile-scan')}
        </cv-button>
        <cv-button
          variant="ghost"
          ?disabled=${actionBusy}
          .loading=${pendingAction === 'refresh_status'}
          @click=${ctx.actions.onUsbRefreshStatus}
        >
          ${i18n('network-pair:button-refresh-presence')}
        </cv-button>
        <cv-button
          variant="ghost"
          ?disabled=${actionBusy}
          .loading=${pendingAction === 'disconnect'}
          @click=${ctx.actions.onUsbDisconnect}
        >
          ${i18n('button:disconnect')}
        </cv-button>
        ${usb.errorText()
          ? html`
              <cv-button variant="ghost" @click=${ctx.actions.onUsbDismissError}>
                ${i18n('remote:usb-mobile-dismiss-error')}
              </cv-button>
            `
          : nothing}
        <cv-button variant="ghost" @click=${ctx.actions.onBackToHosts}>${i18n('button:cancel')}</cv-button>
      </div>
    </div>
  `

  return html` ${renderBackLink(ctx.ui.pairBackLink)} ${content} `
}

function renderUsbDetectedDevicesPanel(ctx: RemoteHostsFlowRenderContext): TemplateResult | typeof nothing {
  const usb = ctx.model.usb
  const detected = usb.detectedDeviceViews()
  if (!detected.length) return nothing

  const actionBusy = ctx.model.connectionOperationBusy()
  const pendingAction = usb.pendingAction()

  return html`
    <div class="remote-presence-panel" data-usb-section="detected-devices">
      <div class="remote-field-label">${i18n('remote:usb-mobile-detected-title')}</div>
      <div class="remote-peer-list">
        ${detected.map((device) => {
          const pairedHostId = device.pairedHostId

          return html`
            <div
              class="remote-peer"
              data-usb-detected-accessory=${String(device.accessoryMode)}
              data-usb-detected-paired=${String(pairedHostId !== null)}
            >
              <div class="remote-peer-main">
                <div class="remote-peer-title">${device.label}</div>
                <div class="remote-peer-meta">
                  ${device.platform} · ${formatUsbBridgeKind(device.source.scan.bridge_kind)} ·
                  ${device.accessoryMode
                    ? i18n('remote:usb-mobile-detected-accessory')
                    : i18n('remote:usb-mobile-detected-candidate')}
                </div>
                <div class="remote-peer-meta">
                  ${pairedHostId
                    ? device.pairingState === 'confirmed'
                      ? i18n('remote:usb-mobile-detected-paired-as', {
                          label: device.pairedLabel ?? pairedHostId,
                        })
                      : i18n('remote:usb-mobile-detected-broken')
                    : i18n('remote:usb-mobile-detected-not-paired')}
                </div>
              </div>
              <div class="remote-peer-actions">
                ${device.pairingState === 'confirmed' && pairedHostId
                  ? html`
                      <cv-button
                        variant="primary"
                        ?disabled=${actionBusy}
                        .loading=${pendingAction === 'connect'}
                        @click=${() => ctx.actions.onUsbConnectPairedHost(pairedHostId)}
                        aria-label=${i18n('remote:usb-mobile-connect-host', {label: device.label})}
                      >
                        ${i18n('button:connect')}
                      </cv-button>
                    `
                  : nothing}
              </div>
            </div>
          `
        })}
      </div>
    </div>
  `
}

function formatUsbPendingAction(action: MobileUsbPendingAction | null): string {
  switch (action) {
    case 'refresh_status':
      return i18n('remote:usb-mobile-busy-refresh')
    case 'scan':
      return i18n('remote:usb-mobile-busy-scan')
    case 'load_paired':
      return i18n('remote:usb-mobile-busy-load-paired')
    case 'pair':
      return i18n('remote:usb-mobile-busy-pair')
    case 'pair_confirm':
      return i18n('remote:usb-mobile-busy-pair-confirm')
    case 'connect':
      return i18n('remote:usb-mobile-busy-connect')
    case 'disconnect':
      return i18n('remote:usb-mobile-busy-disconnect')
    case 'remove':
      return i18n('remote:usb-mobile-busy-remove')
    default:
      return i18n('remote:usb-mobile-busy')
  }
}

function formatUsbFlowState(state: MobileUsbFlowState): string {
  switch (state) {
    case 'unsupported':
      return i18n('remote:usb-mobile-state-unsupported')
    case 'idle':
      return i18n('remote:usb-mobile-state-idle')
    case 'scanning':
      return i18n('remote:usb-mobile-state-scanning')
    case 'unpaired':
      return i18n('remote:usb-mobile-state-unpaired')
    case 'paired':
      return i18n('remote:usb-mobile-state-paired')
    case 'pairing':
      return i18n('remote:usb-mobile-state-pairing')
    case 'pairing_approval':
      return i18n('remote:usb-mobile-state-pairing-approval')
    case 'session_approval':
      return i18n('remote:usb-mobile-state-session-approval')
    case 'connecting':
      return i18n('remote:usb-mobile-state-connecting')
    case 'waiting_host_unlock':
      return i18n('remote:usb-mobile-state-waiting-host-unlock')
    case 'ready':
      return i18n('status:ready')
    case 'disconnected':
      return i18n('status:offline')
    case 'recovery':
      return i18n('remote:usb-mobile-state-recovery')
    case 'error':
      return i18n('status:error')
  }
}

function formatUsbTransport(transport: string | null): string {
  if (transport === 'usb_mobile') return i18n('remote:transport-usb-mobile')
  return i18n('remote:transport-none')
}

function formatUsbBridgeKind(bridgeKind: string): string {
  if (bridgeKind === 'android_aoa') return i18n('remote:transport-android-aoa')
  if (bridgeKind === 'ios_external_accessory') return i18n('remote:transport-ios-external-accessory')
  return bridgeKind
}

function formatUsbPairingState(state: string): string {
  if (state === 'paired') return i18n('remote:usb-mobile-classification-paired')
  if (state === 'broken_local_state') return i18n('remote:usb-mobile-classification-broken')
  return state
}

function formatUsbClassification(classification: MobileUsbScanClassificationKind): string {
  if (classification === 'unpaired') return i18n('remote:usb-mobile-classification-unpaired')
  if (classification === 'paired') return i18n('remote:usb-mobile-classification-paired')
  if (classification === 'broken_local_state') return i18n('remote:usb-mobile-classification-broken')
  return i18n('remote:usb-mobile-classification-ambiguous')
}

function formatUsbRecoveryAction(action: MobileUsbRecoveryAction): string {
  switch (action) {
    case 'hide_usb_entry':
      return i18n('remote:usb-mobile-recovery-hide')
    case 'manual_retry':
    case 'keep_current_flow':
      return i18n('remote:usb-mobile-recovery-retry')
    case 'retry_scan':
    case 'retry_permission':
      return i18n('remote:usb-mobile-recovery-scan')
    case 'wait_in_flight':
      return i18n('remote:usb-mobile-recovery-wait')
    case 'list_paired':
      return i18n('remote:usb-mobile-recovery-list-paired')
    case 'pair_host':
      return i18n('remote:usb-mobile-recovery-pair')
    case 'connect_existing':
      return i18n('remote:usb-mobile-recovery-connect')
    case 'remove_and_repair':
      return i18n('remote:usb-mobile-recovery-remove')
    case 'disconnect_before_retry':
      return i18n('remote:usb-mobile-recovery-disconnect')
    case 'wait_for_host_unlock':
      return i18n('remote:usb-mobile-recovery-unlock')
    case 'ignore_stale_unlock':
      return i18n('remote:usb-mobile-recovery-ignore')
    case 'continue_read_only':
      return i18n('remote:usb-mobile-recovery-read-only')
  }
}
