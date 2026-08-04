import {html, nothing, type TemplateResult} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {i18n} from 'root/i18n'
import type {WelcomeSetupModel} from './welcome-setup.model'
import {renderDeviceLabelCopy} from './remote-desktop-preauth.copy'

export interface RemoteDesktopPreauthUsbActions {
  onBack: () => void
  onPinInput: (event: Event) => void
  onPinSubmit: (event: Event) => void
  onPrimary: () => void
  onPairScanned: (event: Event) => void
  onConnectHost: (event: Event) => void
  onLoadPaired: () => void
  onRemoveHost: (event: Event) => void
}

function backIcon(): TemplateResult {
  return html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7"></path>
    </svg>
  `
}

function bridgeCopy(bridge: string | null | undefined): string {
  if (bridge === 'android_aoa') return i18n('remote:transport-android-aoa')
  if (bridge === 'ios_external_accessory') return i18n('remote:transport-ios-external-accessory')
  return bridge || i18n('remote:preauth-status-unavailable')
}

function platformCopy(platform: string): string {
  if (platform === 'android') return i18n('remote:platform-android')
  if (platform === 'ios') return i18n('remote:platform-ios')
  return i18n('remote:platform-network')
}

function taskHeading(model: WelcomeSetupModel): TemplateResult {
  const usb = model.remote.usb
  const flowState = usb.flowState()
  const errorCode = usb.activeErrorCode()
  const presentation = usb.desktopPresentation()
  const recoveryAction = presentation.recoveryAction
  const onlyScannedHost =
    presentation.scannedRows.length === 1 && presentation.pairedRows.length === 0
      ? presentation.scannedRows[0]!
      : null
  const progress =
    ['scanning', 'pairing', 'connecting', 'session_approval', 'waiting_host_unlock', 'ready'].includes(
      flowState,
    ) ||
    recoveryAction === 'wait_in_flight' ||
    recoveryAction === 'wait_for_host_unlock'
  let title: string = i18n('remote:preauth-usb-title')
  let description: string = i18n('remote:preauth-usb-description')
  let tone: 'warning' | 'danger' | 'neutral' = 'neutral'

  if (flowState === 'scanning') title = i18n('remote:preauth-usb-scanning')
  if (flowState === 'pairing') title = i18n('remote:preauth-usb-pairing')
  if (flowState === 'connecting') title = i18n('remote:preauth-usb-connecting')
  if (flowState === 'pairing_approval' || flowState === 'session_approval') {
    title = i18n('remote:preauth-usb-approval')
    description = i18n('remote:preauth-usb-approval-description')
    tone = 'warning'
  }
  if (flowState === 'waiting_host_unlock' || flowState === 'ready') {
    title = i18n('remote:preauth-wait-unlock-title')
    description = i18n('remote:preauth-usb-wait')
    tone = 'warning'
  }
  if (recoveryAction === 'wait_in_flight') {
    title = i18n('remote:preauth-usb-wait')
    description = i18n('remote:usb-mobile-error-busy')
    tone = 'warning'
  } else if (recoveryAction === 'wait_for_host_unlock') {
    title = i18n('remote:preauth-wait-unlock-title')
    description = i18n('remote:preauth-usb-wait')
    tone = 'warning'
  } else if (recoveryAction === 'continue_read_only') {
    title = i18n('remote:desktop-usb-ready-title')
    description = i18n('remote:usb-mobile-recovery-read-only')
  } else if (recoveryAction === 'remove_and_repair') {
    title = i18n('remote:preauth-usb-recovery')
    description = i18n('remote:usb-mobile-detected-broken')
    tone = 'danger'
  } else if (flowState === 'recovery' || flowState === 'error' || flowState === 'disconnected') {
    title = i18n('remote:preauth-usb-recovery')
    description =
      errorCode === 'ERR_USB_MOBILE_PERMISSION_DENIED'
        ? i18n('remote:preauth-usb-permission-error')
        : errorCode === 'ERR_USB_MOBILE_CABLE_DISCONNECTED'
          ? i18n('remote:preauth-usb-disconnected-error')
          : i18n('remote:preauth-usb-recovery-description')
    tone = 'danger'
  }
  if (flowState === 'unpaired') {
    description = i18n('remote:preauth-usb-approval-description')
    if (!onlyScannedHost?.canPair) title = i18n('remote:preauth-usb-choose')
  }
  if (flowState === 'paired') {
    title =
      presentation.scannedRows.length + presentation.pairedRows.length > 1
        ? i18n('remote:preauth-usb-choose')
        : i18n('remote:preauth-usb-connect')
    description = i18n('remote:preauth-usb-approval-description')
  }

  return html`
    <div class="task-heading" data-tone=${tone}>
      <h2 id="remote-preauth-usb-task-title" tabindex="-1">
        ${flowState === 'unpaired' && onlyScannedHost?.canPair
          ? renderDeviceLabelCopy(
              'remote:preauth-usb-detected',
              onlyScannedHost.label ?? i18n('remote:usb-mobile-device'),
            )
          : title}
      </h2>
      <p class="task-description">${description}</p>
      ${progress
        ? html`
            <div class="inline-state" role="status" aria-live="polite" aria-atomic="true">
              <span class="spinner" aria-hidden="true"></span>
              <span>${i18n('remote:preauth-usb-wait')}</span>
            </div>
          `
        : nothing}
    </div>
  `
}

function usbRows(
  model: WelcomeSetupModel,
  actions: RemoteDesktopPreauthUsbActions,
  showRowActions: boolean,
): TemplateResult {
  const remote = model.remote
  const usb = remote.usb
  const actionBusy = remote.connectionOperationBusy()
  const presentation = usb.desktopPresentation()

  return html`
    <ul class="usb-list">
      ${presentation.scannedRows.map(
        (host, index) => html`
          <li class="usb-row" data-usb-scan-index=${index}>
            <div class="usb-main">
              <strong><bdi dir="auto">${host.label ?? i18n('remote:usb-mobile-device')}</bdi></strong>
              <span class="row-meta">${platformCopy(host.platform)}</span>
            </div>
            <div class="usb-actions">
              ${showRowActions && host.canPair
                ? html`<cv-button
                    size="small"
                    variant="primary"
                    data-usb-pair-index=${index}
                    ?disabled=${actionBusy}
                    @click=${actions.onPairScanned}
                    >${i18n('remote:preauth-usb-pair')}</cv-button
                  >`
                : nothing}
              ${showRowActions && host.canConnect && host.pairedHostId
                ? html`<cv-button
                    size="small"
                    variant="primary"
                    data-usb-connect-host-id=${host.pairedHostId}
                    ?disabled=${actionBusy}
                    @click=${actions.onConnectHost}
                    >${i18n('remote:preauth-usb-connect')}</cv-button
                  >`
                : nothing}
              ${showRowActions && host.canListPaired
                ? html`<cv-button
                    size="small"
                    variant="primary"
                    data-usb-load-paired
                    ?disabled=${actionBusy}
                    @click=${actions.onLoadPaired}
                    >${i18n('remote:preauth-usb-choose')}</cv-button
                  >`
                : nothing}
              ${showRowActions && host.canRemoveBroken && host.brokenHostId
                ? html`<cv-button
                    size="small"
                    variant="danger"
                    data-usb-remove-host-id=${host.brokenHostId}
                    ?disabled=${actionBusy}
                    @click=${actions.onRemoveHost}
                    >${i18n('remote:preauth-remove-confirm')}</cv-button
                  >`
                : nothing}
            </div>
          </li>
        `,
      )}
      ${repeat(
        presentation.pairedRows,
        (host) => host.source.host_id,
        (host) => html`
          <li class="device-item" data-usb-host-id=${host.source.host_id}>
            <div class="usb-row">
              <div class="usb-main">
                <strong><bdi dir="auto">${host.label}</bdi></strong>
                <span class="row-meta">${platformCopy(host.platform)}</span>
              </div>
              <div class="usb-actions">
                ${showRowActions && host.canConnect
                  ? html`<cv-button
                      size="small"
                      variant="primary"
                      data-usb-connect-host-id=${host.source.host_id}
                      ?disabled=${actionBusy}
                      @click=${actions.onConnectHost}
                      >${i18n('remote:preauth-usb-connect')}</cv-button
                    >`
                  : nothing}
                ${showRowActions && host.canRemove
                  ? html`<cv-button
                      size="small"
                      variant="danger"
                      data-usb-remove-host-id=${host.source.host_id}
                      ?disabled=${actionBusy}
                      @click=${actions.onRemoveHost}
                      >${i18n('remote:preauth-remove-confirm')}</cv-button
                    >`
                  : nothing}
              </div>
            </div>
          </li>
        `,
      )}
    </ul>
  `
}

function technicalDetails(model: WelcomeSetupModel, actions: RemoteDesktopPreauthUsbActions): TemplateResult {
  const usb = model.remote.usb
  const status = usb.status()
  const approval = usb.pairingApproval()
  const presentation = usb.desktopPresentation()
  const detailRows = presentation.detailRows
  const removableRows = detailRows.filter(({canRemove}) => canRemove)
  const actionBusy = model.remote.connectionOperationBusy()

  return html`
    <cv-disclosure class="technical-details" data-usb-technical-details>
      <span slot="trigger" class="details-trigger">
        <strong>${i18n('remote:preauth-details')}</strong>
        <small>${i18n('remote:preauth-details-summary')}</small>
      </span>
      <dl class="detail-list">
        ${detailRows.map(
          (host) => html`
            <div>
              <dt>${i18n('remote:preauth-detail-phone')}</dt>
              <dd><bdi dir="auto">${host.label}</bdi></dd>
            </div>
            <div>
              <dt>${i18n('remote:preauth-detail-peer-id')}</dt>
              <dd><code dir="ltr">${host.hostId}</code></dd>
            </div>
            <div>
              <dt>${i18n('remote:preauth-detail-usb-bridge')}</dt>
              <dd dir="ltr">${bridgeCopy(host.bridge)}</dd>
            </div>
            <div>
              <dt>${i18n('remote:preauth-detail-status')}</dt>
              <dd>
                <span dir="ltr">${host.state}</span>${host.lastSeenMs
                  ? ` · ${new Date(host.lastSeenMs).toLocaleString()}`
                  : ''}
              </dd>
            </div>
          `,
        )}
        <div>
          <dt>${i18n('remote:preauth-detail-status')}</dt>
          <dd dir="ltr">${status?.session_state ?? usb.flowState()}</dd>
        </div>
        <div>
          <dt>${i18n('remote:preauth-detail-transport')}</dt>
          <dd>${i18n('remote:transport-usb-mobile')} · ${i18n('remote:network-fallback-disabled')}</dd>
        </div>
        ${approval
          ? html`<div>
              <dt>${i18n('remote:preauth-detail-fingerprint')}</dt>
              <dd><code dir="ltr">${approval.peer_fingerprint}</code></dd>
            </div>`
          : nothing}
        ${usb.activeErrorCode()
          ? html`<div>
              <dt>${i18n('remote:preauth-detail-error-code')}</dt>
              <dd><code dir="ltr">${usb.activeErrorCode()}</code></dd>
            </div>`
          : nothing}
        ${usb.errorText()
          ? html`<div>
              <dt>${i18n('status:error')}</dt>
              <dd><code dir="auto">${usb.errorText()}</code></dd>
            </div>`
          : nothing}
      </dl>
      ${removableRows.length > 0
        ? html`
            <ul class="technical-actions">
              ${repeat(
                removableRows,
                ({hostId}) => hostId,
                (host) => html`
                  <li>
                    <bdi dir="auto">${host.label}</bdi>
                    <cv-button
                      size="small"
                      variant="danger"
                      data-usb-remove-host-id=${host.hostId}
                      aria-label=${i18n('remote:usb-mobile-remove-host', {label: host.label})}
                      ?disabled=${actionBusy}
                      @click=${actions.onRemoveHost}
                    >
                      ${i18n('remote:preauth-remove-confirm')}
                    </cv-button>
                  </li>
                `,
              )}
            </ul>
          `
        : nothing}
    </cv-disclosure>
  `
}

function primaryLabel(model: WelcomeSetupModel): string {
  const usb = model.remote.usb
  const presentation = usb.desktopPresentation()
  if (presentation.recoveryCta) return presentation.recoveryCta.label

  switch (presentation.primaryAction?.kind) {
    case 'refresh_status':
      return i18n('button:refresh')
    case 'load_paired':
      return i18n('remote:preauth-usb-choose')
    case 'pair':
      return i18n('remote:preauth-usb-pair')
    case 'pair_confirm':
      return i18n('button:continue')
    case 'connect':
      return i18n('remote:preauth-usb-connect')
    case 'disconnect':
      return i18n('button:disconnect')
    case 'remove':
      return i18n('remote:preauth-remove-confirm')
    case 'scan':
      return usb.scanFoundNothing() ? i18n('remote:preauth-usb-scan-again') : i18n('remote:preauth-usb-scan')
    case 'back_to_hosts':
    case 'dismiss_error':
    case 'continue_read_only':
      break
  }
  return i18n('remote:preauth-usb-retry')
}

export function renderDesktopPreauthUsb(
  model: WelcomeSetupModel,
  actions: RemoteDesktopPreauthUsbActions,
): TemplateResult {
  const usb = model.remote.usb
  const flowState = usb.flowState()
  const actionBusy = model.remote.connectionOperationBusy()
  const approval = usb.pairingApproval()
  const pinError = usb.pairingApprovalPinError()
  const presentation = usb.desktopPresentation()
  const hasRows = presentation.scannedRows.length > 0 || presentation.pairedRows.length > 0

  return html`
    <main class="remote-preauth" data-remote-preauth-screen="usb" data-usb-flow-state=${flowState}>
      <header class="screen-header">
        <button class="back-button" type="button" ?disabled=${actionBusy} @click=${actions.onBack}>
          ${backIcon()}<span>${i18n('remote:preauth-back-phones')}</span>
        </button>
        <div class="screen-copy">
          <h1 data-screen-heading tabindex="-1">${i18n('remote:preauth-usb-title')}</h1>
          <p class="screen-description">${i18n('remote:preauth-usb-description')}</p>
        </div>
      </header>

      <section class="usb-task" aria-labelledby="remote-preauth-usb-task-title">
        <div class="task-panel">
          ${taskHeading(model)}
          ${approval
            ? html`
                <form class="approval-form" @submit=${actions.onPinSubmit} novalidate>
                  <cv-field required ?invalid=${Boolean(pinError)}>
                    <span slot="label">${i18n('remote:preauth-pairing-pin')}</span>
                    <cv-input
                      id="remote-preauth-usb-pin"
                      name="usb-pairing-pin"
                      type="text"
                      inputmode="numeric"
                      autocomplete="one-time-code"
                      autofocus
                      maxlength="6"
                      dir="ltr"
                      .value=${usb.pairingApprovalPin()}
                      @cv-input=${actions.onPinInput}
                    ></cv-input>
                    ${pinError ? html`<span slot="error">${pinError}</span>` : nothing}
                  </cv-field>
                  <cv-button
                    type="submit"
                    variant="primary"
                    ?disabled=${!usb.canConfirmPairing()}
                    .loading=${usb.pendingAction() === 'pair_confirm'}
                  >
                    ${i18n('remote:preauth-usb-continue')}
                  </cv-button>
                </form>
              `
            : nothing}
          ${usb.scanFoundNothing() && !actionBusy
            ? html`<p class="inline-state" data-usb-empty>${i18n('remote:preauth-usb-empty')}</p>`
            : nothing}
          ${hasRows ? usbRows(model, actions, !presentation.showPrimaryAction) : nothing}
          ${approval === null && presentation.showPrimaryAction
            ? html`
                <div class="usb-actions">
                  <cv-button
                    variant=${presentation.primaryAction?.kind === 'remove' ? 'danger' : 'primary'}
                    data-usb-primary-action
                    ?disabled=${actionBusy || !presentation.primaryActionEnabled}
                    .loading=${actionBusy}
                    @click=${actions.onPrimary}
                    >${primaryLabel(model)}</cv-button
                  >
                </div>
              `
            : nothing}
        </div>
      </section>
      ${technicalDetails(model, actions)}
    </main>
  `
}
