import {css} from 'lit'

export const credentialTagColorStyles = css`
  .entry-badge[data-family='meta'][data-tag-color-id='violet'],
  .entry-tags-chip[data-tag-color-id='violet']::part(base) {
    border-color: var(--pm-tag-violet-border);
    background: var(--pm-tag-violet-surface);
    color: var(--pm-tag-violet);
  }

  .entry-badge[data-family='meta'][data-tag-color-id='green'],
  .entry-tags-chip[data-tag-color-id='green']::part(base) {
    border-color: var(--pm-tag-green-border);
    background: var(--pm-tag-green-surface);
    color: var(--pm-tag-green);
  }

  .entry-badge[data-family='meta'][data-tag-color-id='blue'],
  .entry-tags-chip[data-tag-color-id='blue']::part(base) {
    border-color: var(--pm-tag-blue-border);
    background: var(--pm-tag-blue-surface);
    color: var(--pm-tag-blue);
  }

  .entry-badge[data-family='meta'][data-tag-color-id='pink'],
  .entry-tags-chip[data-tag-color-id='pink']::part(base) {
    border-color: var(--pm-tag-pink-border);
    background: var(--pm-tag-pink-surface);
    color: var(--pm-tag-pink);
  }

  .entry-badge[data-family='meta'][data-tag-color-id='amber'],
  .entry-tags-chip[data-tag-color-id='amber']::part(base) {
    border-color: var(--pm-tag-amber-border);
    background: var(--pm-tag-amber-surface);
    color: var(--pm-tag-amber);
  }

  .entry-badge[data-family='meta'][data-tag-color-id='orange'],
  .entry-tags-chip[data-tag-color-id='orange']::part(base) {
    border-color: var(--pm-tag-orange-border);
    background: var(--pm-tag-orange-surface);
    color: var(--pm-tag-orange);
  }

  .entry-badge[data-family='meta'][data-tag-color-id='cyan'],
  .entry-tags-chip[data-tag-color-id='cyan']::part(base) {
    border-color: var(--pm-tag-cyan-border);
    background: var(--pm-tag-cyan-surface);
    color: var(--pm-tag-cyan);
  }
`
