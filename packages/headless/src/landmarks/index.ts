import {atom, computed, type Atom} from '@reatom/core'

export type LandmarkType =
  | 'banner'
  | 'main'
  | 'navigation'
  | 'complementary'
  | 'contentinfo'
  | 'search'
  | 'form'
  | 'region'

/** A plain value or a Reatom atom (signal) holding that value. */
export type MaybeAtom<T> = T | Atom<T>

export interface CreateLandmarkOptions {
  type: LandmarkType
  /** Accessible label – plain string or reactive atom. */
  label?: MaybeAtom<string>
  /** ID of the labelling element – plain string or reactive atom. */
  labelId?: MaybeAtom<string>
  idBase?: string
}

export interface LandmarkState {
  type: Atom<LandmarkType>
  label: Atom<string | null>
  labelId: Atom<string | null>
}

export interface LandmarkProps {
  role: LandmarkType
  'aria-label'?: string
  'aria-labelledby'?: string
}

export interface LandmarkContracts {
  getLandmarkProps(): LandmarkProps
}

export interface LandmarkModel {
  readonly state: LandmarkState
  readonly contracts: LandmarkContracts
}

export interface LandmarkDescriptor {
  type: LandmarkType
  label?: string
  labelId?: string
}

export interface LandmarkUniquenessIssue {
  type: LandmarkType
  key: string
  count: number
}

const uniquenessKey = (descriptor: LandmarkDescriptor) => descriptor.labelId ?? descriptor.label ?? ''

export const findLandmarkUniquenessIssues = (
  descriptors: readonly LandmarkDescriptor[],
): LandmarkUniquenessIssue[] => {
  const buckets = new Map<string, LandmarkUniquenessIssue>()

  for (const descriptor of descriptors) {
    const key = uniquenessKey(descriptor)
    const bucketKey = `${descriptor.type}::${key}`
    const existing = buckets.get(bucketKey)
    if (existing) {
      existing.count += 1
    } else {
      buckets.set(bucketKey, {
        type: descriptor.type,
        key,
        count: 1,
      })
    }
  }

  return [...buckets.values()].filter((issue) => issue.count > 1)
}

export const hasLandmarkUniquenessIssues = (descriptors: readonly LandmarkDescriptor[]) =>
  findLandmarkUniquenessIssues(descriptors).length > 0

function resolveAtom<T>(value: MaybeAtom<T> | undefined, fallback: T, name: string): Atom<T> {
  if (value == null) return atom<T>(fallback, name)
  if (typeof value === 'function') return value as Atom<T>
  return atom<T>(value as T, name)
}

export function createLandmark(options: CreateLandmarkOptions): LandmarkModel {
  const idBase = options.idBase ?? `landmark-${options.type}`

  const typeAtom = atom<LandmarkType>(options.type, `${idBase}.type`)
  const labelAtom = resolveAtom<string | null>(options.label, null, `${idBase}.label`)
  const labelIdAtom = resolveAtom<string | null>(options.labelId, null, `${idBase}.labelId`)
  const landmarkPropsAtom = computed(() => {
    const label = labelAtom()
    const labelId = labelIdAtom()

    return {
      role: typeAtom(),
      'aria-label': labelId == null ? (label ?? undefined) : undefined,
      'aria-labelledby': labelId ?? undefined,
    }
  }, `${idBase}.landmarkProps`)

  const state: LandmarkState = {
    type: typeAtom,
    label: labelAtom,
    labelId: labelIdAtom,
  }

  const contracts: LandmarkContracts = {
    getLandmarkProps() {
      return landmarkPropsAtom()
    },
  }

  return {
    state,
    contracts,
  }
}
