import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest'

import {CVField} from '@chromvoid/uikit/components/cv-field'
import {CVInput} from '@chromvoid/uikit/components/cv-input'
import {CVSelect} from '@chromvoid/uikit/components/cv-select'
import {CVSelectOption} from '@chromvoid/uikit/components/cv-select-option'
import type {UrlRule} from '@project/passmanager/types'

import {
  PMEntryWebsiteEditor,
  PMEntryWebsiteEditorModel,
} from '../../src/features/passmanager/components/card/entry-website-editor'

beforeAll(() => {
  CVField.define()
  CVInput.define()
  CVSelectOption.define()
  CVSelect.define()
  PMEntryWebsiteEditor.define()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('PMEntryWebsiteEditorModel', () => {
  it('preserves baseline rules and legacy duplicates while unchanged', () => {
    const rules: UrlRule[] = [
      {value: '[', match: 'regex'},
      {value: 'example.com', match: 'exact'},
      {value: 'https://example.com', match: 'never'},
    ]
    const model = new PMEntryWebsiteEditorModel()
    model.reset(rules)

    expect(model.dirty()).toBe(false)
    expect(model.buildRules({allowUnchangedLegacy: true})).toEqual({ok: true, rules})
    expect(model.rowErrors()).toEqual({})
  })

  it('keeps the first row and removes only additional rows', () => {
    const model = new PMEntryWebsiteEditorModel()
    model.reset([
      {value: '^https://first', match: 'regex'},
      {value: 'first.example', match: 'host'},
      {value: 'second.example', match: 'exact'},
    ])
    const first = model.rows()[0]!
    const secondOpenable = model.rows()[2]
    expect(model.primaryRowId()).toBe(model.rows()[1]?.id)
    expect(model.hasAdvancedMatching()).toBe(true)

    expect(model.remove(first.id)).toBeUndefined()
    expect(model.rows()).toHaveLength(3)

    expect(model.remove(secondOpenable!.id)).toBe(model.rows()[1]?.id)
    expect(model.primaryValue()).toBe('first.example')

    const addedId = model.add()
    expect(model.rows().at(-1)).toMatchObject({id: addedId, value: '', match: 'base_domain'})
  })

  it('keeps compatibility matching available for an imported entry after resetting its rules', () => {
    const model = new PMEntryWebsiteEditorModel()
    model.reset([{value: 'admin.example.com', match: 'exact'}])
    const firstId = model.rows()[0]!.id

    model.updateMatch(firstId, 'base_domain')
    expect(model.hasAdvancedMatching()).toBe(true)

    model.reset([{value: 'admin.example.com', match: 'base_domain'}])
    expect(model.hasAdvancedMatching()).toBe(false)
  })

  it('keeps commas in one URL and expands multiline paste into base-domain rows', () => {
    const model = new PMEntryWebsiteEditorModel()
    const firstId = model.rows()[0]!.id

    model.updateValue(firstId, 'https://example.com/path,segment')
    expect(model.buildRules()).toEqual({
      ok: true,
      rules: [{value: 'https://example.com/path,segment', match: 'base_domain'}],
    })

    expect(
      model.pasteMultiline(firstId, '\nhttps://one.example\n\nhttps://two.example/path,part\n'),
    ).toBe(true)
    expect(model.rows().map(({value, match}) => ({value, match}))).toEqual([
      {value: 'https://one.example', match: 'base_domain'},
      {value: 'https://two.example/path,part', match: 'base_domain'},
    ])
  })

  it('validates every match mode and reports invalid regex separately', () => {
    const model = new PMEntryWebsiteEditorModel()
    model.reset(
      (['base_domain', 'host', 'starts_with', 'exact', 'never'] as const).map((match, index) => ({
        value: `https://${index}.example.com`,
        match,
      })),
    )
    const regexId = model.add()
    model.updateMatch(regexId, 'regex')
    model.updateValue(regexId, '[')

    expect(model.buildRules()).toEqual({ok: false, firstInvalidRowId: regexId})
    expect(model.rowErrors()[regexId]).toBe('Enter a valid regular expression')

    model.updateValue(regexId, '^https://example\\.com')
    expect(model.rowErrors()[regexId]).toBeUndefined()
    expect(model.buildRules()).toMatchObject({ok: true})
  })

  it('marks only later canonical duplicates and clears the error after correction', () => {
    const model = new PMEntryWebsiteEditorModel()
    const firstId = model.rows()[0]!.id
    model.updateValue(firstId, 'example.com')
    const duplicateId = model.add()
    model.updateMatch(duplicateId, 'exact')
    model.updateValue(duplicateId, 'https://example.com')

    expect(model.buildRules()).toEqual({ok: false, firstInvalidRowId: duplicateId})
    expect(model.rowErrors()[firstId]).toBeUndefined()
    expect(model.rowErrors()[duplicateId]).toBe('This website is already added')

    model.updateValue(duplicateId, 'other.example')
    expect(model.rowErrors()[duplicateId]).toBeUndefined()
  })
})

describe('PMEntryWebsiteEditor', () => {
  async function renderEditor(model = new PMEntryWebsiteEditorModel()) {
    const editor = document.createElement(PMEntryWebsiteEditor.elementName) as PMEntryWebsiteEditor
    editor.model = model
    document.body.append(editor)
    await editor.updateComplete
    return editor
  }

  it('renders one compact default website row without remove or matching controls', async () => {
    const editor = await renderEditor()
    const root = editor.shadowRoot!

    expect(root.querySelectorAll('.row')).toHaveLength(1)
    expect(root.querySelector<CVInput>('cv-input')?.placeholder).toBe('example.com')
    expect(root.querySelector('.remove-website')).toBeNull()
    expect(root.querySelector('.advanced-settings')).toBeNull()
    expect(root.querySelectorAll('cv-select-option')).toHaveLength(0)
    expect(root.querySelector('.add-website')?.textContent).toContain('Add another website')
  })

  it('keeps a contextual warning associated with the website group', async () => {
    const editor = await renderEditor()
    editor.contextDescription = 'Review this website before importing the login.'
    await editor.updateComplete

    const fieldset = editor.shadowRoot!.querySelector('fieldset')
    expect(fieldset?.getAttribute('aria-describedby')).toBe('entry-websites-description')
    expect(editor.shadowRoot!.querySelector('.context-description')?.textContent).toContain(
      'Review this website before importing the login.',
    )
  })

  it('shows one advanced matching disclosure only for compatibility rules', async () => {
    const model = new PMEntryWebsiteEditorModel()
    model.reset([
      {value: 'example.com', match: 'base_domain'},
      {value: 'admin.example.com', match: 'exact'},
    ])
    const editor = await renderEditor(model)
    const root = editor.shadowRoot!

    expect(root.querySelectorAll('.remove-website')).toHaveLength(1)
    expect(root.querySelector('.row.removable > .remove-website')).not.toBeNull()
    expect(root.querySelector('cv-input .remove-website')).toBeNull()
    expect(root.querySelector('.advanced-settings > summary')?.textContent).toContain('Match settings')
    expect(root.querySelectorAll('.match-rule')).toHaveLength(2)
    expect(root.querySelectorAll('.match-rule-website')[1]?.textContent).toContain('admin.example.com')
    expect(root.querySelectorAll('cv-select')).toHaveLength(2)
    expect(root.querySelectorAll('cv-select-option')).toHaveLength(12)
  })

  it('focuses an added row and returns focus after removing it', async () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const editor = await renderEditor()
    const root = editor.shadowRoot!

    root
      .querySelector('.add-website')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await Promise.resolve()
    await editor.updateComplete

    const inputs = root.querySelectorAll<CVInput>('cv-input')
    await inputs[1]?.updateComplete
    await Promise.resolve()
    frames.splice(0).forEach((callback) => callback(0))
    expect(inputs).toHaveLength(2)
    expect(inputs[1]?.shadowRoot?.activeElement?.getAttribute('part')).toBe('input')

    root
      .querySelector('.remove-website')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await Promise.resolve()
    await editor.updateComplete
    await inputs[0]?.updateComplete
    await Promise.resolve()
    frames.splice(0).forEach((callback) => callback(0))

    expect(root.querySelectorAll('cv-input')).toHaveLength(1)
    expect(inputs[0]?.shadowRoot?.activeElement?.getAttribute('part')).toBe('input')
  })

  it('associates an inline error and focuses the real invalid input', async () => {
    const model = new PMEntryWebsiteEditorModel()
    const rowId = model.rows()[0]!.id
    model.updateValue(rowId, '[')
    expect(model.buildRules()).toEqual({ok: false, firstInvalidRowId: rowId})

    const editor = await renderEditor(model)
    const field = editor.shadowRoot!.querySelector<CVField>('cv-field')!
    const input = editor.shadowRoot!.querySelector<CVInput>('cv-input')!
    await field.updateComplete

    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('-error')
    expect(editor.focusFirstInvalid()).toBe(true)
    expect(input.shadowRoot?.activeElement?.getAttribute('part')).toBe('input')
  })
})
