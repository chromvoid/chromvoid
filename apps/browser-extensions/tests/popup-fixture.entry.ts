import type {CredentialCandidate, CredentialOneTimeCode, ProviderStatus} from '@chromvoid/scheme'

import {AppRoot} from '../src/popup/app'
import {CredentialDetail} from '../src/popup/components/credential-detail'
import {CredentialRow} from '../src/popup/components/credential-row'
import {ExtPairingForm} from '../src/popup/components/pairing-form'
import {RecoveryState} from '../src/popup/components/recovery-state'
import {setLang} from '../src/popup/i18n'
import {createPopupModel, type PopupCredentialProvider} from '../src/popup/popup.model'

const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'ready'
setLang(params.get('lang') === 'ru' ? 'ru' : 'en')

const candidate = (overrides: Partial<CredentialCandidate>): CredentialCandidate => ({
  credential_id: 'site-primary',
  label: 'Example account',
  username: 'alice@example.test',
  domain: 'example.test',
  app_id: null,
  match: 'exact',
  otp_options: [],
  last_used_at: null,
  ...overrides,
})

const siteCandidates = [
  candidate({
    credential_id: 'site-primary',
    label: params.has('long')
      ? 'Primary workspace account with a deliberately long descriptive name'
      : 'Primary account',
    otp_options: [
      {id: 'otp-main', label: 'Primary authenticator', type: 'totp'},
      {id: 'otp-backup', label: 'Backup authenticator', type: 'totp'},
    ],
  }),
  candidate({credential_id: 'site-team', label: 'Team workspace', username: 'alice+team@example.test'}),
  candidate({credential_id: 'site-admin', label: 'Administration', username: 'admin@example.test'}),
  candidate({credential_id: 'site-billing', label: 'Billing', username: 'billing@example.test'}),
]

const allCandidates = [
  ...siteCandidates,
  candidate({
    credential_id: 'other-site',
    label: 'Other service',
    username: 'alice@other.test',
    domain: 'other.test',
  }),
]

class FixtureProvider implements PopupCredentialProvider {
  async status(): Promise<ProviderStatus> {
    if (state === 'offline' || state === 'unpaired') {
      throw new Error('Gateway unavailable')
    }
    return {
      enabled: state !== 'disabled',
      vault_open: state !== 'locked',
    } as ProviderStatus
  }

  async pairWithPin(): Promise<boolean> {
    return true
  }

  async probeReachable(): Promise<boolean> {
    return state === 'unpaired'
  }

  async listForContext(): Promise<CredentialCandidate[]> {
    return siteCandidates
  }

  async searchAll(query: string): Promise<CredentialCandidate[]> {
    const normalized = query.toLowerCase()
    return allCandidates.filter((item) =>
      [item.label, item.username, item.domain ?? ''].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    )
  }

  async readPasswordForSite(_context: unknown, credentialId: string) {
    const item = siteCandidates.find((entry) => entry.credential_id === credentialId)!
    return {credentialId, username: item.username, password: 'fixture-secret'}
  }

  async readOneTimeCodeForSite(
    _context: unknown,
    credentialId: string,
    otpId: string,
  ): Promise<CredentialOneTimeCode> {
    return {credential_id: credentialId, otp_id: otpId, code: '123456', valid_until_ms: Date.now() + 30_000}
  }
}

const model = createPopupModel({
  provider: new FixtureProvider(),
  getActiveTab: async () => ({id: 1, url: 'https://example.test/login'}),
  sendPassword: async () => undefined,
  sendOtp: async () => undefined,
  writeClipboard: async () => undefined,
  openTab: async () => undefined,
  subscribeFocus: () => () => undefined,
  subscribeVisible: () => () => undefined,
})

CredentialDetail.define()
CredentialRow.define()
ExtPairingForm.define()
RecoveryState.define()
AppRoot.configure(model)
AppRoot.define()
