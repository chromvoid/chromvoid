import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import {defaultKeymap, indentLess, indentMore} from '@codemirror/commands'
import {markdown} from '@codemirror/lang-markdown'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import {EditorState, type Extension} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
  type ViewUpdate,
  WidgetType,
  ViewPlugin,
} from '@codemirror/view'
import {css, html, LitElement, type PropertyValues} from 'lit'

import {getRuntimeCapabilities} from '../../../core/runtime/runtime-capabilities'
import {mobileKeyboardOccluding} from '../../../app/bootstrap/mobile-keyboard/keyboard-occlusion.model'
import type {
  MarkdownEditorFocusRequest,
  MarkdownEditorSelectionRequest,
  MarkdownImageInsertionSelection,
  MarkdownViewportAnchor,
} from '../models/markdown-preview.model'
import type {CatalogFileLinkItem} from '../../../core/catalog/local-catalog/types'
import {
  formatMarkdownFileLinkInsertion,
  getAnyMarkdownFileLinkCompletionMatch,
  getMarkdownFileLinkCompletionMatch,
  getMarkdownFileLinkCompletionReplacementRange,
} from '../services/markdown-file-links'
import {
  formatWikilinkInsertion,
  getSelectedMarkdownText,
  getWikilinkCompletionMatch,
  type MarkdownNoteLinkCompletion,
} from '../services/markdown-note-links'
import {findMarkdownTaskMarkerInLine} from '../services/markdown-task-lists'

export type MarkdownSourceCommand = 'save' | 'undo' | 'redo'

export type MarkdownSourceInputDetail = {
  source: string
}

export type MarkdownSourceSelectionDetail = MarkdownImageInsertionSelection

export type MarkdownSourceImageFilesDetail = {
  files: File[]
  selectionStart: number
  selectionEnd: number
}

export type MarkdownFileLinkCompletionProvider = (query: string) => Promise<CatalogFileLinkItem[]>

export type MarkdownSourceCommandDetail = {
  command: MarkdownSourceCommand
}

type KeyboardScrollGeometry = {
  readonly bottomMargin: number
  readonly keyboardInset: number
  readonly visibleRect: {
    readonly bottom: number
    readonly top: number
  } | null
}

type KeyboardSelectionRevealMeasurement = {
  readonly geometry: KeyboardScrollGeometry
  readonly selectionHead: number
  readonly selectionNeedsReveal: boolean
}

const IMAGE_FILE_NAME_PATTERN = /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i
const MOBILE_KEYBOARD_SCROLL_ATTR = 'data-mobile-keyboard-scroll'
const MOBILE_KEYBOARD_SCROLL_OFF_VALUE = 'off'
const MOBILE_KEYBOARD_SELECTION_MARGIN_PX = 8
const MOBILE_KEYBOARD_MIN_OVERLAP_PX = 1
const MOBILE_KEYBOARD_CONTENT_CLEARANCE_PROPERTY = '--_markdown-source-editor-keyboard-clearance'
const MOBILE_KEYBOARD_ROOT_OFFSET_PROPERTIES = [
  '--app-runtime-keyboard-overlay-offset',
  '--app-runtime-keyboard-scroll-clearance',
  '--app-runtime-visual-viewport-inset-block-end',
  '--app-runtime-keyboard-native-inset-block-end',
] as const
const MOBILE_KEYBOARD_ROOT_ATTRIBUTES = [
  'style',
  'data-mobile-keyboard-expanded',
  'data-native-keyboard-insets',
  'data-android-native-keyboard-insets',
  'data-ios-native-keyboard-insets',
  'data-mobile-keyboard-native-resize',
] as const

class TaskCheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super()
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked
  }

  toDOM(): HTMLElement {
    const checkbox = document.createElement('span')
    checkbox.className = 'cm-markdown-task-checkbox'
    checkbox.setAttribute('aria-hidden', 'true')
    checkbox.dataset['checked'] = this.checked ? 'true' : 'false'
    return checkbox
  }

  ignoreEvent(): boolean {
    return false
  }
}

function taskListDecorations(view: EditorView): DecorationSet {
  const decorations = []
  for (const range of view.visibleRanges) {
    let line = view.state.doc.lineAt(range.from)
    while (line.from <= range.to) {
      const marker = findMarkdownTaskMarkerInLine(line.text, line.number - 1)
      if (marker) {
        decorations.push(
          Decoration.widget({
            widget: new TaskCheckboxWidget(marker.checked),
            side: 1,
          }).range(line.from + marker.markerEnd),
        )
      }

      if (line.to >= view.state.doc.length) {
        break
      }
      line = view.state.doc.line(line.number + 1)
    }
  }

  return Decoration.set(decorations, true)
}

function toggleTaskListItemFromWidget(view: EditorView, eventTarget: EventTarget | null): boolean {
  const target = eventTarget instanceof Element ? eventTarget.closest('.cm-markdown-task-checkbox') : null
  if (!target) {
    return false
  }

  const position = view.posAtDOM(target)
  const line = view.state.doc.lineAt(position)
  const marker = findMarkdownTaskMarkerInLine(line.text, line.number - 1)
  if (!marker) {
    return false
  }

  view.dispatch({
    changes: {
      from: line.from + marker.markerStart,
      to: line.from + marker.markerEnd,
      insert: marker.checked ? '[ ]' : '[x]',
    },
    selection: {anchor: line.from + marker.markerEnd},
  })
  view.focus()
  return true
}

function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().replace(/[\\[\]]/g, '\\$&')
}

const taskListPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = taskListDecorations(view)
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = taskListDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown: (event, view) => {
        if (!toggleTaskListItemFromWidget(view, event.target)) {
          return false
        }
        event.preventDefault()
        return true
      },
    },
  },
)

export class MarkdownSourceEditor extends LitElement {
  static elementName = 'markdown-source-editor'

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      inline-size: 100%;
      block-size: 100%;
      min-block-size: 320px;
      min-inline-size: 0;
    }

    .editor-host {
      block-size: 100%;
      min-block-size: inherit;
    }
  `

  static get properties() {
    return {
      editorLabel: {type: String, attribute: 'editor-label'},
      fileLinkCompletionProvider: {attribute: false},
      focusRequest: {attribute: false},
      noteLinkCompletions: {attribute: false},
      selectionRequest: {attribute: false},
      source: {type: String},
    }
  }

  static define() {
    if (!customElements.get(MarkdownSourceEditor.elementName)) {
      customElements.define(MarkdownSourceEditor.elementName, this as CustomElementConstructor)
    }
  }

  declare editorLabel: string
  declare fileLinkCompletionProvider: MarkdownFileLinkCompletionProvider
  declare focusRequest: MarkdownEditorFocusRequest | null
  declare noteLinkCompletions: MarkdownNoteLinkCompletion[]
  declare selectionRequest: MarkdownEditorSelectionRequest | null
  declare source: string

  private view: EditorView | null = null
  private applyingExternalSource = false
  private keyboardGeometryCleanup: (() => void) | null = null
  private keyboardGeometryObserver: MutationObserver | null = null
  private keyboardSelectionRevealFrame = 0
  private keyboardGeometrySyncPending = false
  private lastFocusRequestId = 0
  private lastSelectionRequestId = 0
  private pendingCompletionAlias = ''
  private scrollerScrollCleanup: (() => void) | null = null

  constructor() {
    super()
    this.editorLabel = 'Markdown source editor'
    this.fileLinkCompletionProvider = async () => []
    this.focusRequest = null
    this.noteLinkCompletions = []
    this.selectionRequest = null
    this.source = ''
  }

  disconnectedCallback(): void {
    this.keyboardGeometrySyncPending = false
    if (this.keyboardSelectionRevealFrame) {
      this.ownerDocument.defaultView?.cancelAnimationFrame(this.keyboardSelectionRevealFrame)
      this.keyboardSelectionRevealFrame = 0
    }
    this.keyboardGeometryCleanup?.()
    this.keyboardGeometryCleanup = null
    this.keyboardGeometryObserver?.disconnect()
    this.keyboardGeometryObserver = null
    this.scrollerScrollCleanup?.()
    this.scrollerScrollCleanup = null
    this.view?.destroy()
    this.view = null
    super.disconnectedCallback()
  }

  protected firstUpdated(): void {
    const parent = this.renderRoot.querySelector<HTMLElement>('.editor-host')
    if (!parent) {
      return
    }

    this.view = new EditorView({
      parent,
      doc: this.source,
      extensions: this.createExtensions(),
    })
    this.setupKeyboardGeometryListeners(this.view)
    this.setupScrollForwarding(this.view)
    this.applySelectionRequest()
    this.applyFocusRequest()
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    const selectionRequestChanged = changedProperties.has('selectionRequest')
    if (selectionRequestChanged) {
      this.releaseFocusForHiddenMobileKeyboard()
    }
    if (changedProperties.has('source')) {
      this.syncSourceFromProperty()
    }
    if (selectionRequestChanged) {
      this.applySelectionRequest()
    }
    if (changedProperties.has('focusRequest')) {
      this.applyFocusRequest()
    }
  }

  getSelection(): MarkdownImageInsertionSelection {
    const selection = this.view?.state.selection.main
    return {
      selectionStart: selection?.from ?? 0,
      selectionEnd: selection?.to ?? 0,
    }
  }

  get value(): string {
    return this.view?.state.doc.toString() ?? this.source
  }

  set value(source: string) {
    this.source = source
    this.syncSourceFromProperty()
  }

  get selectionStart(): number {
    return this.getSelection().selectionStart
  }

  get selectionEnd(): number {
    return this.getSelection().selectionEnd
  }

  get scrollTop(): number {
    return this.getScroller()?.scrollTop ?? 0
  }

  set scrollTop(scrollTop: number) {
    const scroller = this.getScroller()
    if (scroller) {
      scroller.scrollTop = scrollTop
    }
  }

  get scrollHeight(): number {
    return this.getScroller()?.scrollHeight ?? 0
  }

  get clientHeight(): number {
    return this.getScroller()?.clientHeight ?? 0
  }

  captureViewportAnchor(options: {preferSelection?: boolean} = {}): MarkdownViewportAnchor | null {
    const view = this.view
    if (!view) {
      return null
    }

    const hasTextGeometry = this.hasTextGeometry()
    const scrollerRect = view.scrollDOM.getBoundingClientRect()
    const selectionFocused = options.preferSelection !== false && view.hasFocus
    const position = selectionFocused
      ? view.state.selection.main.head
      : hasTextGeometry
        ? view.posAtCoords(
            {
              x: view.contentDOM.getBoundingClientRect().left + 1,
              y: scrollerRect.top + 1,
            },
            false,
          )
        : view.viewport.from
    const positionRect = hasTextGeometry ? view.coordsAtPos(position) : null
    const line = view.state.doc.lineAt(position)
    const lineFraction = line.length > 0 ? (position - line.from) / line.length : 0

    return {
      sourceLine: line.number - 1 + lineFraction,
      sourceOffset: position,
      viewportOffset: positionRect ? positionRect.top - scrollerRect.top : 0,
      kind: selectionFocused ? 'selection' : 'viewport-top',
    }
  }

  restoreViewportAnchor(anchor: MarkdownViewportAnchor): boolean {
    const view = this.view
    if (!view) {
      return false
    }

    if (!this.hasTextGeometry()) {
      return true
    }

    const position = this.resolveViewportAnchorPosition(view, anchor)
    const yMargin = Math.min(Math.max(0, view.scrollDOM.clientHeight - 1), Math.max(0, anchor.viewportOffset))
    const lineBlock = view.lineBlockAt(position)
    view.scrollDOM.scrollTop = lineBlock.top + view.documentPadding.top - yMargin
    view.requestMeasure({
      key: this,
      read: (measuredView) => {
        const positionRect = measuredView.coordsAtPos(position)
        return positionRect
          ? positionRect.top - measuredView.scrollDOM.getBoundingClientRect().top - yMargin
          : 0
      },
      write: (scrollDelta, measuredView) => {
        if (Math.abs(scrollDelta) > 1) {
          measuredView.scrollDOM.scrollTop += scrollDelta
        }
      },
    })
    return true
  }

  setSelectionRange(selectionStart: number, selectionEnd: number): void {
    const view = this.view
    if (!view) {
      return
    }

    const anchor = Math.min(view.state.doc.length, Math.max(0, selectionStart))
    const head = Math.min(view.state.doc.length, Math.max(0, selectionEnd))
    view.dispatch({selection: {anchor, head}})
  }

  openNoteLinkCompletion(): void {
    const view = this.view
    if (!view) {
      return
    }

    this.ensureExecCommandShim(view)
    const selection = view.state.selection.main
    const source = view.state.doc.toString()
    this.pendingCompletionAlias = getSelectedMarkdownText(source, {
      selectionStart: selection.from,
      selectionEnd: selection.to,
    })

    const match = getWikilinkCompletionMatch(source, selection.head)
    if (!match) {
      const anchor = Math.min(selection.from, selection.to)
      const head = Math.max(selection.from, selection.to)
      view.dispatch({
        changes: {from: anchor, to: head, insert: '[['},
        selection: {anchor: anchor + 2},
        scrollIntoView: true,
      })
    }

    view.focus()
    startCompletion(view)
  }

  openFileLinkCompletion(): void {
    const view = this.view
    if (!view) {
      return
    }

    this.ensureExecCommandShim(view)
    const selection = view.state.selection.main
    const source = view.state.doc.toString()
    const alias = getSelectedMarkdownText(source, {
      selectionStart: selection.from,
      selectionEnd: selection.to,
    })
    this.pendingCompletionAlias = alias

    const match = getAnyMarkdownFileLinkCompletionMatch(source, selection.head)
    if (!match) {
      const anchor = Math.min(selection.from, selection.to)
      const head = Math.max(selection.from, selection.to)
      const insertion = `[${escapeMarkdownLinkLabel(alias)}](`
      view.dispatch({
        changes: {from: anchor, to: head, insert: insertion},
        selection: {anchor: anchor + insertion.length},
        scrollIntoView: true,
      })
    }

    view.focus()
    startCompletion(view)
  }

  focus(options?: FocusOptions): void {
    const view = this.view
    if (!view) {
      HTMLElement.prototype.focus.call(this, options)
      return
    }

    this.ensureExecCommandShim(view)
    if (this.canFocusEditor(view)) {
      view.focus()
      return
    }

    this.tabIndex = -1
    HTMLElement.prototype.focus.call(this, options)
  }

  focusAt(selectionStart: number | null): void {
    const view = this.view
    if (!view) {
      return
    }

    this.ensureExecCommandShim(view)
    const anchor =
      selectionStart === null
        ? view.state.selection.main.head
        : Math.min(view.state.doc.length, Math.max(0, selectionStart))
    const currentSelection = view.state.selection.main
    const selectionChanged = currentSelection.from !== anchor || currentSelection.to !== anchor
    if (selectionChanged) {
      view.dispatch({
        selection: {anchor},
        scrollIntoView: true,
      })
    }
    this.focus({preventScroll: true})
  }

  private getScroller(): HTMLElement | null {
    return this.view?.scrollDOM ?? null
  }

  private hasTextGeometry(): boolean {
    const range = this.ownerDocument.createRange()
    return typeof range.getClientRects === 'function'
  }

  private resolveViewportAnchorPosition(view: EditorView, anchor: MarkdownViewportAnchor): number {
    if (anchor.sourceOffset !== null) {
      return Math.min(view.state.doc.length, Math.max(0, anchor.sourceOffset))
    }

    const lineIndex = Math.min(view.state.doc.lines - 1, Math.max(0, Math.floor(anchor.sourceLine)))
    const line = view.state.doc.line(lineIndex + 1)
    const lineFraction = Math.min(1, Math.max(0, anchor.sourceLine - lineIndex))
    return line.from + Math.round(line.length * lineFraction)
  }

  private setupScrollForwarding(view: EditorView): void {
    const handleScroll = () => {
      this.dispatchEvent(new Event('scroll', {bubbles: true, composed: true}))
    }

    view.scrollDOM.addEventListener('scroll', handleScroll, {passive: true})
    this.scrollerScrollCleanup = () => {
      view.scrollDOM.removeEventListener('scroll', handleScroll)
    }
  }

  private setupKeyboardGeometryListeners(view: EditorView): void {
    const ownerWindow = this.ownerDocument.defaultView
    if (!ownerWindow) {
      return
    }

    const handleKeyboardGeometryChange = () => this.scheduleKeyboardGeometrySync(view)
    const visualViewport = ownerWindow.visualViewport
    visualViewport?.addEventListener('resize', handleKeyboardGeometryChange)
    visualViewport?.addEventListener('scroll', handleKeyboardGeometryChange)
    ownerWindow.addEventListener('resize', handleKeyboardGeometryChange)
    ownerWindow.addEventListener('orientationchange', handleKeyboardGeometryChange)

    if (typeof MutationObserver !== 'undefined') {
      this.keyboardGeometryObserver = new MutationObserver(handleKeyboardGeometryChange)
      this.keyboardGeometryObserver.observe(this.ownerDocument.documentElement, {
        attributes: true,
        attributeFilter: [...MOBILE_KEYBOARD_ROOT_ATTRIBUTES],
      })
    }

    this.keyboardGeometryCleanup = () => {
      visualViewport?.removeEventListener('resize', handleKeyboardGeometryChange)
      visualViewport?.removeEventListener('scroll', handleKeyboardGeometryChange)
      ownerWindow.removeEventListener('resize', handleKeyboardGeometryChange)
      ownerWindow.removeEventListener('orientationchange', handleKeyboardGeometryChange)
    }
  }

  private scheduleKeyboardGeometrySync(view = this.view): void {
    if (!view || this.keyboardGeometrySyncPending) {
      return
    }

    this.keyboardGeometrySyncPending = true
    view.requestMeasure({
      key: this,
      read: (measureView): KeyboardSelectionRevealMeasurement => {
        const geometry = this.readKeyboardScrollGeometry(measureView)
        const selectionHead = measureView.state.selection.main.head
        return {
          geometry,
          selectionHead,
          selectionNeedsReveal: this.isSelectionHeadOutsideVisibleKeyboardViewport(measureView, geometry),
        }
      },
      write: (measurement, measureView) => {
        this.keyboardGeometrySyncPending = false
        if (this.view !== measureView) {
          return
        }

        const {geometry} = measurement
        const contentClearance = measureView.hasFocus ? geometry.bottomMargin : 0
        this.applyKeyboardContentClearance(contentClearance)
        if (
          geometry.keyboardInset <= MOBILE_KEYBOARD_MIN_OVERLAP_PX ||
          !measureView.hasFocus ||
          !measurement.selectionNeedsReveal
        ) {
          return
        }

        this.queueKeyboardSelectionScrollEffect(measureView, measurement.selectionHead)
      },
    })
  }

  private applyKeyboardContentClearance(contentClearance: number): void {
    const normalizedClearance = Math.max(0, Math.round(contentClearance))
    if (normalizedClearance === 0) {
      this.style.removeProperty(MOBILE_KEYBOARD_CONTENT_CLEARANCE_PROPERTY)
      return
    }

    this.style.setProperty(MOBILE_KEYBOARD_CONTENT_CLEARANCE_PROPERTY, `${normalizedClearance}px`)
  }

  private queueKeyboardSelectionScrollEffect(view: EditorView, selectionHead: number): void {
    const ownerWindow = view.dom.ownerDocument.defaultView
    if (!ownerWindow || this.keyboardSelectionRevealFrame) {
      return
    }

    this.keyboardSelectionRevealFrame = ownerWindow.requestAnimationFrame(() => {
      this.keyboardSelectionRevealFrame = 0
      if (this.view !== view || !view.hasFocus) {
        return
      }

      if (view.state.selection.main.head !== selectionHead) {
        this.scheduleKeyboardGeometrySync(view)
        return
      }

      view.dispatch({
        effects: EditorView.scrollIntoView(selectionHead, {
          y: 'nearest',
          yMargin: MOBILE_KEYBOARD_SELECTION_MARGIN_PX,
        }),
      })
    })
  }

  private readKeyboardScrollGeometry(view: EditorView): KeyboardScrollGeometry {
    const ownerDocument = view.dom.ownerDocument
    const ownerWindow = ownerDocument.defaultView
    if (!ownerWindow) {
      return {bottomMargin: 0, keyboardInset: 0, visibleRect: null}
    }

    const root = ownerDocument.documentElement
    const layoutHeight =
      this.getPositiveDimension(root.clientHeight) || this.getPositiveDimension(ownerWindow.innerHeight)
    if (layoutHeight <= 0) {
      return {bottomMargin: 0, keyboardInset: 0, visibleRect: null}
    }

    const visualViewport = ownerWindow.visualViewport
    const visualTop =
      visualViewport && Number.isFinite(visualViewport.offsetTop) ? Math.max(0, visualViewport.offsetTop) : 0
    const visualBottom = visualViewport
      ? visualTop + this.getPositiveDimension(visualViewport.height)
      : this.getPositiveDimension(ownerWindow.innerHeight) || layoutHeight
    const visualViewportInset = Math.max(0, layoutHeight - visualBottom)
    const rootInset = this.readRootKeyboardInset(root, ownerWindow)
    const keyboardInset = Math.max(rootInset, visualViewportInset)
    if (keyboardInset <= MOBILE_KEYBOARD_MIN_OVERLAP_PX) {
      return {bottomMargin: 0, keyboardInset, visibleRect: null}
    }

    const keyboardTop = Math.min(
      rootInset > 0 ? layoutHeight - rootInset : Number.POSITIVE_INFINITY,
      visualViewportInset > 0 ? visualBottom : Number.POSITIVE_INFINITY,
    )
    if (!Number.isFinite(keyboardTop)) {
      return {bottomMargin: 0, keyboardInset, visibleRect: null}
    }

    const scrollerRect = view.scrollDOM.getBoundingClientRect()
    const overlap = scrollerRect.bottom - keyboardTop
    if (overlap <= MOBILE_KEYBOARD_MIN_OVERLAP_PX) {
      return {bottomMargin: 0, keyboardInset, visibleRect: null}
    }

    const maxMargin = Math.max(0, scrollerRect.height - MOBILE_KEYBOARD_SELECTION_MARGIN_PX - 1)
    return {
      bottomMargin: Math.min(Math.ceil(overlap), Math.floor(maxMargin)),
      keyboardInset,
      visibleRect: {
        bottom: Math.min(scrollerRect.bottom, keyboardTop),
        top: Math.max(scrollerRect.top, visualTop),
      },
    }
  }

  private isSelectionHeadOutsideVisibleKeyboardViewport(
    view: EditorView,
    geometry: KeyboardScrollGeometry,
  ): boolean {
    const visibleRect = geometry.visibleRect
    if (!visibleRect || visibleRect.bottom <= visibleRect.top) return false

    const selection = view.state.selection.main
    const selectionHeadRect = view.coordsAtPos(
      selection.head,
      selection.assoc || (selection.head > selection.anchor ? -1 : 1),
    )
    if (!selectionHeadRect) return true

    return (
      selectionHeadRect.top < visibleRect.top - MOBILE_KEYBOARD_MIN_OVERLAP_PX ||
      selectionHeadRect.bottom > visibleRect.bottom + MOBILE_KEYBOARD_MIN_OVERLAP_PX
    )
  }

  private readKeyboardScrollMargin(view: EditorView): number {
    return this.readKeyboardScrollGeometry(view).bottomMargin
  }

  private readRootKeyboardInset(root: HTMLElement, ownerWindow: Window): number {
    const rootStyle = ownerWindow.getComputedStyle(root)
    return MOBILE_KEYBOARD_ROOT_OFFSET_PROPERTIES.reduce((maxInset, propertyName) => {
      const value = Number.parseFloat(rootStyle.getPropertyValue(propertyName))
      return Number.isFinite(value) && value > maxInset ? value : maxInset
    }, 0)
  }

  private getPositiveDimension(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  }

  private ensureExecCommandShim(view: EditorView): void {
    const doc = view.dom.ownerDocument as Document & {execCommand?: (commandId: string) => boolean}
    if (typeof doc.execCommand !== 'function') {
      Object.defineProperty(doc, 'execCommand', {
        configurable: true,
        value: () => false,
      })
    }
  }

  private canFocusEditor(view: EditorView): boolean {
    const selection = view.dom.ownerDocument.getSelection?.()
    return !selection || typeof selection.collapse === 'function'
  }

  private createExtensions(): Extension[] {
    return [
      highlightSpecialChars(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
      bracketMatching(),
      rectangularSelection(),
      highlightActiveLine(),
      markdown({completeHTMLTags: false}),
      autocompletion({
        activateOnTyping: true,
        override: [this.createNoteLinkCompletionSource(), this.createFileLinkCompletionSource()],
      }),
      taskListPlugin,
      EditorView.lineWrapping,
      EditorView.scrollMargins.of((view) => {
        const bottom = this.readKeyboardScrollMargin(view)
        return bottom > 0 ? {bottom} : null
      }),
      EditorView.contentAttributes.of({
        'aria-label': this.editorLabel,
        [MOBILE_KEYBOARD_SCROLL_ATTR]: MOBILE_KEYBOARD_SCROLL_OFF_VALUE,
      }),
      EditorView.domEventHandlers({
        dragover: (event) => this.handleDragOver(event),
        drop: (event, view) => this.handleDrop(event, view),
        paste: (event, view) => this.handlePaste(event, view),
      }),
      EditorView.updateListener.of((update) => this.handleViewUpdate(update)),
      this.createTheme(),
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => this.emitCommand('save'),
        },
        {
          key: 'Mod-z',
          preventDefault: true,
          run: () => this.emitCommand('undo'),
        },
        {
          key: 'Mod-Shift-z',
          preventDefault: true,
          run: () => this.emitCommand('redo'),
        },
        {
          key: 'Ctrl-y',
          preventDefault: true,
          run: () => this.emitCommand('redo'),
        },
        {
          key: 'Tab',
          run: indentMore,
        },
        {
          key: 'Shift-Tab',
          run: indentLess,
        },
        ...defaultKeymap,
      ]),
    ]
  }

  private createTheme(): Extension {
    return EditorView.theme({
      '&': {
        blockSize: '100%',
        minBlockSize: 'inherit',
        borderRadius: 'inherit',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
      },
      '.cm-scroller': {
        fontFamily:
          'var(--cv-font-family-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace)',
        fontSize: 'var(--cv-font-size-sm)',
        fontWeight: '500',
        lineHeight: '1.65',
      },
      '.cm-content': {
        boxSizing: 'border-box',
        minBlockSize: '100%',
        padding: `0 0 var(${MOBILE_KEYBOARD_CONTENT_CLEARANCE_PROPERTY}, 0px)`,
        caretColor: 'var(--cv-color-accent)',
      },
      '.cm-focused': {
        outline: 'none',
      },
      '.cm-cursor': {
        borderInlineStartColor: 'var(--cv-color-accent)',
      },
      '&.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, &.cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
        background: 'var(--cv-color-editor-selection-background, var(--cv-color-selected))',
      },
      '.cm-activeLine': {
        background: 'transparent',
        boxShadow: 'inset 2px 0 var(--cv-color-primary-border-strong)',
      },
      '.cm-tooltip': {
        border: '1px solid var(--cv-color-border-muted)',
        borderRadius: 'var(--cv-radius-2)',
        background: 'var(--cv-color-surface-elevated)',
        color: 'var(--cv-color-text)',
        boxShadow: 'var(--cv-shadow-2)',
        overflow: 'hidden',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--cv-font-family-body, inherit)',
        fontSize: 'var(--cv-font-size-sm)',
        minInlineSize: '220px',
        maxInlineSize: 'min(360px, 80vw)',
        maxBlockSize: '272px',
        padding: '4px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 10px',
        borderRadius: 'var(--cv-radius-1)',
        color: 'var(--cv-color-text)',
        lineHeight: '1.4',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li:hover': {
        background: 'var(--cv-color-surface-hover)',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        background: 'var(--cv-color-active)',
        color: 'var(--cv-color-text)',
      },
      '.cm-completionIcon': {
        display: 'none',
      },
      '.cm-completionLabel': {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: '500',
      },
      '.cm-completionMatchedText': {
        textDecoration: 'none',
        color: 'var(--cv-color-accent)',
        fontWeight: '600',
      },
      '.cm-completionDetail': {
        marginInlineStart: 'auto',
        maxInlineSize: '55%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--cv-color-text-muted)',
        fontSize: '0.85em',
        fontStyle: 'normal',
      },
      '.cm-markdown-task-checkbox': {
        boxSizing: 'border-box',
        display: 'inline-grid',
        placeItems: 'center',
        inlineSize: 'max(1.08em, 18px)',
        blockSize: 'max(1.08em, 18px)',
        marginInline: '0.32em 0.28em',
        border: '1px solid var(--cv-color-border-muted)',
        borderRadius: 'var(--cv-radius-1)',
        verticalAlign: 'middle',
        backgroundColor: 'var(--cv-color-surface-tertiary-glass)',
        color: 'var(--cv-color-primary)',
        cursor: 'pointer',
        transform: 'translateY(0)',
        transition: [
          'transform var(--cv-duration-fast) var(--cv-easing-standard)',
          'border-color var(--cv-duration-fast) var(--cv-easing-standard)',
          'background-color var(--cv-duration-fast) var(--cv-easing-standard)',
          'color var(--cv-duration-fast) var(--cv-easing-standard)',
        ].join(', '),
      },
      '.cm-markdown-task-checkbox:hover': {
        borderColor: 'var(--cv-color-primary-border-strong)',
        backgroundColor: 'var(--cv-color-primary-surface)',
      },
      '.cm-markdown-task-checkbox:active': {
        transform: 'translateY(1px) scale(0.96)',
      },
      '.cm-markdown-task-checkbox[data-checked="true"]': {
        borderColor: 'var(--cv-color-primary-border-strong)',
        backgroundColor: 'var(--cv-color-primary-surface-strong)',
      },
      '.cm-markdown-task-checkbox::after': {
        boxSizing: 'border-box',
        content: '""',
        inlineSize: '0.38em',
        blockSize: '0.68em',
        borderColor: 'currentColor',
        borderStyle: 'solid',
        borderWidth: '0 2px 2px 0',
        opacity: '0',
        transform: 'translateY(-0.08em) rotate(45deg) scale(0.84)',
        transition: [
          'transform var(--cv-duration-fast) var(--cv-easing-standard)',
          'opacity var(--cv-duration-fast) var(--cv-easing-standard)',
        ].join(', '),
      },
      '.cm-markdown-task-checkbox[data-checked="true"]::after': {
        opacity: '1',
        transform: 'translateY(-0.08em) rotate(45deg) scale(1)',
      },
      '@media (prefers-reduced-motion: reduce)': {
        '.cm-markdown-task-checkbox, .cm-markdown-task-checkbox::after': {
          transitionDuration: 'var(--cv-duration-instant, 0ms)',
        },
      },
    })
  }

  private createNoteLinkCompletionSource() {
    return (context: CompletionContext): CompletionResult | null => {
      const source = context.state.doc.toString()
      const match = getWikilinkCompletionMatch(source, context.pos)
      if (!match) {
        return null
      }

      const query = match.query.trim().toLocaleLowerCase()
      const options = this.noteLinkCompletions
        .filter((item) =>
          !query ||
          item.label.toLocaleLowerCase().includes(query) ||
          item.target.toLocaleLowerCase().includes(query),
        )
        .map((item): Completion => ({
          label: item.label,
          detail: item.detail,
          type: 'reference',
          apply: (view) => {
            const nextSource = view.state.doc.toString()
            const currentMatch =
              getWikilinkCompletionMatch(nextSource, view.state.selection.main.head) ?? match
            const trailingCloseLength = nextSource.slice(currentMatch.to, currentMatch.to + 2) === ']]' ? 2 : 0
            const insertion = formatWikilinkInsertion(item.target, this.pendingCompletionAlias)
            this.pendingCompletionAlias = ''
            view.dispatch({
              changes: {from: currentMatch.from, to: currentMatch.to + trailingCloseLength, insert: insertion},
              selection: {anchor: currentMatch.from + insertion.length},
              scrollIntoView: true,
            })
          },
        }))

      return {
        from: match.from + 2,
        to: match.to,
        options,
        validFor: /^[^\]\n]*$/,
      }
    }
  }

  private createFileLinkCompletionSource() {
    return async (context: CompletionContext): Promise<CompletionResult | null> => {
      const source = context.state.doc.toString()
      // While typing, `[[` belongs to note completions; the wikilink shortcut
      // offers files only when completion is invoked explicitly.
      const match = context.explicit
        ? getAnyMarkdownFileLinkCompletionMatch(source, context.pos)
        : getMarkdownFileLinkCompletionMatch(source, context.pos)
      if (!match) {
        return null
      }

      const items = await this.fileLinkCompletionProvider(match.query).catch(() => [])
      if (items.length === 0) {
        return null
      }

      const options = items.map((item): Completion => ({
        label: item.name,
        detail: item.path,
        type: 'file',
        apply: (view) => {
          const nextSource = view.state.doc.toString()
          const selection = view.state.selection.main
          const currentMatch = getAnyMarkdownFileLinkCompletionMatch(nextSource, selection.head) ?? match
          const replacement = getMarkdownFileLinkCompletionReplacementRange(nextSource, currentMatch)
          const insertion = formatMarkdownFileLinkInsertion(
            item,
            this.pendingCompletionAlias || currentMatch.label || item.name,
          )
          this.pendingCompletionAlias = ''
          view.dispatch({
            changes: {from: replacement.from, to: replacement.to, insert: insertion},
            selection: {anchor: replacement.from + insertion.length},
            scrollIntoView: true,
          })
        },
      }))

      return {
        from: match.from,
        to: match.to,
        options,
        validFor: 'kind' in match && match.kind === 'wikilink-shortcut' ? /^[^\]\n]*$/ : /^[^)\n]*$/,
      }
    }
  }

  private syncSourceFromProperty(): void {
    const view = this.view
    if (!view) {
      return
    }

    const currentSource = view.state.doc.toString()
    const nextSource = this.source
    if (currentSource === nextSource) {
      return
    }

    // Replace only the changed span: a full-document replace invalidates the
    // editor's scroll anchoring and makes the viewport jump on every sync.
    let prefix = 0
    const maxPrefix = Math.min(currentSource.length, nextSource.length)
    while (prefix < maxPrefix && currentSource.charCodeAt(prefix) === nextSource.charCodeAt(prefix)) {
      prefix += 1
    }
    let currentEnd = currentSource.length
    let nextEnd = nextSource.length
    while (
      currentEnd > prefix &&
      nextEnd > prefix &&
      currentSource.charCodeAt(currentEnd - 1) === nextSource.charCodeAt(nextEnd - 1)
    ) {
      currentEnd -= 1
      nextEnd -= 1
    }

    const anchor = Math.min(view.state.selection.main.head, nextSource.length)
    this.applyingExternalSource = true
    try {
      view.dispatch({
        changes: {from: prefix, to: currentEnd, insert: nextSource.slice(prefix, nextEnd)},
        selection: {anchor},
      })
    } finally {
      this.applyingExternalSource = false
    }
  }

  private applyFocusRequest(): void {
    const request = this.focusRequest
    if (!request || request.id === this.lastFocusRequestId) {
      return
    }

    this.lastFocusRequestId = request.id
    this.focusAt(request.selectionStart)
  }

  private applySelectionRequest(): void {
    const request = this.selectionRequest
    if (!request || request.id === this.lastSelectionRequestId) {
      return
    }

    this.lastSelectionRequestId = request.id
    this.setSelectionRange(request.selectionStart, request.selectionEnd)
  }

  private releaseFocusForHiddenMobileKeyboard(): void {
    const view = this.view
    if (!view?.hasFocus || !getRuntimeCapabilities().mobile || mobileKeyboardOccluding()) {
      return
    }

    view.contentDOM.blur()
  }

  private handleViewUpdate(update: ViewUpdate): void {
    if (update.docChanged && !this.applyingExternalSource) {
      this.dispatchEvent(
        new CustomEvent<MarkdownSourceInputDetail>('markdown-source-input', {
          bubbles: true,
          composed: true,
          detail: {source: update.state.doc.toString()},
        }),
      )
      this.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
    }

    if (update.docChanged || update.selectionSet || update.focusChanged) {
      const selection = update.state.selection.main
      this.dispatchEvent(
        new CustomEvent<MarkdownSourceSelectionDetail>('markdown-source-selection', {
          bubbles: true,
          composed: true,
          detail: {
            selectionStart: selection.from,
            selectionEnd: selection.to,
          },
        }),
      )
    }

    if (update.focusChanged || (update.view.hasFocus && (update.docChanged || update.selectionSet))) {
      this.scheduleKeyboardGeometrySync(update.view)
    }
  }

  private emitCommand(command: MarkdownSourceCommand): boolean {
    this.dispatchEvent(
      new CustomEvent<MarkdownSourceCommandDetail>('markdown-source-command', {
        bubbles: true,
        composed: true,
        detail: {command},
      }),
    )
    return true
  }

  private handlePaste(event: ClipboardEvent, view: EditorView): boolean {
    const files = this.getImageFiles(event.clipboardData?.files)
    if (files.length === 0) {
      return false
    }

    event.preventDefault()
    this.emitImageFiles(files, view)
    return true
  }

  private handleDrop(event: DragEvent, view: EditorView): boolean {
    const files = this.getImageFiles(event.dataTransfer?.files)
    if (files.length === 0) {
      return false
    }

    event.preventDefault()
    this.emitImageFiles(files, view)
    return true
  }

  private handleDragOver(event: DragEvent): boolean {
    if (!this.hasImageFile(event.dataTransfer?.items)) {
      return false
    }

    event.preventDefault()
    return true
  }

  private emitImageFiles(files: File[], view: EditorView): void {
    const selection = view.state.selection.main
    this.dispatchEvent(
      new CustomEvent<MarkdownSourceImageFilesDetail>('markdown-source-image-files', {
        bubbles: true,
        composed: true,
        detail: {
          files,
          selectionStart: selection.from,
          selectionEnd: selection.to,
        },
      }),
    )
  }

  private getImageFiles(files: FileList | readonly File[] | null | undefined): File[] {
    return Array.from(files ?? []).filter((file) => this.isImageFile(file))
  }

  private hasImageFile(items: DataTransferItemList | null | undefined): boolean {
    return Array.from(items ?? []).some(
      (item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')),
    )
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || IMAGE_FILE_NAME_PATTERN.test(file.name)
  }

  protected render() {
    return html`<div class="editor-host"></div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'markdown-source-editor': MarkdownSourceEditor
  }
}
