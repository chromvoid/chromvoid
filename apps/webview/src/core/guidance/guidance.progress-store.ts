import type {GuidanceProgress, GuidanceProgressState} from './guidance.types'

export const GUIDANCE_PROGRESS_STORAGE_KEY = 'chromvoid.guidance.progress.v1'

export interface GuidanceProgressStore {
  load(): GuidanceProgress[]
  save(progress: readonly GuidanceProgress[]): void
  clear(): void
}

const PROGRESS_STATES = new Set<GuidanceProgressState>([
  'seen',
  'dismissed',
  'snoozed',
  'completed',
])

function isProgressRecord(value: unknown): value is GuidanceProgress {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<GuidanceProgress>
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.version === 'number' &&
    Number.isFinite(record.version) &&
    typeof record.state === 'string' &&
    PROGRESS_STATES.has(record.state as GuidanceProgressState)
  )
}

function getStorage(): Storage | null {
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

export const localGuidanceProgressStore: GuidanceProgressStore = {
  load(): GuidanceProgress[] {
    const storage = getStorage()
    if (!storage) return []

    const raw = storage.getItem(GUIDANCE_PROGRESS_STORAGE_KEY)
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isProgressRecord)
    } catch {
      return []
    }
  },

  save(progress: readonly GuidanceProgress[]): void {
    const storage = getStorage()
    if (!storage) return
    storage.setItem(GUIDANCE_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  },

  clear(): void {
    const storage = getStorage()
    if (!storage) return
    storage.removeItem(GUIDANCE_PROGRESS_STORAGE_KEY)
  },
}
