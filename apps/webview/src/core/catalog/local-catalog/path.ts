export function normalizePath(path: string): string {
  path = path.replace(/\/+/g, '/')

  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }

  if (!path.startsWith('/')) {
    path = '/' + path
  }

  return path
}

export function splitPath(path: string): string[] {
  const normalized = normalizePath(path)
  if (normalized === '/') return []
  return normalized.slice(1).split('/').filter(Boolean)
}

export function joinPath(...components: string[]): string {
  if (components.length === 0) return '/'
  const filtered = components.filter(Boolean)
  if (filtered.length === 0) return '/'
  return normalizePath('/' + filtered.join('/'))
}
