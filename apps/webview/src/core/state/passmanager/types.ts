import type {CatalogService} from '../../catalog/catalog'

export type ClientCatalogNodeLike = {
  nodeId: number
  name: string
  isDir: boolean
  isFile: boolean
  path: string
  modtime: number
}



/**Minimum Catalog Service contract required by passmanager modules
* Allows you not to depend on the full Catalog Service directly.
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

