import {describe, expect, it, vi} from 'vitest'
import {createFeed, type FeedArticle, type FeedKeyboardResult} from './index'

describe('createFeed', () => {
  const threeArticles: FeedArticle[] = [{id: 'a1'}, {id: 'a2'}, {id: 'a3'}]

  // ── Navigation: focusNextArticle / focusPrevArticle ──

  describe('article navigation', () => {
    it('focusNextArticle moves to the next article', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      feed.actions.focusNextArticle()
      expect(feed.state.activeArticleId()).toBe('a2')
    })

    it('focusPrevArticle moves to the previous article', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a2'})
      feed.actions.focusPrevArticle()
      expect(feed.state.activeArticleId()).toBe('a1')
    })

    it('clamps at last article when focusNextArticle at end', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a3'})
      feed.actions.focusNextArticle()
      expect(feed.state.activeArticleId()).toBe('a3')
    })

    it('clamps at first article when focusPrevArticle at start', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      feed.actions.focusPrevArticle()
      expect(feed.state.activeArticleId()).toBe('a1')
    })

    it('skips disabled articles during forward navigation', () => {
      const feed = createFeed({
        articles: [{id: 'a1'}, {id: 'a2', disabled: true}, {id: 'a3'}],
        initialActiveArticleId: 'a1',
      })
      feed.actions.focusNextArticle()
      expect(feed.state.activeArticleId()).toBe('a3')
    })

    it('skips disabled articles during backward navigation', () => {
      const feed = createFeed({
        articles: [{id: 'a1'}, {id: 'a2', disabled: true}, {id: 'a3'}],
        initialActiveArticleId: 'a3',
      })
      feed.actions.focusPrevArticle()
      expect(feed.state.activeArticleId()).toBe('a1')
    })

    it('handles navigation when all articles are disabled', () => {
      const feed = createFeed({
        articles: [{id: 'a1', disabled: true}, {id: 'a2', disabled: true}],
      })
      expect(feed.state.activeArticleId()).toBe(null)
      feed.actions.focusNextArticle()
      expect(feed.state.activeArticleId()).toBe(null)
    })

    it('handles navigation on empty feed', () => {
      const feed = createFeed({articles: []})
      expect(feed.state.activeArticleId()).toBe(null)
      feed.actions.focusNextArticle()
      expect(feed.state.activeArticleId()).toBe(null)
      feed.actions.focusPrevArticle()
      expect(feed.state.activeArticleId()).toBe(null)
    })
  })

  // ── aria-posinset and aria-setsize ──

  describe('aria-posinset and aria-setsize', () => {
    it('calculates correct 1-based posinset', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.contracts.getArticleProps('a1')['aria-posinset']).toBe(1)
      expect(feed.contracts.getArticleProps('a2')['aria-posinset']).toBe(2)
      expect(feed.contracts.getArticleProps('a3')['aria-posinset']).toBe(3)
    })

    it('returns -1 for aria-setsize when totalCount is unknown', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.contracts.getArticleProps('a1')['aria-setsize']).toBe(-1)
    })

    it('uses totalCount for aria-setsize when known', () => {
      const feed = createFeed({articles: threeArticles, totalCount: 100})
      expect(feed.contracts.getArticleProps('a1')['aria-setsize']).toBe(100)
    })

    it('recalculates positions after appendArticles', () => {
      const feed = createFeed({articles: [{id: 'a1'}, {id: 'a2'}]})
      feed.actions.appendArticles([{id: 'a3'}, {id: 'a4'}])
      expect(feed.contracts.getArticleProps('a3')['aria-posinset']).toBe(3)
      expect(feed.contracts.getArticleProps('a4')['aria-posinset']).toBe(4)
    })

    it('recalculates positions after prependArticles', () => {
      const feed = createFeed({articles: [{id: 'a3'}, {id: 'a4'}]})
      feed.actions.prependArticles([{id: 'a1'}, {id: 'a2'}])
      expect(feed.contracts.getArticleProps('a1')['aria-posinset']).toBe(1)
      expect(feed.contracts.getArticleProps('a2')['aria-posinset']).toBe(2)
      expect(feed.contracts.getArticleProps('a3')['aria-posinset']).toBe(3)
    })

    it('recalculates after setArticles', () => {
      const feed = createFeed({articles: threeArticles})
      feed.actions.setArticles([{id: 'b1'}, {id: 'b2'}])
      expect(feed.contracts.getArticleProps('b1')['aria-posinset']).toBe(1)
      expect(feed.contracts.getArticleProps('b2')['aria-posinset']).toBe(2)
    })

    it('recalculates after removeArticle', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      feed.actions.removeArticle('a2')
      expect(feed.contracts.getArticleProps('a1')['aria-posinset']).toBe(1)
      expect(feed.contracts.getArticleProps('a3')['aria-posinset']).toBe(2)
    })
  })

  // ── aria-busy state transitions ──

  describe('aria-busy state transitions', () => {
    it('sets aria-busy during loadMore', async () => {
      let resolveLoad!: (value: FeedArticle[]) => void
      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: () => new Promise((r) => { resolveLoad = r }),
      })

      const p = feed.actions.loadMore()
      expect(feed.state.isBusy()).toBe(true)
      expect(feed.contracts.getFeedProps()['aria-busy']).toBe('true')

      resolveLoad([{id: 'a4'}])
      await p

      expect(feed.state.isBusy()).toBe(false)
      expect(feed.contracts.getFeedProps()['aria-busy']).toBe('false')
    })

    it('sets aria-busy during loadNewer', async () => {
      let resolveLoad!: (value: FeedArticle[]) => void
      const feed = createFeed({
        articles: threeArticles,
        onLoadNewer: () => new Promise((r) => { resolveLoad = r }),
      })

      const p = feed.actions.loadNewer()
      expect(feed.state.isBusy()).toBe(true)
      expect(feed.contracts.getFeedProps()['aria-busy']).toBe('true')

      resolveLoad([{id: 'a0'}])
      await p

      expect(feed.state.isBusy()).toBe(false)
    })

    it('setBusy controls isBusy directly', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.isBusy()).toBe(false)
      feed.actions.setBusy(true)
      expect(feed.state.isBusy()).toBe(true)
      feed.actions.setBusy(false)
      expect(feed.state.isBusy()).toBe(false)
    })
  })

  // ── Focus preservation on prepend ──

  describe('focus preservation when articles are prepended', () => {
    it('preserves activeArticleId when articles are prepended', () => {
      const feed = createFeed({
        articles: [{id: 'a3'}, {id: 'a4'}],
        initialActiveArticleId: 'a3',
      })
      feed.actions.prependArticles([{id: 'a1'}, {id: 'a2'}])
      expect(feed.state.activeArticleId()).toBe('a3')
    })

    it('shifts aria-posinset for existing articles after prepend', () => {
      const feed = createFeed({
        articles: [{id: 'a3'}, {id: 'a4'}],
        initialActiveArticleId: 'a3',
      })
      feed.actions.prependArticles([{id: 'a1'}, {id: 'a2'}])
      expect(feed.contracts.getArticleProps('a3')['aria-posinset']).toBe(3)
      expect(feed.contracts.getArticleProps('a4')['aria-posinset']).toBe(4)
    })
  })

  // ── Focus recovery when active article is removed ──

  describe('focus recovery when active article is removed', () => {
    it('moves focus to next enabled article when active is removed', () => {
      const feed = createFeed({
        articles: threeArticles,
        initialActiveArticleId: 'a2',
      })
      feed.actions.removeArticle('a2')
      expect(feed.state.activeArticleId()).toBe('a3')
    })

    it('falls back to previous enabled article when active is last and removed', () => {
      const feed = createFeed({
        articles: threeArticles,
        initialActiveArticleId: 'a3',
      })
      feed.actions.removeArticle('a3')
      expect(feed.state.activeArticleId()).toBe('a2')
    })

    it('sets null when all articles are removed', () => {
      const feed = createFeed({
        articles: [{id: 'a1'}],
        initialActiveArticleId: 'a1',
      })
      feed.actions.removeArticle('a1')
      expect(feed.state.activeArticleId()).toBe(null)
    })

    it('preserves activeArticleId when non-active article is removed', () => {
      const feed = createFeed({
        articles: threeArticles,
        initialActiveArticleId: 'a1',
      })
      feed.actions.removeArticle('a3')
      expect(feed.state.activeArticleId()).toBe('a1')
    })

    it('skips disabled articles during focus recovery', () => {
      const feed = createFeed({
        articles: [{id: 'a1'}, {id: 'a2'}, {id: 'a3', disabled: true}, {id: 'a4'}],
        initialActiveArticleId: 'a2',
      })
      feed.actions.removeArticle('a2')
      // Next is a3 but disabled, so should go to a4
      expect(feed.state.activeArticleId()).toBe('a4')
    })
  })

  // ── setArticles replaces list and validates active ──

  describe('setArticles', () => {
    it('replaces the entire article list', () => {
      const feed = createFeed({articles: threeArticles})
      feed.actions.setArticles([{id: 'b1'}, {id: 'b2'}])
      expect(feed.state.articleIds()).toEqual(['b1', 'b2'])
    })

    it('deduplicates articles', () => {
      const feed = createFeed({articles: threeArticles})
      feed.actions.setArticles([{id: 'b1'}, {id: 'b1'}, {id: 'b2'}])
      expect(feed.state.articleIds()).toEqual(['b1', 'b2'])
    })

    it('validates activeArticleId against new list', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a2'})
      feed.actions.setArticles([{id: 'b1'}, {id: 'b2'}])
      // a2 no longer exists, should fall back to first enabled
      expect(feed.state.activeArticleId()).toBe('b1')
    })

    it('preserves activeArticleId if it exists in new list', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a2'})
      feed.actions.setArticles([{id: 'a2'}, {id: 'a5'}])
      expect(feed.state.activeArticleId()).toBe('a2')
    })
  })

  // ── appendArticles / prependArticles deduplication ──

  describe('appendArticles and prependArticles deduplication', () => {
    it('appendArticles deduplicates against existing articles', () => {
      const feed = createFeed({articles: [{id: 'a1'}, {id: 'a2'}]})
      feed.actions.appendArticles([{id: 'a2'}, {id: 'a3'}])
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3'])
    })

    it('prependArticles deduplicates against existing articles', () => {
      const feed = createFeed({articles: [{id: 'a2'}, {id: 'a3'}]})
      feed.actions.prependArticles([{id: 'a1'}, {id: 'a2'}])
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3'])
    })
  })

  // ── handleKeyDown returns FeedKeyboardResult ──

  describe('handleKeyDown returns correct FeedKeyboardResult', () => {
    it('returns "next" for PageDown', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      const result: FeedKeyboardResult = feed.actions.handleKeyDown({key: 'PageDown'})
      expect(result).toBe('next')
      expect(feed.state.activeArticleId()).toBe('a2')
    })

    it('returns "prev" for PageUp', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a2'})
      const result: FeedKeyboardResult = feed.actions.handleKeyDown({key: 'PageUp'})
      expect(result).toBe('prev')
      expect(feed.state.activeArticleId()).toBe('a1')
    })

    it('returns "exit-after" for Ctrl+End', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      const result: FeedKeyboardResult = feed.actions.handleKeyDown({key: 'End', ctrlKey: true})
      expect(result).toBe('exit-after')
    })

    it('returns "exit-before" for Ctrl+Home', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a3'})
      const result: FeedKeyboardResult = feed.actions.handleKeyDown({key: 'Home', ctrlKey: true})
      expect(result).toBe('exit-before')
    })

    it('returns null for unhandled keys', () => {
      const feed = createFeed({articles: threeArticles})
      const result: FeedKeyboardResult = feed.actions.handleKeyDown({key: 'Tab'})
      expect(result).toBe(null)
    })

    it('Ctrl+End does NOT move focus to last article', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      feed.actions.handleKeyDown({key: 'End', ctrlKey: true})
      // Per APG, Ctrl+End signals exit-after, does NOT move to last article
      expect(feed.state.activeArticleId()).toBe('a1')
    })

    it('Ctrl+Home does NOT move focus to first article', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a3'})
      feed.actions.handleKeyDown({key: 'Home', ctrlKey: true})
      // Per APG, Ctrl+Home signals exit-before, does NOT move to first article
      expect(feed.state.activeArticleId()).toBe('a3')
    })

    it('Meta+End also returns exit-after', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      const result = feed.actions.handleKeyDown({key: 'End', metaKey: true})
      expect(result).toBe('exit-after')
    })

    it('Meta+Home also returns exit-before', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a3'})
      const result = feed.actions.handleKeyDown({key: 'Home', metaKey: true})
      expect(result).toBe('exit-before')
    })
  })

  // ── isEmpty, hasError, canLoadMore, canLoadNewer derived state ──

  describe('derived state accuracy', () => {
    it('isEmpty is true when no articles', () => {
      const feed = createFeed({articles: []})
      expect(feed.state.isEmpty()).toBe(true)
    })

    it('isEmpty is false when articles exist', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.isEmpty()).toBe(false)
    })

    it('isEmpty updates after setArticles to empty', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.isEmpty()).toBe(false)
      feed.actions.setArticles([])
      expect(feed.state.isEmpty()).toBe(true)
    })

    it('hasError is false initially', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.hasError()).toBe(false)
      expect(feed.state.error()).toBe(null)
    })

    it('canLoadMore reflects whether bottom-loading is possible', () => {
      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: async () => [],
      })
      // With onLoadMore callback provided and not loading, canLoadMore should be true
      expect(feed.state.canLoadMore()).toBe(true)
    })

    it('canLoadNewer reflects whether top-loading is possible', () => {
      const feed = createFeed({
        articles: threeArticles,
        onLoadNewer: async () => [],
      })
      expect(feed.state.canLoadNewer()).toBe(true)
    })

    it('canLoadMore is false when no onLoadMore callback', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.canLoadMore()).toBe(false)
    })

    it('canLoadNewer is false when no onLoadNewer callback', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.canLoadNewer()).toBe(false)
    })

    it('canLoadMore is false while loading', async () => {
      let resolveLoad!: (value: FeedArticle[]) => void
      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: () => new Promise((r) => { resolveLoad = r }),
      })

      expect(feed.state.canLoadMore()).toBe(true)
      const p = feed.actions.loadMore()
      expect(feed.state.canLoadMore()).toBe(false)

      resolveLoad([])
      await p
      expect(feed.state.canLoadMore()).toBe(true)
    })

    it('canLoadNewer is false while loading', async () => {
      let resolveLoad!: (value: FeedArticle[]) => void
      const feed = createFeed({
        articles: threeArticles,
        onLoadNewer: () => new Promise((r) => { resolveLoad = r }),
      })

      expect(feed.state.canLoadNewer()).toBe(true)
      const p = feed.actions.loadNewer()
      expect(feed.state.canLoadNewer()).toBe(false)

      resolveLoad([])
      await p
      expect(feed.state.canLoadNewer()).toBe(true)
    })
  })

  // ── Error state transitions ──

  describe('error state transitions', () => {
    it('setError sets error and hasError', () => {
      const feed = createFeed({articles: threeArticles})
      feed.actions.setError('Network error')
      expect(feed.state.error()).toBe('Network error')
      expect(feed.state.hasError()).toBe(true)
    })

    it('clearError clears error and hasError', () => {
      const feed = createFeed({articles: threeArticles})
      feed.actions.setError('Network error')
      feed.actions.clearError()
      expect(feed.state.error()).toBe(null)
      expect(feed.state.hasError()).toBe(false)
    })

    it('loadMore sets error on rejection', async () => {
      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: async () => { throw new Error('Load failed') },
      })

      await feed.actions.loadMore()
      expect(feed.state.hasError()).toBe(true)
      expect(feed.state.error()).toBe('Load failed')
      expect(feed.state.isLoading()).toBe(false)
      expect(feed.state.isBusy()).toBe(false)
    })

    it('loadNewer sets error on rejection', async () => {
      const feed = createFeed({
        articles: threeArticles,
        onLoadNewer: async () => { throw new Error('Refresh failed') },
      })

      await feed.actions.loadNewer()
      expect(feed.state.hasError()).toBe(true)
      expect(feed.state.error()).toBe('Refresh failed')
      expect(feed.state.isLoading()).toBe(false)
      expect(feed.state.isBusy()).toBe(false)
    })
  })

  // ── Concurrent load guard ──

  describe('concurrent load guard', () => {
    it('second loadMore during active load is no-op', async () => {
      let loadCalls = 0
      let resolveLoad!: (value: FeedArticle[]) => void

      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: () => {
          loadCalls++
          return new Promise<FeedArticle[]>((r) => { resolveLoad = r })
        },
      })

      const p1 = feed.actions.loadMore()
      const p2 = feed.actions.loadMore()
      expect(loadCalls).toBe(1)

      resolveLoad([{id: 'a4'}])
      await p1
      await p2
      expect(loadCalls).toBe(1)
    })

    it('loadNewer is no-op while loadMore is active', async () => {
      let loadMoreCalls = 0
      let loadNewerCalls = 0
      let resolveMore!: (value: FeedArticle[]) => void

      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: () => {
          loadMoreCalls++
          return new Promise<FeedArticle[]>((r) => { resolveMore = r })
        },
        onLoadNewer: async () => {
          loadNewerCalls++
          return [{id: 'n1'}]
        },
      })

      const p1 = feed.actions.loadMore()
      const p2 = feed.actions.loadNewer()
      expect(loadMoreCalls).toBe(1)
      expect(loadNewerCalls).toBe(0)

      resolveMore([{id: 'a4'}])
      await p1
      await p2
    })

    it('loadMore is no-op while loadNewer is active', async () => {
      let loadMoreCalls = 0
      let loadNewerCalls = 0
      let resolveNewer!: (value: FeedArticle[]) => void

      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: async () => {
          loadMoreCalls++
          return [{id: 'a4'}]
        },
        onLoadNewer: () => {
          loadNewerCalls++
          return new Promise<FeedArticle[]>((r) => { resolveNewer = r })
        },
      })

      const p1 = feed.actions.loadNewer()
      const p2 = feed.actions.loadMore()
      expect(loadNewerCalls).toBe(1)
      expect(loadMoreCalls).toBe(0)

      resolveNewer([{id: 'n1'}])
      await p1
      await p2
    })
  })

  // ── loadMore and loadNewer behavior ──

  describe('loadMore', () => {
    it('appends articles from callback', async () => {
      const feed = createFeed({
        articles: [{id: 'a1'}, {id: 'a2'}],
        onLoadMore: async () => [{id: 'a3'}, {id: 'a4'}],
      })

      await feed.actions.loadMore()
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3', 'a4'])
    })

    it('is no-op when no onLoadMore callback', async () => {
      const feed = createFeed({articles: threeArticles})
      await feed.actions.loadMore()
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3'])
    })

    it('preserves activeArticleId after load', async () => {
      const feed = createFeed({
        articles: threeArticles,
        initialActiveArticleId: 'a2',
        onLoadMore: async () => [{id: 'a4'}],
      })

      await feed.actions.loadMore()
      expect(feed.state.activeArticleId()).toBe('a2')
    })

    it('transitions isLoading during load', async () => {
      let resolveLoad!: (value: FeedArticle[]) => void
      const feed = createFeed({
        articles: threeArticles,
        onLoadMore: () => new Promise((r) => { resolveLoad = r }),
      })

      expect(feed.state.isLoading()).toBe(false)
      const p = feed.actions.loadMore()
      expect(feed.state.isLoading()).toBe(true)

      resolveLoad([])
      await p
      expect(feed.state.isLoading()).toBe(false)
    })
  })

  describe('loadNewer', () => {
    it('prepends articles from callback', async () => {
      const feed = createFeed({
        articles: [{id: 'a3'}, {id: 'a4'}],
        onLoadNewer: async () => [{id: 'a1'}, {id: 'a2'}],
      })

      await feed.actions.loadNewer()
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3', 'a4'])
    })

    it('is no-op when no onLoadNewer callback', async () => {
      const feed = createFeed({articles: threeArticles})
      await feed.actions.loadNewer()
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3'])
    })

    it('preserves activeArticleId after load', async () => {
      const feed = createFeed({
        articles: [{id: 'a3'}, {id: 'a4'}],
        initialActiveArticleId: 'a3',
        onLoadNewer: async () => [{id: 'a1'}, {id: 'a2'}],
      })

      await feed.actions.loadNewer()
      expect(feed.state.activeArticleId()).toBe('a3')
    })

    it('transitions isLoading during load', async () => {
      let resolveLoad!: (value: FeedArticle[]) => void
      const feed = createFeed({
        articles: threeArticles,
        onLoadNewer: () => new Promise((r) => { resolveLoad = r }),
      })

      expect(feed.state.isLoading()).toBe(false)
      const p = feed.actions.loadNewer()
      expect(feed.state.isLoading()).toBe(true)

      resolveLoad([])
      await p
      expect(feed.state.isLoading()).toBe(false)
    })
  })

  // ── setTotalCount ──

  describe('setTotalCount', () => {
    it('updates totalCount and aria-setsize', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.totalCount()).toBe(-1)
      expect(feed.contracts.getArticleProps('a1')['aria-setsize']).toBe(-1)

      feed.actions.setTotalCount(200)
      expect(feed.state.totalCount()).toBe(200)
      expect(feed.contracts.getArticleProps('a1')['aria-setsize']).toBe(200)
    })

    it('setting totalCount to -1 means unknown', () => {
      const feed = createFeed({articles: threeArticles, totalCount: 100})
      feed.actions.setTotalCount(-1)
      expect(feed.state.totalCount()).toBe(-1)
      expect(feed.contracts.getArticleProps('a1')['aria-setsize']).toBe(-1)
    })
  })

  // ── contracts: getFeedProps ──

  describe('getFeedProps contract', () => {
    it('returns correct base props', () => {
      const feed = createFeed({articles: threeArticles})
      const props = feed.contracts.getFeedProps()
      expect(props.role).toBe('feed')
      expect(props['aria-busy']).toBe('false')
      expect(props).toHaveProperty('id')
    })

    it('includes aria-label when provided', () => {
      const feed = createFeed({articles: threeArticles, ariaLabel: 'News Feed'})
      expect(feed.contracts.getFeedProps()['aria-label']).toBe('News Feed')
    })

    it('includes aria-labelledby when provided', () => {
      const feed = createFeed({articles: threeArticles, ariaLabelledBy: 'heading-id'})
      expect(feed.contracts.getFeedProps()['aria-labelledby']).toBe('heading-id')
    })

    it('does not have tabindex (feed container is not focusable)', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.contracts.getFeedProps()).not.toHaveProperty('tabindex')
    })
  })

  // ── contracts: getArticleProps ──

  describe('getArticleProps contract', () => {
    it('returns correct base props', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      const props = feed.contracts.getArticleProps('a1')
      expect(props.role).toBe('article')
      expect(props.tabindex).toBe('0')
      expect(props['data-active']).toBe('true')
      expect(props['aria-posinset']).toBe(1)
    })

    it('active article gets tabindex 0, others get -1', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a2'})
      expect(feed.contracts.getArticleProps('a1').tabindex).toBe('-1')
      expect(feed.contracts.getArticleProps('a2').tabindex).toBe('0')
      expect(feed.contracts.getArticleProps('a3').tabindex).toBe('-1')
    })

    it('disabled article always gets tabindex -1', () => {
      const feed = createFeed({
        articles: [{id: 'a1', disabled: true}],
      })
      const props = feed.contracts.getArticleProps('a1')
      expect(props.tabindex).toBe('-1')
      expect(props['aria-disabled']).toBe('true')
    })

    it('onFocus handler sets the article as active', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      feed.contracts.getArticleProps('a3').onFocus()
      expect(feed.state.activeArticleId()).toBe('a3')
      expect(feed.contracts.getArticleProps('a3')['data-active']).toBe('true')
      expect(feed.contracts.getArticleProps('a1')['data-active']).toBe('false')
    })

    it('throws for unknown article id', () => {
      const feed = createFeed({articles: threeArticles})
      expect(() => feed.contracts.getArticleProps('nonexistent')).toThrow()
    })
  })

  // ── Initial state defaults ──

  describe('initial state', () => {
    it('defaults activeArticleId to first enabled article', () => {
      const feed = createFeed({articles: threeArticles})
      expect(feed.state.activeArticleId()).toBe('a1')
    })

    it('skips disabled articles for initial active', () => {
      const feed = createFeed({
        articles: [{id: 'a1', disabled: true}, {id: 'a2'}, {id: 'a3'}],
      })
      expect(feed.state.activeArticleId()).toBe('a2')
    })

    it('respects initialActiveArticleId', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a3'})
      expect(feed.state.activeArticleId()).toBe('a3')
    })

    it('falls back when initialActiveArticleId is disabled', () => {
      const feed = createFeed({
        articles: [{id: 'a1', disabled: true}, {id: 'a2'}],
        initialActiveArticleId: 'a1',
      })
      expect(feed.state.activeArticleId()).toBe('a2')
    })

    it('isLoading defaults to false', () => {
      const feed = createFeed({articles: []})
      expect(feed.state.isLoading()).toBe(false)
    })

    it('isBusy defaults to false', () => {
      const feed = createFeed({articles: []})
      expect(feed.state.isBusy()).toBe(false)
    })

    it('totalCount defaults to -1', () => {
      const feed = createFeed({articles: []})
      expect(feed.state.totalCount()).toBe(-1)
    })

    it('error defaults to null', () => {
      const feed = createFeed({articles: []})
      expect(feed.state.error()).toBe(null)
    })

    it('hasError defaults to false', () => {
      const feed = createFeed({articles: []})
      expect(feed.state.hasError()).toBe(false)
    })
  })

  // ── removeArticle ──

  describe('removeArticle', () => {
    it('removes the article from the list', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      feed.actions.removeArticle('a2')
      expect(feed.state.articleIds()).toEqual(['a1', 'a3'])
    })

    it('is no-op for unknown article id', () => {
      const feed = createFeed({articles: threeArticles})
      feed.actions.removeArticle('nonexistent')
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3'])
    })
  })

  // ── appendArticles / prependArticles ──

  describe('appendArticles', () => {
    it('adds articles to the end', () => {
      const feed = createFeed({articles: [{id: 'a1'}]})
      feed.actions.appendArticles([{id: 'a2'}, {id: 'a3'}])
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3'])
    })

    it('preserves activeArticleId', () => {
      const feed = createFeed({articles: [{id: 'a1'}], initialActiveArticleId: 'a1'})
      feed.actions.appendArticles([{id: 'a2'}])
      expect(feed.state.activeArticleId()).toBe('a1')
    })
  })

  describe('prependArticles', () => {
    it('adds articles to the beginning', () => {
      const feed = createFeed({articles: [{id: 'a3'}]})
      feed.actions.prependArticles([{id: 'a1'}, {id: 'a2'}])
      expect(feed.state.articleIds()).toEqual(['a1', 'a2', 'a3'])
    })

    it('preserves activeArticleId', () => {
      const feed = createFeed({articles: [{id: 'a3'}], initialActiveArticleId: 'a3'})
      feed.actions.prependArticles([{id: 'a1'}, {id: 'a2'}])
      expect(feed.state.activeArticleId()).toBe('a3')
    })
  })

  // ── Invariant: activeArticleId validated after mutations ──

  describe('activeArticleId invariant after mutations', () => {
    it('resets to first enabled if active becomes invalid after setArticles', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a2'})
      feed.actions.setArticles([{id: 'b1'}, {id: 'b2'}])
      expect(['b1', 'b2']).toContain(feed.state.activeArticleId())
    })

    it('sets null if setArticles makes list empty', () => {
      const feed = createFeed({articles: threeArticles, initialActiveArticleId: 'a1'})
      feed.actions.setArticles([])
      expect(feed.state.activeArticleId()).toBe(null)
    })
  })
})
