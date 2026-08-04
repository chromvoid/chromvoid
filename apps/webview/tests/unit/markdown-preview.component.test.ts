import {afterEach, describe, expect, it, vi} from 'vitest'

import {MarkdownPreview} from '../../src/features/file-manager/components/markdown-preview'
import {MarkdownDocumentPage} from '../../src/features/file-manager/components/markdown-document-page'
import {ensureRouteComponents} from '../../src/app/bootstrap/surface-component-loader'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {
  setMobileKeyboardOccluding,
} from '../../src/app/bootstrap/mobile-keyboard/keyboard-occlusion.model'
import {
  markdownPreviewModel,
  type MarkdownPreviewReadyState,
} from '../../src/features/file-manager/models/markdown-preview.model'
import {markdownDocumentRenameModel} from '../../src/features/file-manager/models/markdown-document-rename.model'
import {transientBackModel} from '../../src/shared/services/transient-back.model'

function ensureDefined() {
  MarkdownPreview.define()
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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
    renderedHtml: '<h1>Notes</h1><p><a href="https://example.com">Link</a></p>',
    imageAssets: {},
    errorKey: null,
    readOnlyReasonKey: null,
    lastSavedAt: null,
    autosavePending: false,
    lastAutosaveAttemptAt: null,
    ...overrides,
  }
}

function createPointerEvent(
  type: string,
  options: {
    clientX?: number
    clientY?: number
    pointerId?: number
    pointerType?: string
    button?: number
  } = {},
): PointerEvent {
  const event = new Event(type, {bubbles: true, cancelable: true, composed: true}) as PointerEvent
  Object.defineProperties(event, {
    button: {value: options.button ?? 0},
    clientX: {value: options.clientX ?? 24},
    clientY: {value: options.clientY ?? 24},
    pointerId: {value: options.pointerId ?? 1},
    pointerType: {value: options.pointerType ?? 'touch'},
  })
  return event
}

function createDoubleClickEvent(
  options: {clientX?: number; clientY?: number; firesTouchEvents?: boolean} = {},
): MouseEvent {
  const event = new MouseEvent('dblclick', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: options.clientX ?? 24,
    clientY: options.clientY ?? 24,
  })
  if (options.firesTouchEvents) {
    Object.defineProperty(event, 'sourceCapabilities', {
      configurable: true,
      value: {firesTouchEvents: true},
    })
  }
  return event
}

function createPasteEvent(files: File[]): ClipboardEvent {
  const event = new Event('paste', {bubbles: true, cancelable: true, composed: true}) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {files},
  })
  return event
}

function createDropEvent(files: File[]): DragEvent {
  const event = new Event('drop', {bubbles: true, cancelable: true, composed: true}) as DragEvent
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {files},
  })
  return event
}

function getSourceEditorContent(editor: HTMLElement): HTMLElement {
  const content = editor.shadowRoot?.querySelector<HTMLElement>('.cm-content')
  if (!content) {
    throw new Error('CodeMirror content not found')
  }
  return content
}

function stubDocumentSelectionObject(selection: Partial<Selection>): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(document, 'getSelection')
  Object.defineProperty(document, 'getSelection', {
    configurable: true,
    value: vi.fn(() => selection),
  })

  return () => {
    if (descriptor) {
      Object.defineProperty(document, 'getSelection', descriptor)
    } else {
      delete (document as Document & {getSelection?: () => Selection | null}).getSelection
    }
  }
}

function stubCaretRangeFromPoint(range: Range | null): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint')
  Object.defineProperty(document, 'caretRangeFromPoint', {
    configurable: true,
    value: vi.fn(() => range),
  })

  return () => {
    if (descriptor) {
      Object.defineProperty(document, 'caretRangeFromPoint', descriptor)
    } else {
      delete (document as Document & {caretRangeFromPoint?: (x: number, y: number) => Range | null})
        .caretRangeFromPoint
    }
  }
}

function createElementWithState(state: MarkdownPreviewReadyState): MarkdownPreview {
  markdownPreviewModel.state.set(state)
  const element = document.createElement('markdown-preview') as MarkdownPreview
  document.body.appendChild(element)
  return element
}

function clickModeButton(element: MarkdownPreview, label: string): void {
  Array.from(element.shadowRoot?.querySelectorAll<HTMLElement>('.mode-button') ?? [])
    .find((button) => button.textContent?.includes(label))
    ?.click()
}

describe('markdown-preview component', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges()
    document.body.innerHTML = ''
    markdownDocumentRenameModel.reset()
    markdownPreviewModel.cleanup()
    markdownPreviewModel.clearViewportAnchorMemory()
    setMobileKeyboardOccluding(false)
    resetRuntimeCapabilities()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('defines the custom element', () => {
    ensureDefined()

    expect(customElements.get('markdown-preview')).toBe(MarkdownPreview)
  })

  it('is registered by the Markdown document component loader', async () => {
    await ensureRouteComponents(
      'loading',
      'files',
      {kind: 'closed'},
      {
        kind: 'markdown',
        fileId: 7,
        fileName: 'notes.md',
        mode: 'markdown',
      },
    )

    expect(customElements.get('markdown-document-page')).toBe(MarkdownDocumentPage)
    expect(customElements.get('markdown-preview')).toBe(MarkdownPreview)
  })

  it('passes preview data to the Markdown model lifecycle', async () => {
    ensureDefined()
    const setPreview = vi.spyOn(markdownPreviewModel, 'setPreview').mockImplementation(() => {})
    const cleanup = vi.spyOn(markdownPreviewModel, 'cleanup').mockImplementation(() => {})

    const element = document.createElement('markdown-preview') as MarkdownPreview
    element.data = {fileId: 7, fileName: 'notes.md', mode: 'markdown'}
    document.body.appendChild(element)
    await settle(element)

    expect(setPreview).toHaveBeenCalledWith({fileId: 7, fileName: 'notes.md', mode: 'markdown'})

    element.remove()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('renders sanitized Markdown preview HTML and inert links', async () => {
    ensureDefined()
    const element = createElementWithState(readyState())
    await settle(element)

    expect(element.shadowRoot?.querySelector('.rendered-markdown h1')?.textContent).toBe('Notes')
    expect(element.shadowRoot?.querySelector('.rendered-markdown')?.getAttribute('aria-label')).toBe(
      'Rendered Markdown preview',
    )

    const link = element.shadowRoot?.querySelector<HTMLAnchorElement>('.rendered-markdown a')
    const event = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})
    link?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('captures the top visible Markdown source position instead of a scroll percentage', async () => {
    ensureDefined()
    const source = ['One', 'Two', 'Three'].join('\n')
    const element = createElementWithState(
      readyState({
        fileId: 42,
        source,
        baseline: source,
        renderedHtml: [0, 1, 2]
          .map(
            (line) =>
              `<p data-source-line-start="${line}" data-source-line-end="${line + 1}">Line ${line + 1}</p>`,
          )
          .join(''),
      }),
    )
    await settle(element)

    const preview = element.shadowRoot?.querySelector<HTMLElement>('.rendered-markdown')
    const blocks = preview?.querySelectorAll<HTMLElement>('[data-source-line-start]') ?? []
    vi.spyOn(preview!, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })
    Array.from(blocks).forEach((block, index) => {
      const top = 30 + index * 50
      vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom: top + 50,
        left: 0,
        right: 400,
        width: 400,
        height: 50,
        x: 0,
        y: top,
        toJSON: () => ({}),
      })
    })

    preview!.dispatchEvent(new Event('scroll', {bubbles: true, composed: true}))
    await nextFrame()

    expect(markdownPreviewModel.getViewportAnchor(42)).toMatchObject({
      sourceLine: 1.4,
      viewportOffset: 0,
      kind: 'viewport-top',
    })
  })

  it('remembers the visible text viewport instead of a focused preview element while scrolling', async () => {
    ensureDefined()
    const source = ['One', 'Two', 'Three'].join('\n')
    const element = createElementWithState(
      readyState({
        fileId: 44,
        source,
        baseline: source,
        renderedHtml: [0, 1, 2]
          .map(
            (line) =>
              `<p data-source-line-start="${line}" data-source-line-end="${line + 1}"><a href="#">Line ${line + 1}</a></p>`,
          )
          .join(''),
      }),
    )
    await settle(element)

    const preview = element.shadowRoot?.querySelector<HTMLElement>('.rendered-markdown')
    const blocks = preview?.querySelectorAll<HTMLElement>('[data-source-line-start]') ?? []
    const focusedLink = blocks[0]?.querySelector<HTMLAnchorElement>('a')
    vi.spyOn(preview!, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })
    Array.from(blocks).forEach((block, index) => {
      const top = 30 + index * 50
      vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom: top + 50,
        left: 0,
        right: 400,
        width: 400,
        height: 50,
        x: 0,
        y: top,
        toJSON: () => ({}),
      })
    })
    focusedLink?.focus({preventScroll: true})

    preview!.dispatchEvent(new Event('scroll', {bubbles: true, composed: true}))
    await nextFrame()

    expect(markdownPreviewModel.getViewportAnchor(44)).toMatchObject({
      sourceLine: 1.4,
      viewportOffset: 0,
      kind: 'viewport-top',
    })
  })

  it.each(['preview', 'edit'] as const)(
    'keeps the saved %s viewport when the Notes document disconnects',
    async (mode) => {
      ensureDefined()
      const fileId = mode === 'preview' ? 45 : 46
      const element = createElementWithState(readyState({fileId, mode}))
      await settle(element)
      const anchor = {
        sourceLine: 12.5,
        sourceOffset: 128,
        viewportOffset: 24,
        kind: 'viewport-top' as const,
      }
      markdownPreviewModel.rememberViewportAnchor(fileId, anchor)

      element.remove()

      expect(markdownPreviewModel.getViewportAnchor(fileId)).toEqual(anchor)
    },
  )

  it('transfers a focused preview element at its viewport offset when switching modes', async () => {
    ensureDefined()
    const source = ['One', 'Two', 'Three'].join('\n')
    const element = createElementWithState(
      readyState({
        fileId: 43,
        source,
        baseline: source,
        renderedHtml:
          '<p data-source-line-start="2" data-source-line-end="3"><a href="#" tabindex="0">Three</a></p>',
      }),
    )
    await settle(element)

    const preview = element.shadowRoot?.querySelector<HTMLElement>('.rendered-markdown')
    const link = preview?.querySelector<HTMLAnchorElement>('a')
    vi.spyOn(preview!, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })
    vi.spyOn(link!, 'getBoundingClientRect').mockReturnValue({
      top: 164,
      bottom: 184,
      left: 0,
      right: 80,
      width: 80,
      height: 20,
      x: 0,
      y: 164,
      toJSON: () => ({}),
    })
    link!.focus({preventScroll: true})

    clickModeButton(element, 'Edit')
    await settle(element)

    expect(markdownPreviewModel.getViewportAnchor(43)).toEqual({
      sourceLine: 2,
      sourceOffset: 8,
      viewportOffset: 64,
      kind: 'focused-element',
    })
  })

  it('routes rendered task list checkbox activation through the Markdown model', async () => {
    ensureDefined()
    const toggleTaskListItemAtLine = vi
      .spyOn(markdownPreviewModel, 'toggleTaskListItemAtLine')
      .mockReturnValue(true)
    const element = createElementWithState(
      readyState({
        source: '- [ ] Todo',
        baseline: '- [ ] Todo',
        renderedHtml:
          '<ul data-source-line-start="0" data-source-line-end="1"><li><span class="cv-markdown-task-checkbox" role="checkbox" tabindex="0" data-cv-task-line="0" aria-checked="false"></span>Todo</li></ul>',
      }),
    )
    await settle(element)

    const checkbox = element.shadowRoot?.querySelector<HTMLElement>('.cv-markdown-task-checkbox')
    const click = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})
    checkbox?.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(toggleTaskListItemAtLine).toHaveBeenCalledWith(0)

    const keydown = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true, composed: true})
    checkbox?.dispatchEvent(keydown)

    expect(keydown.defaultPrevented).toBe(true)
    expect(toggleTaskListItemAtLine).toHaveBeenCalledTimes(2)
  })

  it('syncs rendered task checkbox state without replacing the list item DOM', async () => {
    ensureDefined()
    const element = createElementWithState(
      readyState({
        source: '- [ ] Todo',
        baseline: '- [ ] Todo',
        renderedHtml:
          '<ul data-source-line-start="0" data-source-line-end="1"><li><span class="cv-markdown-task-checkbox" role="checkbox" tabindex="0" data-cv-task-line="0" data-cv-task-checked="false" aria-checked="false" aria-label="Incomplete task"></span>Todo</li></ul>',
      }),
    )
    await settle(element)

    const checkbox = element.shadowRoot?.querySelector<HTMLElement>('.cv-markdown-task-checkbox')
    const row = checkbox?.closest('li')
    expect(checkbox).not.toBeNull()
    expect(row).not.toBeNull()

    expect(markdownPreviewModel.toggleTaskListItemAtLine(0)).toBe(true)
    await settle(element)

    const nextCheckbox = element.shadowRoot?.querySelector<HTMLElement>('.cv-markdown-task-checkbox')
    expect(nextCheckbox).toBe(checkbox)
    expect(nextCheckbox?.closest('li')).toBe(row)
    expect(nextCheckbox?.getAttribute('aria-checked')).toBe('true')
    expect(nextCheckbox?.getAttribute('data-cv-task-checked')).toBe('true')
    expect(nextCheckbox?.getAttribute('aria-label')).toBe('Completed task')
  })

  it('routes rendered note-link activation through the Markdown model', async () => {
    ensureDefined()
    const activateNoteLink = vi.spyOn(markdownPreviewModel, 'activateNoteLink').mockReturnValue(true)
    const element = createElementWithState(
      readyState({
        renderedHtml:
          '<p><span class="cv-markdown-note-link" role="link" tabindex="0" data-cv-note-link-id="note-link-0" data-cv-note-link-state="resolved">Sibling</span></p>',
      }),
    )
    await settle(element)

    const link = element.shadowRoot?.querySelector<HTMLElement>('[data-cv-note-link-id="note-link-0"]')
    const click = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})
    link?.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(activateNoteLink).toHaveBeenCalledWith('note-link-0')

    const keydown = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    link?.dispatchEvent(keydown)

    expect(keydown.defaultPrevented).toBe(true)
    expect(activateNoteLink).toHaveBeenCalledTimes(2)
  })

  it('renders source editor and sends edits to the model', async () => {
    ensureDefined()
    const updateSource = vi.spyOn(markdownPreviewModel, 'updateSource').mockImplementation(() => {})
    const updateEditorSelection = vi
      .spyOn(markdownPreviewModel, 'updateEditorSelection')
      .mockImplementation(() => {})
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    expect(editor).not.toBeNull()
    expect(editor?.value).toBe('# Notes')
    expect(editor?.getAttribute('aria-label')).toBe('Markdown source editor')

    editor!.value = '# Changed'
    editor!.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))

    expect(updateSource).toHaveBeenCalledWith('# Changed')
    expect(updateEditorSelection).toHaveBeenCalledWith({
      selectionStart: editor!.selectionStart,
      selectionEnd: editor!.selectionEnd,
    })
  })

  it('opts CodeMirror out of the global mobile keyboard focus-scroll coordinator', async () => {
    ensureDefined()
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLElement>('.source-editor')
    expect(editor).not.toBeNull()
    const content = getSourceEditorContent(editor!)

    expect(content.getAttribute('data-mobile-keyboard-scroll')).toBe('off')
  })

  it('opens an image-only picker from the editor toolbar with the current selection', async () => {
    ensureDefined()
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const input = element.shadowRoot?.querySelector<HTMLInputElement>('.image-input')
    const button = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLElement>('cv-button.action-button') ?? [],
    ).find((candidate) => candidate.querySelector('cv-icon[name="image-plus"]'))

    expect(input?.type).toBe('file')
    expect(input?.accept).toBe('image/*')
    expect(input?.multiple).toBe(true)
    expect(button).not.toBeUndefined()

    editor!.setSelectionRange(2, 5)
    button!.click()

    expect(inputClick).toHaveBeenCalledTimes(1)
    expect(markdownPreviewModel.getImageInsertionSelection()).toEqual({
      selectionStart: 2,
      selectionEnd: 5,
    })
  })

  it('opens file-link completion from the editor toolbar with the current selection', async () => {
    ensureDefined()
    const requestFileLinkInsertion = vi
      .spyOn(markdownPreviewModel, 'requestFileLinkInsertion')
      .mockReturnValue(true)
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLElement>('.source-editor') as HTMLElement & {
      setSelectionRange(start: number, end: number): void
      openFileLinkCompletion(): void
    }
    const openFileLinkCompletion = vi.spyOn(editor, 'openFileLinkCompletion').mockImplementation(() => {})
    const button = element.shadowRoot?.querySelector<HTMLElement>('[aria-label="Insert file link"]')

    editor.setSelectionRange(2, 5)
    button?.click()
    await settle(element)

    expect(requestFileLinkInsertion).toHaveBeenCalledWith({selectionStart: 2, selectionEnd: 5})
    expect(openFileLinkCompletion).toHaveBeenCalledTimes(1)
  })

  it('renders the mobile editor quick action bar in edit mode', async () => {
    ensureDefined()
    let element = createElementWithState(readyState())
    await settle(element)

    expect(element.shadowRoot?.querySelector('.editor-quick-bar')).toBeNull()

    element.remove()
    element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const quickBar = element.shadowRoot?.querySelector<HTMLElement>('.editor-quick-bar')
    expect(quickBar?.getAttribute('aria-label')).toBe('Markdown quick actions')
    expect(quickBar?.querySelector('[aria-label="Insert image"]')).not.toBeNull()
    expect(quickBar?.querySelector('[aria-label="Insert file link"]')).not.toBeNull()
    expect(quickBar?.querySelector('[aria-label="Insert table"]')).not.toBeNull()
    expect(quickBar?.querySelector('[aria-label="Bold"]')).not.toBeNull()
    expect(quickBar?.querySelector('[aria-label="Italic"]')).not.toBeNull()
    expect(quickBar?.querySelector('[aria-label="Strikethrough"]')).not.toBeNull()
    expect(quickBar?.querySelector('[aria-label="Markdown quick actions"]')).not.toBeNull()

    element.remove()
    element = createElementWithState(
      readyState({mode: 'edit', readOnlyReasonKey: 'markdown:read-only:save-unavailable'}),
    )
    await settle(element)
    expect(element.shadowRoot?.querySelector('.editor-quick-bar')).toBeNull()
  })

  it('routes quick text actions through the Markdown model with editor selection', async () => {
    ensureDefined()
    const applyMarkdownQuickAction = vi
      .spyOn(markdownPreviewModel, 'applyMarkdownQuickAction')
      .mockReturnValue(true)
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const boldButton = element.shadowRoot?.querySelector<HTMLElement>(
      '.editor-quick-bar [aria-label="Bold"]',
    )

    editor!.setSelectionRange(2, 5)
    boldButton?.click()

    expect(applyMarkdownQuickAction).toHaveBeenCalledWith('bold', {selectionStart: 2, selectionEnd: 5})
  })

  it('preserves editor focus when quick action buttons are pressed', async () => {
    ensureDefined()
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const boldButton = element.shadowRoot?.querySelector<HTMLElement>(
      '.editor-quick-bar [aria-label="Bold"]',
    )
    const event = createPointerEvent('pointerdown')
    boldButton?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('applies quick actions without focusing an unfocused source editor', async () => {
    ensureDefined()
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLElement>('.source-editor') as HTMLElement & {
      getSelection(): {selectionStart: number; selectionEnd: number}
      setSelectionRange(start: number, end: number): void
      value: string
    }
    const boldButton = element.shadowRoot?.querySelector<HTMLElement>(
      '.editor-quick-bar [aria-label="Bold"]',
    )

    editor.setSelectionRange(2, 7)
    boldButton?.click()
    await settle(element)

    expect(editor.value).toBe('# **Notes**')
    expect(editor.getSelection()).toEqual({
      selectionStart: '# **Notes**'.length,
      selectionEnd: '# **Notes**'.length,
    })
    expect(editor.shadowRoot?.activeElement).not.toBe(getSourceEditorContent(editor))
    expect(markdownPreviewModel.editorFocusRequest()).toBeNull()
  })

  it('keeps a focused source editor focused while applying a touch quick action', async () => {
    ensureDefined()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    setMobileKeyboardOccluding(true)
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLElement>('.source-editor') as HTMLElement & {
      focus(options?: FocusOptions): void
      getSelection(): {selectionStart: number; selectionEnd: number}
      setSelectionRange(start: number, end: number): void
      value: string
    }
    const boldButton = element.shadowRoot?.querySelector<HTMLElement>(
      '.editor-quick-bar [aria-label="Bold"]',
    )

    editor.focus()
    editor.setSelectionRange(2, 7)
    boldButton?.dispatchEvent(createPointerEvent('pointerdown'))
    boldButton?.dispatchEvent(createPointerEvent('pointerup'))
    await settle(element)

    expect(editor.value).toBe('# **Notes**')
    expect(editor.getSelection()).toEqual({
      selectionStart: '# **Notes**'.length,
      selectionEnd: '# **Notes**'.length,
    })
    expect(editor.shadowRoot?.activeElement).toBe(getSourceEditorContent(editor))
    expect(markdownPreviewModel.editorFocusRequest()).toBeNull()
  })

  it('keeps a dismissed mobile keyboard hidden while applying a touch quick action', async () => {
    ensureDefined()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLElement>('.source-editor') as HTMLElement & {
      focus(options?: FocusOptions): void
      getSelection(): {selectionStart: number; selectionEnd: number}
      setSelectionRange(start: number, end: number): void
      value: string
    }
    const boldButton = element.shadowRoot?.querySelector<HTMLElement>(
      '.editor-quick-bar [aria-label="Bold"]',
    )

    editor.focus()
    editor.setSelectionRange(2, 7)
    boldButton?.dispatchEvent(createPointerEvent('pointerdown'))
    boldButton?.dispatchEvent(createPointerEvent('pointerup'))
    await settle(element)

    expect(editor.value).toBe('# **Notes**')
    expect(editor.getSelection()).toEqual({
      selectionStart: '# **Notes**'.length,
      selectionEnd: '# **Notes**'.length,
    })
    expect(editor.shadowRoot?.activeElement).not.toBe(getSourceEditorContent(editor))
    expect(markdownPreviewModel.editorFocusRequest()).toBeNull()
  })

  it('activates quick text actions on touch pointerup without duplicating the follow-up click', async () => {
    ensureDefined()
    const applyMarkdownQuickAction = vi
      .spyOn(markdownPreviewModel, 'applyMarkdownQuickAction')
      .mockReturnValue(true)
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const boldButton = element.shadowRoot?.querySelector<HTMLElement>(
      '.editor-quick-bar [aria-label="Bold"]',
    )
    const pointerDown = createPointerEvent('pointerdown')
    const pointerUp = createPointerEvent('pointerup')

    editor!.setSelectionRange(2, 5)
    boldButton?.dispatchEvent(pointerDown)
    boldButton?.dispatchEvent(pointerUp)
    boldButton?.click()

    expect(pointerDown.defaultPrevented).toBe(true)
    expect(pointerUp.defaultPrevented).toBe(true)
    expect(applyMarkdownQuickAction).toHaveBeenCalledTimes(1)
    expect(applyMarkdownQuickAction).toHaveBeenCalledWith('bold', {selectionStart: 2, selectionEnd: 5})
  })

  it('routes quick overflow actions through the Markdown model and history controls', async () => {
    ensureDefined()
    const applyMarkdownQuickAction = vi
      .spyOn(markdownPreviewModel, 'applyMarkdownQuickAction')
      .mockReturnValue(true)
    const undo = vi.spyOn(markdownPreviewModel, 'undo').mockReturnValue(true)
    const redo = vi.spyOn(markdownPreviewModel, 'redo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canUndo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canRedo').mockReturnValue(true)
    const element = createElementWithState(readyState({mode: 'edit', source: '# Local', dirty: true}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const menu = element.shadowRoot?.querySelector<HTMLElement>('.editor-quick-overflow')

    editor!.setSelectionRange(2, 5)
    menu?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'heading-h2', open: false},
        bubbles: true,
        composed: true,
      }),
    )
    menu?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'undo', open: false},
        bubbles: true,
        composed: true,
      }),
    )
    menu?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'redo', open: false},
        bubbles: true,
        composed: true,
      }),
    )

    expect(applyMarkdownQuickAction).toHaveBeenCalledWith('heading-h2', {
      selectionStart: 2,
      selectionEnd: 5,
    })
    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).toHaveBeenCalledTimes(1)
  })

  it('disables quick text actions while the Markdown note is busy', async () => {
    ensureDefined()
    const element = createElementWithState(readyState({mode: 'edit', saving: true}))
    await settle(element)

    const boldButton = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.editor-quick-bar [aria-label="Bold"]',
    )

    expect(boldButton?.disabled).toBe(true)
  })

  it('routes selected picker images to the Markdown model and resets the input', async () => {
    ensureDefined()
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const insertImageFiles = vi.spyOn(markdownPreviewModel, 'insertImageFiles').mockResolvedValue(true)
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const input = element.shadowRoot?.querySelector<HTMLInputElement>('.image-input')
    expect(markdownPreviewModel.requestImagePicker({selectionStart: 1, selectionEnd: 3})).toBe(true)
    expect(inputClick).toHaveBeenCalledTimes(1)

    const image = new File([new Uint8Array([1])], 'photo.png', {type: 'image/png'})
    const text = new File([new Uint8Array([2])], 'notes.txt', {type: 'text/plain'})
    Object.defineProperty(input!, 'files', {
      configurable: true,
      value: [image, text],
    })
    input!.dispatchEvent(new Event('change', {bubbles: true, composed: true}))

    expect(insertImageFiles).toHaveBeenCalledWith([image], {
      selectionStart: 1,
      selectionEnd: 3,
    })
    expect(input?.value).toBe('')
  })

  it('renders the image toolbar action as busy while an image is attaching', async () => {
    ensureDefined()
    const element = createElementWithState(readyState({mode: 'edit'}))
    markdownPreviewModel.imageAttaching.set(true)
    await settle(element)

    const button = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLElement>('cv-button.action-button') ?? [],
    ).find((candidate) => candidate.textContent?.includes('Attaching image'))

    expect(button).not.toBeUndefined()
    expect(button?.hasAttribute('disabled')).toBe(true)
    expect(button?.querySelector('cv-spinner')).not.toBeNull()
  })

  it('routes pasted image files through the Markdown model with editor selection', async () => {
    ensureDefined()
    const insertImageFiles = vi.spyOn(markdownPreviewModel, 'insertImageFiles').mockResolvedValue(true)
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const file = new File([new Uint8Array([1])], 'photo.png', {type: 'image/png'})
    editor!.setSelectionRange(2, 5)
    const event = createPasteEvent([file])
    editor!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(insertImageFiles).toHaveBeenCalledWith([file], {
      selectionStart: 2,
      selectionEnd: 5,
    })
  })

  it('routes dropped image files through the Markdown model with editor selection', async () => {
    ensureDefined()
    const insertImageFiles = vi.spyOn(markdownPreviewModel, 'insertImageFiles').mockResolvedValue(true)
    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const file = new File([new Uint8Array([1])], 'drop.webp', {type: 'image/webp'})
    editor!.setSelectionRange(1, 1)
    const event = createDropEvent([file])
    editor!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(insertImageFiles).toHaveBeenCalledWith([file], {
      selectionStart: 1,
      selectionEnd: 1,
    })
  })

  it('enters edit mode from controls without focusing the source editor', async () => {
    ensureDefined()

    let element = createElementWithState(readyState())
    await settle(element)

    Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button') ?? [])
      .find((button) => button.textContent?.includes('Edit'))
      ?.click()
    await settle(element)

    let editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    expect(editor).not.toBeNull()
    expect(element.shadowRoot?.activeElement).not.toBe(editor)
    expect(markdownPreviewModel.editorFocusRequest()).toBeNull()

    element.remove()
    markdownPreviewModel.cleanup()
    element = createElementWithState(readyState())
    await settle(element)

    element.shadowRoot?.querySelector<HTMLButtonElement>('.fab-edit')?.click()
    await settle(element)

    editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    expect(editor).not.toBeNull()
    expect(element.shadowRoot?.activeElement).not.toBe(editor)
    expect(markdownPreviewModel.editorFocusRequest()).toBeNull()
  })

  it('double-taps preview text into edit mode and focuses the source line', async () => {
    vi.useFakeTimers()
    ensureDefined()
    const source = '# First repeat\n\nSecond repeat word'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml:
          '<h1 data-source-line-start="0" data-source-line-end="1">First repeat</h1><p data-source-line-start="2" data-source-line-end="3">Second repeat word</p>',
      }),
    )
    await settle(element)

    const paragraph = element.shadowRoot?.querySelector('.rendered-markdown p')

    paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 40, clientY: 40}))
    paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 40, clientY: 40}))
    vi.advanceTimersByTime(120)
    paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 40, clientY: 40}))
    paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 40, clientY: 40}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    expect(markdownPreviewModel.mode()).toBe('edit')
    expect(editor).not.toBeNull()
    expect(markdownPreviewModel.editorFocusRequest()).toMatchObject({
      selectionStart: source.indexOf('Second'),
    })
  })

  it('focuses the tapped preview word when the caret point resolves text', async () => {
    vi.useFakeTimers()
    ensureDefined()
    const source = '# First repeat\n\nSecond repeat word'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml:
          '<h1 data-source-line-start="0" data-source-line-end="1">First repeat</h1><p data-source-line-start="2" data-source-line-end="3">Second repeat word</p>',
      }),
    )
    await settle(element)

    const paragraph = element.shadowRoot?.querySelector('.rendered-markdown p')
    const textNode = paragraph?.firstChild
    expect(textNode).toBeInstanceOf(Text)

    const caretRange = document.createRange()
    caretRange.setStart(textNode!, 'Second '.length)
    caretRange.setEnd(textNode!, 'Second '.length)
    const restoreCaret = stubCaretRangeFromPoint(caretRange)

    try {
      paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 70, clientY: 40}))
      paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 70, clientY: 40}))
      vi.advanceTimersByTime(120)
      paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 70, clientY: 40}))
      paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 70, clientY: 40}))
      await settle(element)

      expect(markdownPreviewModel.mode()).toBe('edit')
      expect(markdownPreviewModel.editorFocusRequest()).toMatchObject({
        selectionStart: source.indexOf('repeat', source.indexOf('Second')),
      })
    } finally {
      restoreCaret()
    }
  })

  it('uses touch-generated native dblclick as the mobile double-tap fallback', async () => {
    ensureDefined()
    const source = '# First repeat'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml: '<h1 data-source-line-start="0" data-source-line-end="1">First repeat</h1>',
      }),
    )
    await settle(element)

    const heading = element.shadowRoot?.querySelector('.rendered-markdown h1')

    const mouseDoubleClick = createDoubleClickEvent({clientX: 40, clientY: 40})
    heading?.dispatchEvent(mouseDoubleClick)
    await settle(element)
    expect(markdownPreviewModel.mode()).toBe('preview')
    expect(mouseDoubleClick.defaultPrevented).toBe(false)

    const touchDoubleClick = createDoubleClickEvent({clientX: 40, clientY: 40, firesTouchEvents: true})
    heading?.dispatchEvent(touchDoubleClick)
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    expect(markdownPreviewModel.mode()).toBe('edit')
    expect(touchDoubleClick.defaultPrevented).toBe(true)
    expect(editor).not.toBeNull()
    expect(markdownPreviewModel.editorFocusRequest()).toMatchObject({selectionStart: 0})
  })

  it('prevents native selection as soon as the second tap starts', async () => {
    vi.useFakeTimers()
    ensureDefined()
    const source = '# First repeat'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml: '<h1 data-source-line-start="0" data-source-line-end="1">First repeat</h1>',
      }),
    )
    await settle(element)

    const heading = element.shadowRoot?.querySelector('.rendered-markdown h1')
    const textNode = heading?.firstChild
    expect(textNode).toBeInstanceOf(Text)

    const removeAllRanges = vi.fn()
    const restoreSelection = stubDocumentSelectionObject({
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges,
    })

    try {
      heading?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 40, clientY: 30}))
      heading?.dispatchEvent(createPointerEvent('pointerup', {clientX: 40, clientY: 30}))
      vi.advanceTimersByTime(120)

      const secondTapStart = createPointerEvent('pointerdown', {clientX: 40, clientY: 30})
      heading?.dispatchEvent(secondTapStart)

      expect(secondTapStart.defaultPrevented).toBe(true)
      expect(removeAllRanges).toHaveBeenCalled()
    } finally {
      restoreSelection()
    }
  })

  it('clears native preview selection after using it for double-tap edit', async () => {
    ensureDefined()
    const source = '# First repeat'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml: '<h1 data-source-line-start="0" data-source-line-end="1">First repeat</h1>',
      }),
    )
    await settle(element)

    const heading = element.shadowRoot?.querySelector('.rendered-markdown h1')
    const textNode = heading?.firstChild
    expect(textNode).toBeInstanceOf(Text)

    const selectionRange = document.createRange()
    selectionRange.setStart(textNode!, 'First '.length)
    selectionRange.setEnd(textNode!, 'First repeat'.length)
    const removeAllRanges = vi.fn()
    const restoreSelection = stubDocumentSelectionObject({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: vi.fn(() => selectionRange),
      removeAllRanges,
    })

    try {
      heading?.dispatchEvent(createDoubleClickEvent({clientX: 80, clientY: 30, firesTouchEvents: true}))
      await settle(element)

      const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
      expect(markdownPreviewModel.mode()).toBe('edit')
      expect(removeAllRanges).toHaveBeenCalled()
      expect(editor).not.toBeNull()
      expect(markdownPreviewModel.editorFocusRequest()).toMatchObject({
        selectionStart: source.indexOf('repeat'),
      })
    } finally {
      restoreSelection()
    }
  })

  it('keeps long press and single taps in preview mode', async () => {
    vi.useFakeTimers()
    ensureDefined()

    const element = createElementWithState(readyState())
    await settle(element)
    const preview = element.shadowRoot?.querySelector<HTMLElement>('.rendered-markdown')

    preview?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 20, clientY: 20}))
    vi.advanceTimersByTime(600)
    await settle(element)

    expect(markdownPreviewModel.mode()).toBe('preview')
    expect(element.shadowRoot?.querySelector('.source-editor')).toBeNull()

    const contextMenuEvent = new MouseEvent('contextmenu', {bubbles: true, cancelable: true, composed: true})
    preview?.dispatchEvent(contextMenuEvent)
    expect(contextMenuEvent.defaultPrevented).toBe(false)

    preview?.dispatchEvent(createPointerEvent('pointerup', {clientX: 20, clientY: 20}))
    vi.advanceTimersByTime(120)
    preview?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 20, clientY: 20}))
    preview?.dispatchEvent(createPointerEvent('pointerup', {clientX: 20, clientY: 20}))
    await settle(element)

    expect(markdownPreviewModel.mode()).toBe('preview')
    expect(element.shadowRoot?.querySelector('.source-editor')).toBeNull()
  })

  it('does not count moved taps toward preview double-tap editing', async () => {
    vi.useFakeTimers()
    ensureDefined()

    const element = createElementWithState(readyState())
    await settle(element)
    const preview = element.shadowRoot?.querySelector<HTMLElement>('.rendered-markdown')

    preview?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 20, clientY: 20}))
    preview?.dispatchEvent(createPointerEvent('pointermove', {clientX: 36, clientY: 20}))
    preview?.dispatchEvent(createPointerEvent('pointerup', {clientX: 36, clientY: 20}))
    vi.advanceTimersByTime(120)
    preview?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 20, clientY: 20}))
    preview?.dispatchEvent(createPointerEvent('pointerup', {clientX: 20, clientY: 20}))
    await settle(element)

    expect(markdownPreviewModel.mode()).toBe('preview')
    expect(element.shadowRoot?.querySelector('.source-editor')).toBeNull()
  })

  it('routes mode buttons and toolbar actions through the model', async () => {
    ensureDefined()
    const setMode = vi.spyOn(markdownPreviewModel, 'setMode').mockImplementation(() => {})
    const requestFileLinkInsertion = vi
      .spyOn(markdownPreviewModel, 'requestFileLinkInsertion')
      .mockReturnValue(true)
    const undo = vi.spyOn(markdownPreviewModel, 'undo').mockReturnValue(true)
    const redo = vi.spyOn(markdownPreviewModel, 'redo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canUndo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canRedo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'setPreview').mockImplementation(() => {})
    const formatDocument = vi.spyOn(markdownPreviewModel, 'formatDocument').mockResolvedValue(true)
    const rename = vi.spyOn(markdownDocumentRenameModel, 'openRenameDialog').mockResolvedValue(true)
    const element = createElementWithState(readyState({source: '# Changed', dirty: true}))
    element.data = {
      fileId: 7,
      fileName: 'notes.md',
      mimeType: 'text/markdown',
      sourceRevision: 11,
      mode: 'markdown',
    }
    await settle(element)

    const buttons = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button') ?? [])
    expect(element.shadowRoot?.querySelector('.mode-control')?.getAttribute('aria-label')).toBe(
      'Markdown mode',
    )
    buttons.find((button) => button.textContent?.includes('Edit'))?.click()
    buttons.find((button) => button.textContent?.includes('Insert file link'))?.click()
    buttons.find((button) => button.textContent?.includes('Undo'))?.click()
    buttons.find((button) => button.textContent?.includes('Redo'))?.click()
    buttons.find((button) => button.textContent?.includes('Format'))?.click()
    buttons.find((button) => button.textContent?.includes('Rename'))?.click()

    expect(setMode).toHaveBeenCalledWith('edit')
    expect(requestFileLinkInsertion).toHaveBeenCalledTimes(1)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).toHaveBeenCalledTimes(1)
    expect(formatDocument).toHaveBeenCalledTimes(1)
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({fileId: 7, fileName: 'notes.md'}))
  })

  it('renders undo and redo toolbar controls from model state', async () => {
    ensureDefined()
    let element = createElementWithState(readyState())
    await settle(element)

    let undoButton = element.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Undo"]')
    let redoButton = element.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Redo"]')
    expect(undoButton).not.toBeNull()
    expect(redoButton).not.toBeNull()
    expect(undoButton?.disabled).toBe(true)
    expect(redoButton?.disabled).toBe(true)
    expect(undoButton?.querySelector('cv-icon')?.getAttribute('name')).toBe('undo-2')
    expect(redoButton?.querySelector('cv-icon')?.getAttribute('name')).toBe('redo-2')

    element.remove()
    vi.spyOn(markdownPreviewModel, 'canUndo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canRedo').mockReturnValue(true)
    element = createElementWithState(readyState({source: '# Local', dirty: true}))
    await settle(element)

    undoButton = element.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Undo"]')
    redoButton = element.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Redo"]')
    expect(undoButton?.disabled).toBe(false)
    expect(redoButton?.disabled).toBe(false)
  })

  it('does not render save button or saved dirty status chip', async () => {
    ensureDefined()
    const element = createElementWithState(readyState({source: '# Local', dirty: true, saving: true}))
    await settle(element)

    expect(element.shadowRoot?.querySelector('[aria-label="Save"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[aria-label="Saved"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.status-chip')).toBeNull()
  })

  it('renders format action state from Markdown formatting state', async () => {
    ensureDefined()
    let element = createElementWithState(readyState())
    await settle(element)

    let formatButton = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.action-button') ?? [],
    ).find((button) => button.textContent?.includes('Format'))
    expect(formatButton?.getAttribute('aria-label')).toBe('Format')
    expect(formatButton?.disabled).toBe(false)

    element.remove()
    element = createElementWithState(readyState({formatting: true}))
    await settle(element)

    formatButton = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.action-button') ?? [],
    ).find((button) => button.textContent?.includes('Formatting...'))
    expect(formatButton?.getAttribute('aria-label')).toBe('Formatting...')
    expect(formatButton?.disabled).toBe(true)
  })

  it('handles Markdown save, undo, redo, and Escape through shared shortcuts', async () => {
    ensureDefined()
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    const save = vi.spyOn(markdownPreviewModel, 'save').mockResolvedValue(true)
    const undo = vi.spyOn(markdownPreviewModel, 'undo').mockReturnValue(true)
    const redo = vi.spyOn(markdownPreviewModel, 'redo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canUndo').mockReturnValue(true)
    vi.spyOn(markdownPreviewModel, 'canRedo').mockReturnValue(true)
    const element = createElementWithState(readyState({source: '# Changed', dirty: true}))
    const close = vi.fn()
    element.addEventListener('close', close)
    await settle(element)

    const surface = element.shadowRoot?.querySelector<HTMLElement>('.markdown-preview')
    const saveEvent = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    surface?.dispatchEvent(saveEvent)

    expect(saveEvent.defaultPrevented).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)

    const undoEvent = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    surface?.dispatchEvent(undoEvent)

    expect(undoEvent.defaultPrevented).toBe(true)
    expect(undo).toHaveBeenCalledTimes(1)

    const redoEvent = new KeyboardEvent('keydown', {
      key: 'y',
      code: 'KeyY',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    surface?.dispatchEvent(redoEvent)

    expect(redoEvent.defaultPrevented).toBe(true)
    expect(redo).toHaveBeenCalledTimes(1)

    surface?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true}))

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('shows stale controls and routes them through the model', async () => {
    ensureDefined()
    const reload = vi.spyOn(markdownPreviewModel, 'reload').mockResolvedValue()
    const overwrite = vi.spyOn(markdownPreviewModel, 'overwriteStale').mockResolvedValue(true)
    const cancelStale = vi.spyOn(markdownPreviewModel, 'cancelStale').mockImplementation(() => {})
    const element = createElementWithState(
      readyState({
        source: '# Local',
        dirty: true,
        stale: true,
        errorKey: 'markdown:error:stale-source',
      }),
    )
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('This note changed elsewhere')

    const buttons = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button') ?? [])
    buttons.find((button) => button.textContent?.includes('Reload'))?.click()

    const overflowMenu = element.shadowRoot?.querySelector<HTMLElement>('.stale-overflow')
    overflowMenu?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'overwrite', open: false},
        bubbles: true,
        composed: true,
      }),
    )
    overflowMenu?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'cancel', open: false},
        bubbles: true,
        composed: true,
      }),
    )

    expect(reload).toHaveBeenCalledTimes(1)
    expect(overwrite).toHaveBeenCalledTimes(1)
    expect(cancelStale).toHaveBeenCalledTimes(1)
  })

  it('shows read-only state without rendering a save action', async () => {
    ensureDefined()
    const element = createElementWithState(
      readyState({
        source: '# Local',
        dirty: true,
        readOnlyReasonKey: 'markdown:read-only:save-unavailable',
      }),
    )
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('Saving is unavailable in this runtime')
    expect(
      Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button') ?? []).find((button) =>
        button.textContent?.includes('Save unavailable'),
      ),
    ).toBeUndefined()
  })

  it('renders dirty confirmation and routes decisions through the model', async () => {
    ensureDefined()
    const savePending = vi.spyOn(markdownPreviewModel, 'savePendingCloseIntent').mockResolvedValue()
    const discardPending = vi
      .spyOn(markdownPreviewModel, 'discardPendingCloseIntent')
      .mockImplementation(() => {})
    const cancelPending = vi
      .spyOn(markdownPreviewModel, 'cancelPendingCloseIntent')
      .mockImplementation(() => {})
    const element = createElementWithState(readyState({source: '# Local', dirty: true}))
    markdownPreviewModel.pendingCloseIntent.set({kind: 'close'})
    await settle(element)

    const sheet = element.shadowRoot?.querySelector<HTMLElement & {open: boolean}>(
      'cv-bottom-sheet.dirty-sheet',
    )
    expect(sheet).not.toBeNull()
    expect(sheet?.open).toBe(true)
    expect(sheet?.getAttribute('aria-label')).toBe('Unsaved Markdown changes')
    expect(sheet?.getAttribute('aria-labelledby')).toBe('markdown-dirty-title')
    expect(sheet?.getAttribute('aria-describedby')).toBe('markdown-dirty-copy')

    const dirtyButtons = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-bottom-sheet.dirty-sheet cv-button') ?? [],
    ).map((button) => button.textContent?.trim())
    expect(dirtyButtons).toEqual(['Save changes', 'Discard', 'Cancel'])

    const buttons = Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button') ?? [])
    buttons.find((button) => button.textContent?.includes('Save changes'))?.click()
    buttons.find((button) => button.textContent?.includes('Discard'))?.click()
    buttons.find((button) => button.textContent?.includes('Cancel'))?.click()

    expect(savePending).toHaveBeenCalledTimes(1)
    expect(discardPending).toHaveBeenCalledTimes(1)
    expect(cancelPending).toHaveBeenCalledTimes(1)
  })

  it('cancels dirty confirmation through the transient back registry', async () => {
    ensureDefined()
    const element = createElementWithState(readyState({source: '# Local', dirty: true}))
    markdownPreviewModel.pendingCloseIntent.set({kind: 'close'})
    await settle(element)

    const sheet = element.shadowRoot?.querySelector<HTMLElement & {open: boolean}>(
      'cv-bottom-sheet.dirty-sheet',
    )
    expect(sheet?.open).toBe(true)
    expect(transientBackModel.consumeBack()).toBe(true)
    await settle(element)

    expect(markdownPreviewModel.pendingCloseIntent()).toBeNull()
  })

  it('uses Markdown-specific fallback copy for size and UTF-8 failures', async () => {
    ensureDefined()
    markdownPreviewModel.state.set({kind: 'fallback', reasonKey: 'file-preview:text-too-large'})
    let element = document.createElement('markdown-preview') as MarkdownPreview
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('Markdown preview is limited to notes up to 1 MiB')
    expect(element.shadowRoot?.querySelector('.fallback')?.getAttribute('role')).toBe('status')

    element.remove()
    markdownPreviewModel.state.set({kind: 'fallback', reasonKey: 'file-preview:text-invalid-encoding'})
    element = document.createElement('markdown-preview') as MarkdownPreview
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.textContent).toContain('Markdown notes must be UTF-8 text')
  })
})
