import assert from 'node:assert/strict'
import {beforeEach, describe, it} from 'node:test'

import type {
  CredentialCandidate,
  CredentialOneTimeCode,
  ProviderContext,
  ProviderStatus,
} from '@chromvoid/scheme'

import type {ExtensionTab} from '../runtime/webextension-api'
import {setLang} from './i18n'
import {createPopupModel, type PopupCredentialProvider, type PopupModelDependencies} from './popup.model'

const siteCandidate = (overrides: Partial<CredentialCandidate> = {}): CredentialCandidate => ({
  credential_id: 'site-credential',
  label: 'Example account',
  username: 'alice@example.test',
  domain: 'example.test',
  app_id: null,
  match: 'exact',
  otp_options: [
    {id: 'otp-primary', label: 'Primary', type: 'totp'},
    {id: 'otp-work', label: 'Work', type: 'totp'},
  ],
  last_used_at: null,
  ...overrides,
})

const webTab = (id = 7, url = 'https://example.test/login') => ({id, url}) as ExtensionTab

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {promise, resolve, reject}
}

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeProvider implements PopupCredentialProvider {
  statusValue = {enabled: true, vault_open: true} as ProviderStatus
  site = [siteCandidate()]
  searches: string[] = []
  passwordReads: Array<{context: ProviderContext; credentialId: string}> = []
  otpReads: Array<{context: ProviderContext; credentialId: string; otpId: string}> = []
  pairPins: string[] = []
  searchHandler: (query: string) => Promise<CredentialCandidate[]> = async () => []

  async status() {
    return this.statusValue
  }

  async pairWithPin(pin: string) {
    this.pairPins.push(pin)
    return true
  }

  async probeReachable() {
    return true
  }

  async listForContext() {
    return this.site
  }

  async searchAll(query: string) {
    this.searches.push(query)
    return this.searchHandler(query)
  }

  async readPasswordForSite(context: ProviderContext, credentialId: string) {
    this.passwordReads.push({context, credentialId})
    return {credentialId, username: 'alice@example.test', password: 'super-secret'}
  }

  async readOneTimeCodeForSite(context: ProviderContext, credentialId: string, otpId: string) {
    this.otpReads.push({context, credentialId, otpId})
    return {
      credential_id: credentialId,
      otp_id: otpId,
      code: '123456',
      valid_until_ms: Date.now() + 30_000,
    } satisfies CredentialOneTimeCode
  }
}

const createHarness = (options: {tabs?: ExtensionTab[]; provider?: FakeProvider} = {}) => {
  const provider = options.provider ?? new FakeProvider()
  const tabs = options.tabs ? [...options.tabs] : [webTab()]
  const sentPasswords: Array<{tabId: number; data: unknown}> = []
  const sentOtps: Array<{tabId: number; data: unknown}> = []
  const clipboard: string[] = []
  const opened: string[] = []
  const focusListeners = new Set<() => void>()
  const visibleListeners = new Set<() => void>()
  let tabIndex = 0

  const dependencies: PopupModelDependencies = {
    provider,
    async getActiveTab() {
      const tab = tabs[Math.min(tabIndex, tabs.length - 1)]
      tabIndex += 1
      return tab
    },
    async sendPassword(tabId, data) {
      sentPasswords.push({tabId, data})
    },
    async sendOtp(tabId, data) {
      sentOtps.push({tabId, data})
    },
    async writeClipboard(value) {
      clipboard.push(value)
    },
    async openTab(url) {
      opened.push(url)
    },
    subscribeFocus(listener) {
      focusListeners.add(listener)
      return () => focusListeners.delete(listener)
    },
    subscribeVisible(listener) {
      visibleListeners.add(listener)
      return () => visibleListeners.delete(listener)
    },
  }

  return {
    model: createPopupModel(dependencies),
    provider,
    sentPasswords,
    sentOtps,
    clipboard,
    opened,
    focusListeners,
    visibleListeners,
  }
}

describe('popup model', () => {
  beforeEach(() => setLang('en'))

  it('loads only current-site candidates for an empty query', async () => {
    const {model, provider} = createHarness()
    await model.refresh(true)

    assert.equal(model.runtime().kind, 'ready')
    assert.equal(model.currentHost(), 'example.test')
    assert.deepEqual(
      model.visibleCandidates().map((item) => item.credential_id),
      ['site-credential'],
    )
    assert.deepEqual(provider.searches, [])
  })

  it('does not dump the vault automatically on browser-internal pages', async () => {
    const {model, provider} = createHarness({tabs: [{id: 4, url: 'chrome://extensions'} as ExtensionTab]})
    await model.refresh(true)

    assert.equal(model.runtime().kind, 'ready')
    assert.equal(model.isWebTab(), false)
    assert.deepEqual(model.visibleCandidates(), [])
    assert.deepEqual(provider.searches, [])
  })

  it('keeps the latest global search result when older work finishes later', async () => {
    const provider = new FakeProvider()
    const oldResult = deferred<CredentialCandidate[]>()
    const newResult = deferred<CredentialCandidate[]>()
    provider.searchHandler = (query) => (query === 'old' ? oldResult.promise : newResult.promise)
    const {model} = createHarness({provider})
    await model.refresh(true)

    model.setQuery('old')
    await wait(250)
    model.setQuery('new')
    await wait(250)
    newResult.resolve([siteCandidate({credential_id: 'new-result'})])
    await wait()
    oldResult.resolve([siteCandidate({credential_id: 'old-result'})])
    await wait()

    assert.equal(model.query(), 'new')
    assert.deepEqual(
      model.search.data().map((item) => item.credential_id),
      ['new-result'],
    )
    assert.deepEqual(provider.searches, ['old', 'new'])
  })

  it('keeps search failures separate from the site list state', async () => {
    const provider = new FakeProvider()
    provider.searchHandler = async () => {
      throw new Error('Search transport failed')
    }
    const {model} = createHarness({provider})
    await model.refresh(true)

    model.setQuery('alice')
    await wait(250)
    await wait()

    assert.equal(model.runtime().kind, 'ready')
    assert.equal(model.siteCandidates().length, 1)
    assert.equal(model.searchError(), 'Search transport failed')
  })

  it('never reads a secret for a global result from another site', async () => {
    const {model, provider, clipboard} = createHarness()
    await model.refresh(true)
    const other = siteCandidate({credential_id: 'other', domain: 'other.test', match: 'exact'})

    await model.copyPassword(other)

    assert.deepEqual(provider.passwordReads, [])
    assert.deepEqual(clipboard, [])
    assert.match(model.actionError() ?? '', /saved site/i)
  })

  it('fails closed when the active tab changes while a password is being read', async () => {
    const {model, provider, sentPasswords} = createHarness({
      tabs: [webTab(7), webTab(7), webTab(8, 'https://other.test/login')],
    })
    await model.refresh(true)

    await model.fillPassword(provider.site[0]!)

    assert.equal(provider.passwordReads.length, 1)
    assert.deepEqual(sentPasswords, [])
    assert.match(model.actionError() ?? '', /active tab changed/i)
  })

  it('fills the captured tab and includes the expected origin', async () => {
    const {model, provider, sentPasswords} = createHarness({
      tabs: [webTab(7), webTab(7), webTab(7)],
    })
    await model.refresh(true)

    await model.fillPassword(provider.site[0]!)

    assert.deepEqual(sentPasswords, [
      {
        tabId: 7,
        data: {
          id: 'site-credential',
          username: 'alice@example.test',
          password: 'super-secret',
          expectedOrigin: 'https://example.test',
        },
      },
    ])
    assert.equal(model.actionError(), undefined)
    assert.equal(
      JSON.stringify([
        model.runtime(),
        model.siteCandidates(),
        model.selectedCandidate(),
        model.feedback(),
      ]).includes('super-secret'),
      false,
    )
  })

  it('uses the selected real OTP id for OTP-only actions', async () => {
    const {model, provider, sentOtps} = createHarness({
      tabs: [webTab(7), webTab(7), webTab(7)],
    })
    await model.refresh(true)
    const candidate = provider.site[0]!
    model.openDetail(candidate)
    model.setSelectedOtp('otp-work')

    await model.fillOtp(candidate)

    assert.equal(provider.otpReads[0]?.otpId, 'otp-work')
    assert.equal((sentOtps[0]?.data as {expectedOrigin?: string}).expectedOrigin, 'https://example.test')
  })

  it('validates pairing on submit without calling transport and updates after editing', async () => {
    const {model, provider} = createHarness()
    model.setPairingPin('12')

    assert.equal(await model.pair(), false)
    assert.deepEqual(provider.pairPins, [])
    assert.equal(model.pairingFocusRequest(), 1)
    assert.match(model.pairingPinError() ?? '', /6 digits/)

    model.setPairingPin('123456')
    assert.equal(model.pairingPinError(), undefined)
  })

  it('owns focus and visibility listener teardown explicitly', async () => {
    const {model, focusListeners, visibleListeners} = createHarness()
    model.connect()
    model.connect()
    await wait()

    assert.equal(focusListeners.size, 1)
    assert.equal(visibleListeners.size, 1)

    model.disconnect()
    assert.equal(focusListeners.size, 0)
    assert.equal(visibleListeners.size, 0)
  })
})
