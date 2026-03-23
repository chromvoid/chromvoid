import type {SortOption} from 'root/shared/contracts/file-manager'
import type {VirtualFileListHandlerContext} from './types'
import type {SearchFilters} from 'root/shared/contracts/file-manager'

export const handleHeaderSort = (context: VirtualFileListHandlerContext, option: SortOption) => {
  const current = context.getFilters()
  const isSame = current.sortBy === option
  const nextDirection = isSame && current.sortDirection === 'asc' ? 'desc' : 'asc'
  const next: SearchFilters = {
    ...current,
    sortBy: option,
    sortDirection: isSame ? nextDirection : 'asc',
  }
  context.emitFiltersChange(next)
}
