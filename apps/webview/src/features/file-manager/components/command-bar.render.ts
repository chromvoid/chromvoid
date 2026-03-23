import {html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import type {Command, CommandCategory} from './command-bar.types'
import {CommandBarModel} from '../models/command-bar.model'

const COMMAND_CATEGORY_ORDER: CommandCategory[] = ['actions', 'navigation', 'filters', 'search']

const getCommandCategoryLabel = (category: CommandCategory): string => {
  switch (category) {
    case 'navigation':
      return i18n('command-bar:category:navigation' as any)
    case 'actions':
      return i18n('command-bar:category:actions' as any)
    case 'filters':
      return i18n('command-bar:category:filters' as any)
    case 'search':
      return i18n('command-bar:category:search' as any)
  }
}

const renderCommand = (model: CommandBarModel, cmd: Command, index: number) => {
  const selected = model.commandIsSelected(index)
  return html`
    <button
      class="command ${selected ? 'selected' : ''}"
      data-command-id=${cmd.id}
      @click=${cmd.action}
      ?disabled=${cmd.disabled}
    >
      <cv-icon name=${cmd.icon}></cv-icon>
      <span class="label">${cmd.label}</span>
      ${cmd.shortcut ? html`<span class="shortcut">${cmd.shortcut}</span>` : nothing}
    </button>
  `
}

export const renderResults = (model: CommandBarModel) => {
  const groups = model.getSortedCommandGroups()
  const list = model.commandList
  if (list.length === 0) {
    return html`<div class="empty">${i18n('command-bar:no-results' as any)}</div>`
  }

  let index = 0

  return COMMAND_CATEGORY_ORDER.filter((category) => groups[category].length > 0).map(
    (category) => html`
      <div class="category">
        <div class="category-label">${getCommandCategoryLabel(category)}</div>
        ${groups[category].map((command) => renderCommand(model, command, index++))}
      </div>
    `,
  )
}

export const renderCommandBar = (model: CommandBarModel) => {
  return html`
    <div class="backdrop" @click=${model.onBackdropClick}></div>
    <div class="dialog" role="dialog" aria-modal="true" aria-label=${i18n('command-bar:title' as any)}>
      <div class="search">
        <cv-icon class="search-icon" name="search"></cv-icon>
        <input
          class="search-input"
          type="text"
          placeholder=${i18n('command-bar:placeholder' as any)}
          .value=${model.query()}
          @input=${model.onInput}
        />
        <span class="hint">ESC</span>
      </div>
      <div class="results">${renderResults(model)}</div>
    </div>
    <input class="file-input" type="file" multiple @change=${model.onFileInputChange} />
  `
}
