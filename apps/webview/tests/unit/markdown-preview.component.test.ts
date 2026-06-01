import {afterEach, describe, expect, it, vi} from 'vitest'

import {MarkdownPreview} from '../../src/features/file-manager/components/markdown-preview'
import {MarkdownDocumentPage} from '../../src/features/file-manager/components/markdown-document-page'
import {ensureRouteComponents} from '../../src/app/bootstrap/surface-component-loader'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
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
  options: {clientX?: number; clientY?: number; pointerId?: number; pointerType?: string; button?: number} = {},
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

function stubCaretRangeFromPoint(range: Range): () => void {
  const documentWithCaret = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const descriptor = Object.getOwnPropertyDescriptor(documentWithCaret, 'caretRangeFromPoint')
  Object.defineProperty(documentWithCaret, 'caretRangeFromPoint', {
    configurable: true,
    value: vi.fn(() => range),
  })

  return () => {
    if (descriptor) {
      Object.defineProperty(documentWithCaret, 'caretRangeFromPoint', descriptor)
    } else {
      delete documentWithCaret.caretRangeFromPoint
    }
  }
}

function stubDocumentSelection(range: Range): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(document, 'getSelection')
  Object.defineProperty(document, 'getSelection', {
    configurable: true,
    value: vi.fn(() => ({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: vi.fn(() => range),
      removeAllRanges: vi.fn(),
    })),
  })

  return () => {
    if (descriptor) {
      Object.defineProperty(document, 'getSelection', descriptor)
    } else {
      delete (document as Document & {getSelection?: () => Selection | null}).getSelection
    }
  }
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

function stubRangeClientRectsForTextNode(textNode: Text, options: {charWidth: number; top: number; height: number}): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects')
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value(this: Range) {
      if (this.startContainer !== textNode || this.endContainer !== textNode) {
        return [] as unknown as DOMRectList
      }

      const left = this.startOffset * options.charWidth
      return [
        {
          bottom: options.top + options.height,
          height: options.height,
          left,
          right: left + options.charWidth,
          top: options.top,
          width: options.charWidth,
          x: left,
          y: options.top,
          toJSON() {
            return this
          },
        },
      ] as unknown as DOMRectList
    },
  })

  return () => {
    if (descriptor) {
      Object.defineProperty(Range.prototype, 'getClientRects', descriptor)
    } else {
      delete (Range.prototype as Range & {getClientRects?: () => DOMRectList}).getClientRects
    }
  }
}

function createElementWithState(state: MarkdownPreviewReadyState): MarkdownPreview {
  markdownPreviewModel.state.set(state)
  const element = document.createElement('markdown-preview') as MarkdownPreview
  document.body.appendChild(element)
  return element
}

describe('markdown-preview component', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges()
    document.body.innerHTML = ''
    markdownDocumentRenameModel.reset()
    markdownPreviewModel.cleanup()
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

  it('focuses the source editor when entering edit mode from controls', async () => {
    ensureDefined()

    let element = createElementWithState(readyState())
    await settle(element)

    Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button') ?? [])
      .find((button) => button.textContent?.includes('Edit'))
      ?.click()
    await settle(element)

    let editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    expect(editor).not.toBeNull()
    expect(element.shadowRoot?.activeElement).toBe(editor)

    element.remove()
    markdownPreviewModel.cleanup()
    element = createElementWithState(readyState())
    await settle(element)

    element.shadowRoot?.querySelector<HTMLButtonElement>('.fab-edit')?.click()
    await settle(element)

    editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    expect(editor).not.toBeNull()
    expect(element.shadowRoot?.activeElement).toBe(editor)
  })

  it('double-taps preview text into edit mode at the tapped word occurrence', async () => {
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
    const range = document.createRange()
    range.setStart(textNode!, 'Second re'.length)
    range.setEnd(textNode!, 'Second re'.length)
    const restoreCaretRange = stubCaretRangeFromPoint(range)

    paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 40, clientY: 40}))
    paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 40, clientY: 40}))
    vi.advanceTimersByTime(120)
    paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 40, clientY: 40}))
    paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 40, clientY: 40}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const expectedSelectionStart = source.indexOf('Second repeat') + 'Second re'.length
    expect(markdownPreviewModel.mode()).toBe('edit')
    expect(editor).not.toBeNull()
    expect(element.shadowRoot?.activeElement).toBe(editor)
    expect(editor?.selectionStart).toBe(expectedSelectionStart)

    restoreCaretRange()
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
    const textNode = heading?.firstChild
    expect(textNode).toBeInstanceOf(Text)
    const range = document.createRange()
    range.setStart(textNode!, 'First re'.length)
    range.setEnd(textNode!, 'First re'.length)
    const restoreCaretRange = stubCaretRangeFromPoint(range)

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
    expect(element.shadowRoot?.activeElement).toBe(editor)
    expect(editor?.selectionStart).toBe(source.indexOf('First repeat') + 'First re'.length)

    restoreCaretRange()
  })

  it('prefers the word selected in preview over a misleading caret position', async () => {
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

    const wrongCaretRange = document.createRange()
    wrongCaretRange.setStart(textNode!, 0)
    wrongCaretRange.setEnd(textNode!, 0)
    const restoreCaretRange = stubCaretRangeFromPoint(wrongCaretRange)

    const selectionRange = document.createRange()
    const selectedWordStart = 'Second '.length
    const selectedWordEnd = 'Second repeat'.length
    selectionRange.setStart(textNode!, selectedWordStart)
    selectionRange.setEnd(textNode!, selectedWordEnd)
    const restoreSelection = stubDocumentSelection(selectionRange)

    try {
      paragraph?.dispatchEvent(createDoubleClickEvent({clientX: 90, clientY: 30, firesTouchEvents: true}))
      await settle(element)

      const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
      const repeatStart = source.indexOf('Second repeat') + selectedWordStart
      expect(markdownPreviewModel.mode()).toBe('edit')
      expect(editor).not.toBeNull()
      expect(editor?.selectionStart).toBe(repeatStart)
    } finally {
      restoreSelection()
      restoreCaretRange()
    }
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
      expect(element.shadowRoot?.activeElement).toBe(editor)
      expect(editor?.selectionStart).toBe(source.indexOf('repeat'))
    } finally {
      restoreSelection()
    }
  })

  it('maps preview selection through link labels without counting hidden link URLs', async () => {
    ensureDefined()
    const source = '[visible](https://example.com/visible) visible'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml:
          '<p data-source-line-start="0" data-source-line-end="1"><a href="https://example.com/visible">visible</a> visible</p>',
      }),
    )
    await settle(element)

    const paragraph = element.shadowRoot?.querySelector('.rendered-markdown p')
    const tailTextNode = paragraph?.lastChild
    expect(tailTextNode).toBeInstanceOf(Text)

    const selectionRange = document.createRange()
    selectionRange.setStart(tailTextNode!, 1)
    selectionRange.setEnd(tailTextNode!, ' visible'.length)
    const restoreSelection = stubDocumentSelection(selectionRange)

    try {
      paragraph?.dispatchEvent(createDoubleClickEvent({clientX: 90, clientY: 30, firesTouchEvents: true}))
      await settle(element)

      const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
      expect(markdownPreviewModel.mode()).toBe('edit')
      expect(editor).not.toBeNull()
      expect(editor?.selectionStart).toBe(source.lastIndexOf('visible'))
    } finally {
      restoreSelection()
    }
  })

  it('maps preview selection through markdown block prefixes', async () => {
    ensureDefined()
    const source = '## Heading target'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml: '<h2 data-source-line-start="0" data-source-line-end="1">Heading target</h2>',
      }),
    )
    await settle(element)

    const heading = element.shadowRoot?.querySelector('.rendered-markdown h2')
    const textNode = heading?.firstChild
    expect(textNode).toBeInstanceOf(Text)

    const selectionRange = document.createRange()
    selectionRange.setStart(textNode!, 'Heading '.length)
    selectionRange.setEnd(textNode!, 'Heading target'.length)
    const restoreSelection = stubDocumentSelection(selectionRange)

    try {
      heading?.dispatchEvent(createDoubleClickEvent({clientX: 90, clientY: 30, firesTouchEvents: true}))
      await settle(element)

      const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
      expect(markdownPreviewModel.mode()).toBe('edit')
      expect(editor).not.toBeNull()
      expect(editor?.selectionStart).toBe(source.indexOf('target'))
    } finally {
      restoreSelection()
    }
  })

  it('maps preview selection through markdown task list prefixes', async () => {
    ensureDefined()
    const source = '- [x] done target'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml:
          '<ul data-source-line-start="0" data-source-line-end="1"><li>done target</li></ul>',
      }),
    )
    await settle(element)

    const item = element.shadowRoot?.querySelector('.rendered-markdown li')
    const textNode = item?.firstChild
    expect(textNode).toBeInstanceOf(Text)

    const selectionRange = document.createRange()
    selectionRange.setStart(textNode!, 'done '.length)
    selectionRange.setEnd(textNode!, 'done target'.length)
    const restoreSelection = stubDocumentSelection(selectionRange)

    try {
      item?.dispatchEvent(createDoubleClickEvent({clientX: 90, clientY: 30, firesTouchEvents: true}))
      await settle(element)

      const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
      expect(markdownPreviewModel.mode()).toBe('edit')
      expect(editor).not.toBeNull()
      expect(editor?.selectionStart).toBe(source.indexOf('target'))
    } finally {
      restoreSelection()
    }
  })

  it('maps preview selection across soft line breaks instead of textarea visual rows', async () => {
    ensureDefined()
    const source = 'repeat on first raw line\nwrapped lower repeat word'
    const element = createElementWithState(
      readyState({
        source,
        baseline: source,
        renderedHtml:
          '<p data-source-line-start="0" data-source-line-end="2">repeat on first raw line\nwrapped lower repeat word</p>',
      }),
    )
    await settle(element)

    const paragraph = element.shadowRoot?.querySelector('.rendered-markdown p')
    const textNode = paragraph?.firstChild
    expect(textNode).toBeInstanceOf(Text)

    const secondRepeatStart = 'repeat on first raw line\nwrapped lower '.length
    const selectionRange = document.createRange()
    selectionRange.setStart(textNode!, secondRepeatStart)
    selectionRange.setEnd(textNode!, secondRepeatStart + 'repeat'.length)
    const restoreSelection = stubDocumentSelection(selectionRange)

    try {
      paragraph?.dispatchEvent(createDoubleClickEvent({clientX: 150, clientY: 55, firesTouchEvents: true}))
      await settle(element)

      const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
      expect(markdownPreviewModel.mode()).toBe('edit')
      expect(editor).not.toBeNull()
      expect(editor?.selectionStart).toBe(source.lastIndexOf('repeat'))
    } finally {
      restoreSelection()
    }
  })

  it('uses rendered text geometry when browser caret APIs do not resolve preview text', async () => {
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
    const restoreRangeRects = stubRangeClientRectsForTextNode(textNode as Text, {
      charWidth: 10,
      top: 20,
      height: 20,
    })

    paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 86, clientY: 30}))
    paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 86, clientY: 30}))
    vi.advanceTimersByTime(120)
    paragraph?.dispatchEvent(createPointerEvent('pointerdown', {clientX: 86, clientY: 30}))
    paragraph?.dispatchEvent(createPointerEvent('pointerup', {clientX: 86, clientY: 30}))
    await settle(element)

    const editor = element.shadowRoot?.querySelector<HTMLTextAreaElement>('.source-editor')
    const repeatStart = source.indexOf('Second repeat') + 'Second '.length
    expect(markdownPreviewModel.mode()).toBe('edit')
    expect(editor).not.toBeNull()
    expect(editor?.selectionStart).toBeGreaterThan(repeatStart)
    expect(editor?.selectionStart).toBeLessThanOrEqual(repeatStart + 'repeat'.length)

    restoreRangeRects()
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
    buttons.find((button) => button.textContent?.includes('Undo'))?.click()
    buttons.find((button) => button.textContent?.includes('Redo'))?.click()
    buttons.find((button) => button.textContent?.includes('Format'))?.click()
    buttons.find((button) => button.textContent?.includes('Rename'))?.click()

    expect(setMode).toHaveBeenCalledWith('edit')
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
      Array.from(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button') ?? []).find(
        (button) => button.textContent?.includes('Save unavailable'),
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

    const sheet = element.shadowRoot?.querySelector<HTMLElement & {open: boolean}>('cv-bottom-sheet.dirty-sheet')
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

    const sheet = element.shadowRoot?.querySelector<HTMLElement & {open: boolean}>('cv-bottom-sheet.dirty-sheet')
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

  it('keeps layout-critical Markdown controls constrained without inline styles', async () => {
    ensureDefined()
    const cssText = MarkdownPreview.styles.map((style) => style.cssText ?? '').join('\n')

    expect(cssText).toContain('.content')
    expect(cssText).toContain('--markdown-editor-keyboard-clearance: var(--visual-viewport-bottom-inset, 0px);')
    expect(cssText).toContain('overflow: hidden;')
    expect(cssText).toContain('padding-block-end: var(--markdown-editor-keyboard-clearance);')
    expect(cssText).toContain('resize: none;')
    expect(cssText).toContain('overflow: auto;')
    expect(cssText).toContain('--markdown-preview-fab-size: 56px;')
    expect(cssText).toContain('--markdown-preview-fab-inset-block-end: max(16px, env(safe-area-inset-bottom));')
    expect(cssText).toContain('--markdown-preview-fab-clearance: calc(')
    expect(cssText).toContain('inline-size: var(--markdown-preview-fab-size);')
    expect(cssText).toContain('block-size: var(--markdown-preview-fab-size);')
    expect(cssText).toContain('inset-block-end: var(--markdown-preview-fab-inset-block-end);')
    expect(cssText).toContain('linear-gradient(')
    expect(cssText).toContain('var(--cv-color-surface-elevated, var(--cv-color-surface))')
    expect(cssText).toContain('0 0 0 6px var(--cv-color-surface-elevated, var(--cv-color-surface));')
    expect(cssText).toMatch(
      /padding-block-end:\s*calc\(\s*var\(--app-spacing-4\)\s*\+\s*var\(--markdown-preview-fab-clearance\)\s*\);/,
    )
    expect(cssText).toContain('scroll-padding-block-end: var(--markdown-preview-fab-clearance);')
    expect(cssText).toContain('--markdown-editor-last-line-clearance: 1lh;')
    expect(cssText).toContain('padding-block-end: calc(')
    expect(cssText).toContain('scroll-padding-block-end: calc(')
    expect(cssText).toMatch(
      /scroll-padding-block-end:\s*calc\(\s*var\(--markdown-editor-keyboard-clearance\)\s*\+\s*var\(--app-spacing-4\)\s*\+\s*var\(--markdown-editor-last-line-clearance\)\s*\);/,
    )
    expect(cssText).toContain('.dirty-sheet-body')
    expect(cssText).toContain('.dirty-actions')
    expect(cssText).not.toContain('.status-chip')
    expect(cssText).toContain('font-size: var(--cv-font-size-base);')
    expect(cssText).toContain('env(safe-area-inset-left)')
    expect(cssText).toContain('.toolbar-actions')
    expect(cssText).toContain('display: none;')
    expect(cssText).toContain('.rendered-markdown table')
    expect(cssText).toContain('max-inline-size: 100%;')
    expect(cssText).toContain('overflow-x: auto;')
    expect(cssText).toContain('border-collapse: separate;')
    expect(cssText).toContain(".rendered-markdown :is(th, td)[data-align='right']")
    expect(cssText).toContain('text-align: end;')
    expect(cssText).toContain('.rendered-markdown .cv-markdown-image')
    expect(cssText).toContain('.rendered-markdown .cv-markdown-image--blocked')

    const element = createElementWithState(readyState({mode: 'edit'}))
    await settle(element)

    expect(element.shadowRoot?.querySelector('[style]')).toBeNull()
  })
})
