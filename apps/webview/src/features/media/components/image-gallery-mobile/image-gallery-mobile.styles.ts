import {css} from 'lit'
import {animationStyles, spinIndicatorStyles} from 'root/shared/ui/shared-styles'

export const imageGalleryMobileStyles = [
  animationStyles,
  css`
    :host {
      display: block;
      --image-gallery-mobile-viewport-translate-y: 0px;
      --image-gallery-mobile-viewport-opacity: 1;
      --image-gallery-mobile-image-translate-x: 0px;
      --image-gallery-mobile-image-translate-y: 0px;
      --image-gallery-mobile-image-scale: 1;
      --image-gallery-mobile-image-transition: transform 0.18s ease-out;
    }

    .overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: var(--cv-alpha-black-95);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: fadeIn 0.2s ease-out;
    }

    .header,
    .footer {
      position: relative;
      z-index: 3;
      transition:
        opacity 0.18s ease,
        transform 0.18s ease;
    }

    .header.hidden,
    .footer.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .header.hidden {
      transform: translateY(-8px);
    }

    .footer.hidden {
      transform: translateY(8px);
    }

    .header {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--app-spacing-2);
      isolation: isolate;
      padding: var(--app-spacing-3);
      padding-top: max(var(--app-spacing-3), var(--safe-area-top, 0px));
      padding-left: max(var(--app-spacing-3), env(safe-area-inset-left));
      padding-right: max(var(--app-spacing-3), env(safe-area-inset-right));
      color: white;
    }

    .header::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: linear-gradient(
        180deg,
        var(--cv-alpha-black-65) 0%,
        var(--cv-alpha-black-35) 68%,
        transparent 100%
      );
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .header > * {
      position: relative;
      z-index: 1;
    }

    .header-copy {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 0;
      overflow: hidden;
      padding-inline: var(--app-spacing-1);
      text-align: center;
    }

    .title {
      display: inline-flex;
      align-items: baseline;
      max-inline-size: 100%;
      min-inline-size: 0;
      font-size: var(--cv-font-size-base);
      font-weight: var(--cv-font-weight-semibold);
      line-height: 1.2;
      color: white;
    }

    .title-stem {
      min-inline-size: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .title-extension {
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .counter {
      color: var(--cv-alpha-white-70);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-medium);
      line-height: 1;
    }

    .header-actions {
      display: inline-flex;
      align-items: center;
      justify-self: end;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--cv-alpha-white-8);
      border-radius: var(--cv-radius-2);
      background: var(--cv-alpha-black-25);
      box-shadow: inset 0 1px 0 var(--cv-alpha-white-6);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    .close-button,
    .header-action-button,
    .header-menu-button,
    .sheet-close-button,
    .thumb-button {
      border: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .close-button,
    .header-action-button,
    .sheet-close-button {
      inline-size: 44px;
      block-size: 44px;
      min-inline-size: 44px;
      min-block-size: 44px;
      flex: 0 0 44px;
      border-radius: var(--cv-radius-s);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-button::part(base),
    .header-action-button::part(base),
    .sheet-close-button::part(base) {
      inline-size: 100%;
      block-size: 100%;
      min-inline-size: 0;
      min-block-size: 0;
    }

    .close-button {
      justify-self: start;
      border: 1px solid var(--cv-alpha-white-10);
      background: var(--cv-alpha-black-35);
      box-shadow: inset 0 1px 0 var(--cv-alpha-white-8);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transition:
        background 0.16s ease,
        border-color 0.16s ease,
        transform 0.16s ease;
    }

    .header-action-button {
      background: transparent;
      transition:
        background 0.16s ease,
        color 0.16s ease;
    }

    .sheet-close-button {
      background: var(--cv-alpha-white-15);
    }

    .close-button:hover,
    .header-action-button:hover {
      background: var(--cv-alpha-white-10);
    }

    .close-button:active,
    .header-action-button:active {
      transform: translateY(1px);
    }

    .close-button::part(base):focus-visible,
    .header-action-button::part(base):focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: 2px;
    }

    .header-menu-button {
      --cv-menu-button-min-height: 44px;
      --cv-menu-button-icon-overflow-menu-offset: 6px;
      --cv-menu-button-icon-overflow-menu-min-inline-size: 220px;
      --cv-menu-button-menu-z-index: 1005;
      inline-size: 44px;
      block-size: 44px;
      min-inline-size: 44px;
      min-block-size: 44px;
      flex: 0 0 44px;
      color: white;
      transition: color 0.16s ease;
    }

    .header-menu-button::part(trigger) {
      inline-size: 44px;
      block-size: 44px;
      min-inline-size: 44px;
      min-block-size: 44px;
      padding: 0;
      border: none;
      border-radius: var(--cv-radius-s);
      background: transparent;
      color: white;
      transition: background 0.16s ease;
    }

    .header-menu-button::part(trigger):hover,
    .header-menu-button::part(trigger):active {
      background: var(--cv-alpha-white-10);
    }

    .header-menu-button::part(trigger):focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: 2px;
    }

    .header-menu-button::part(label),
    .header-menu-button::part(dropdown-icon) {
      display: none;
    }

    .header-menu-button::part(menu) {
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-3);
      background: var(--cv-color-surface-elevated);
      box-shadow: 0 18px 48px var(--cv-alpha-black-45);
    }

    .header-menu-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .header-menu-item.danger::part(base),
    .header-menu-item.danger cv-icon {
      color: var(--cv-color-danger);
    }

    .header-action-button:disabled {
      opacity: 0.78;
      cursor: default;
    }

    .main {
      position: relative;
      flex: 1;
      overflow: hidden;
      touch-action: none;
    }

    .viewport {
      position: absolute;
      inset: 0;
      transform: translate3d(0, var(--image-gallery-mobile-viewport-translate-y), 0);
      opacity: var(--image-gallery-mobile-viewport-opacity);
      transition:
        transform 0.18s ease,
        opacity 0.18s ease;
    }

    .footer {
      padding-inline: max(var(--app-spacing-3), env(safe-area-inset-left))
        max(var(--app-spacing-3), env(safe-area-inset-right));
      padding-bottom: max(var(--app-spacing-4), env(safe-area-inset-bottom));
    }

    cv-bottom-sheet {
      --image-gallery-sheet-surface: #0d141f;
      --image-gallery-sheet-surface-raised: #121c2a;
      --image-gallery-sheet-surface-soft: rgba(18, 28, 42, 0.82);
      --image-gallery-sheet-border: rgba(142, 169, 208, 0.18);
      --image-gallery-sheet-border-strong: rgba(0, 229, 255, 0.28);
      --image-gallery-sheet-text: #eef5ff;
      --image-gallery-sheet-muted: rgba(238, 245, 255, 0.66);
      --image-gallery-sheet-handle-block-size: 28px;
    }

    cv-bottom-sheet::part(content) {
      display: grid;
      align-content: start;
      border: 1px solid var(--image-gallery-sheet-border-strong);
      border-block-end: 0;
      background:
        radial-gradient(120% 78px at 50% 0, var(--cv-alpha-white-10), transparent 68%),
        linear-gradient(180deg, #162235 0%, var(--image-gallery-sheet-surface) 120px),
        var(--image-gallery-sheet-surface);
      box-shadow:
        0 -28px 74px var(--cv-alpha-black-55),
        0 -1px 0 var(--cv-alpha-white-8) inset;
    }

    cv-bottom-sheet::part(handle) {
      box-sizing: border-box;
      block-size: var(--image-gallery-sheet-handle-block-size);
      min-block-size: var(--image-gallery-sheet-handle-block-size);
      max-block-size: var(--image-gallery-sheet-handle-block-size);
      padding-block: 11px 4px;
    }

    cv-bottom-sheet::part(grabber) {
      inline-size: 46px;
      block-size: 5px;
      box-shadow: 0 0 16px var(--cv-color-primary-ring);
    }

    cv-bottom-sheet::part(body) {
      block-size: max(
        0px,
        calc(var(--cv-bottom-sheet-detent-visible-height) - var(--image-gallery-sheet-handle-block-size))
      );
      max-block-size: max(
        0px,
        calc(var(--cv-bottom-sheet-detent-visible-height) - var(--image-gallery-sheet-handle-block-size))
      );
      min-block-size: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
    }

    .info-sheet-content {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
    }

    .sheet-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-2) var(--app-spacing-4) var(--app-spacing-3);
      background:
        linear-gradient(180deg, rgba(22, 34, 53, 0.98), rgba(13, 20, 31, 0.96)),
        var(--image-gallery-sheet-surface);
      border-bottom: 1px solid var(--image-gallery-sheet-border);
      box-shadow: 0 1px 0 var(--cv-alpha-white-6) inset;
    }

    .sheet-title {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }

    .sheet-title strong {
      color: var(--image-gallery-sheet-text);
      font-family: var(--cv-font-family-display, var(--cv-font-family-primary, inherit));
      font-size: clamp(1rem, 4.3vw, 1.18rem);
      line-height: 1.12;
      overflow-wrap: anywhere;
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .sheet-title span {
      width: fit-content;
      max-inline-size: 100%;
      padding: 3px 8px;
      border: 1px solid var(--cv-color-primary-border);
      border-radius: 999px;
      background: var(--cv-color-primary-surface);
      color: var(--image-gallery-sheet-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.15;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheet-body {
      min-block-size: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      display: grid;
      align-content: start;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-3) var(--app-spacing-4);
      padding-bottom: max(var(--app-spacing-5), env(safe-area-inset-bottom));
      scrollbar-gutter: stable;
    }

    .sheet-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--app-spacing-2);
    }

    .sheet-summary-tile {
      min-block-size: 64px;
      display: grid;
      align-content: space-between;
      gap: 6px;
      padding: 10px 12px;
      border: 1px solid var(--cv-color-border-faint);
      border-radius: var(--cv-radius-3);
      background:
        linear-gradient(180deg, var(--cv-alpha-white-6), transparent), var(--image-gallery-sheet-surface-soft);
      box-shadow: 0 1px 0 var(--cv-alpha-white-6) inset;
      min-inline-size: 0;
    }

    .sheet-summary-tile.primary {
      border-color: var(--cv-color-primary-border);
      background:
        linear-gradient(
          180deg,
          var(--cv-color-primary-surface),
          transparent
        ),
        var(--image-gallery-sheet-surface-soft);
    }

    .sheet-summary-tile.wide {
      grid-column: 1 / -1;
    }

    .sheet-summary-tile span {
      color: var(--image-gallery-sheet-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
    }

    .sheet-summary-tile strong {
      min-inline-size: 0;
      color: var(--image-gallery-sheet-text);
      font-size: var(--cv-font-size-sm);
      line-height: 1.22;
      overflow-wrap: anywhere;
    }

    .sheet-section {
      display: grid;
      gap: var(--app-spacing-2);
      padding-block-start: var(--app-spacing-1);
    }

    .share-pending-overlay {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      place-items: center;
      padding: var(--app-spacing-4);
      background: var(--cv-alpha-black-45);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    .share-pending-status {
      display: inline-flex;
      align-items: center;
      gap: var(--app-spacing-3);
      max-inline-size: min(320px, 100%);
      padding: var(--app-spacing-3) var(--app-spacing-4);
      border-radius: var(--cv-radius-3);
      border: 1px solid var(--cv-alpha-white-16);
      background: linear-gradient(180deg, var(--cv-alpha-white-10), transparent), var(--cv-alpha-black-75);
      box-shadow: 0 18px 48px var(--cv-alpha-black-35);
      color: var(--cv-color-text-inverse, #fff);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
    }

    .detail-grid {
      display: grid;
      gap: 0;
      border: 1px solid var(--image-gallery-sheet-border);
      border-radius: var(--cv-radius-3);
      background: rgba(18, 28, 42, 0.62);
      overflow: hidden;
    }

    .detail-row {
      display: grid;
      grid-template-columns: minmax(88px, 30%) minmax(0, 1fr);
      gap: var(--app-spacing-3);
      padding: 10px 12px;
      font-size: var(--cv-font-size-sm);
      line-height: 1.35;
    }

    .detail-row + .detail-row {
      border-top: 1px solid var(--image-gallery-sheet-border);
    }

    .detail-label {
      color: var(--image-gallery-sheet-muted);
      font-weight: var(--cv-font-weight-medium);
    }

    .detail-value {
      color: var(--image-gallery-sheet-text);
      overflow-wrap: anywhere;
      text-align: end;
    }

    .detail-link {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      color: var(--cv-color-primary);
      text-decoration: none;
    }

    .detail-link cv-icon {
      flex: 0 0 auto;
      color: currentColor;
    }

    .gps-warning-row .detail-value {
      color: var(--cv-color-warning, #f2b705);
      text-align: start;
    }

    .path-row .detail-value {
      word-break: break-word;
      overflow-wrap: anywhere;
      text-align: start;
    }

    .sheet-section-label {
      color: var(--image-gallery-sheet-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .sheet-state {
      min-block-size: 44px;
      display: flex;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--image-gallery-sheet-border);
      border-radius: var(--cv-radius-3);
      background: rgba(18, 28, 42, 0.62);
      color: var(--image-gallery-sheet-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.4;
    }
  `,
]

export const imageGalleryMobileTrackStyles = [
  animationStyles,
  spinIndicatorStyles,
  css`
    :host {
      display: block;
      block-size: 100%;
    }

    .track {
      display: flex;
      width: 300%;
      height: 100%;
      transform: translateX(-33.333%);
      will-change: transform;
    }

    .track.settling {
      transition: transform 0.28s ease-out;
    }

    .panel {
      position: relative;
      width: 33.333%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      padding: var(--app-spacing-4) max(var(--app-spacing-5), env(safe-area-inset-left))
        calc(var(--app-spacing-5) + env(safe-area-inset-bottom))
        max(var(--app-spacing-5), env(safe-area-inset-right));
    }

    .panel.previous,
    .panel.next {
      z-index: 1;
    }

    .panel.current {
      z-index: 2;
    }

    .image-shell {
      display: flex;
      align-items: center;
      justify-content: center;
      max-inline-size: 100%;
      max-block-size: 100%;
    }

    .image-shell.active {
      will-change: transform;
      transform-origin: center center;
      transform: translate3d(
          var(--image-gallery-mobile-image-translate-x),
          var(--image-gallery-mobile-image-translate-y),
          0
        )
        scale(var(--image-gallery-mobile-image-scale));
      transition: var(--image-gallery-mobile-image-transition, transform 0.18s ease-out);
    }

    .gallery-image {
      max-inline-size: 100%;
      max-block-size: 100%;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: none;
    }

    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--cv-alpha-white-30);
      border-top-color: white;
      border-radius: 50%;
    }

    .panel-error {
      max-inline-size: min(72vw, 360px);
      color: var(--cv-alpha-white-70);
      font-size: var(--cv-font-size-sm);
      line-height: 1.4;
      text-align: center;
    }
  `,
]

export const imageGalleryMobileThumbnailStripStyles = css`
  :host {
    display: block;
  }

  .thumbnail-strip {
    display: flex;
    justify-content: flex-start;
    gap: var(--app-spacing-2);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding: var(--app-spacing-3) 0;
    scrollbar-width: none;
  }

  .thumbnail-strip::-webkit-scrollbar {
    display: none;
  }

  .thumbnail-strip::before,
  .thumbnail-strip::after {
    content: '';
    display: block;
    block-size: 1px;
    flex: 0 0 0;
  }

  .thumbnail-strip::before {
    flex-basis: var(--thumbnail-before-spacer, 0px);
  }

  .thumbnail-strip::after {
    flex-basis: var(--thumbnail-after-spacer, 0px);
  }

  .thumb-button {
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    inline-size: 56px;
    block-size: 56px;
    border-radius: var(--cv-radius-3);
    padding: 0;
    flex: 0 0 auto;
    overflow: hidden;
    background: var(--cv-alpha-white-10);
    border: 1px solid var(--cv-alpha-white-12);
    position: relative;
    opacity: 0.86;
    transform: translateY(0) scale(1);
    transition:
      border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      box-shadow var(--cv-duration-fast, 120ms) var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      opacity var(--cv-duration-fast, 120ms) var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
      transform var(--cv-duration-normal, 250ms) var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1));
  }

  .thumb-button.active {
    border-color: white;
    box-shadow: 0 0 0 1px white;
    opacity: 1;
    transform: translateY(-2px) scale(1.04);
  }

  .thumb-button img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    pointer-events: none;
    transition: opacity var(--cv-duration-fast, 120ms) var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }

  .thumb-placeholder {
    inline-size: 100%;
    block-size: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cv-alpha-white-55);
    font-size: var(--cv-font-size-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb-button,
    .thumb-button img {
      transition: none;
    }

    .thumb-button.active {
      transform: none;
    }
  }
`
