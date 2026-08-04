import {afterEach, beforeAll, describe, expect, it} from 'vitest'

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

  it('adds, removes, and promotes openable rows without changing their match mode', () => {
    const model = new PMEntryWebsiteEditorModel()
    model.reset([
      {value: '^https://first', match: 'regex'},
      {value: 'first.example', match: 'host'},
      {value: 'second.example', match: 'exact'},
    ])
    const secondOpenable = model.rows()[2]
    expect(model.primaryRowId()).toBe(model.rows()[1]?.id)

    model.makePrimary(secondOpenable!.id)
    expect(model.rows()[0]).toMatchObject({value: 'second.example', match: 'exact'})
    expect(model.primaryRowId()).toBe(secondOpenable!.id)

    model.remove(secondOpenable!.id)
    expect(model.primaryValue()).toBe('first.example')

    const addedId = model.add()
    expect(model.rows().at(-1)).toMatchObject({id: addedId, value: '', match: 'base_domain'})
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

  it('renders a persistent description, example-only placeholder, and native disclosure', async () => {
    const editor = await renderEditor()
    const root = editor.shadowRoot!

    expect(root.querySelector('.description')?.textContent).toContain('paste one address per line')
    expect(root.querySelector<CVInput>('cv-input')?.placeholder).toBe('example.com')
    expect(root.querySelector('details > summary')?.textContent).toContain('Match settings')
    expect(root.querySelectorAll('cv-select-option')).toHaveLength(6)
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
