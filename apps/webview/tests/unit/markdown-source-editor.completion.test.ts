import {afterEach, describe, expect, it} from 'vitest'

import type {EditorView} from '@codemirror/view'
import {currentCompletions} from '@codemirror/autocomplete'

import {MarkdownSourceEditor} from '../../src/features/file-manager/components/markdown-source-editor'

// CodeMirror measures text through Range APIs that jsdom does not implement.
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function getView(editor: MarkdownSourceEditor): EditorView {
  return (editor as unknown as {view: EditorView}).view
}

function typeText(editor: MarkdownSourceEditor, text: string): EditorView {
  const view = getView(editor)
  for (const char of text) {
    const head = view.state.selection.main.head
    view.dispatch({
      changes: {from: head, insert: char},
      selection: {anchor: head + 1},
      userEvent: 'input.type',
    })
  }
  return view
}

async function waitForCompletions(view: EditorView): Promise<readonly unknown[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const completions = currentCompletions(view.state)
    if (completions.length > 0) {
      return completions
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return currentCompletions(view.state)
}

async function createEditor(): Promise<MarkdownSourceEditor> {
  MarkdownSourceEditor.define()
  const editor = document.createElement('markdown-source-editor') as MarkdownSourceEditor
  editor.noteLinkCompletions = [
    {label: 'Alpha', detail: '/notes/alpha.md', target: 'alpha'},
    {label: 'Beta', detail: '/notes/beta.md', target: 'beta'},
  ]
  editor.fileLinkCompletionProvider = async () =>
    [{id: 1, name: 'report.pdf', path: '/docs/report.pdf', isDir: false}] as never
  document.body.appendChild(editor)
  await settle(editor)
  return editor
}

describe('markdown source editor wikilink completions', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('suggests all notes after typing [[', async () => {
    const editor = await createEditor()
    const view = typeText(editor, '[[')

    const completions = (await waitForCompletions(view)) as Array<{label: string}>
    const labels = completions.map((completion) => completion.label)
    expect(labels).toContain('Alpha')
    expect(labels).toContain('Beta')
    expect(labels).not.toContain('report.pdf')
  })

  it('suggests catalog files while typing a markdown link target', async () => {
    const editor = await createEditor()
    const view = typeText(editor, '[report](')

    const completions = (await waitForCompletions(view)) as Array<{label: string}>
    const labels = completions.map((completion) => completion.label)
    expect(labels).toContain('report.pdf')
    expect(labels).not.toContain('Alpha')
  })

  it('filters note suggestions by the typed query', async () => {
    const editor = await createEditor()
    const view = typeText(editor, '[[alp')

    const completions = (await waitForCompletions(view)) as Array<{label: string}>
    const labels = completions.map((completion) => completion.label)
    expect(labels).toContain('Alpha')
    expect(labels).not.toContain('Beta')
  })

  it('inserts a wikilink when a note completion is applied', async () => {
    const editor = await createEditor()
    const view = typeText(editor, '[[alp')

    const completions = (await waitForCompletions(view)) as Array<{
      label: string
      apply: (view: EditorView, completion: unknown, from: number, to: number) => void
    }>
    const alpha = completions.find((completion) => completion.label === 'Alpha')
    expect(alpha).toBeDefined()

    const head = view.state.selection.main.head
    alpha!.apply(view, alpha, head, head)
    expect(view.state.doc.toString()).toBe('[[alpha]]')
  })

  it('shows note completions via explicit openNoteLinkCompletion', async () => {
    const editor = await createEditor()
    editor.openNoteLinkCompletion()

    const view = getView(editor)
    const completions = (await waitForCompletions(view)) as Array<{label: string}>
    const labels = completions.map((completion) => completion.label)
    expect(view.state.doc.toString()).toBe('[[')
    expect(labels).toContain('Alpha')
    expect(labels).toContain('Beta')
  })
})
