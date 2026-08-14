import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVInput} from '@chromvoid/uikit'
import type {CVDrawer} from '@chromvoid/uikit'
import {setPasswordManagerLang} from '@project/passmanager/i18n'
import {normalizeCredentialTagCatalog, normalizeCredentialTags} from '@project/passmanager/tags'
import {PMDesktopTagManagerDrawer} from '../../src/features/passmanager/components/tags/desktop-tag-manager-drawer'
import {pmCredentialTagsModel} from '../../src/features/passmanager/models/pm-credential-tags.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function installRoot({catalog = [], readOnly = false}: {catalog?: readonly string[]; readOnly?: boolean} = {}) {
  const credentialTags = atom(normalizeCredentialTagCatalog(catalog))
  const saveCredentialTagCatalog = vi.fn(async (tags: unknown) => {
    credentialTags.set(normalizeCredentialTagCatalog(tags))
    return true
  })
  const entries = [
    {
      id: 'entry-1',
      tags: normalizeCredentialTags(['Work']),
      async updateTags(tags: unknown) {
        this.tags = normalizeCredentialTags(tags)
      },
    },
  ]

  setPassmanagerRoot({
    allEntries: entries,
    credentialTags,
    credentialTagMeta: atom({}),
    isReadOnly: atom(readOnly),
    saveCredentialTagCatalog,
  } as never)

  return {saveCredentialTagCatalog}
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}): Promise<void> {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

function getDrawer(component: PMDesktopTagManagerDrawer): CVDrawer {
  return component.shadowRoot!.querySelector('cv-drawer') as CVDrawer
}

describe('PMDesktopTagManagerDrawer', () => {
  beforeEach(() => {
    setPasswordManagerLang('en')
    installRoot({catalog: ['Work', 'Personal']})
    PMDesktopTagManagerDrawer.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    pmCredentialTagsModel.closeCatalogManager()
    pmCredentialTagsModel.closeSheet()
    setPassmanagerRoot(undefined)
    setPasswordManagerLang('en')
    vi.restoreAllMocks()
  })

  it('opens as a controlled non-modal drawer with catalog controls', async () => {
    const component = document.createElement(
      'pm-desktop-tag-manager-drawer',
    ) as PMDesktopTagManagerDrawer
    document.body.append(component)
    pmCredentialTagsModel.openCatalogManager()
    await settle(component)
    await settle(getDrawer(component))

    const drawer = getDrawer(component)
    expect(drawer.open).toBe(true)
    expect(drawer.modal).toBe(false)
    expect(drawer.closeOnEscape).toBe(true)
    expect(drawer.closeOnOutsidePointer).toBe(false)
    expect(drawer.closeOnOutsideFocus).toBe(false)
    expect(drawer.closeLabel).toBe('Close')
    expect(component.shadowRoot!.querySelector('#pm-tag-catalog-search')).not.toBeNull()
    expect(component.shadowRoot!.querySelectorAll('.tag-row')).toHaveLength(2)
    const actions = [...component.shadowRoot!.querySelectorAll('cv-button.row-action')]
    expect(actions).toHaveLength(4)
    expect(actions.every((action) => !action.hasAttribute('unstyled'))).toBe(true)
    expect(actions.every((action) => action.hasAttribute('aria-label'))).toBe(true)
  })

  it('filters the catalog without changing selected tags', async () => {
    const component = document.createElement(
      'pm-desktop-tag-manager-drawer',
    ) as PMDesktopTagManagerDrawer
    document.body.append(component)
    pmCredentialTagsModel.openCatalogManager()
    await settle(component)

    component.shadowRoot!.querySelector('#pm-tag-catalog-search')!.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'pers'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(component)

    const rows = [...component.shadowRoot!.querySelectorAll('.tag-row')]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('Personal')
  })

  it('keeps create enabled for blank input and focuses the invalid field after submit', async () => {
    const component = document.createElement(
      'pm-desktop-tag-manager-drawer',
    ) as PMDesktopTagManagerDrawer
    document.body.append(component)
    pmCredentialTagsModel.openCatalogManager()
    await settle(component)

    ;(component.shadowRoot!.querySelector('.toolbar cv-button') as HTMLElement).click()
    await settle(component)

    const submit = component.shadowRoot!.querySelector('cv-button[type="submit"]') as
      | (HTMLElement & {disabled?: boolean})
      | null
    const form = component.shadowRoot!.querySelector('form') as HTMLFormElement
    expect(submit?.disabled).toBe(false)

    const focus = vi.spyOn(CVInput.prototype, 'focus')
    form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await settle(component)

    expect(pmCredentialTagsModel.tagError()).toBe('Enter a tag name')
    expect(focus).toHaveBeenCalled()
    expect(component.shadowRoot!.querySelector('[slot="error"]')?.textContent).toBe('Enter a tag name')
  })

  it('uses the first Escape to cancel an inline mutation and the second to close', async () => {
    const component = document.createElement(
      'pm-desktop-tag-manager-drawer',
    ) as PMDesktopTagManagerDrawer
    document.body.append(component)
    pmCredentialTagsModel.openCatalogManager()
    pmCredentialTagsModel.openCreateTag()
    await settle(component)
    await settle(getDrawer(component))

    const drawer = getDrawer(component)
    expect(drawer.closeOnEscape).toBe(false)
    const headerClose = drawer.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
    const manager = component.shadowRoot!.querySelector('.manager') as HTMLElement
    headerClose.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true, cancelable: true}),
    )
    await settle(component)

    expect(pmCredentialTagsModel.sheetMode()).toBe('manage')
    expect(pmCredentialTagsModel.catalogManagerOpen()).toBe(true)
    expect(drawer.closeOnEscape).toBe(true)

    manager.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true, cancelable: true}),
    )
    await settle(component)
    await settle(getDrawer(component))

    expect(pmCredentialTagsModel.catalogManagerOpen()).toBe(false)
  })

  it('keeps catalog browsing available and disables mutations in read-only mode', async () => {
    installRoot({catalog: ['Work'], readOnly: true})
    const component = document.createElement(
      'pm-desktop-tag-manager-drawer',
    ) as PMDesktopTagManagerDrawer
    document.body.append(component)
    pmCredentialTagsModel.openCatalogManager()
    await settle(component)

    expect(component.shadowRoot!.querySelector('.readonly-note')?.textContent).toContain('read-only')
    expect((component.shadowRoot!.querySelector('.toolbar cv-button') as {disabled?: boolean}).disabled).toBe(
      true,
    )
    expect(component.shadowRoot!.querySelectorAll('.tag-row')).toHaveLength(1)
  })
})
