import type {CatalogService} from '../../catalog/catalog'

export type ClientCatalogNodeLike = {
  nodeId: number
  name: string
  isDir: boolean
  isFile: boolean
  path: string
  modtime: number
}



/**
 * Минимальный контракт CatalogService, необходимый модулям passmanager.
 * Позволяет не зависеть от полного CatalogService напрямую.
 */
export type CatalogDeps = Pick<
  CatalogService,
  | 'api'
  | 'transport'
  | 'catalog'
  | 'lastError'
  | 'queueRefresh'
  | 'refresh'
  | 'refreshSilent'
>

