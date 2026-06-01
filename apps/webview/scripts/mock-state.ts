import {existsSync} from 'node:fs'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

type MockNode = {
  id: number
  type: number
  name: string
  size: number
  modtime: number
  parentId: number | null
  children: number[]
  mimeType?: string
}

export type PersistedState = {
  version: 1
  nextId: number
  nodes: [number, MockNode][]
  files: [number, string][]
  secrets: [number, string][]
  otpSecrets: [string, {secret: string; digits: number; period: number}][]
}

export type MockPassmanagerBootstrapState = {
  version: 1
  nextId: number
  folders: string[]
  entries: Array<{
    n: number
    i: string
    t?: string
    u?: string
    f?: string
    w?: unknown[]
    o?: unknown[]
    r?: string
    k?: Array<{id: string; type: string; fingerprint: string; comment?: string}>
    x?: Record<string, unknown>
  }>
  otpSecrets: PersistedState['otpSecrets']
}

export type PersistedPassmanagerState = {
  version: 1
  revision: number
  nextNodeId: number
  folders: string[]
  foldersMeta: Array<{path: string; iconRef?: string | null}>
  entries: Array<{nodeId: number; meta: Record<string, unknown>}>
  secrets: [string, string][]
  otpSecrets: [string, {secret: string; digits: number; period: number}][]
  icons: [
    string,
    {
      icon_ref: string
      mime_type: string
      content_base64: string
      width: number
      height: number
      bytes: number
      created_at: number
      updated_at: number
    },
  ][]
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function findNodeIdByPath(nodes: Map<number, MockNode>, path: string): number | undefined {
  let current = 0
  for (const part of splitPath(path)) {
    const node = nodes.get(current)
    if (!node) return undefined
    const next = node.children.find((id) => nodes.get(id)?.name === part)
    if (next === undefined) return undefined
    current = next
  }
  return current
}

export function buildPassmanagerBootstrap(state: PersistedState): MockPassmanagerBootstrapState {
  const nodes = new Map<number, MockNode>(state.nodes)
  const files = new Map<number, string>(state.files)
  const pmRootId = findNodeIdByPath(nodes, '/.passmanager')

  if (pmRootId === undefined) {
    return {
      version: 1,
      nextId: state.nextId,
      folders: [],
      entries: [],
      otpSecrets: state.otpSecrets ?? [],
    }
  }

  const folders: string[] = []
  const entries: MockPassmanagerBootstrapState['entries'] = []

  const readJsonFile = (nodeId: number): Record<string, unknown> | undefined => {
    const b64 = files.get(nodeId)
    if (!b64) return undefined
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  const walk = (dirId: number, groupPath: string) => {
    const dir = nodes.get(dirId)
    if (!dir) return

    for (const childId of dir.children) {
      const child = nodes.get(childId)
      if (!child || (child.type !== 0 && child.type !== 255)) continue
      if (child.name.startsWith('.')) continue

      const metaFileId = child.children.find((id) => {
        const node = nodes.get(id)
        return node?.type === 1 && node.name === 'meta.json'
      })

      if (metaFileId !== undefined) {
        const meta = readJsonFile(metaFileId)
        if (meta) {
          const {id, title, username, urls, otps, iconRef, sshKeys, groupPath: _groupPath, folderPath: _folderPath, ...rest} =
            meta
          entries.push({
            n: child.id,
            i: typeof id === 'string' ? id : child.name,
            t: typeof title === 'string' ? title : undefined,
            u: typeof username === 'string' ? username : undefined,
            f: groupPath || undefined,
            w: Array.isArray(urls) && urls.length > 0 ? urls : undefined,
            o: Array.isArray(otps) && otps.length > 0 ? otps : undefined,
            r: typeof iconRef === 'string' && iconRef.length > 0 ? iconRef : undefined,
            k: Array.isArray(sshKeys) && sshKeys.length > 0 ? sshKeys : undefined,
            x: Object.keys(rest).length > 0 ? rest : undefined,
          })
        }
        continue
      }

      const childPath = groupPath ? `${groupPath}/${child.name}` : child.name
      folders.push(childPath)
      walk(child.id, childPath)
    }
  }

  walk(pmRootId, '')

  return {
    version: 1,
    nextId: state.nextId,
    folders,
    entries,
    otpSecrets: state.otpSecrets ?? [],
  }
}

export function buildPersistedPassmanagerStateFromCatalog(state: PersistedState): PersistedPassmanagerState {
  const bootstrap = buildPassmanagerBootstrap(state)

  return {
    version: 1,
    revision: 1,
    nextNodeId: bootstrap.nextId,
    folders: [...bootstrap.folders],
    foldersMeta: [],
    entries: bootstrap.entries.map((entry) => {
      const {n, f, t, u, w, o, r, k, i, x} = entry
      const meta: Record<string, unknown> = {
        id: i,
      }
      if (t) meta['title'] = t
      if (u) meta['username'] = u
      if (f) meta['folderPath'] = f
      if (w) meta['urls'] = w
      if (o) meta['otps'] = o
      if (r) meta['iconRef'] = r
      if (k) meta['sshKeys'] = k
      if (x && typeof x === 'object') {
        Object.assign(meta, x)
      }

      return {nodeId: n, meta}
    }),
    secrets: [],
    otpSecrets: [...(bootstrap.otpSecrets ?? [])],
    icons: [],
  }
}

export async function readPersistedState(stateFile: string): Promise<PersistedState | undefined> {
  if (!existsSync(stateFile)) {
    return undefined
  }
  const raw = await readFile(stateFile, 'utf8')
  return JSON.parse(raw) as PersistedState
}

export async function readPersistedPassmanagerState(
  stateFile: string,
): Promise<PersistedPassmanagerState | undefined> {
  if (!existsSync(stateFile)) {
    return undefined
  }
  const raw = await readFile(stateFile, 'utf8')
  return JSON.parse(raw) as PersistedPassmanagerState
}

export async function readPersistedStateText(stateFile: string): Promise<string | undefined> {
  if (!existsSync(stateFile)) {
    return undefined
  }
  return await readFile(stateFile, 'utf8')
}

export async function writePersistedStateText(stateDir: string, stateFile: string, body: string): Promise<void> {
  await mkdir(stateDir, {recursive: true})
  await writeFile(stateFile, body)
}

export async function deletePersistedState(stateFile: string): Promise<void> {
  await rm(stateFile, {force: true})
}
