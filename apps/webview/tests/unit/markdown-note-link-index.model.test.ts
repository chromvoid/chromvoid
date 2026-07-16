import {describe, expect, it, vi} from 'vitest'

import {MarkdownNoteLinkIndexModel} from '../../src/features/file-manager/models/markdown-note-link-index.model'
import {
  createMarkdownNoteContext,
  createWikilinkCandidate,
} from '../../src/features/file-manager/services/markdown-note-links'
import type {AppContext} from '../../src/shared/services/app-context'

function note(input: {fileId: number; fileName: string; path: string; parentPath: string}) {
  return {
    id: String(input.fileId),
    fileId: input.fileId,
    fileName: input.fileName,
    path: input.path,
    parentPath: input.parentPath,
    mimeType: 'text/markdown',
  }
}

function candidate(rawTarget: string) {
  const parsed = createWikilinkCandidate({id: `link:${rawTarget}`, rawTarget})
  if (!parsed) {
    throw new Error(`Invalid candidate ${rawTarget}`)
  }
  return parsed
}

describe('MarkdownNoteLinkIndexModel', () => {
  it('loads notes from catalog.listNotes metadata', async () => {
    const listNotes = vi.fn(async () => ({
      version: 1,
      items: [
        {
          node_id: 2,
          name: 'Sibling.md',
          path: '/Docs/Sibling.md',
          parent_path: '/Docs',
          size: 12,
          mime_type: 'text/markdown',
          source_revision: 8,
          created_at: 1,
          updated_at: 2,
        },
      ],
    }))
    const model = new MarkdownNoteLinkIndexModel({
      getContext: () => ({catalog: {listNotes}}) as unknown as AppContext,
    })

    await model.loadNotes()

    expect(listNotes).toHaveBeenCalledTimes(1)
    expect(model.notes()).toEqual([
      expect.objectContaining({
        fileId: 2,
        fileName: 'Sibling.md',
        path: '/Docs/Sibling.md',
        parentPath: '/Docs',
        sourceRevision: 8,
      }),
    ])
  })

  it('resolves same-note anchors, relative paths, suffix paths, and unique stems', () => {
    const model = new MarkdownNoteLinkIndexModel()
    model.notes.set([
      note({fileId: 1, fileName: 'Current.md', path: '/Docs/Current.md', parentPath: '/Docs'}),
      note({fileId: 2, fileName: 'Sibling.md', path: '/Docs/Sibling.md', parentPath: '/Docs'}),
      note({fileId: 3, fileName: 'Roadmap.md', path: '/Archive/Roadmap.md', parentPath: '/Archive'}),
      note({fileId: 4, fileName: 'Deep.md', path: '/Projects/Specs/Deep.md', parentPath: '/Projects/Specs'}),
    ])
    const context = createMarkdownNoteContext({
      fileId: 1,
      fileName: 'Current.md',
      path: '/Docs/Current.md',
      parentPath: '/Docs',
      sourceRevision: 1,
    })

    expect(model.resolve(context, candidate('#Intro'))).toEqual({
      kind: 'same-note-anchor',
      candidateId: 'link:#Intro',
      anchor: 'intro',
    })
    expect(model.resolve(context, candidate('./Sibling.md'))).toMatchObject({
      kind: 'resolved',
      target: {fileId: 2, path: '/Docs/Sibling.md'},
    })
    expect(model.resolve(context, candidate('Specs/Deep'))).toMatchObject({
      kind: 'resolved',
      target: {fileId: 4, path: '/Projects/Specs/Deep.md'},
    })
    expect(model.resolve(context, candidate('Roadmap'))).toMatchObject({
      kind: 'resolved',
      target: {fileId: 3, path: '/Archive/Roadmap.md'},
    })
  })

  it('fails closed for ambiguous basename and stem links', () => {
    const model = new MarkdownNoteLinkIndexModel()
    model.notes.set([
      note({fileId: 2, fileName: 'Daily.md', path: '/Archive/Daily.md', parentPath: '/Archive'}),
      note({fileId: 3, fileName: 'Daily.markdown', path: '/Work/Daily.markdown', parentPath: '/Work'}),
    ])
    const context = createMarkdownNoteContext({
      fileId: 1,
      fileName: 'Current.md',
      path: '/Docs/Current.md',
      parentPath: '/Docs',
      sourceRevision: 1,
    })

    expect(model.resolve(context, candidate('Daily'))).toEqual({
      kind: 'ambiguous',
      candidateId: 'link:Daily',
    })
  })

  it('builds duplicate-safe completion targets', () => {
    const model = new MarkdownNoteLinkIndexModel()
    model.notes.set([
      note({fileId: 2, fileName: 'Daily.md', path: '/Archive/Daily.md', parentPath: '/Archive'}),
      note({fileId: 3, fileName: 'Daily.markdown', path: '/Work/Daily.markdown', parentPath: '/Work'}),
      note({fileId: 4, fileName: 'Plan.md', path: '/Docs/Plan.md', parentPath: '/Docs'}),
    ])

    expect(model.completions(createMarkdownNoteContext({fileId: 1, fileName: 'Current.md'}))).toEqual([
      expect.objectContaining({label: 'Daily', target: 'Archive/Daily'}),
      expect.objectContaining({label: 'Plan', target: 'Plan'}),
      expect.objectContaining({label: 'Daily', target: 'Work/Daily'}),
    ])
  })
})
