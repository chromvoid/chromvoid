import type {SortOption} from 'root/shared/contracts/file-manager'
import type {VirtualFileListHandlerContext} from './types'

export const handleHeaderSort = (context: VirtualFileListHandlerContext, option: SortOption) => {
  context.applyTableSort(option)
}
