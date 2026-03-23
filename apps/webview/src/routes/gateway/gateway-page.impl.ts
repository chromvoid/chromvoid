import {XLitElement} from '@statx/lit'
import {html, nothing} from 'lit'

import {navigationModel} from 'root/app/navigation/navigation.model'

import {GatewayModel, type AccessDuration} from './gateway.model'
import {gatewayPageStyles} from './gateway-page.styles'
import {renderGatewayExtensionsSection} from './components/gateway-extensions-section'
import {renderGatewayPairingSection} from './components/gateway-pairing-section'
import {renderGatewayPolicySection} from './components/gateway-policy-section'
import {renderGatewaySettingsSection} from './components/gateway-settings-section'

export class GatewayPage extends XLitElement {
  static define() {
    if (!customElements.get('gateway-page')) {
      customElements.define('gateway-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
  }

  declare hideBackLink: boolean

  static styles = gatewayPageStyles

  private readonly model = new GatewayModel()

  constructor() {
    super()
    this.hideBackLink = false
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.model.loadConfig()
  }

  disconnectedCallback(): void {
    this.model.dispose()
    super.disconnectedCallback()
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
        <header class="header">
          ${this.hideBackLink
            ? nothing
            : html`<button class="back-link" @click=${this.onBack}>
                <cv-icon name="arrow-left"></cv-icon>
                Back to files
              </button>`}
          <h1 class="title">Browser Extension Gateway</h1>
          <p class="subtitle">Manage browser extension connections to your vault</p>
        </header>

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
