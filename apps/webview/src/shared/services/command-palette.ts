export type CommandPaletteMode = 'all' | 'filters' | 'search'

export type CommandPaletteSource = 'mobile-toolbar' | 'mobile-tab' | 'fab' | 'keyboard' | 'rail'

export type CommandPaletteOpenDetail = {
  mode?: CommandPaletteMode
  source?: CommandPaletteSource
}

export function openCommandPalette(detail: CommandPaletteOpenDetail = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<CommandPaletteOpenDetail>('command-bar:open', {
      detail,
      bubbles: true,
      composed: true,
    }),
  )
}
