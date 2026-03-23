import {css} from 'lit'

/**
 * Общие стили для списков (ul, li)
 */
export const listItemsCSS = css`
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  li {
    border-radius: var(--cv-radius-2);
  }
`

/**
 * Стили для папки в списке групп
 */
export const folderItemCSS = css`
  li.group {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--cv-space-2);
    padding: 10px;
    background: var(--cv-color-surface-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    cursor: pointer;
  }

  li.group:hover {
    background: var(--cv-color-primary-subtle);
    border-color: var(--cv-color-primary);
    transform: translateY(-1px);
    box-shadow: var(--cv-shadow-1);
  }

  li.group cv-icon {
    color: var(--cv-color-primary);
    width: 24px;
    height: 24px;
    padding: 4px;
    box-sizing: content-box;
    background: color-mix(in oklch, var(--cv-color-primary) 12%, transparent);
    border-radius: var(--cv-radius-1);
  }

  li.group div {
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @container (width < 480px) {
    li.group {
      padding: calc(var(--cv-space-2) * 0.75) var(--cv-space-2);
    }
  }
`

/**
 * Стили для пустого состояния
 */
export const emptyStateCSS = css`
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--cv-space-3);
    padding: var(--cv-space-7) var(--cv-space-4);
    text-align: center;
    color: var(--cv-color-text-muted);
    background: color-mix(in oklch, var(--cv-color-surface-2) 50%, transparent);
    border: 2px dashed var(--cv-color-border);
    border-radius: var(--cv-radius-3);
  }

  .empty::before {
    content: '';
    display: block;
    width: 48px;
    height: 48px;
    background: var(--cv-color-border);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'%3E%3Cpath d='M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'/%3E%3C/svg%3E")
      center / contain no-repeat;
    opacity: 0.5;
  }
`
