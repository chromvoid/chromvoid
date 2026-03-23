export const transformUrls = (urlString: string): string[] => {
  return [
    ...urlString
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ]
}
export const showUrls = (urls: string[]): string[] => {
  return urls.map(formatLink)
}

export function formatLink(link: string) {
  if (!link || link.trim().length === 0) {
    return ''
  }

  // Удаляем лишние символы и пробелы
  link = link.trim().replace(/\s+/g, '')

  // Если уже есть протокол, оставляем как есть
  if (link.match(/^https?:\/\//i)) {
    // Убираем лишний trailing slash, если это только домен
    if (link.match(/^https?:\/\/[^\/]+\/$/) && !link.match(/^https?:\/\/[^\/]+\/[^\/]/)) {
      return link.slice(0, -1)
    }
    return link
  }

  // Добавляем https:// если протокола нет
  link = 'https://' + link

  return link
}

export function truncateLink(link: string) {
  link = link.replace(/^(https?:\/\/)?/, '')

  // Удаляем www из ссылки
  link = link.replace(/^www\./i, '')

  // Находим индекс первого слеша после домена
  const domainIndex = link.indexOf('/')

  // Если слеш не найден, возвращаем всю ссылку
  if (domainIndex === -1) {
    return link
  }

  // Находим индекс последнего слеша перед доменом
  const lastSlashIndex = link.lastIndexOf('/', domainIndex - 1)

  // Если последний слеш не найден, возвращаем всю ссылку
  if (lastSlashIndex === -1) {
    return link
  }

  // Обрезаем ссылку до индекса последнего слеша перед доменом
  const truncatedLink = link.substr(lastSlashIndex + 1, domainIndex - lastSlashIndex - 1)

  return truncatedLink
}

export function isLink(str: string) {
  if (!str || str.trim().length === 0) {
    return false
  }

  // Убираем протокол для проверки
  let cleanUrl = str.trim().replace(/^https?:\/\//i, '')

  // Убираем trailing slash
  cleanUrl = cleanUrl.replace(/\/$/, '')

  // Более гибкий regex для доменов:
  // - Поддерживает www и без www
  // - Поддерживает различные TLD (.com, .org, .co.uk, .ru, etc.)
  // - Поддерживает поддомены
  // - Поддерживает пути после домена
  // - Поддерживает порты
  const domainRegex =
    /^(www\.)?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?[a-zA-Z]{2,}(:[0-9]{1,5})?(\/.*)?$/

  return domainRegex.test(cleanUrl)
}

// Реэкспорт утилиты нормализации временных меток из service/utils
export {normalizeTimestampMs} from './service/utils'
