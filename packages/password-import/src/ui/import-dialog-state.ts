import type {CatalogOperations} from '../mapper.js'
import type {ExistingEntryInfo} from '../types.js'

let catalogOps: CatalogOperations | null = null
let existingEntriesMap: Map<string, ExistingEntryInfo> | null = null

export function setImportCatalogOps(ops: CatalogOperations) {
  catalogOps = ops
}

export function getImportCatalogOps(): CatalogOperations | null {
  return catalogOps
}

export function setExistingEntriesMap(map: Map<string, ExistingEntryInfo>) {
  existingEntriesMap = map
}

export function getExistingEntriesMap(): Map<string, ExistingEntryInfo> | null {
  return existingEntriesMap
}
