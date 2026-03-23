import type {FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'

export class CatalogUIService {
  filterAndSort(items: FileListItem[], filters: SearchFilters): FileListItem[] {
    // Фильтруем элементы без name или path (защита от некорректных данных)
    let filtered = items.filter((item) => item.name != null && item.path != null)

    if (filters.query) {
      const query = filters.query.toLowerCase()
      filtered = filtered.filter(
        (item) => item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query),
      )
    }

    if (filters.fileTypes.length > 0) {
      const allowed = new Set(this.getFileTypeExtensions(filters.fileTypes))
      filtered = filtered.filter((item) =>
        item.isDir ? true : allowed.has(this.getFileExtension(item.name)),
      )
    }

    if (!filters.showHidden) {
      filtered = filtered.filter((item) => item.isDir || !item.name.startsWith('.'))
    }

    const mult = filters.sortDirection === 'asc' ? 1 : -1
    filtered.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      switch (filters.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name) * mult
        case 'size':
          return ((a.size || 0) - (b.size || 0)) * mult
        case 'date':
          return ((a.lastModified || 0) - (b.lastModified || 0)) * mult
        case 'type':
          return this.getFileExtension(a.name).localeCompare(this.getFileExtension(b.name)) * mult
        default:
          return 0
      }
    })

    return filtered
  }

  private getFileTypeExtensions(types: string[]): string[] {
    const typeMap: Record<string, string[]> = {
      images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      documents: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
      videos: ['mp4', 'avi', 'mkv', 'mov', 'wmv'],
      audio: ['mp3', 'wav', 'flac', 'aac'],
      archives: ['zip', 'rar', '7z', 'tar', 'gz'],
      code: ['js', 'ts', 'html', 'css', 'py', 'java', 'cpp'],
    }
    return types.flatMap((t) => typeMap[t] || [])
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.')
    return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : ''
  }
}
