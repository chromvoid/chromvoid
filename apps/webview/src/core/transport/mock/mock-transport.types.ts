import type {TransportEventHandler} from '../transport'
import type {FileMediaInfo} from '../../catalog/media-info'
import type {NodeType} from '../../catalog/local-catalog/types'
import type {CredentialTagCatalogMeta} from '@project/passmanager/tags'
import type {CredentialSecurityAuditArtifactV1} from '@project/passmanager/security-audit'
import type {PassManagerSshKey} from '@project/passmanager/types'

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
  otpSecrets: [string, MockOtpSecret][]
}

export type MockOtpSecret = {
  secret: string
  encoding?: string
  algorithm?: string
  digits: number
  period: number
  type?: string
  counter?: number
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
  tagMeta?: CredentialTagCatalogMeta
  entries: Array<{nodeId: number; meta: Record<string, unknown>}>
  secrets: [string, string][]
  sshKeys?: [string, PassManagerSshKey][]
  sshSecrets?: [string, {privateKey?: string; publicKey?: string}][]
  otpSecrets: [string, MockOtpSecret][]
  icons: [string, MockPassmanagerIcon][]
  securityAudit?: CredentialSecurityAuditArtifactV1
}
