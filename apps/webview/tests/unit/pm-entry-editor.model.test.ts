import {afterEach, describe, expect, it} from 'vitest'

import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'

describe('pmEntryEditorModel', () => {
  afterEach(() => {
    pmEntryEditorModel.reset()
  })

  it('opens and tracks the active entry surface', () => {
    pmEntryEditorModel.openSurface('entry-a', 'title')

    expect(pmEntryEditorModel.active()).toBe(true)
    expect(pmEntryEditorModel.activeEntryId()).toBe('entry-a')
    expect(pmEntryEditorModel.activeSurface()).toBe('title')
    expect(pmEntryEditorModel.isActiveForEntry('entry-a')).toBe(true)
    expect(pmEntryEditorModel.isActiveForEntry('entry-a', 'title')).toBe(true)
    expect(pmEntryEditorModel.isActiveForEntry('entry-a', 'note')).toBe(false)
    expect(pmEntryEditorModel.isActiveForEntry('entry-b')).toBe(false)
  })

  it('ignores close requests for another entry and closes the matching one', () => {
    pmEntryEditorModel.openSurface('entry-a', 'password')

    expect(pmEntryEditorModel.closeSurface('entry-b')).toBe(false)
    expect(pmEntryEditorModel.activeSurface()).toBe('password')

    expect(pmEntryEditorModel.closeSurface('entry-a')).toBe(true)
    expect(pmEntryEditorModel.active()).toBe(false)
    expect(pmEntryEditorModel.activeSurface()).toBeNull()
  })

  it('resets when the visible entry changes away from the active editor entry', () => {
    pmEntryEditorModel.openSurface('entry-a', 'ssh')
    pmEntryEditorModel.markDirty('entry-a', true)
    pmEntryEditorModel.resetForEntryChange('entry-a')

    expect(pmEntryEditorModel.active()).toBe(true)
    expect(pmEntryEditorModel.dirty()).toBe(true)

    pmEntryEditorModel.resetForEntryChange('entry-b')

    expect(pmEntryEditorModel.active()).toBe(false)
    expect(pmEntryEditorModel.activeEntryId()).toBeUndefined()
    expect(pmEntryEditorModel.activeSurface()).toBeNull()
    expect(pmEntryEditorModel.dirty()).toBe(false)
    expect(pmEntryEditorModel.dirtyEntryId()).toBeUndefined()
  })

  it('tracks dirty entry state and clears only matching entries', () => {
    pmEntryEditorModel.markDirty('entry-a', true)

    expect(pmEntryEditorModel.dirty()).toBe(true)
    expect(pmEntryEditorModel.dirtyEntryId()).toBe('entry-a')

    pmEntryEditorModel.clearDirty('entry-b')
    expect(pmEntryEditorModel.dirtyEntryId()).toBe('entry-a')

    pmEntryEditorModel.markDirty('entry-a', false)
    expect(pmEntryEditorModel.dirty()).toBe(false)
  })

  it('clears dirty state on explicit surface close and reset', () => {
    pmEntryEditorModel.openSurface('entry-a', 'entry')
    pmEntryEditorModel.markDirty('entry-a', true)

    expect(pmEntryEditorModel.closeSurface('entry-a')).toBe(true)
    expect(pmEntryEditorModel.dirty()).toBe(false)

    pmEntryEditorModel.openSurface('entry-b', 'note')
    pmEntryEditorModel.markDirty('entry-b', true)
    pmEntryEditorModel.reset()

    expect(pmEntryEditorModel.dirty()).toBe(false)
  })
})
