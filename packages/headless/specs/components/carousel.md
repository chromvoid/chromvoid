# Carousel Component Contract

## Purpose

`Carousel` provides a headless APG-aligned model for a slideshow or image rotator, enabling users to navigate through a set of items (slides) sequentially.

## Component Files

- `src/carousel/index.ts` - model and public `createCarousel` API
- `src/carousel/carousel.test.ts` - unit behavior tests

## Public API

- `createCarousel(options)`
- `state` (signal-backed):
  - `activeSlideIndex()`
  - `isPaused()`
  - `slideCount()`
  - `visibleSlideIndices()` - array of indices currently in view
- `actions`:
  - navigation: `moveNext`, `movePrev`, `moveTo(index)`
  - playback: `play`, `pause`, `togglePlay`
  - keyboard: `handleKeyDown`
- `contracts`:
  - `getRootProps()`
  - `getSlideGroupProps()`
  - `getSlideProps(index)`
  - `getNextButtonProps()`
  - `getPrevButtonProps()`
  - `getPlayPauseButtonProps()`
  - `getIndicatorProps(index)`

## APG and A11y Contract

- root role: `region` (with `aria-roledescription="carousel"`)
- slide group role: `group` (with `aria-roledescription="slide"`)
- required attributes:
  - root: `aria-label` or `aria-labelledby`
  - slide: `aria-label` or `aria-labelledby`, `aria-hidden` (if not visible)
  - buttons: `aria-controls`, `aria-label`
  - play/pause button: toggle `aria-label` between "Stop slide rotation" / "Start slide rotation" (NO `aria-pressed` per W3C APG guidance)
- focus management:
  - slides are not focusable by default unless they contain interactive elements
  - navigation controls (buttons, indicators) are in the tab sequence

## Behavior Contract

- `Carousel` supports automatic rotation (autoplay) with a configurable interval.
- rotation MUST pause on focus (when any element inside the carousel is focused) or on mouse hover.
- rotation MUST stop permanently if the user explicitly pauses it.
- `aria-live` is used to announce slide changes:
  - `off` when autoplaying
  - `polite` when the user manually navigates

## Invariants

- `activeSlideIndex` must be within `[0, slideCount - 1]`.
- `aria-roledescription` is used to provide a more descriptive role than `region` or `group`.
- only visible slides should be accessible to assistive technologies (`aria-hidden="false"`).

## Transitions Table

| Event / Action        | Current State          | Next State / Effect                                   |
|-----------------------|------------------------|-------------------------------------------------------|
| `moveNext()`          | any                    | `activeSlideIndex` = `(current + 1) % slideCount`; `aria-live` = `polite`; reset autoplay timer |
| `movePrev()`          | any                    | `activeSlideIndex` = `(current - 1 + slideCount) % slideCount`; `aria-live` = `polite`; reset autoplay timer |
| `moveTo(index)`       | any                    | `activeSlideIndex` = clamped index; `aria-live` = `polite`; reset autoplay timer |
| `play()`              | `userPaused = true`    | `userPaused` = `false`; autoplay resumes              |
| `pause()`             | `userPaused = false`   | `userPaused` = `true`; autoplay timer cleared          |
| `togglePlay()`        | `userPaused = true`    | calls `play()`                                         |
| `togglePlay()`        | `userPaused = false`   | calls `pause()`                                        |
| `handleFocusIn()`     | any                    | `isFocusWithin` = `true`; autoplay timer cleared       |
| `handleFocusOut()`    | any                    | `isFocusWithin` = `false`; autoplay resumes if eligible |
| `handlePointerEnter()`| any                    | `isPointerInside` = `true`; autoplay timer cleared     |
| `handlePointerLeave()`| any                    | `isPointerInside` = `false`; autoplay resumes if eligible |
| `handleKeyDown(ArrowRight)` | any              | calls `moveNext()`                                     |
| `handleKeyDown(ArrowLeft)`  | any              | calls `movePrev()`                                     |
| `handleKeyDown(Home)` | any                    | calls `moveTo(0)`                                      |
| `handleKeyDown(End)`  | any                    | calls `moveTo(slideCount - 1)`                         |
| autoplay timer fires  | autoplay running       | `activeSlideIndex` advances by 1; `aria-live` = `off`; timer restarted |

Autoplay is "running" when: `autoplay` option enabled AND `userPaused = false` AND `isPointerInside = false` AND `isFocusWithin = false` AND `slideCount > 1`.

## Adapter Expectations

UIKit adapters MUST bind to the headless model as follows:

**Signals read (reactive, drive re-renders):**
- `state.activeSlideIndex()` — current active slide index
- `state.isPaused()` — computed pause state (combines user-paused, focus, pointer)
- `state.slideCount()` — number of slides
- `state.visibleSlideIndices()` — array of currently visible slide indices

**Actions called (event handlers, never mutate state directly):**
- `actions.moveNext()` / `actions.movePrev()` — on next/prev button click
- `actions.moveTo(index)` — on indicator click
- `actions.togglePlay()` — on play/pause button click
- `actions.handleKeyDown(event)` — on keydown within carousel
- `actions.handleFocusIn()` / `actions.handleFocusOut()` — on focusin/focusout on root
- `actions.handlePointerEnter()` / `actions.handlePointerLeave()` — on pointerenter/pointerleave on root

**Contracts spread (attribute maps applied directly to DOM elements):**
- `contracts.getRootProps()` — spread onto the carousel root element
- `contracts.getSlideGroupProps()` — spread onto the slide container
- `contracts.getSlideProps(index)` — spread onto each slide element
- `contracts.getNextButtonProps()` — spread onto the next button
- `contracts.getPrevButtonProps()` — spread onto the previous button
- `contracts.getPlayPauseButtonProps()` — spread onto the play/pause toggle button (returns `aria-label` only, no `aria-pressed`)
- `contracts.getIndicatorProps(index)` — spread onto each indicator button

**UIKit-only concerns (NOT in headless):**
- Touch/swipe gesture handling
- CSS transition animations
- Responsive layout logic

## Minimum Test Matrix

- manual navigation via `moveNext` / `movePrev`
- autoplay lifecycle (start, pause on focus, resume on blur)
- `aria-live` state transitions based on interaction source
- correct `aria-hidden` mapping for visible vs hidden slides
- indicator synchronization with `activeSlideIndex`

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- touch swipe gestures (should be handled in the adapter)
- complex transition animations (CSS/JS animations are out of scope for headless)
- vertical carousels
- variable-width slides
