export const CREDENTIAL_TAG_MAX_LENGTH = 32
export const CREDENTIAL_TAG_MAX_PER_ENTRY = 12
export const CREDENTIAL_TAG_COLOR_IDS = [
  'violet',
  'green',
  'blue',
  'pink',
  'amber',
  'orange',
  'cyan',
] as const
export const CREDENTIAL_TAG_DEFAULT_COLOR_ID = 'violet' satisfies CredentialTagColorId

export type CredentialTagLabel = string
export type CredentialTagKey = string
export type CredentialTagColorId = (typeof CREDENTIAL_TAG_COLOR_IDS)[number]
export type CredentialTagMeta = {
  colorId: CredentialTagColorId
}
export type CredentialTagCatalogMeta = Record<CredentialTagKey, CredentialTagMeta>

export type CredentialTagOption = {
  key: CredentialTagKey
  label: CredentialTagLabel
  colorId: CredentialTagColorId
  count: number
}

export type CredentialTagMutationEntry = {
  id: string
  tags: readonly string[]
}

export type CredentialTagRenamePlan =
  | {
      ok: true
      sourceKey: CredentialTagKey
      nextKey: CredentialTagKey
      nextLabel: CredentialTagLabel
      catalogTags: CredentialTagLabel[]
      affectedEntryIds: string[]
    }
  | {
      ok: false
      reason: 'invalid_source' | 'invalid_label' | 'target_exists'
    }

export type CredentialTagDeletePlan = {
  key: CredentialTagKey
  catalogTags: CredentialTagLabel[]
  affectedEntryIds: string[]
}

function isCredentialTagColorId(value: unknown): value is CredentialTagColorId {
  return (
    typeof value === 'string' &&
    (CREDENTIAL_TAG_COLOR_IDS as readonly string[]).includes(value)
  )
}

function readCredentialTagMetaColorId(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  return rec['colorId'] ?? rec['color_id']
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

export function normalizeCredentialTagColorId(value: unknown): CredentialTagColorId | undefined {
  return isCredentialTagColorId(value) ? value : undefined
}

export function fallbackCredentialTagColorId(keyOrLabel: string): CredentialTagColorId {
  const key = credentialTagKey(keyOrLabel)
  if (!key) return CREDENTIAL_TAG_DEFAULT_COLOR_ID

  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  }

  return CREDENTIAL_TAG_COLOR_IDS[hash % CREDENTIAL_TAG_COLOR_IDS.length] ?? CREDENTIAL_TAG_DEFAULT_COLOR_ID
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

export function normalizeCredentialTagCatalog(values: unknown): string[] {
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
  }

  return tags
}

export function normalizeCredentialTagCatalogMeta(
  value: unknown,
  catalogTags?: readonly string[],
): CredentialTagCatalogMeta {
  if (!value || typeof value !== 'object') return {}

  const allowedKeys =
    catalogTags === undefined
      ? undefined
      : new Set(normalizeCredentialTagCatalog(catalogTags).map(credentialTagKey))
  const meta: CredentialTagCatalogMeta = {}

  for (const [rawKey, rawMeta] of Object.entries(value as Record<string, unknown>)) {
    const key = credentialTagKey(rawKey)
    if (!key || (allowedKeys && !allowedKeys.has(key))) continue

    const colorId = normalizeCredentialTagColorId(readCredentialTagMetaColorId(rawMeta))
    if (!colorId) continue
    meta[key] = {colorId}
  }

  return meta
}

export function pruneCredentialTagCatalogMeta(
  meta: unknown,
  catalogTags: readonly string[],
): CredentialTagCatalogMeta {
  return normalizeCredentialTagCatalogMeta(meta, catalogTags)
}

export function buildCredentialTagOptions(
  entries: readonly {tags: readonly string[]}[],
  catalogTags: readonly string[] = [],
  catalogMeta: CredentialTagCatalogMeta = {},
): CredentialTagOption[] {
  const options = new Map<CredentialTagKey, CredentialTagOption>()
  const meta = normalizeCredentialTagCatalogMeta(catalogMeta)

  for (const label of normalizeCredentialTagCatalog(catalogTags)) {
    const key = credentialTagKey(label)
    if (!key || options.has(key)) continue
    options.set(key, {key, label, colorId: meta[key]?.colorId ?? fallbackCredentialTagColorId(key), count: 0})
  }

  for (const entry of entries) {
    for (const label of normalizeCredentialTags(entry.tags)) {
      const key = credentialTagKey(label)
      const current = options.get(key)
      if (current) {
        current.count += 1
      } else {
        options.set(key, {key, label, colorId: meta[key]?.colorId ?? fallbackCredentialTagColorId(key), count: 1})
      }
    }
  }

  return Array.from(options.values()).sort((left, right) => {
    const byCount = right.count - left.count
    if (byCount !== 0) return byCount
    return left.label.localeCompare(right.label)
  })
}

export function hasCredentialTagKey(tags: readonly string[], tagKey: string): boolean {
  const key = credentialTagKey(tagKey)
  if (!key) return false
  return normalizeCredentialTagCatalog(tags).some((tag) => credentialTagKey(tag) === key)
}

export function replaceCredentialTagLabel(
  tags: readonly string[],
  sourceKey: string,
  nextLabel: string,
): string[] {
  const normalizedSourceKey = credentialTagKey(sourceKey)
  const normalizedNextLabel = normalizeCredentialTagLabel(nextLabel)
  if (!normalizedSourceKey || !normalizedNextLabel) {
    return normalizeCredentialTags(tags)
  }

  return normalizeCredentialTags(
    tags.map((tag) => (credentialTagKey(tag) === normalizedSourceKey ? normalizedNextLabel : tag)),
  )
}

export function removeCredentialTagLabel(tags: readonly string[], tagKey: string): string[] {
  const normalizedKey = credentialTagKey(tagKey)
  if (!normalizedKey) return normalizeCredentialTags(tags)
  return normalizeCredentialTags(tags.filter((tag) => credentialTagKey(tag) !== normalizedKey))
}

export function planCredentialTagRename(
  catalogTags: readonly string[],
  entries: readonly CredentialTagMutationEntry[],
  sourceKey: string,
  nextLabel: unknown,
): CredentialTagRenamePlan {
  const normalizedSourceKey = credentialTagKey(sourceKey)
  if (!normalizedSourceKey) {
    return {ok: false, reason: 'invalid_source'}
  }

  const normalizedNextLabel = normalizeCredentialTagLabel(nextLabel)
  if (!normalizedNextLabel) {
    return {ok: false, reason: 'invalid_label'}
  }

  const nextKey = credentialTagKey(normalizedNextLabel)
  const normalizedCatalog = normalizeCredentialTagCatalog(catalogTags)
  if (
    nextKey !== normalizedSourceKey &&
    (hasCredentialTagKey(normalizedCatalog, nextKey) ||
      entries.some((entry) => entryHasCredentialTag(entry.tags, nextKey)))
  ) {
    return {ok: false, reason: 'target_exists'}
  }

  const affectedEntryIds = entries
    .filter((entry) => entryHasCredentialTag(entry.tags, normalizedSourceKey))
    .map((entry) => entry.id)

  const catalogHasSource = hasCredentialTagKey(normalizedCatalog, normalizedSourceKey)
  const catalogTagsNext = catalogHasSource
    ? normalizedCatalog.map((tag) =>
        credentialTagKey(tag) === normalizedSourceKey ? normalizedNextLabel : tag,
      )
    : [...normalizedCatalog, normalizedNextLabel]

  return {
    ok: true,
    sourceKey: normalizedSourceKey,
    nextKey,
    nextLabel: normalizedNextLabel,
    catalogTags: normalizeCredentialTagCatalog(catalogTagsNext),
    affectedEntryIds,
  }
}

export function planCredentialTagDelete(
  catalogTags: readonly string[],
  entries: readonly CredentialTagMutationEntry[],
  tagKey: string,
): CredentialTagDeletePlan {
  const key = credentialTagKey(tagKey)
  const affectedEntryIds = key
    ? entries.filter((entry) => entryHasCredentialTag(entry.tags, key)).map((entry) => entry.id)
    : []
  const catalogTagsNext = key
    ? normalizeCredentialTagCatalog(catalogTags).filter((tag) => credentialTagKey(tag) !== key)
    : normalizeCredentialTagCatalog(catalogTags)

  return {
    key,
    catalogTags: catalogTagsNext,
    affectedEntryIds,
  }
}

export function renameCredentialTagCatalogMeta(
  meta: unknown,
  catalogTags: readonly string[],
  sourceKey: string,
  nextKey: string,
  colorId?: CredentialTagColorId,
): CredentialTagCatalogMeta {
  const next = normalizeCredentialTagCatalogMeta(meta)
  const normalizedSourceKey = credentialTagKey(sourceKey)
  const normalizedNextKey = credentialTagKey(nextKey)
  if (!normalizedNextKey) return pruneCredentialTagCatalogMeta(next, catalogTags)

  const nextColorId =
    colorId ??
    (normalizedSourceKey ? next[normalizedSourceKey]?.colorId : undefined) ??
    next[normalizedNextKey]?.colorId
  if (normalizedSourceKey && normalizedSourceKey !== normalizedNextKey) {
    delete next[normalizedSourceKey]
  }
  if (nextColorId) {
    next[normalizedNextKey] = {colorId: nextColorId}
  }
  return pruneCredentialTagCatalogMeta(next, catalogTags)
}

export function removeCredentialTagCatalogMeta(
  meta: unknown,
  catalogTags: readonly string[],
  tagKey: string,
): CredentialTagCatalogMeta {
  const next = normalizeCredentialTagCatalogMeta(meta)
  const key = credentialTagKey(tagKey)
  if (key) delete next[key]
  return pruneCredentialTagCatalogMeta(next, catalogTags)
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
