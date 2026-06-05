import {css} from 'lit'

export const pmEntryTagsStyles = css`
  .entry-tags-editor {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .entry-tags-combobox {
    inline-size: 100%;
    --cv-combobox-min-width: 100%;
  }

  .entry-tags-combobox::part(input-wrapper) {
    border-color: var(--cv-color-border);
    background: var(--cv-color-surface-2);
  }

  .entry-tags-combobox:focus-within::part(input-wrapper) {
    border-color: var(--cv-color-primary-border-strong);
    box-shadow: 0 0 0 1px var(--cv-color-primary-ring);
  }

  .entry-tags-combobox::part(input) {
    min-block-size: 34px;
    font-size: var(--cv-font-size-sm);
  }

  .entry-tags-combobox::part(trigger) {
    min-block-size: 34px;
    min-inline-size: 0;
    font-size: var(--cv-font-size-sm);
  }

  .entry-tags-combobox::part(label) {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--cv-color-text-muted);
  }

  .entry-tags-combobox::part(tag) {
    border: 1px solid var(--cv-color-border);
    background: var(--cv-color-surface-3);
    color: var(--cv-color-text-muted);
  }

  .entry-tags-combobox::part(tag-label) {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entry-tags-combobox::part(listbox) {
    max-block-size: min(260px, 48vh);
  }

  .entry-tags-picker {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--cv-space-2);
    align-items: stretch;
    min-inline-size: 0;
  }

  .entry-tags-manage {
    inline-size: 40px;
    min-block-size: 34px;
  }

  .entry-tags-manage::part(base) {
    min-block-size: 34px;
    padding-inline: 0;
  }

  .entry-tags-readonly {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .entry-tags-empty {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }

  .entry-tags-chip {
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  @container (width < 360px) {
    .entry-tags-picker {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }
`
