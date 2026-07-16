import {buildChildPath, parentPath as getParentPath} from 'root/app/navigation/navigation-snapshot'
import type {
  CatalogNotesListItem,
  CatalogNotesListResponse,
} from 'root/core/catalog/local-catalog/types'

export type CatalogMarkdownNote = {
  id: string
  fileId: number
  fileName: string
  path: string
  parentPath: string
  size?: number
  lastModified?: number
  sourceRevision?: number
  mimeType?: string
  heading?: string
  excerpt?: string
  previewWords?: number
  previewTruncated?: boolean
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function normalizeCatalogNoteItem(item: CatalogNotesListItem): CatalogMarkdownNote | null {
  const fileId = Number(item.node_id)
  if (!Number.isFinite(fileId)) {
    return null
  }

  const path = item.path || buildChildPath(item.parent_path || '/', item.name)
  const mimeType = typeof item.mime_type === 'string' ? item.mime_type : undefined
  const size = toOptionalFiniteNumber(item.size)
  const lastModified = toOptionalFiniteNumber(item.updated_at)
  const sourceRevision = toOptionalFiniteNumber(item.source_revision)
  const heading = toOptionalString(item.heading)
  const excerpt = toOptionalString(item.excerpt)
  const previewWords = toOptionalFiniteNumber(item.preview_words)
  const previewTruncated = typeof item.preview_truncated === 'boolean' ? item.preview_truncated : undefined

  return {
    id: String(fileId),
    fileId,
    fileName: item.name,
    path,
    parentPath: item.parent_path || getParentPath(path),
    ...(size !== undefined ? {size} : {}),
    ...(lastModified !== undefined ? {lastModified} : {}),
    ...(sourceRevision !== undefined ? {sourceRevision} : {}),
    ...(mimeType ? {mimeType} : {}),
    ...(heading ? {heading} : {}),
    ...(excerpt ? {excerpt} : {}),
    ...(previewWords !== undefined ? {previewWords} : {}),
    ...(previewTruncated !== undefined ? {previewTruncated} : {}),
  }
}

export function normalizeCatalogNotesResponse(response: CatalogNotesListResponse): CatalogMarkdownNote[] {
  return response.items
    .map(normalizeCatalogNoteItem)
    .filter((row): row is CatalogMarkdownNote => Boolean(row))
}
