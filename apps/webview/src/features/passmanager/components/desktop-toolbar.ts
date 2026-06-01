import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

export type PMDesktopToolbarActionSpec<TAction extends string = string> = {
  id: TAction
  icon: string
  label: string
  disabled?: boolean
  danger?: boolean
  iconOnly?: boolean
  appearance?: 'default' | 'ghost'
}

type PMDesktopToolbarRenderOptions = {
  itemClass: string
  contentClass: string
  labelClass?: string
  iconClass?: string
  dangerClass?: string
  iconOnlyClass?: string
}

export function getPMDesktopToolbarKey(
  scope: string,
  actions: readonly PMDesktopToolbarActionSpec[],
): string {
  return `${scope}:${actions.map((action) => `${action.id}:${action.disabled ? '1' : '0'}`).join('|')}`
}

export function renderPMDesktopToolbarItems<TAction extends string>(
  actions: readonly PMDesktopToolbarActionSpec<TAction>[],
  options: PMDesktopToolbarRenderOptions,
) {
  return actions.map((action) => {
    const className = [
      options.itemClass,
      action.danger ? options.dangerClass : '',
      action.iconOnly ? options.iconOnlyClass : '',
    ]
      .filter(Boolean)
      .join(' ')

    return html`
      <cv-toolbar-item
        value=${action.id}
        data-action=${action.id}
        data-appearance=${action.appearance ?? 'default'}
        class=${className}
        ?disabled=${action.disabled ?? false}
        title=${action.label}
        aria-label=${action.label}
      >
        <span class=${options.contentClass}>
          <cv-icon class=${options.iconClass ?? nothing} name=${action.icon}></cv-icon>
          ${action.iconOnly
            ? nothing
            : html`<span class=${options.labelClass ?? nothing}>${action.label}</span>`}
        </span>
      </cv-toolbar-item>
    `
  })
}
