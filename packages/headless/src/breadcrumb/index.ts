import {atom, computed, type Atom, type Computed} from '@reatom/core'

export interface BreadcrumbItem {
  id: string
  label: string
  href: string
  isCurrent?: boolean
}

export interface BreadcrumbItemState extends BreadcrumbItem {
  isCurrent: boolean
}

export interface CreateBreadcrumbOptions {
  items: readonly BreadcrumbItem[]
  idBase?: string
  ariaLabel?: string
  ariaLabelledBy?: string
}

export interface BreadcrumbState {
  items: Atom<BreadcrumbItemState[]>
  currentId: Computed<string | null>
}

export interface BreadcrumbRootProps {
  role: 'navigation'
  'aria-label'?: string
  'aria-labelledby'?: string
}

export interface BreadcrumbListProps {
  role?: undefined
}

export interface BreadcrumbItemProps {
  id: string
  role?: undefined
  'data-current': 'true' | 'false'
}

export interface BreadcrumbLinkProps {
  id: string
  role: 'link'
  href: string
  'aria-current'?: 'page'
}

export interface BreadcrumbSeparatorProps {
  'aria-hidden': 'true'
}

export interface BreadcrumbContracts {
  getRootProps(): BreadcrumbRootProps
  getListProps(): BreadcrumbListProps
  getItemProps(id: string): BreadcrumbItemProps
  getLinkProps(id: string): BreadcrumbLinkProps
  getSeparatorProps(id: string): BreadcrumbSeparatorProps
}

export interface BreadcrumbModel {
  readonly state: BreadcrumbState
  readonly contracts: BreadcrumbContracts
}

export const normalizeBreadcrumbItems = (items: readonly BreadcrumbItem[]): BreadcrumbItemState[] => {
  if (items.length === 0) return []

  let currentIndex = -1
  items.forEach((item, index) => {
    if (item.isCurrent) {
      currentIndex = index
    }
  })

  if (currentIndex < 0) {
    currentIndex = items.length - 1
  }

  return items.map((item, index) => ({
    ...item,
    isCurrent: index === currentIndex,
  }))
}

export function createBreadcrumb(options: CreateBreadcrumbOptions): BreadcrumbModel {
  const idBase = options.idBase ?? 'breadcrumb'
  const itemsAtom = atom<BreadcrumbItemState[]>(normalizeBreadcrumbItems(options.items), `${idBase}.items`)
  const currentIdAtom = computed(
    () => itemsAtom().find((item) => item.isCurrent)?.id ?? null,
    `${idBase}.currentId`,
  )

  const itemDomId = (id: string) => `${idBase}-item-${id}`
  const linkDomId = (id: string) => `${idBase}-link-${id}`

  const contracts: BreadcrumbContracts = {
    getRootProps() {
      return {
        role: 'navigation',
        'aria-label': options.ariaLabel ?? (options.ariaLabelledBy == null ? 'Breadcrumb' : undefined),
        'aria-labelledby': options.ariaLabelledBy,
      }
    },
    getListProps() {
      return {}
    },
    getItemProps(id: string) {
      const item = itemsAtom().find((candidate) => candidate.id === id)
      if (!item) {
        throw new Error(`Unknown breadcrumb item id: ${id}`)
      }

      return {
        id: itemDomId(id),
        role: undefined,
        'data-current': item.isCurrent ? 'true' : 'false',
      }
    },
    getLinkProps(id: string) {
      const item = itemsAtom().find((candidate) => candidate.id === id)
      if (!item) {
        throw new Error(`Unknown breadcrumb item id for link: ${id}`)
      }

      return {
        id: linkDomId(id),
        role: 'link',
        href: item.href,
        'aria-current': item.isCurrent ? 'page' : undefined,
      }
    },
    getSeparatorProps(id: string) {
      const item = itemsAtom().find((candidate) => candidate.id === id)
      if (!item) {
        throw new Error(`Unknown breadcrumb item id for separator: ${id}`)
      }

      return {
        'aria-hidden': 'true',
      }
    },
  }

  const state: BreadcrumbState = {
    items: itemsAtom,
    currentId: currentIdAtom,
  }

  return {
    state,
    contracts,
  }
}
