# Feed Component Contract

## Purpose

`Feed` provides a headless APG-aligned model for bidirectional infinite scrolling content, where sections of content (articles) are loaded dynamically as the user scrolls or triggers load actions. Supports both appending (bottom) and prepending (top) of articles.

## Component Files

- `src/feed/index.ts` - model and public `createFeed` API
- `src/feed/feed.test.ts` - unit behavior tests

## Public API

- `createFeed(options)`
- `state` (signal-backed):
  - `articleIds()` - ordered list of loaded article identifiers
  - `activeArticleId()` - identifier of the article currently focused or "active"
  - `isLoading()` - boolean indicating if content is being fetched
  - `isBusy()` - boolean for `aria-busy`
  - `totalCount()` - total number of articles if known, or -1 if unknown/infinite
  - `isEmpty()` - derived: `articleIds.length === 0`
  - `hasError()` - derived: whether an error is present
  - `error()` - current error value/message, or `null`
  - `canLoadMore()` - derived: whether more bottom-loading is possible
  - `canLoadNewer()` - derived: whether more top-loading is possible
- `actions`:
  - navigation: `focusNextArticle`, `focusPrevArticle`
  - lifecycle: `loadMore` (append), `loadNewer` (prepend), `setArticles`, `appendArticles`, `prependArticles`, `removeArticle`
  - state: `setBusy`, `setError`, `clearError`, `setTotalCount`
  - keyboard: `handleKeyDown`
- `contracts`:
  - `getFeedProps()`
  - `getArticleProps(articleId)`

## APG and A11y Contract

- root role: `feed`
- item role: `article`
- required attributes:
  - root: `aria-label` or `aria-labelledby`, `aria-busy`
  - article: `aria-posinset`, `aria-setsize`, `tabindex`
- focus management:
  - the feed container itself is not focusable
  - articles are focusable and managed via `roving-tabindex`

## Keyboard Contract

Per W3C APG Feed Pattern:

- `PageDown`: move focus to the next article (`focusNextArticle`)
- `PageUp`: move focus to the previous article (`focusPrevArticle`)
- `Ctrl + End`: move focus to the first focusable element AFTER the feed (not to the last article). The headless `handleKeyDown` signals this intent via a return value or flag; the adapter is responsible for actual DOM focus movement.
- `Ctrl + Home`: move focus to the first focusable element BEFORE the feed (not to the first article). Same adapter delegation as above.

The `handleKeyDown` action returns a `FeedKeyboardResult` indicating the action taken:
- `'next'` - moved to next article
- `'prev'` - moved to previous article
- `'exit-after'` - adapter should move focus after the feed
- `'exit-before'` - adapter should move focus before the feed
- `null` - key not handled

## Behavior Contract

### Bidirectional Loading

- `loadMore` triggers when the user/adapter requests more content at the bottom (append direction). The adapter (UIKit) uses IntersectionObserver on a bottom sentinel to call this action.
- `loadNewer` triggers when the user/adapter requests newer content at the top (prepend direction). The adapter (UIKit) uses IntersectionObserver on a top sentinel to call this action.
- Both `loadMore` and `loadNewer` are action-only: headless exposes the actions, UIKit decides when to call them.

### Aria Busy

- `aria-busy` is set to `true` during both `loadMore` and `loadNewer` operations.
- `setBusy(true)` is called at the start of loading; `setBusy(false)` at completion.

### Focus Preservation

- When articles are prepended, the currently focused article must retain its focus. The `activeArticleId` remains stable; `aria-posinset` values shift for all articles.
- When the active article is removed, focus moves to the nearest enabled article (prefer next, fallback to prev).

### Position Recalculation

- `aria-posinset` and `aria-setsize` are recalculated on any article list change (`setArticles`, `appendArticles`, `prependArticles`, `removeArticle`).
- `aria-setsize` equals `totalCount` if known, or `-1` if unknown/infinite.
- `aria-posinset` is 1-based and reflects the article's position in the full ordered list.

## State Signal Surface

| Signal | Type | Description |
|---|---|---|
| `articleIds` | `Computed<string[]>` | Ordered list of loaded article IDs |
| `activeArticleId` | `Atom<string \| null>` | Currently focused article ID |
| `isLoading` | `Atom<boolean>` | Whether a load operation is in progress |
| `isBusy` | `Atom<boolean>` | Maps to `aria-busy` |
| `totalCount` | `Atom<number>` | Total articles count, or `-1` if unknown |
| `isEmpty` | `Computed<boolean>` | `articleIds.length === 0` |
| `hasError` | `Computed<boolean>` | `error !== null` |
| `error` | `Atom<string \| null>` | Current error message, or `null` |
| `canLoadMore` | `Computed<boolean>` | Whether bottom-loading is possible (not loading AND not all loaded) |
| `canLoadNewer` | `Computed<boolean>` | Whether top-loading is possible (not loading AND newer content exists) |

## Actions

| Action | Signature | Description |
|---|---|---|
| `focusNextArticle` | `() => void` | Move active to next enabled article |
| `focusPrevArticle` | `() => void` | Move active to previous enabled article |
| `loadMore` | `() => Promise<void>` | Append articles at bottom; sets busy, calls adapter callback |
| `loadNewer` | `() => Promise<void>` | Prepend articles at top; sets busy, calls adapter callback |
| `setArticles` | `(articles: FeedArticle[]) => void` | Replace entire article list |
| `appendArticles` | `(articles: FeedArticle[]) => void` | Add articles to the end |
| `prependArticles` | `(articles: FeedArticle[]) => void` | Add articles to the beginning |
| `removeArticle` | `(articleId: string) => void` | Remove a single article by ID |
| `setBusy` | `(value: boolean) => void` | Set `aria-busy` state |
| `setError` | `(message: string) => void` | Set error state with message |
| `clearError` | `() => void` | Clear error state |
| `setTotalCount` | `(count: number) => void` | Set total article count (`-1` for unknown) |
| `handleKeyDown` | `(event: FeedKeyboardEventLike) => FeedKeyboardResult` | Process keyboard event per APG |

## Contracts

### `getFeedProps()`

Returns a complete ARIA prop object ready to spread on the feed root element:

```ts
{
  id: string
  role: 'feed'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-busy': 'true' | 'false'
}
```

### `getArticleProps(articleId)`

Returns a complete ARIA prop object ready to spread on each article element:

```ts
{
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
```

## Transitions Table

| Event / Action | Current State | Next State / Effect |
|---|---|---|
| `focusNextArticle()` | any | `activeArticleId` = next enabled article ID; clamps at last |
| `focusPrevArticle()` | any | `activeArticleId` = previous enabled article ID; clamps at first |
| `loadMore()` | `isLoading = false` | `isLoading` = `true`; `isBusy` = `true`; invoke callback; on resolve: append articles, `isLoading` = `false`, `isBusy` = `false`; on reject: set error, `isLoading` = `false`, `isBusy` = `false` |
| `loadMore()` | `isLoading = true` | no-op (guard against concurrent loads) |
| `loadNewer()` | `isLoading = false` | `isLoading` = `true`; `isBusy` = `true`; invoke callback; on resolve: prepend articles, `isLoading` = `false`, `isBusy` = `false`; on reject: set error, `isLoading` = `false`, `isBusy` = `false` |
| `loadNewer()` | `isLoading = true` | no-op (guard against concurrent loads) |
| `setArticles(list)` | any | `articles` = deduplicated list; recalculate all derived signals; ensure `activeArticleId` invariant |
| `appendArticles(list)` | any | `articles` = current + new (deduplicated); recalculate positions |
| `prependArticles(list)` | any | `articles` = new + current (deduplicated); recalculate positions; `activeArticleId` preserved |
| `removeArticle(id)` | `activeArticleId = id` | remove article; `activeArticleId` = nearest enabled (prefer next, fallback prev) |
| `removeArticle(id)` | `activeArticleId != id` | remove article; `activeArticleId` unchanged |
| `setBusy(value)` | any | `isBusy` = value |
| `setError(message)` | any | `error` = message; `hasError` = `true` |
| `clearError()` | any | `error` = `null`; `hasError` = `false` |
| `setTotalCount(count)` | any | `totalCount` = count; `canLoadMore` / `canLoadNewer` recalculated |
| `handleKeyDown(PageDown)` | any | calls `focusNextArticle()`; returns `'next'` |
| `handleKeyDown(PageUp)` | any | calls `focusPrevArticle()`; returns `'prev'` |
| `handleKeyDown(Ctrl+End)` | any | returns `'exit-after'` (adapter handles DOM focus) |
| `handleKeyDown(Ctrl+Home)` | any | returns `'exit-before'` (adapter handles DOM focus) |
| `handleKeyDown(other)` | any | returns `null` (not handled) |

## Invariants

1. `activeArticleId` must always be `null` or one of the currently loaded enabled `articleIds`.
2. `aria-setsize` equals `totalCount` if known (>= 0), or `-1` if unknown/infinite.
3. `aria-posinset` is 1-based and sequential across the ordered `articleIds` list.
4. Only the active article has `tabindex="0"`; all others have `tabindex="-1"`.
5. Disabled articles are skipped during keyboard navigation.
6. Focus must be preserved or logically moved when articles are prepended, appended, or removed.
7. `isEmpty` is always equivalent to `articleIds.length === 0`.
8. `hasError` is always equivalent to `error !== null`.
9. Concurrent `loadMore`/`loadNewer` calls are guarded — only one load operation at a time.
10. After any article list mutation, `activeArticleId` is validated against the new list and corrected if needed.

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.articleIds()` — ordered article IDs for rendering the list
- `state.activeArticleId()` — for focus management
- `state.isLoading()` — for rendering loading indicators
- `state.isBusy()` — reflected in `aria-busy` via `getFeedProps()`
- `state.isEmpty()` — for rendering empty state slot
- `state.hasError()` — for rendering error state slot
- `state.error()` — for rendering error message
- `state.canLoadMore()` — for showing/hiding bottom sentinel or load-more button
- `state.canLoadNewer()` — for showing/hiding top sentinel or load-newer button
- `state.totalCount()` — reflected in `aria-setsize` via `getArticleProps()`

**Actions called (event handlers, never mutate state directly):**
- `actions.focusNextArticle()` / `actions.focusPrevArticle()` — article navigation
- `actions.loadMore()` — called by IntersectionObserver on bottom sentinel
- `actions.loadNewer()` — called by IntersectionObserver on top sentinel
- `actions.setArticles(list)` — to replace the full article list
- `actions.appendArticles(list)` / `actions.prependArticles(list)` — for manual batch additions
- `actions.removeArticle(id)` — to remove a single article
- `actions.setBusy(value)` — for external busy state control
- `actions.setError(message)` / `actions.clearError()` — for error state management
- `actions.setTotalCount(count)` — when total becomes known or changes
- `actions.handleKeyDown(event)` — on keydown within feed root; adapter inspects return value for `'exit-after'`/`'exit-before'` to handle DOM focus transfer

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getFeedProps()` — spread onto the feed root element
- `contracts.getArticleProps(articleId)` — spread onto each article element

**UIKit-only concerns (NOT in headless):**
- IntersectionObserver setup for top/bottom sentinels
- DOM focus transfer for `Ctrl+End` / `Ctrl+Home` (moving focus outside the feed)
- Empty state and error state slot rendering
- Scroll position management
- Touch/gesture handling

## Minimum Test Matrix

- article navigation via `focusNextArticle` / `focusPrevArticle`
- correct `aria-posinset` and `aria-setsize` calculation during dynamic loading
- `aria-busy` state transitions during `loadMore` and `loadNewer`
- focus preservation when articles are prepended
- focus recovery when active article is removed
- boundary handling (first/last article clamping)
- disabled article skip behavior
- `setArticles` replaces list and validates active
- `appendArticles` / `prependArticles` deduplication
- `handleKeyDown` returns correct `FeedKeyboardResult` values
- `isEmpty`, `hasError`, `canLoadMore`, `canLoadNewer` derived state accuracy
- error state transitions (`setError`, `clearError`)
- concurrent load guard (second `loadMore` during active load is no-op)

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- scroll position restoration
- complex filtering or sorting of the feed
- nested feeds
- automatic scroll-to-load logic (handled by IntersectionObserver in the adapter)
- virtualization of off-screen articles
