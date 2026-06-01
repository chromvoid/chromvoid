import {css} from 'lit'

export const audioPlayerStyles = css`
  :host {
    display: block;
  }

  adaptive-modal-surface::part(content) {
    overflow: hidden;
    border: 1px solid var(--cv-color-border-faint);
    background: var(--cv-gradient-surface-deep);
    color: var(--cv-color-text);
    box-shadow: var(--cv-shadow-xl);
  }

  adaptive-modal-surface::part(content):focus-visible {
    outline: 1px solid var(--cv-color-border-muted);
    outline-offset: -1px;
  }

  adaptive-modal-surface::part(overlay) {
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  adaptive-modal-surface::part(body) {
    overflow: hidden;
    padding: 0;
  }

  adaptive-modal-surface::part(footer) {
    display: none;
  }

  .player-sheet {
    inline-size: 100%;
    max-block-size: min(78vh, 720px);
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr);
    overflow: hidden;
    color: var(--cv-color-text);
  }

  .sheet-header {
    min-inline-size: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--app-spacing-4);
    padding: var(--app-spacing-6) var(--app-spacing-6) var(--app-spacing-4);
  }

  .track-headline {
    min-inline-size: 0;
    display: grid;
    align-items: start;
  }

  .track-meta {
    min-inline-size: 0;
    display: grid;
    gap: var(--app-spacing-1);
  }

  .track-eyebrow,
  .queue-header {
    color: var(--cv-color-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: 0.6875rem;
    font-weight: var(--cv-font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .track-title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--cv-color-text-strong);
    font-family: var(--cv-font-family-display);
    font-size: var(--cv-font-size-2xl);
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.12;
  }

  .track-file {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-sm);
    line-height: 1.25;
  }

  .seek-labels,
  .queue-count,
  .queue-index,
  .queue-duration {
    font-family: var(--cv-font-family-code);
    font-variant-numeric: tabular-nums;
  }

  .seek-labels,
  .queue-count {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }

  .icon-button,
  .fallback-button,
  .queue-row {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .icon-button {
    inline-size: 48px;
    block-size: 48px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--cv-radius-full);
    background: transparent;
    color: var(--cv-color-text-muted);
    cursor: pointer;
    transition:
      transform var(--cv-duration-fast) var(--cv-easing-standard),
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      background-color var(--cv-duration-fast) var(--cv-easing-standard),
      color var(--cv-duration-fast) var(--cv-easing-standard),
      box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .icon-button:hover {
    border-color: var(--cv-color-border-faint);
    background: var(--cv-color-surface-glass-subtle);
    color: var(--cv-color-text);
  }

  .icon-button:active {
    transform: scale(0.97);
  }

  .icon-button:focus-visible,
  .fallback-button:focus-visible,
  .queue-row:focus-visible,
  .seek-slider::part(thumb):focus-visible {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: 3px;
  }

  .icon-button:disabled {
    cursor: default;
    opacity: 0.38;
    color: var(--cv-color-text-subtle);
  }

  .icon-button.primary {
    inline-size: 72px;
    block-size: 72px;
    border-color: var(--cv-color-primary-border);
    background: var(--cv-color-primary);
    color: var(--cv-color-on-primary);
    box-shadow: 0 18px 42px var(--cv-alpha-black-35);
  }

  .icon-button.primary:hover {
    transform: translateY(-1px);
    color: var(--cv-color-on-primary);
    box-shadow: 0 20px 46px var(--cv-alpha-black-35);
  }

  .icon-button.quiet {
    inline-size: 44px;
    block-size: 44px;
    border-color: var(--cv-color-border-faint);
    background: var(--cv-color-surface-glass-subtle);
    color: var(--cv-color-text-muted);
  }

  .icon-button.stop {
    inline-size: 42px;
    block-size: 42px;
    color: var(--cv-color-text-subtle);
  }

  .seek-control {
    display: grid;
    gap: var(--app-spacing-3);
    padding: var(--app-spacing-4) var(--app-spacing-6) 0;
  }

  .seek-labels {
    display: flex;
    justify-content: space-between;
    gap: var(--app-spacing-3);
  }

  .waveform-seek {
    position: relative;
    isolation: isolate;
    --audio-waveform-edge: var(--app-spacing-4);

    min-inline-size: 0;
    block-size: 76px;
    display: grid;
    align-items: center;
    overflow: hidden;
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-glass-subtle);
  }

  .waveform-seek::before {
    position: absolute;
    inset-inline: var(--audio-waveform-edge);
    inset-block-start: 50%;
    z-index: 0;
    block-size: 1px;
    border-radius: var(--cv-radius-full);
    background: var(--cv-color-border-faint);
    content: '';
    opacity: 0.72;
  }

  .waveform-grid {
    position: absolute;
    inset: var(--app-spacing-3) var(--audio-waveform-edge);
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(96, minmax(1px, 1fr));
    align-items: center;
    gap: 1.5px;
    pointer-events: none;
  }

  .waveform-column {
    min-inline-size: 0;
    block-size: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cv-color-text-subtle);
    opacity: 0.78;
  }

  .waveform-column[data-played='true'] {
    color: var(--cv-color-primary-dark);
    opacity: 0.9;
  }

  .waveform-column[data-emphasis='soft'] {
    opacity: 0.58;
  }

  .waveform-column[data-emphasis='peak'] {
    color: var(--cv-color-text-muted);
    opacity: 0.84;
  }

  .waveform-column[data-emphasis='peak'][data-played='true'] {
    color: var(--cv-color-primary);
    opacity: 0.76;
  }

  .waveform-column[data-playhead-near='true'] {
    opacity: 0.92;
  }

  .waveform-bar {
    inline-size: min(100%, 2px);
    min-block-size: 4px;
    block-size: var(--waveform-bar-size, 6px);
    border-radius: var(--cv-radius-full);
    background: var(--cv-gradient-audio-waveform-bar), currentColor;
    opacity: 0.42;
    transform-origin: center;
    transition:
      block-size 120ms var(--cv-easing-standard),
      opacity 120ms var(--cv-easing-standard),
      transform 120ms var(--cv-easing-standard);
  }

  .waveform-column[data-played='true'] .waveform-bar {
    opacity: 0.68;
  }

  .waveform-seek[data-preparing='true'] .waveform-grid {
    animation: audio-waveform-preparing 1.7s var(--cv-easing-standard) infinite;
  }

  .waveform-column[data-level='0'] {
    --waveform-bar-size: 4px;
  }

  .waveform-column[data-level='1'] {
    --waveform-bar-size: 6px;
  }

  .waveform-column[data-level='2'] {
    --waveform-bar-size: 8px;
  }

  .waveform-column[data-level='3'] {
    --waveform-bar-size: 10px;
  }

  .waveform-column[data-level='4'] {
    --waveform-bar-size: 14px;
  }

  .waveform-column[data-level='5'] {
    --waveform-bar-size: 18px;
  }

  .waveform-column[data-level='6'] {
    --waveform-bar-size: 22px;
  }

  .waveform-column[data-level='7'] {
    --waveform-bar-size: 26px;
  }

  .waveform-column[data-level='8'] {
    --waveform-bar-size: 30px;
  }

  .waveform-column[data-level='9'] {
    --waveform-bar-size: 34px;
  }

  .waveform-column[data-level='10'] {
    --waveform-bar-size: 38px;
  }

  .waveform-column[data-level='11'] {
    --waveform-bar-size: 42px;
  }

  .waveform-column[data-level='12'] {
    --waveform-bar-size: 46px;
  }

  .seek-slider {
    position: relative;
    z-index: 2;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 100%;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .seek-slider::part(base) {
    inline-size: calc(100% - var(--audio-waveform-edge) - var(--audio-waveform-edge));
    block-size: 100%;
    margin-inline: auto;
  }

  .seek-slider::part(track) {
    block-size: 100%;
    border: 0;
    background: transparent;
  }

  .seek-slider::part(range) {
    background: transparent;
  }

  .seek-slider::part(thumb) {
    overflow: visible;
    inline-size: 2px;
    block-size: 52px;
    border: 0;
    border-radius: var(--cv-radius-full);
    background: var(--cv-color-cyan-light);
    box-shadow: 0 0 0 2px var(--cv-color-primary-ring);
  }

  .seek-slider::part(thumb)::before {
    position: absolute;
    inset-block-start: -7px;
    inset-inline-start: 50%;
    inline-size: 10px;
    block-size: 10px;
    border-radius: var(--cv-radius-full);
    background: var(--cv-color-cyan-light);
    box-shadow: 0 0 0 3px var(--cv-color-primary-ring);
    content: '';
    transform: translateX(-50%);
  }

  .seek-slider[disabled] {
    cursor: default;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--app-spacing-5);
    padding: var(--app-spacing-5) var(--app-spacing-6) var(--app-spacing-6);
  }

  .native-preparing-status {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--app-spacing-3);
    margin: 0 var(--app-spacing-6) var(--app-spacing-2);
    padding: var(--app-spacing-3);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-primary-surface);
    color: var(--cv-color-text);
  }

  .native-preparing-icon {
    inline-size: 34px;
    block-size: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-secondary-glass);
    color: var(--cv-color-primary);
  }

  .native-preparing-icon cv-icon {
    animation: audio-preparing-spin 900ms linear infinite;
  }

  .native-preparing-copy {
    min-inline-size: 0;
    display: grid;
    gap: 2px;
  }

  .native-preparing-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
  }

  .native-preparing-detail {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.4;
  }

  .fallback-limited {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--app-spacing-3);
    margin: var(--app-spacing-2) var(--app-spacing-6) var(--app-spacing-6);
    padding: var(--app-spacing-4);
    border: 1px solid var(--cv-color-warning-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-secondary-glass);
  }

  .fallback-icon {
    inline-size: 46px;
    block-size: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-warning-surface);
    color: var(--cv-color-warning);
  }

  .fallback-copy-block {
    min-inline-size: 0;
    display: grid;
    gap: var(--app-spacing-1);
  }

  .fallback-title {
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-base);
    font-weight: var(--cv-font-weight-semibold);
  }

  .fallback-copy {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.55;
  }

  .fallback-actions {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-spacing-2);
  }

  .fallback-button {
    min-block-size: 42px;
    display: inline-flex;
    align-items: center;
    gap: var(--app-spacing-2);
    padding-inline: var(--app-spacing-3);
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-glass-subtle);
    color: var(--cv-color-text);
    cursor: pointer;
  }

  .fallback-button:hover {
    border-color: var(--cv-color-primary-border);
    color: var(--cv-color-primary);
  }

  .queue {
    min-block-size: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--app-spacing-3);
    padding: 0 var(--app-spacing-6) max(var(--app-spacing-6), env(safe-area-inset-bottom, 0px));
    overflow: hidden;
  }

  .queue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--app-spacing-3);
  }

  .queue-count {
    color: var(--cv-color-text-muted);
  }

  .queue-list {
    min-block-size: 0;
    overflow: auto;
    display: grid;
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-4);
    background: var(--cv-color-surface-glass-subtle);
  }

  .queue-row {
    position: relative;
    inline-size: 100%;
    min-block-size: 54px;
    display: grid;
    align-items: center;
    gap: var(--app-spacing-2);
    padding: 0 var(--app-spacing-4);
    border: 0;
    border-block-end: 1px solid var(--cv-color-border-faint);
    border-radius: 0;
    background: transparent;
    color: var(--cv-color-text-muted);
    text-align: start;
    cursor: pointer;
    transition:
      background-color var(--cv-duration-fast) var(--cv-easing-standard),
      color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .queue-row:last-child {
    border-block-end: 0;
  }

  .queue-row::before {
    position: absolute;
    inset-block: var(--app-spacing-3);
    inset-inline-start: 0;
    inline-size: 3px;
    border-radius: 0 var(--cv-radius-full) var(--cv-radius-full) 0;
    background: var(--cv-color-primary);
    content: '';
    opacity: 0;
    transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .queue-row::part(base) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    justify-content: stretch;
    text-align: start;
  }

  .queue-row::part(prefix),
  .queue-row::part(label),
  .queue-row::part(suffix) {
    min-inline-size: 0;
  }

  .queue-row::part(prefix),
  .queue-row::part(suffix) {
    justify-content: flex-start;
  }

  .queue-row::part(label) {
    justify-content: flex-start;
    overflow: hidden;
  }

  .queue-row:hover {
    background: var(--cv-color-surface-glass-subtle);
    color: var(--cv-color-text);
  }

  .queue-row.active {
    background: var(--cv-color-primary-surface);
    color: var(--cv-color-text);
  }

  .queue-row.active::before {
    opacity: 1;
  }

  .queue-prefix {
    display: inline-flex;
    align-items: center;
    gap: var(--app-spacing-2);
  }

  .queue-equalizer {
    inline-size: 18px;
    block-size: 18px;
    display: inline-flex;
    align-items: end;
    justify-content: center;
    gap: 3px;
    color: var(--cv-color-primary);
    opacity: 0;
  }

  .queue-row.active .queue-equalizer {
    opacity: 1;
  }

  .queue-equalizer span {
    inline-size: 3px;
    block-size: 9px;
    border-radius: var(--cv-radius-full);
    background: currentColor;
    opacity: 0.86;
  }

  .queue-equalizer span:nth-child(2) {
    block-size: 15px;
  }

  .queue-equalizer span:nth-child(3) {
    block-size: 11px;
  }

  .queue-index {
    inline-size: 4ch;
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-sm);
  }

  .queue-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
    font-size: var(--cv-font-size-sm);
    line-height: 1.35;
  }

  .queue-duration {
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-sm);
  }

  .queue-row.active .queue-index,
  .queue-row.active .queue-duration {
    color: var(--cv-color-primary);
  }

  @media (min-width: 720px) {
    .player-sheet {
      max-block-size: min(720px, calc(100vh - 32px));
    }
  }

  @media (max-width: 420px) {
    .waveform-seek {
      --audio-waveform-edge: var(--app-spacing-3);
    }

    .sheet-header {
      gap: var(--app-spacing-3);
      padding-inline: var(--app-spacing-4);
    }

    .track-title {
      font-size: var(--cv-font-size-xl);
    }

    .seek-control,
    .controls,
    .queue {
      padding-inline: var(--app-spacing-4);
    }

    .controls {
      gap: var(--app-spacing-3);
    }

    .waveform-grid {
      gap: 1.5px;
    }
  }

  @media (hover: none) and (pointer: coarse) {
    adaptive-modal-surface::part(overlay) {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-button,
    .waveform-bar,
    .queue-row,
    .queue-row::before {
      transition: none;
    }

    .waveform-seek[data-preparing='true'] .waveform-grid,
    .native-preparing-icon cv-icon {
      animation: none;
    }

    .icon-button.primary:hover {
      transform: none;
    }
  }

  @keyframes audio-waveform-preparing {
    0%,
    100% {
      opacity: 0.48;
    }

    50% {
      opacity: 0.78;
    }
  }

  @keyframes audio-preparing-spin {
    to {
      transform: rotate(360deg);
    }
  }
`
