import {atom, computed, wrap} from '@reatom/core'

import type {CatalogNotesListResponse} from 'root/core/catalog/local-catalog/types'
import type {AppContext} from 'root/shared/services/app-context'
import {tryGetAppContext} from 'root/shared/services/app-context'

import {
  type CatalogMarkdownNote,
  normalizeCatalogNotesResponse,
} from '../services/catalog-notes'
import {
  buildWikilinkCompletionTarget,
  getPathBasename,
  normalizeCatalogNotePath,
  normalizeMarkdownAnchor,
  normalizeRelativeNotePath,
  removeMarkdownExtension,
  withMarkdownPathVariants,
  type MarkdownNoteContext,
  type MarkdownNoteLinkCandidate,
  type MarkdownNoteLinkCompletion,
} from '../services/markdown-note-links'

export type MarkdownResolvedNoteLinkTarget = CatalogMarkdownNote & {
  anchor: string | null
}

export type MarkdownNoteLinkResolution =
  | {kind: 'resolved'; candidateId: string; target: MarkdownResolvedNoteLinkTarget}
  | {kind: 'same-note-anchor'; candidateId: string; anchor: string}
  | {kind: 'unresolved'; candidateId: string}
  | {kind: 'ambiguous'; candidateId: string}
  | {kind: 'external'; candidateId: string}

export type MarkdownNoteLinkIndexLike = {
  loadNotes: () => Promise<void>
  resolve: (
    context: MarkdownNoteContext,
    candidate: MarkdownNoteLinkCandidate,
  ) => MarkdownNoteLinkResolution
  completions: (context: MarkdownNoteContext) => MarkdownNoteLinkCompletion[]
}

type NotesLoader = {
  listNotes?: () => Promise<CatalogNotesListResponse>
}

export type MarkdownNoteLinkIndexModelDeps = {
  getContext?: () => AppContext | null
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function uniqueNotes(notes: CatalogMarkdownNote[]): CatalogMarkdownNote[] {
  const byPath = new Map<string, CatalogMarkdownNote>()
  for (const note of notes) {
    byPath.set(note.path, note)
  }
  return [...byPath.values()]
}

export class MarkdownNoteLinkIndexModel implements MarkdownNoteLinkIndexLike {
  readonly notes = atom<CatalogMarkdownNote[]>([], 'markdown.noteLinks.notes')
  readonly loading = atom(false, 'markdown.noteLinks.loading')
  readonly loadError = atom(false, 'markdown.noteLinks.loadError')
  readonly ready = computed(() => !this.loading() && !this.loadError(), 'markdown.noteLinks.ready')

  private readonly getContext: () => AppContext | null
  private loadPromise: Promise<void> | null = null

  constructor(deps: MarkdownNoteLinkIndexModelDeps = {}) {
    this.getContext = deps.getContext ?? tryGetAppContext
  }

  async loadNotes(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise
    }

    this.loadPromise = this.runLoadNotes().finally(() => {
      this.loadPromise = null
    })
    return this.loadPromise
  }

  resolve(
    context: MarkdownNoteContext,
    candidate: MarkdownNoteLinkCandidate,
  ): MarkdownNoteLinkResolution {
    if (!candidate.targetPath && candidate.anchor) {
      return {
        kind: 'same-note-anchor',
        candidateId: candidate.id,
        anchor: normalizeMarkdownAnchor(candidate.anchor),
      }
    }

    const notes = this.notes()
    if (notes.length === 0) {
      return {kind: 'unresolved', candidateId: candidate.id}
    }

    const anchor = candidate.anchor ? normalizeMarkdownAnchor(candidate.anchor) : null
    const targetPath = candidate.targetPath.trim()
    const resolved = this.resolveTargetPath(context, targetPath)
    if (resolved.length === 0) {
      return {kind: 'unresolved', candidateId: candidate.id}
    }
    if (resolved.length > 1) {
      return {kind: 'ambiguous', candidateId: candidate.id}
    }

    const target = resolved[0]!
    if (anchor && context.path && target.path === context.path) {
      return {kind: 'same-note-anchor', candidateId: candidate.id, anchor}
    }

    return {
      kind: 'resolved',
      candidateId: candidate.id,
      target: {
        ...target,
        anchor,
      },
    }
  }

  completions(_context: MarkdownNoteContext): MarkdownNoteLinkCompletion[] {
    const notes = [...this.notes()].sort((left, right) => left.path.localeCompare(right.path))
    const duplicateStemCounts = new Map<string, number>()
    for (const note of notes) {
      const stem = normalizeLookupKey(removeMarkdownExtension(note.fileName))
      duplicateStemCounts.set(stem, (duplicateStemCounts.get(stem) ?? 0) + 1)
    }

    return notes.map((note) => {
      const stemKey = normalizeLookupKey(removeMarkdownExtension(note.fileName))
      const target = buildWikilinkCompletionTarget(note, duplicateStemCounts.get(stemKey) ?? 1)
      return {
        label: removeMarkdownExtension(note.fileName),
        detail: note.parentPath,
        target,
      }
    })
  }

  private async runLoadNotes(): Promise<void> {
    const loader = this.getNotesLoader()
    if (!loader?.listNotes) {
      this.notes.set([])
      this.loading.set(false)
      this.loadError.set(false)
      return
    }

    this.loading.set(true)
    this.loadError.set(false)
    try {
      const response = await wrap(loader.listNotes())
      this.notes.set(normalizeCatalogNotesResponse(response))
      this.loadError.set(false)
    } catch {
      this.notes.set([])
      this.loadError.set(true)
    } finally {
      this.loading.set(false)
    }
  }

  private getNotesLoader(): NotesLoader | null {
    const catalog = this.getContext()?.catalog as NotesLoader | undefined
    return typeof catalog?.listNotes === 'function' ? catalog : null
  }

  private resolveTargetPath(context: MarkdownNoteContext, targetPath: string): CatalogMarkdownNote[] {
    if (!targetPath) {
      return []
    }

    const notes = this.notes()
    const byPath = this.createPathIndex(notes)

    if (targetPath.startsWith('/')) {
      return this.findByCandidatePaths(byPath, withMarkdownPathVariants(targetPath))
    }

    const parentPath = context.parentPath ?? '/'
    const relativeMatches = this.findByCandidatePaths(
      byPath,
      withMarkdownPathVariants(normalizeRelativeNotePath(parentPath, targetPath) ?? ''),
    )
    if (relativeMatches.length > 0) {
      return relativeMatches
    }

    if (targetPath.includes('/')) {
      const suffixMatches = this.findByPathSuffix(notes, targetPath)
      if (suffixMatches.length > 0) {
        return suffixMatches
      }
    }

    return this.findByUniqueBasename(notes, targetPath)
  }

  private createPathIndex(notes: readonly CatalogMarkdownNote[]): Map<string, CatalogMarkdownNote> {
    const index = new Map<string, CatalogMarkdownNote>()
    for (const note of notes) {
      const normalized = normalizeCatalogNotePath(note.path)
      if (normalized) {
        index.set(normalizeLookupKey(normalized), note)
      }
    }
    return index
  }

  private findByCandidatePaths(
    byPath: Map<string, CatalogMarkdownNote>,
    paths: readonly string[],
  ): CatalogMarkdownNote[] {
    return uniqueNotes(
      paths
        .map((path) => normalizeCatalogNotePath(path))
        .filter((path): path is string => Boolean(path))
        .map((path) => byPath.get(normalizeLookupKey(path)))
        .filter((note): note is CatalogMarkdownNote => Boolean(note)),
    )
  }

  private findByPathSuffix(notes: readonly CatalogMarkdownNote[], targetPath: string): CatalogMarkdownNote[] {
    const suffixes = withMarkdownPathVariants(targetPath.replace(/^\/+/, ''))
      .map((path) => normalizeLookupKey(`/${path}`))
    return notes.filter((note) =>
      suffixes.some((suffix) => normalizeLookupKey(note.path).endsWith(suffix)),
    )
  }

  private findByUniqueBasename(notes: readonly CatalogMarkdownNote[], targetPath: string): CatalogMarkdownNote[] {
    const targetBase = removeMarkdownExtension(getPathBasename(targetPath))
    if (!targetBase) {
      return []
    }

    const key = normalizeLookupKey(targetBase)
    return notes.filter((note) => normalizeLookupKey(removeMarkdownExtension(note.fileName)) === key)
  }
}

export const markdownNoteLinkIndexModel = new MarkdownNoteLinkIndexModel()
