export const formatTemp = (value?: number) => {
  if (!value) {
    return '?'
  }
  return `${(value / 1000).toFixed(1)}°C`
}

export const formatTime = (value?: number) => {
  if (!value) {
    return '-'
  }
  return new Date(value * 1000).toLocaleString()
}

export function formatBytesMB(megabytes: number, decimals = 2): string {
  const bytes = (megabytes || 0) * 1e6
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}
