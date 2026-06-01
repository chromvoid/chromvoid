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

  // Remove unnecessary symbols and spaces
  link = link.trim().replace(/\s+/g, '')

  // If you already have a protocol, leave it as it is.
  if (link.match(/^https?:\/\//i)) {
    // Remove the extra trailing slash, if it is only a domain
    if (link.match(/^https?:\/\/[^\/]+\/$/) && !link.match(/^https?:\/\/[^\/]+\/[^\/]/)) {
      return link.slice(0, -1)
    }
    return link
  }

  // Add https:// if there is no protocol
  link = 'https://' + link

  return link
}

export function truncateLink(link: string) {
  link = link.replace(/^(https?:\/\/)?/, '')

  // Remove www from the link
  link = link.replace(/^www\./i, '')

  // Find the index of the first slash after the domain
  const domainIndex = link.indexOf('/')

  // If the slash is not found, return the entire link
  if (domainIndex === -1) {
    return link
  }

  // Find the index of the last slash before the domain
  const lastSlashIndex = link.lastIndexOf('/', domainIndex - 1)

  // If the last slash is not found, return the entire link
  if (lastSlashIndex === -1) {
    return link
  }

  // Cut the link to the index of the last slash before the domain
  const truncatedLink = link.substr(lastSlashIndex + 1, domainIndex - lastSlashIndex - 1)

  return truncatedLink
}

export function isLink(str: string) {
  if (!str || str.trim().length === 0) {
    return false
  }

  // Remove the protocol for verification
  let cleanUrl = str.trim().replace(/^https?:\/\//i, '')

  // Removing trailing slash
  cleanUrl = cleanUrl.replace(/\/$/, '')

  // More flexible regex for domains:
  // Supports www and without www
  // Supports various TLDs (.com, .org, .co.uk, .ru, etc.)
  // - Supports subdomains.
  // - Supports paths after domain
  // - Supports ports.
  const domainRegex =
    /^(www\.)?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?[a-zA-Z]{2,}(:[0-9]{1,5})?(\/.*)?$/

  return domainRegex.test(cleanUrl)
}

// Re-export utilities of normalization of time tags from password-utils
export {normalizeTimestampMs} from './password-utils'
