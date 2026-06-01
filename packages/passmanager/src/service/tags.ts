export const CREDENTIAL_TAG_MAX_LENGTH = 32
export const CREDENTIAL_TAG_MAX_PER_ENTRY = 12

export type CredentialTagLabel = string
export type CredentialTagKey = string

export type CredentialTagOption = {
  key: CredentialTagKey
  label: CredentialTagLabel
  count: number
}

function normalizeTagText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^#+/u, '')
    .trim()
    .replace(/\s+/gu, ' ')
}

export function normalizeCredentialTagLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const label = normalizeTagText(value)
  if (!label) return undefined
  if ([...label].length > CREDENTIAL_TAG_MAX_LENGTH) return undefined

  return label
}

export function credentialTagKey(label: string): CredentialTagKey {
  const normalized = normalizeCredentialTagLabel(label) ?? ''
  return normalized.toLowerCase().replace(/\s+/gu, '-')
}

export function normalizeCredentialTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<CredentialTagKey>()
  const tags: string[] = []

  for (const value of values) {
    const label = normalizeCredentialTagLabel(value)
    if (!label) continue

    const key = credentialTagKey(label)
    if (!key || seen.has(key)) continue

    seen.add(key)
    tags.push(label)

    if (tags.length >= CREDENTIAL_TAG_MAX_PER_ENTRY) break
  }

  return tags
}

export function buildCredentialTagOptions(
  entries: readonly {tags: readonly string[]}[],
): CredentialTagOption[] {
  const options = new Map<CredentialTagKey, CredentialTagOption>()

  for (const entry of entries) {
    for (const label of normalizeCredentialTags(entry.tags)) {
      const key = credentialTagKey(label)
      const current = options.get(key)
      if (current) {
        current.count += 1
      } else {
        options.set(key, {key, label, count: 1})
      }
    }
  }

  return Array.from(options.values()).sort((left, right) => {
    const byCount = right.count - left.count
    if (byCount !== 0) return byCount
    return left.label.localeCompare(right.label)
  })
}

export function pruneCredentialTagKeys(
  keys: readonly string[],
  options: readonly CredentialTagOption[],
): CredentialTagKey[] {
  const available = new Set(options.map((option) => option.key))
  const seen = new Set<CredentialTagKey>()
  const pruned: CredentialTagKey[] = []

  for (const value of keys) {
    const key = credentialTagKey(value)
    if (!key || !available.has(key) || seen.has(key)) continue
    seen.add(key)
    pruned.push(key)
  }

  return pruned
}

export function entryHasCredentialTag(
  entryTags: readonly string[],
  tagKey: CredentialTagKey,
): boolean {
  const key = credentialTagKey(tagKey)
  if (!key) return false
  return normalizeCredentialTags(entryTags).some((label) => credentialTagKey(label) === key)
}
