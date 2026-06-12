import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing} from 'lit'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {guidanceCompletionBridge} from 'root/core/guidance'
import {i18n} from 'root/i18n'
import {renderRouteBackLink} from 'root/shared/ui/route-back-link'

import {GatewayModel, type AccessDuration} from './gateway.model'
import {gatewayPageStyles} from './gateway-page.styles'
import {renderGatewayExtensionsSection} from './components/gateway-extensions-section'
import {renderGatewayPairingSection} from './components/gateway-pairing-section'
import {renderGatewayPolicySection} from './components/gateway-policy-section'
import {renderGatewaySettingsSection} from './components/gateway-settings-section'

export class GatewayPage extends ReatomLitElement {
  static define() {
    if (!customElements.get('gateway-page')) {
      customElements.define('gateway-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
    externalToolbar: {type: Boolean, attribute: 'external-toolbar'},
  }

  declare hideBackLink: boolean
  declare externalToolbar: boolean

  static styles = gatewayPageStyles

  private readonly model = new GatewayModel()
  private guidanceCompletionUnsubscribe?: () => void

  constructor() {
    super()
    this.hideBackLink = false
    this.externalToolbar = false
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.guidanceCompletionUnsubscribe = guidanceCompletionBridge.bindGatewayPairedExtensions(
      this.model.pairedExtensions,
    )
    this.model.loadConfig()
  }

  disconnectedCallback(): void {
    this.guidanceCompletionUnsubscribe?.()
    this.guidanceCompletionUnsubscribe = undefined
    this.model.dispose()
    super.disconnectedCallback()
  }

  override updated(changed: Map<string, unknown>) {
    super.updated(changed)
    const progress = this.renderRoot.querySelector<HTMLElement>('.progress-bar-fill[data-progress]')
    if (!progress) {
      return
    }

    progress.style.setProperty('--gateway-pairing-progress', `${progress.dataset['progress'] ?? '0'}%`)
  }

  private onBack = () => {
    navigationModel.goBack()
  }

  private onToggleEnabled = () => {
    this.model.setEnabled(!this.model.isEnabled())
  }

  private onAccessDurationChange = (e: Event) => {
    const value = (e.target as HTMLSelectElement).value
    this.model.setAccessDuration(value as AccessDuration)
  }

  private onSessionDurationChange = (e: Event) => {
    const mins = parseInt((e.target as HTMLSelectElement).value, 10)
    this.model.setSessionDuration(mins)
  }

  private onRevoke = (id: string) => {
    this.model.revokeExtension(id)
  }

  private onShowPolicy = (id: string) => {
    this.model.loadCapabilityPolicy(id)
    this.model.loadActiveGrants(id)
  }

  private onClosePolicy = () => {
    this.model.selectedExtensionPolicy.set(null)
    this.model.activeGrants.set(null)
  }

  private onToggleActionGrant = () => {
    const policy = this.model.selectedExtensionPolicy()
    if (!policy) return
    this.model.saveCapabilityPolicy({...policy, require_action_grant: !policy.require_action_grant})
  }

  private onToggleSiteGrant = () => {
    const policy = this.model.selectedExtensionPolicy()
    if (!policy) return
    this.model.saveCapabilityPolicy({...policy, require_site_grant: !policy.require_site_grant})
  }

  private onAddAllowlistOrigin = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    const input = e.target as HTMLInputElement
    const origin = input.value.trim()
    if (!origin) return

    const policy = this.model.selectedExtensionPolicy()
    if (!policy) return

    if (!policy.site_allowlist.includes(origin)) {
      this.model.saveCapabilityPolicy({
        ...policy,
        site_allowlist: [...policy.site_allowlist, origin],
      })
    }
    input.value = ''
  }

  private onRemoveAllowlistOrigin = (origin: string) => {
    const policy = this.model.selectedExtensionPolicy()
    if (!policy) return
    this.model.saveCapabilityPolicy({
      ...policy,
      site_allowlist: policy.site_allowlist.filter((o) => o !== origin),
    })
  }

  private onRevokeAllGrants = () => {
    const policy = this.model.selectedExtensionPolicy()
    if (!policy) return
    this.model.revokeAllGrants(policy.extension_id)
  }

  private onStartPairing = () => {
    this.model.startPairing()
  }

  private onCancelPairing = () => {
    this.model.cancelPairing()
  }

  protected render() {
    const cfg = this.model.config()
    const extensions = this.model.pairedExtensions()
    const policy = this.model.selectedExtensionPolicy()
    const grants = this.model.activeGrants()

    return html`
      <div class="page">
        ${this.externalToolbar
          ? nothing
          : html`
              <header class="header">
                ${renderRouteBackLink({
                  hidden: this.hideBackLink,
                  label: i18n('gateway:back-to-files'),
                  onBack: this.onBack,
                })}
                <h1 class="title">${i18n('gateway:page-title')}</h1>
                <p class="subtitle">${i18n('gateway:page-subtitle')}</p>
              </header>
            `}

        <div class="grid">
          ${renderGatewaySettingsSection({
            cfg,
            onToggleEnabled: this.onToggleEnabled,
            onAccessDurationChange: this.onAccessDurationChange,
            onSessionDurationChange: this.onSessionDurationChange,
          })}
          ${renderGatewayExtensionsSection({
            extensions,
            onShowPolicy: this.onShowPolicy,
            onRevoke: this.onRevoke,
          })}
          ${renderGatewayPolicySection({
            policy,
            grants,
            onClosePolicy: this.onClosePolicy,
            onToggleActionGrant: this.onToggleActionGrant,
            onToggleSiteGrant: this.onToggleSiteGrant,
            onAddAllowlistOrigin: this.onAddAllowlistOrigin,
            onRemoveAllowlistOrigin: this.onRemoveAllowlistOrigin,
            onRevokeAllGrants: this.onRevokeAllGrants,
          })}
          ${renderGatewayPairingSection({
            phase: this.model.pairingPhase(),
            info: this.model.pairingInfo(),
            pinSecondsLeft: this.model.pinSecondsLeft(),
            tokenSecondsLeft: this.model.tokenSecondsLeft(),
            error: this.model.pairingError(),
            onStartPairing: this.onStartPairing,
            onCancelPairing: this.onCancelPairing,
          })}
        </div>
      </div>
    `
  }
}

GatewayPage.define()
