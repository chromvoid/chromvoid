import {computed, wrap} from '@reatom/core'

import {i18n} from 'root/i18n'
import {tryGetAppContext} from './app-context'
import {openExternalBrowserUrl} from './external-browser'

/** The only place the WebView knows where ChromVoid's public legal documents live. */
export const LEGAL_DOCUMENT_URLS = {
  'privacy-policy': 'https://chromvoid.com/en/legal/privacy-policy/',
  'terms-of-service': 'https://chromvoid.com/en/legal/terms-of-service-eula/',
} as const

export type LegalDocument = keyof typeof LEGAL_DOCUMENT_URLS

export type LegalDocumentLink = {
  readonly document: LegalDocument
  readonly href: string
  readonly label: string
}

export type LegalDocumentEntry = LegalDocumentLink & {
  readonly icon: string
}

export type LegalConsentPart =
  | {readonly kind: 'text'; readonly text: string}
  | ({readonly kind: 'link'} & LegalDocumentLink)

const CONSENT_PLACEHOLDER_PATTERN = /\$\{(terms|privacy)\}/g
const CONSENT_PLACEHOLDER_DOCUMENTS = {
  terms: 'terms-of-service',
  privacy: 'privacy-policy',
} as const satisfies Record<string, LegalDocument>

export function isLegalDocument(value: unknown): value is LegalDocument {
  return typeof value === 'string' && Object.hasOwn(LEGAL_DOCUMENT_URLS, value)
}

/**
 * Splits the translated consent sentence around its `${terms}` / `${privacy}` placeholders so the
 * link phrases can be rendered as links wherever the target language puts them.
 */
export function splitLegalConsent(
  template: string,
  labels: Readonly<Record<LegalDocument, string>>,
): LegalConsentPart[] {
  const parts: LegalConsentPart[] = []
  let cursor = 0

  for (const match of template.matchAll(CONSENT_PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push({kind: 'text', text: template.slice(cursor, index)})
    const document = CONSENT_PLACEHOLDER_DOCUMENTS[match[1] as keyof typeof CONSENT_PLACEHOLDER_DOCUMENTS]
    parts.push({kind: 'link', document, href: LEGAL_DOCUMENT_URLS[document], label: labels[document]})
    cursor = index + match[0].length
  }

  if (cursor < template.length) parts.push({kind: 'text', text: template.slice(cursor)})
  return parts
}

class LegalDocumentsModel {
  readonly links = computed(
    (): readonly LegalDocumentEntry[] => [
      {
        document: 'privacy-policy',
        href: LEGAL_DOCUMENT_URLS['privacy-policy'],
        label: i18n('legal:privacy-policy'),
        icon: 'shield',
      },
      {
        document: 'terms-of-service',
        href: LEGAL_DOCUMENT_URLS['terms-of-service'],
        label: i18n('legal:terms-of-service'),
        icon: 'scroll-text',
      },
    ],
    'legal.links',
  )

  readonly consentParts = computed(
    () =>
      splitLegalConsent(i18n('legal:consent'), {
        'privacy-policy': i18n('legal:consent-privacy'),
        'terms-of-service': i18n('legal:consent-terms'),
      }),
    'legal.consentParts',
  )

  async open(document: LegalDocument): Promise<void> {
    try {
      await wrap(openExternalBrowserUrl(LEGAL_DOCUMENT_URLS[document]))
    } catch (error) {
      console.warn('[Legal] Failed to open legal document', error)
      tryGetAppContext()?.store.pushNotification('error', i18n('legal:open-failed'))
    }
  }
}

export const legalDocumentsModel = new LegalDocumentsModel()
