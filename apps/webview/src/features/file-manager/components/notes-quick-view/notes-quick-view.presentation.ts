import {getLang, i18n} from 'root/i18n'
import type {
  NotesQuickViewDisplayMode,
  NotesQuickViewSortMode,
  NotesQuickViewSummary,
} from './notes-quick-view.model'

export function getNotesQuickViewSortLabel(sortMode: NotesQuickViewSortMode): string {
  if (sortMode === 'recent') return i18n('notes:quick_view:sort:recent' as never)
  if (sortMode === 'size') return i18n('notes:quick_view:sort:size' as never)
  return i18n('notes:quick_view:sort:name' as never)
}

export function getNotesQuickViewDisplayModeLabel(displayMode: NotesQuickViewDisplayMode): string {
  return i18n(`notes:quick_view:view_mode:${displayMode}` as never)
}

export function formatNotesQuickViewSummary(total: number, visible: number): NotesQuickViewSummary {
  if (total !== visible) {
    return {
      total,
      visible,
      label: i18n('notes:quick_view:summary:filtered_count' as never, {
        visible: String(visible),
        total: String(total),
      }),
    }
  }

  const category = new Intl.PluralRules(getLang()).select(visible)
  const countKey =
    category === 'one'
      ? 'notes:quick_view:summary:count:one'
      : category === 'two' || category === 'few'
        ? 'notes:quick_view:summary:count:few'
        : 'notes:quick_view:summary:count'

  return {
    total,
    visible,
    label: i18n(countKey as never, {count: String(visible)}),
  }
}
