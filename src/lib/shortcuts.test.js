import { describe, it, expect } from 'vitest'
import { shouldHandleUndo } from './shortcuts.js'

const evt = (overrides = {}) => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  key: 'z',
  target: { tagName: 'BODY' },
  ...overrides,
})

describe('shouldHandleUndo', () => {
  it('accepts Cmd+Z', () => {
    expect(shouldHandleUndo(evt({ metaKey: true }))).toBe(true)
  })

  it('accepts Ctrl+Z', () => {
    expect(shouldHandleUndo(evt({ ctrlKey: true }))).toBe(true)
  })

  it('accepts an uppercase key from caps lock', () => {
    expect(shouldHandleUndo(evt({ metaKey: true, key: 'Z' }))).toBe(true)
  })

  it('rejects Z with no modifier', () => {
    expect(shouldHandleUndo(evt())).toBe(false)
  })

  it('rejects a different letter', () => {
    expect(shouldHandleUndo(evt({ metaKey: true, key: 'y' }))).toBe(false)
  })

  it('rejects Shift+Cmd+Z, which means redo', () => {
    expect(shouldHandleUndo(evt({ metaKey: true, shiftKey: true }))).toBe(false)
  })

  it('rejects Alt+Cmd+Z', () => {
    expect(shouldHandleUndo(evt({ metaKey: true, altKey: true }))).toBe(false)
  })

  it('tolerates a missing key', () => {
    expect(shouldHandleUndo(evt({ metaKey: true, key: undefined }))).toBe(false)
  })

  // The regression this module exists for: the add-task input is where focus
  // normally sits, so guarding on focus alone disabled undo in the one
  // situation it is actually needed.
  it('handles undo when the focused input is empty', () => {
    const target = { tagName: 'INPUT', value: '' }
    expect(shouldHandleUndo(evt({ metaKey: true, target }))).toBe(true)
  })

  it('defers to the field when the focused input has text to undo', () => {
    const target = { tagName: 'INPUT', value: 'half-typed task' }
    expect(shouldHandleUndo(evt({ metaKey: true, target }))).toBe(false)
  })

  it('defers to a textarea holding text', () => {
    const target = { tagName: 'TEXTAREA', value: 'notes' }
    expect(shouldHandleUndo(evt({ metaKey: true, target }))).toBe(false)
  })

  it('defers to a contenteditable target', () => {
    const target = { tagName: 'DIV', isContentEditable: true }
    expect(shouldHandleUndo(evt({ metaKey: true, target }))).toBe(false)
  })

  it('handles undo when the target is a button', () => {
    const target = { tagName: 'BUTTON' }
    expect(shouldHandleUndo(evt({ metaKey: true, target }))).toBe(true)
  })

  it('tolerates a missing target', () => {
    expect(shouldHandleUndo(evt({ metaKey: true, target: null }))).toBe(true)
  })
})
