import {afterEach, describe, expect, it, vi} from 'vitest'

import {MarkdownDocumentPage} from '../../src/features/file-manager/components/markdown-document-page'
import {MarkdownPreview} from '../../src/features/file-manager/components/markdown-preview'
import {markdownDocumentRenameModel} from '../../src/features/file-manager/models/markdown-document-rename.model'
import {
  markdownPreviewModel,
  type MarkdownPreviewReadyState,
} from '../../src/features/file-manager/models/markdown-preview.model'

function ensureDefined() {
  MarkdownDocumentPage.define()
  MarkdownPreview.define()
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function readyState(overrides: Partial<MarkdownPreviewReadyState> = {}): MarkdownPreviewReadyState {
  const source = overrides.source ?? '# Notes'
  const baseline = overrides.baseline ?? '# Notes'
  return {
    kind: 'ready',
    fileId: 7,
    fileName: 'notes.md',
    size: 7,
    mimeType: 'text/markdown',
    lastModified: 123,
    source,
    baseline,
    sourceRevision: 11,
    baselineSourceRevision: 11,
    mode: 'preview',
    dirty: source !== baseline,
    saving: false,
    formatting: false,
    stale: false,
    renderedHtml: '<h1>Notes</h1>',
    errorKey: null,
    readOnlyReasonKey: null,
    lastSavedAt: null,
    autosavePending: false,
    lastAutosaveAttemptAt: null,
    ...overrides,
  }
}

describe('markdown-document-page component', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    markdownDocumentRenameModel.reset()
    markdownPreviewModel.cleanup()
    vi.restoreAllMocks()
  })

  it('renders Markdown preview as page content and forwards close actions', async () => {
    ensureDefined()
    vi.spyOn(markdownPreviewModel, 'setPreview').mockImplementation(() => {})
    const close = vi.fn()

    const element = document.createElement('markdown-document-page') as MarkdownDocumentPage
    element.data = {
      fileId: 7,
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      sourceRevision: 11,
      mode: 'markdown',
    }
    element.addEventListener('close', close)
    document.body.appendChild(element)
    await settle(element)

    const markdown = element.shadowRoot?.querySelector('markdown-preview') as MarkdownPreview | null
    expect(markdown?.data).toEqual({
      fileId: 7,
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      sourceRevision: 11,
      mode: 'markdown',
    })
    expect(element.shadowRoot?.querySelector('.title')?.textContent).toBe('notes.md')

    element.shadowRoot?.querySelector<HTMLButtonElement>('.back-button')?.click()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('renders inline title editing and shows model validation errors', async () => {
    ensureDefined()
    markdownPreviewModel.state.set(readyState())

    const element = document.createElement('markdown-document-page') as MarkdownDocumentPage
    element.data = {
      fileId: 7,
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      sourceRevision: 11,
      mode: 'markdown',
    }
    document.body.appendChild(element)
    await settle(element)

    element.shadowRoot?.querySelector<HTMLButtonElement>('.title-button')?.click()
    await settle(element)

    const input = element.shadowRoot?.querySelector<HTMLInputElement>('.title-input')
    expect(input?.value).toBe('notes.md')

    if (input) {
      input.value = 'bad/name.md'
      input.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, data: 'bad/name.md'}))
    }
    element.shadowRoot?.querySelector<HTMLFormElement>('.title-form')?.dispatchEvent(
      new Event('submit', {bubbles: true, cancelable: true, composed: true}),
    )
    await settle(element)

    expect(element.shadowRoot?.querySelector('.title-error')?.textContent).toBeTruthy()
    expect(element.shadowRoot?.querySelector<HTMLInputElement>('.title-input')?.getAttribute('aria-invalid')).toBe('true')
  })

  it('renders route-level loading state while the Markdown document is pending', async () => {
    ensureDefined()

    const element = document.createElement('markdown-document-page') as MarkdownDocumentPage
    element.pending = true
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('markdown-preview')).toBeNull()
    expect(element.shadowRoot?.querySelector('.pending')?.getAttribute('role')).toBe('status')
  })
})
