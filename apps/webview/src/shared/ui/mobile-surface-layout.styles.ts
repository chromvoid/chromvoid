import {css} from 'lit'

export const mobileSurfaceLayoutFlexFillStyles = css`
  mobile-surface-layout {
    flex: 1 1 auto;
    min-block-size: 0;
  }
`

export const mobileSurfaceLayoutBlockFillStyles = css`
  mobile-surface-layout {
    block-size: 100%;
    min-block-size: 0;
  }
`

export const mobileSurfaceLayoutStyles = css`
  :host {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    overflow: hidden;
    gap: var(--app-mobile-surface-gap);
    padding-block-start: var(--app-mobile-surface-gutter-block-start);
    padding-block-end: var(--app-mobile-surface-gutter-block-end);
    padding-inline: var(--app-mobile-surface-gutter-inline);
  }

  :host([hidden]) {
    display: none;
  }

  :host([variant='flush']) {
    gap: 0;
    padding: 0;
  }

  :host([variant='nested']) {
    padding: 0;
  }

  .header,
  .footer {
    flex: 0 0 auto;
    min-inline-size: 0;
  }

  .content,
  .scroll {
    flex: 1 1 auto;
    min-block-size: 0;
    min-inline-size: 0;
  }

  .content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .scroll {
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    scroll-padding-block-start: var(--app-mobile-surface-scroll-padding-block-start);
    scroll-padding-block-end: var(--app-mobile-surface-scroll-padding-block-end);
  }

  slot:not([name]) {
    display: contents;
  }
`
