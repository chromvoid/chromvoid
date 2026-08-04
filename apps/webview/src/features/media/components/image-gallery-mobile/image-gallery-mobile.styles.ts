import {css} from 'lit'
import {animationStyles, spinIndicatorStyles} from 'root/shared/ui/shared-styles'

export const imageGalleryMobileStyles = [
  css`
    :host {
      display: block;
      --_media-image-gallery-mobile-viewport-translate-block: 0px;
      --_media-image-gallery-mobile-viewport-opacity: 1;
      --_media-image-gallery-mobile-image-translate-inline: 0px;
      --_media-image-gallery-mobile-image-translate-block: 0px;
      --_media-image-gallery-mobile-image-scale: 1;
      --_media-image-gallery-mobile-image-transition: transform 0.18s ease-out;
    }

    .footer {
      position: relative;
      z-index: 3;
      transition:
        opacity 0.18s ease,
        transform 0.18s ease;
    }

    .footer.hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px);
    }

    .sheet-close-button,
    .sheet-close-button::part(base) {
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .sheet-close-button {
      border: none;
      inline-size: 34px;
      block-size: 34px;
      min-inline-size: 34px;
      min-block-size: 34px;
      flex: 0 0 34px;
      border-radius: 11px;
      color: var(--media-image-gallery-sheet-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--media-image-gallery-sheet-control);
    }

    .sheet-close-button::part(base) {
      inline-size: 100%;
      block-size: 100%;
      min-inline-size: 0;
      min-block-size: 0;
    }

    .main {
      position: relative;
      inline-size: 100%;
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
      touch-action: none;
    }

    .viewport {
      position: absolute;
      inset: 0;
      transform: translate3d(0, var(--_media-image-gallery-mobile-viewport-translate-block), 0);
      opacity: var(--_media-image-gallery-mobile-viewport-opacity);
      transition:
        transform 0.18s ease,
        opacity 0.18s ease;
    }

    .footer {
      padding-inline: max(var(--app-spacing-3), var(--app-runtime-safe-area-inline-start, 0px))
        max(var(--app-spacing-3), var(--app-runtime-safe-area-inline-end, 0px));
      padding-bottom: max(var(--app-spacing-4), env(safe-area-inset-bottom));
    }

    cv-bottom-sheet {
      --cv-bottom-sheet-border-radius: var(--media-image-gallery-sheet-radius);
      --cv-bottom-sheet-body-padding: 0;
      --cv-bottom-sheet-expanded-height: var(--media-image-gallery-sheet-expanded-block-size);
      --cv-bottom-sheet-middle-height: var(--media-image-gallery-sheet-middle-block-size);
      --cv-bottom-sheet-collapsed-height: var(--media-image-gallery-sheet-collapsed-block-size);
      --cv-bottom-sheet-overlay-color: var(--media-image-gallery-sheet-overlay);
    }

    cv-bottom-sheet::part(content) {
      display: grid;
      align-content: start;
      border: 1px solid var(--media-image-gallery-sheet-border-strong);
      border-block-end: 0;
      background: var(--media-image-gallery-sheet-surface);
      box-shadow: 0 -24px 60px var(--cv-alpha-black-55);
    }

    cv-bottom-sheet::part(content):focus-visible {
      outline: none;
    }

    cv-bottom-sheet::part(handle) {
      box-sizing: border-box;
      block-size: var(--media-image-gallery-sheet-handle-block-size);
      min-block-size: var(--media-image-gallery-sheet-handle-block-size);
      max-block-size: var(--media-image-gallery-sheet-handle-block-size);
      padding-block: 10px 2px;
    }

    cv-bottom-sheet::part(grabber) {
      inline-size: 38px;
      block-size: 5px;
      background: var(--media-image-gallery-sheet-grabber);
      box-shadow: none;
    }

    cv-bottom-sheet::part(body) {
      block-size: max(
        0px,
        calc(var(--cv-bottom-sheet-detent-visible-height) - var(--media-image-gallery-sheet-handle-block-size))
      );
      max-block-size: max(
        0px,
        calc(var(--cv-bottom-sheet-detent-visible-height) - var(--media-image-gallery-sheet-handle-block-size))
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
      gap: 13px;
      padding: 10px 18px 12px;
      background: var(--media-image-gallery-sheet-surface);
    }

    .sheet-file-icon {
      flex: 0 0 46px;
      inline-size: 46px;
      block-size: 46px;
      display: grid;
      place-items: center;
      border: 1px solid var(--media-image-gallery-sheet-border-strong);
      border-radius: 13px;
      background: var(--media-image-gallery-sheet-file-icon-background);
      color: var(--media-image-gallery-sheet-file-icon-foreground);
      overflow: hidden;
    }

    .sheet-title {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 auto;
      min-inline-size: 0;
    }

    .sheet-title strong {
      color: var(--media-image-gallery-sheet-text);
      font-family: var(--cv-font-family-display, var(--cv-font-family-primary, inherit));
      font-size: 1.0625rem;
      font-weight: var(--cv-font-weight-bold, 700);
      letter-spacing: 0;
      line-height: 1.18;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheet-title-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      min-inline-size: 0;
    }

    .sheet-title-meta span {
      width: fit-content;
      max-inline-size: 100%;
      padding: 2px 7px;
      border-radius: 6px;
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
      font-family: var(--cv-font-family-code);
      font-size: 0.6875rem;
      font-weight: var(--cv-font-weight-semibold, 600);
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheet-title-meta small {
      min-inline-size: 0;
      color: var(--media-image-gallery-sheet-text-meta);
      font-family: var(--cv-font-family-code);
      font-size: 0.71875rem;
      font-weight: var(--cv-font-weight-medium, 500);
      line-height: 1.3;
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
      gap: 14px;
      padding: 0 18px;
      padding-bottom: max(26px, env(safe-area-inset-bottom));
      scrollbar-width: none;
    }

    .sheet-body::-webkit-scrollbar,
    .sheet-summary::-webkit-scrollbar {
      inline-size: 0;
      block-size: 0;
    }

    .sheet-summary {
      display: flex;
      gap: 8px;
      block-size: 32px;
      min-block-size: 32px;
      overflow-x: auto;
      padding-block-end: 2px;
      scrollbar-width: none;
    }

    .sheet-summary-chip {
      flex: 0 0 auto;
      min-block-size: 30px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding-block: 6px;
      padding-inline-start: 9px;
      padding-inline-end: 11px;
      border: 1px solid var(--media-image-gallery-sheet-border);
      border-radius: 10px;
      background: var(--media-image-gallery-sheet-card);
      color: var(--media-image-gallery-sheet-text-summary);
      font-family: var(--cv-font-family-code);
      font-size: 0.75rem;
      font-weight: var(--cv-font-weight-semibold, 600);
      line-height: 1.2;
      white-space: nowrap;
      min-inline-size: 0;
    }

    .sheet-summary-chip.primary cv-icon {
      color: var(--cv-color-primary);
    }

    .sheet-summary-chip:not(.primary) cv-icon {
      color: var(--media-image-gallery-sheet-text-meta);
    }

    .sheet-summary-chip small {
      display: none;
    }

    .sheet-summary-chip span {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sheet-section {
      display: grid;
      gap: 8px;
      padding-block-start: 2px;
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
      background: var(--media-image-gallery-share-pending-background);
      box-shadow: 0 18px 48px var(--cv-alpha-black-35);
      color: var(--media-image-gallery-overlay-foreground);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
    }

    .detail-grid {
      display: grid;
      gap: 0;
      padding: 2px 14px;
      border: 1px solid var(--media-image-gallery-sheet-border-hairline);
      border-radius: 16px;
      background: var(--media-image-gallery-sheet-card);
      overflow: hidden;
    }

    .detail-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 11px 0;
      font-size: 0.84375rem;
      line-height: 1.35;
    }

    .detail-row + .detail-row {
      border-top: 1px solid var(--media-image-gallery-sheet-divider);
    }

    .detail-label {
      color: var(--media-image-gallery-sheet-text-muted);
      font-weight: var(--cv-font-weight-semibold, 600);
      white-space: nowrap;
    }

    .detail-value {
      flex: 1 1 auto;
      min-inline-size: 0;
      color: var(--media-image-gallery-sheet-text-soft);
      font-weight: var(--cv-font-weight-bold, 700);
      overflow-wrap: anywhere;
      text-align: end;
    }

    .detail-link {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: var(--cv-color-primary);
      text-decoration: none;
    }

    .detail-link cv-icon {
      flex: 0 0 auto;
      color: currentColor;
    }

    .path-row .detail-value {
      word-break: break-word;
      overflow-wrap: anywhere;
      text-align: start;
      font-family: var(--cv-font-family-code);
      font-size: 0.71875rem;
      font-weight: var(--cv-font-weight-medium, 500);
      line-height: 1.5;
    }

    .sheet-section-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--media-image-gallery-sheet-text-muted);
      font-size: 0.75rem;
      font-weight: var(--cv-font-weight-bold, 700);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .sheet-section-label cv-icon {
      color: var(--cv-color-primary);
    }

    .location-card {
      display: grid;
      border: 1px solid var(--media-image-gallery-sheet-border-hairline);
      border-radius: 16px;
      background: var(--media-image-gallery-sheet-card);
      overflow: hidden;
    }

    .location-link {
      padding: 13px 14px 12px;
      border-bottom: 1px solid var(--media-image-gallery-sheet-divider);
    }

    .location-icon,
    .notice-icon {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      inline-size: 36px;
      block-size: 36px;
      border-radius: 11px;
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
    }

    .location-copy {
      display: grid;
      gap: 4px;
      min-inline-size: 0;
    }

    .location-copy strong {
      color: var(--media-image-gallery-sheet-text-soft);
      font-family: var(--cv-font-family-code);
      font-size: 0.8125rem;
      font-weight: var(--cv-font-weight-semibold, 600);
      overflow-wrap: anywhere;
    }

    .location-copy span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--cv-color-primary);
      font-size: 0.75rem;
      font-weight: var(--cv-font-weight-bold, 700);
    }

    .location-card .detail-row {
      padding: 11px 14px;
    }

    .sheet-notice,
    .sheet-state {
      min-block-size: 64px;
      display: flex;
      align-items: flex-start;
      gap: 13px;
      padding: 15px;
      border: 1px solid var(--media-image-gallery-sheet-notice-border);
      border-radius: 16px;
      background: var(--media-image-gallery-sheet-notice-surface);
      color: var(--media-image-gallery-sheet-text-muted-strong);
      font-size: 0.8125rem;
      font-weight: var(--cv-font-weight-medium, 500);
      line-height: 1.45;
    }

    .sheet-notice[data-tone='warning'],
    .sheet-state[data-tone='loading'] {
      border-color: var(--media-image-gallery-sheet-warning-border);
      background: var(--media-image-gallery-sheet-warning-surface);
    }

    .sheet-notice[data-tone='warning'] .notice-icon,
    .sheet-state[data-tone='loading'] .notice-icon {
      background: var(--media-image-gallery-sheet-warning-icon-surface);
      color: var(--cv-color-warning);
    }

    .sheet-notice[data-tone='danger'] {
      border-color: var(--media-image-gallery-sheet-danger-border);
      background: var(--media-image-gallery-sheet-danger-surface);
    }

    .sheet-notice[data-tone='danger'] .notice-icon {
      background: var(--media-image-gallery-sheet-danger-icon-surface);
      color: var(--cv-color-danger);
    }

    .notice-copy {
      display: grid;
      gap: 5px;
      min-inline-size: 0;
    }

    .notice-copy strong {
      color: var(--media-image-gallery-sheet-text);
      font-size: 0.9375rem;
      line-height: 1.3;
    }

    .diagnostics-details {
      display: grid;
      gap: 8px;
      padding-block-start: 4px;
    }

    .diagnostics-details summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 4px 2px 0;
      cursor: pointer;
      list-style: none;
      -webkit-tap-highlight-color: transparent;
    }

    .diagnostics-details summary::-webkit-details-marker {
      display: none;
    }

    .summary-chevron {
      color: var(--media-image-gallery-sheet-text-muted);
      transition: transform 0.18s ease;
    }

    .diagnostics-details[open] .summary-chevron {
      transform: rotate(180deg);
    }

    .diagnostics-grid {
      margin-block-start: 8px;
      background: var(--media-image-gallery-sheet-card-strong);
    }

    .diagnostics-grid .detail-label,
    .diagnostics-grid .detail-value {
      font-family: var(--cv-font-family-code);
      font-size: 0.75rem;
      font-weight: var(--cv-font-weight-semibold, 600);
    }

    .sheet-close-button:hover {
      color: var(--media-image-gallery-sheet-text);
      background: var(--cv-alpha-white-15);
    }

    .location-link:focus-visible,
    .diagnostics-details summary:focus-visible,
    .sheet-close-button:focus-visible,
    .sheet-close-button::part(base):focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: 3px;
    }

    @media (prefers-reduced-motion: reduce) {
      .summary-chevron {
        transition-duration: 0ms;
      }
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
      padding-block-start: var(--app-spacing-4);
      padding-block-end: calc(var(--app-spacing-5) + env(safe-area-inset-bottom));
      padding-inline-start: max(
        var(--app-spacing-5),
        var(--app-runtime-safe-area-inline-start, 0px)
      );
      padding-inline-end: max(
        var(--app-spacing-5),
        var(--app-runtime-safe-area-inline-end, 0px)
      );
    }

    .panel.previous,
    .panel.next {
      z-index: 1;
    }

    .panel.current {
      z-index: 2;
    }

    .image-shell {
      inline-size: 100%;
      block-size: 100%;
    }

    .image-shell.active {
      will-change: transform;
      transform-origin: center center;
      transform: translate3d(
          var(--_media-image-gallery-mobile-image-translate-inline),
          var(--_media-image-gallery-mobile-image-translate-block),
          0
        )
        scale(var(--_media-image-gallery-mobile-image-scale));
      transition: var(--_media-image-gallery-mobile-image-transition, transform 0.18s ease-out);
    }

    .gallery-image {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      object-fit: contain;
      object-position: center;
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
    flex-basis: var(--_media-image-gallery-thumbnail-before-spacer, 0px);
  }

  .thumbnail-strip::after {
    flex-basis: var(--_media-image-gallery-thumbnail-after-spacer, 0px);
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

  .thumb-button::part(label) {
    inline-size: 100%;
    block-size: 100%;
  }

  .thumb-button img {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    object-fit: contain;
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
