import {css} from 'lit'

export const fileItemResponsiveStyles = css`
  :host([view-mode='list']) .swipe-container {
    block-size: calc(100% - 4px);
    margin-block: 2px;
  }

  :host([view-mode='list']) .swipe-container > .file-item {
    block-size: 100%;
    margin-block: 0;
  }

  .swipe-container {
    position: relative;
    overflow: hidden;
    border-radius: inherit;
    isolation: isolate;
  }

  .swipe-container > .file-item {
    --_file-item-swipe-offset: 0px;
    position: relative;
    z-index: 1;
    inline-size: 100%;
    touch-action: pan-y;
    transform: translate3d(var(--_file-item-swipe-offset), 0, 0);
    will-change: transform;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .swipe-container > .file-item .thumbnail-shell,
  .swipe-container > .file-item .info,
  .swipe-container > .file-item .file-type {
    transform: translateZ(0);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .swipe-actions-left,
  .swipe-actions-right {
    position: absolute;
    inset-block: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 64px;
    border-radius: 16px;
    visibility: hidden;
    pointer-events: none;
  }

  .swipe-container.swipe-right .swipe-actions-left,
  .swipe-container.swipe-left .swipe-actions-right {
    visibility: visible;
    pointer-events: auto;
  }

  .swipe-actions-left {
    inset-inline-start: 0;
    background: linear-gradient(
      90deg,
      var(--cv-color-primary-surface-strong) 0%,
      var(--cv-color-primary-surface) 100%
    );
  }

  .swipe-actions-right {
    inset-inline-end: 0;
    background: linear-gradient(
      270deg,
      var(--cv-color-danger-surface-strong) 0%,
      var(--cv-color-danger-surface) 100%
    );
  }

  .swipe-action {
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    background: var(--cv-alpha-black-14);
    border: 1px solid var(--cv-alpha-white-20);
    border-radius: var(--cv-radius-2);
    padding: 6px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .swipe-action cv-icon {
    font-size: 18px;
  }

  .file-item.swiping {
    transition: none;
  }

  .file-item.snap-back {
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
`
