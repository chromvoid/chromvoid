import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const openExternalBrowserUrl = vi.hoisted(() => vi.fn((_url: string) => Promise.resolve()))

vi.mock('../../src/shared/services/external-browser', () => ({
  openExternalBrowserUrl: (url: string) => openExternalBrowserUrl(url),
}))

import {setLang} from '../../src/i18n'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {
  LEGAL_DOCUMENT_URLS,
  isLegalDocument,
  legalDocumentsModel,
  splitLegalConsent,
} from '../../src/shared/services/legal-documents.model'

const PRIVACY_URL = 'https://chromvoid.com/en/legal/privacy-policy/'
const TERMS_URL = 'https://chromvoid.com/en/legal/terms-of-service-eula/'

describe('legal documents model', () => {
  let pushNotification: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setLang('en')
    openExternalBrowserUrl.mockReset()
    openExternalBrowserUrl.mockResolvedValue(undefined)
    pushNotification = vi.fn()
    initAppContext(createMockAppContext({store: {pushNotification} as never}))
  })

  afterEach(() => {
    clearAppContext()
    setLang('en')
  })

  it('points at the published privacy policy and terms of service', () => {
    expect(LEGAL_DOCUMENT_URLS).toEqual({
      'privacy-policy': PRIVACY_URL,
      'terms-of-service': TERMS_URL,
    })
    expect(legalDocumentsModel.links().map(({document, href, label}) => ({document, href, label}))).toEqual([
      {document: 'privacy-policy', href: PRIVACY_URL, label: 'Privacy Policy'},
      {document: 'terms-of-service', href: TERMS_URL, label: 'Terms of Service'},
    ])
  })

  it('recognises only known legal documents', () => {
    expect(isLegalDocument('privacy-policy')).toBe(true)
    expect(isLegalDocument('terms-of-service')).toBe(true)
    expect(isLegalDocument('toString')).toBe(false)
    expect(isLegalDocument(undefined)).toBe(false)
  })

  it('renders the English consent sentence with both documents as links', () => {
    expect(legalDocumentsModel.consentParts()).toEqual([
      {kind: 'text', text: 'By continuing, you agree to the '},
      {kind: 'link', document: 'terms-of-service', href: TERMS_URL, label: 'Terms of Service'},
      {kind: 'text', text: ' and acknowledge the '},
      {kind: 'link', document: 'privacy-policy', href: PRIVACY_URL, label: 'Privacy Policy'},
      {kind: 'text', text: '.'},
    ])
  })

  it('places the links wherever a translation puts the placeholders', () => {
    const parts = splitLegalConsent('${privacy}: read it, then ${terms}', {
      'privacy-policy': 'P',
      'terms-of-service': 'T',
    })

    expect(parts).toEqual([
      {kind: 'link', document: 'privacy-policy', href: PRIVACY_URL, label: 'P'},
      {kind: 'text', text: ': read it, then '},
      {kind: 'link', document: 'terms-of-service', href: TERMS_URL, label: 'T'},
    ])
  })

  it('follows the active language', () => {
    setLang('ru')

    const links = legalDocumentsModel
      .consentParts()
      .filter((part) => part.kind === 'link')
      .map((part) => part.label)

    expect(links).toEqual(['Условия использования', 'Политикой конфиденциальности'])
  })

  it('opens a document through the external browser opener', async () => {
    await legalDocumentsModel.open('terms-of-service')

    expect(openExternalBrowserUrl).toHaveBeenCalledWith(TERMS_URL)
    expect(pushNotification).not.toHaveBeenCalled()
  })

  it('reports a failure to open the browser', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    openExternalBrowserUrl.mockRejectedValueOnce(new Error('no browser'))

    await legalDocumentsModel.open('privacy-policy')

    expect(openExternalBrowserUrl).toHaveBeenCalledWith(PRIVACY_URL)
    expect(pushNotification).toHaveBeenCalledWith('error', 'Failed to open the legal document')
    warn.mockRestore()
  })
})
