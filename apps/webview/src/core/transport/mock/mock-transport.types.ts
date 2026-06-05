import type {TransportEventHandler} from '../transport'
import type {FileMediaInfo} from '../../catalog/media-info'
import type {NodeType} from '../../catalog/local-catalog/types'

export type HandlerSet = Set<TransportEventHandler>

export type Ok<T> = {ok: true; result: T}

export type Err = {ok: false; error: string}

export type MockTransportLogChannel = 'catalog' | 'passmanager'

export type MockTransportLogEntry = {
  channel: MockTransportLogChannel
  command: string
  data: Record<string, unknown>
  result: unknown
  at: number
}

export const MOCK_TRANSPORT_LOG_ENDPOINT = '/api/mock-transport-log'

export type MockNode = {
  id: number
  type: NodeType
  name: string
  size: number
  modtime: number
  parentId: number | null
  children: number[]
  mimeType?: string
  mediaInfo?: FileMediaInfo | null
  sourceRevision?: number
  mediaInspectedRevision?: number
}

export type PersistedState = {
  version: 1
  nextId: number
  nodes: [number, MockNode][]
  files: [number, string][]
  secrets: [number, string][]
  otpSecrets: [string, {secret: string; digits: number; period: number}][]
}

export type MockPassmanagerIcon = {
  icon_ref: string
  mime_type: string
  background_color?: string | null
  content_base64: string
  width: number
  height: number
  bytes: number
  created_at: number
  updated_at: number
}

export type MockPassmanagerFolderMeta = {
  iconRef?: string | null
  description?: string | null
}

export type PersistedPassmanagerState = {
  version: 1
  revision: number
  nextNodeId: number
  folders: string[]
  foldersMeta: Array<{path: string; iconRef?: string | null; description?: string | null}>
  tags?: string[]
  entries: Array<{nodeId: number; meta: Record<string, unknown>}>
  secrets: [string, string][]
  otpSecrets: [string, {secret: string; digits: number; period: number}][]
  icons: [string, MockPassmanagerIcon][]
}
