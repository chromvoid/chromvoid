import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

// ── Types ──

export interface FeedArticle {
  id: string
  disabled?: boolean
}

export interface FeedKeyboardEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
}

export type FeedKeyboardResult = 'next' | 'prev' | 'exit-after' | 'exit-before' | null

export interface CreateFeedOptions {
  articles: readonly FeedArticle[]
  idBase?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  initialActiveArticleId?: string | null
  totalCount?: number
  onLoadMore?: () => readonly FeedArticle[] | Promise<readonly FeedArticle[]>
  onLoadNewer?: () => readonly FeedArticle[] | Promise<readonly FeedArticle[]>
}

export interface FeedState {
  articleIds: Computed<string[]>
  activeArticleId: Atom<string | null>
  isLoading: Atom<boolean>
  isBusy: Atom<boolean>
  totalCount: Atom<number>
  isEmpty: Computed<boolean>
  hasError: Computed<boolean>
  error: Atom<string | null>
  canLoadMore: Computed<boolean>
  canLoadNewer: Computed<boolean>
}

export interface FeedActions {
  focusNextArticle(): void
  focusPrevArticle(): void
  loadMore(): Promise<void>
  loadNewer(): Promise<void>
  setArticles(articles: FeedArticle[]): void
  appendArticles(articles: FeedArticle[]): void
  prependArticles(articles: FeedArticle[]): void
  removeArticle(articleId: string): void
  setBusy(value: boolean): void
  setError(message: string): void
  clearError(): void
  setTotalCount(count: number): void
  handleKeyDown(event: FeedKeyboardEventLike): FeedKeyboardResult
}

export interface FeedProps {
  id: string
  role: 'feed'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-busy': 'true' | 'false'
}

export interface FeedArticleProps {
  id: string
  role: 'article'
  tabindex: '0' | '-1'
  'aria-posinset': number
  'aria-setsize': number
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  onFocus: () => void
}

export interface FeedContracts {
  getFeedProps(): FeedProps
  getArticleProps(articleId: string): FeedArticleProps
}

export interface FeedModel {
  readonly state: FeedState
  readonly actions: FeedActions
  readonly contracts: FeedContracts
}

// ── Helpers ──

const dedupe = (articles: readonly FeedArticle[]): FeedArticle[] => {
  const seen = new Set<string>()
  const result: FeedArticle[] = []
  for (const a of articles) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    result.push(a)
  }
  return result
}

// ── createFeed ──

export function createFeed(options: CreateFeedOptions): FeedModel {
  const idBase = options.idBase ?? 'feed'

  // -- Atoms --

  const articlesAtom = atom<FeedArticle[]>(dedupe(options.articles), `${idBase}.articles`)

  const articleIdsAtom = computed(
    () => articlesAtom().map((a) => a.id),
    `${idBase}.articleIds`,
  )

  const articleByIdAtom = computed(
    () => new Map(articlesAtom().map((a, i) => [a.id, {article: a, index: i}])),
    `${idBase}.articleById`,
  )

  const enabledIdsAtom = computed(
    () => articlesAtom().filter((a) => !a.disabled).map((a) => a.id),
    `${idBase}.enabledIds`,
  )

  const isLoadingAtom = atom(false, `${idBase}.isLoading`)
  const isBusyAtom = atom(false, `${idBase}.isBusy`)
  const totalCountAtom = atom(options.totalCount ?? -1, `${idBase}.totalCount`)
  const errorAtom = atom<string | null>(null, `${idBase}.error`)

  const isEmptyAtom = computed(() => articleIdsAtom().length === 0, `${idBase}.isEmpty`)
  const hasErrorAtom = computed(() => errorAtom() !== null, `${idBase}.hasError`)

  const canLoadMoreAtom = computed(
    () => options.onLoadMore != null && !isLoadingAtom(),
    `${idBase}.canLoadMore`,
  )

  const canLoadNewerAtom = computed(
    () => options.onLoadNewer != null && !isLoadingAtom(),
    `${idBase}.canLoadNewer`,
  )

  // -- Active article resolution --

  const resolveInitialActive = (): string | null => {
    const initial = options.initialActiveArticleId
    if (initial != null) {
      const info = articleByIdAtom().get(initial)
      if (info && !info.article.disabled) return initial
    }
    return enabledIdsAtom()[0] ?? null
  }

  const activeArticleIdAtom = atom<string | null>(resolveInitialActive(), `${idBase}.activeArticleId`)

  const ensureActiveInvariant = () => {
    const active = activeArticleIdAtom()
    const enabled = enabledIdsAtom()

    if (enabled.length === 0) {
      activeArticleIdAtom.set(null)
      return
    }

    if (active != null && enabled.includes(active)) return

    activeArticleIdAtom.set(enabled[0] ?? null)
  }

  // -- Navigation --

  const moveBy = (direction: 1 | -1) => {
    const enabled = enabledIdsAtom()
    if (enabled.length === 0) {
      activeArticleIdAtom.set(null)
      return
    }

    const active = activeArticleIdAtom()
    if (active == null) {
      activeArticleIdAtom.set(enabled[0] ?? null)
      return
    }

    const idx = enabled.indexOf(active)
    if (idx < 0) {
      activeArticleIdAtom.set(enabled[0] ?? null)
      return
    }

    const next = Math.min(Math.max(idx + direction, 0), enabled.length - 1)
    activeArticleIdAtom.set(enabled[next] ?? null)
  }

  const focusNextArticle = action(() => {
    moveBy(1)
  }, `${idBase}.focusNextArticle`)

  const focusPrevArticle = action(() => {
    moveBy(-1)
  }, `${idBase}.focusPrevArticle`)

  // -- Article mutations --

  const setArticles = action((articles: FeedArticle[]) => {
    articlesAtom.set(dedupe(articles))
    ensureActiveInvariant()
  }, `${idBase}.setArticles`)

  const appendArticles = action((articles: FeedArticle[]) => {
    articlesAtom.set(dedupe([...articlesAtom(), ...articles]))
  }, `${idBase}.appendArticles`)

  const prependArticles = action((articles: FeedArticle[]) => {
    articlesAtom.set(dedupe([...articles, ...articlesAtom()]))
  }, `${idBase}.prependArticles`)

  const removeArticle = action((articleId: string) => {
    const current = articlesAtom()
    const idx = current.findIndex((a) => a.id === articleId)
    if (idx < 0) return

    const wasActive = activeArticleIdAtom() === articleId
    const next = current.filter((a) => a.id !== articleId)
    articlesAtom.set(next)

    if (wasActive) {
      const enabled = enabledIdsAtom()
      if (enabled.length === 0) {
        activeArticleIdAtom.set(null)
        return
      }

      // Find nearest enabled: try items at and after the removed index, then before
      const allIds = articleIdsAtom()
      // prefer next (articles that were after the removed one)
      let found: string | null = null
      for (let i = idx; i < allIds.length; i++) {
        if (enabled.includes(allIds[i]!)) {
          found = allIds[i]!
          break
        }
      }
      if (found == null) {
        // fallback to prev
        for (let i = Math.min(idx - 1, allIds.length - 1); i >= 0; i--) {
          if (enabled.includes(allIds[i]!)) {
            found = allIds[i]!
            break
          }
        }
      }
      activeArticleIdAtom.set(found ?? enabled[0] ?? null)
    }
  }, `${idBase}.removeArticle`)

  // -- State actions --

  const setBusy = action((value: boolean) => {
    isBusyAtom.set(value)
  }, `${idBase}.setBusy`)

  const setError = action((message: string) => {
    errorAtom.set(message)
  }, `${idBase}.setError`)

  const clearError = action(() => {
    errorAtom.set(null)
  }, `${idBase}.clearError`)

  const setTotalCount = action((count: number) => {
    totalCountAtom.set(count)
  }, `${idBase}.setTotalCount`)

  // -- Load operations --

  const loadMore = action(async () => {
    if (!options.onLoadMore) return
    if (isLoadingAtom()) return

    isLoadingAtom.set(true)
    isBusyAtom.set(true)

    try {
      const loaded = await options.onLoadMore()
      articlesAtom.set(dedupe([...articlesAtom(), ...loaded]))
      ensureActiveInvariant()
    } catch (e) {
      errorAtom.set(e instanceof Error ? e.message : String(e))
    } finally {
      isLoadingAtom.set(false)
      isBusyAtom.set(false)
    }
  }, `${idBase}.loadMore`)

  const loadNewer = action(async () => {
    if (!options.onLoadNewer) return
    if (isLoadingAtom()) return

    isLoadingAtom.set(true)
    isBusyAtom.set(true)

    try {
      const loaded = await options.onLoadNewer()
      articlesAtom.set(dedupe([...loaded, ...articlesAtom()]))
      ensureActiveInvariant()
    } catch (e) {
      errorAtom.set(e instanceof Error ? e.message : String(e))
    } finally {
      isLoadingAtom.set(false)
      isBusyAtom.set(false)
    }
  }, `${idBase}.loadNewer`)

  // -- Keyboard --

  const handleKeyDown = action((event: FeedKeyboardEventLike): FeedKeyboardResult => {
    const ctrlOrMeta = event.ctrlKey === true || event.metaKey === true

    if (event.key === 'PageDown') {
      focusNextArticle()
      return 'next'
    }

    if (event.key === 'PageUp') {
      focusPrevArticle()
      return 'prev'
    }

    if (event.key === 'End' && ctrlOrMeta) {
      return 'exit-after'
    }

    if (event.key === 'Home' && ctrlOrMeta) {
      return 'exit-before'
    }

    return null
  }, `${idBase}.handleKeyDown`)

  // -- Contracts --

  const setActiveArticle = action((articleId: string) => {
    const info = articleByIdAtom().get(articleId)
    if (!info || info.article.disabled) return
    activeArticleIdAtom.set(articleId)
  }, `${idBase}.setActiveArticle`)

  const contracts: FeedContracts = {
    getFeedProps() {
      const props: FeedProps = {
        id: `${idBase}-root`,
        role: 'feed',
        'aria-busy': isBusyAtom() ? 'true' : 'false',
      }
      if (options.ariaLabel != null) props['aria-label'] = options.ariaLabel
      if (options.ariaLabelledBy != null) props['aria-labelledby'] = options.ariaLabelledBy
      return props
    },

    getArticleProps(articleId: string) {
      const info = articleByIdAtom().get(articleId)
      if (!info) {
        throw new Error(`Unknown feed article id: ${articleId}`)
      }

      const total = totalCountAtom()
      const setSize = total >= 0 ? total : -1
      const posInSet = info.index + 1
      const isActive = activeArticleIdAtom() === articleId

      return {
        id: `${idBase}-article-${articleId}`,
        role: 'article' as const,
        tabindex: (isActive && !info.article.disabled ? '0' : '-1') as '0' | '-1',
        'aria-posinset': posInSet,
        'aria-setsize': setSize,
        'aria-disabled': info.article.disabled ? ('true' as const) : undefined,
        'data-active': (isActive ? 'true' : 'false') as 'true' | 'false',
        onFocus: () => setActiveArticle(articleId),
      }
    },
  }

  // -- Assemble model --

  const state: FeedState = {
    articleIds: articleIdsAtom,
    activeArticleId: activeArticleIdAtom,
    isLoading: isLoadingAtom,
    isBusy: isBusyAtom,
    totalCount: totalCountAtom,
    isEmpty: isEmptyAtom,
    hasError: hasErrorAtom,
    error: errorAtom,
    canLoadMore: canLoadMoreAtom,
    canLoadNewer: canLoadNewerAtom,
  }

  const actions: FeedActions = {
    focusNextArticle,
    focusPrevArticle,
    loadMore,
    loadNewer,
    setArticles,
    appendArticles,
    prependArticles,
    removeArticle,
    setBusy,
    setError,
    clearError,
    setTotalCount,
    handleKeyDown,
  }

  return {
    state,
    actions,
    contracts,
  }
}
