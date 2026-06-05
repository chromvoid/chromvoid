import {atom} from '@reatom/core'

import type {Entry} from './entry'
import {
  buildCredentialTagOptions,
  entryHasCredentialTag,
  pruneCredentialTagKeys,
  type CredentialTagKey,
} from './tags'

export const filterValue = atom('', 'filter_value')

export type QuickFilter = 'recent' | 'otp' | 'nopass' | 'files' | 'favorites' | 'ssh' | 'card'
export const quickFilters = atom<QuickFilter[]>([], 'quick_filters')
export const selectedCredentialTagFilters = atom<CredentialTagKey[]>([], 'credential_tag_filters')

type EntrySearchCache = {
  title: string
  username: string
  urlsSignature: string
  tagsSignature: string
  titleLower: string
  usernameLower: string
  urlsLower: string
  tagsLower: string
  hasSearchableText: boolean
}

const entrySearchCache = new WeakMap<Entry, EntrySearchCache>()

function getEntrySearchCache(entry: Entry): EntrySearchCache {
  const rawTitle = typeof entry.title === 'string' ? entry.title : ''
  const rawUsername = typeof entry.username === 'string' ? entry.username : ''
  const hasTitleMetadata = typeof entry.title === 'string'
  const hasUsernameMetadata = typeof entry.username === 'string'
  const urls = entry.urls
  const urlsSignature = urls.map((rule) => `${rule.match}:${rule.value}`).join('\n')
  const tags = entry.tags
  const tagsSignature = tags.join('\n')
  const cached = entrySearchCache.get(entry)

  if (
    cached &&
    cached.title === rawTitle &&
    cached.username === rawUsername &&
    cached.urlsSignature === urlsSignature &&
    cached.tagsSignature === tagsSignature
  ) {
    return cached
  }

  const urlsText = urls.map((rule) => rule.value).join('\n')
  const tagsText = tags.join('\n')
  const next = {
    title: rawTitle,
    username: rawUsername,
    urlsSignature,
    tagsSignature,
    titleLower: rawTitle.toLowerCase(),
    usernameLower: rawUsername.toLowerCase(),
    urlsLower: urlsText.toLowerCase(),
    tagsLower: tagsText.toLowerCase(),
    hasSearchableText:
      hasTitleMetadata || hasUsernameMetadata || urlsText.length > 0 || tagsText.length > 0,
  } satisfies EntrySearchCache

  entrySearchCache.set(entry, next)
  return next
}

export function createGroupFilterMatcher(filter: string): (group: {name: string; description?: string}) => boolean {
  const search = filter.toLowerCase()
  if (!search) {
    return () => true
  }

  return (group) => {
    const name = typeof group.name === 'string' ? group.name : ''
    const description = typeof group.description === 'string' ? group.description : ''

    return name.toLowerCase().includes(search) || description.toLowerCase().includes(search)
  }
}

export function createEntryFilterMatcher(
  filter: string,
  activeFilters: ReadonlyArray<QuickFilter> = quickFilters(),
  nowMs = Date.now(),
  selectedTags: ReadonlyArray<CredentialTagKey> = selectedCredentialTagFilters(),
) {
  const search = filter.toLowerCase()
  const hasSearch = search.length > 0
  const hasRecentFilter = activeFilters.includes('recent')
  const hasOtpFilter = activeFilters.includes('otp')
  const hasSshFilter = activeFilters.includes('ssh')
  const hasCardFilter = activeFilters.includes('card')
  const recentThreshold = nowMs - 14 * 24 * 60 * 60 * 1000

  return (entry: Entry): boolean => {
    if (hasRecentFilter && entry.updatedTs < recentThreshold) {
      return false
    }

    if (hasOtpFilter && (entry.entryType === 'payment_card' || entry.otps().length === 0)) {
      return false
    }

    if (hasSshFilter && (entry.entryType === 'payment_card' || entry.sshKeys.length === 0)) {
      return false
    }

    if (hasCardFilter && entry.entryType !== 'payment_card') {
      return false
    }

    if (selectedTags.some((tagKey) => !entryHasCredentialTag(entry.tags, tagKey))) {
      return false
    }

    const cached = getEntrySearchCache(entry)
    if (!hasSearch) {
      return cached.hasSearchableText
    }

    return (
      cached.titleLower.includes(search) ||
      cached.usernameLower.includes(search) ||
      cached.urlsLower.includes(search) ||
      cached.tagsLower.includes(search)
    )
  }
}

export const filterRule = (entry: Entry, filterValue: string) => {
  return createEntryFilterMatcher(filterValue)(entry)
}

export function getEffectiveSelectedCredentialTagFilters(
  entries: readonly Entry[] | undefined | null,
  catalogTags: readonly string[] = [],
): CredentialTagKey[] {
  return pruneCredentialTagKeys(selectedCredentialTagFilters(), buildCredentialTagOptions(entries ?? [], catalogTags))
}
