import { describe, it, expect } from 'vitest'
import { createUndoStack, applyUndo } from './undo.js'

const task = (id, completed = false) => ({ id, text: id, completed })

describe('createUndoStack', () => {
  it('pops the most recent entry', () => {
    const stack = createUndoStack()
    stack.push({ type: 'delete', task: task('a'), index: 0 })
    stack.push({ type: 'delete', task: task('b'), index: 1 })
    expect(stack.pop().task.id).toBe('b')
  })

  it('returns null when empty', () => {
    expect(createUndoStack().pop()).toBe(null)
  })

  it('reports its size', () => {
    const stack = createUndoStack()
    expect(stack.size).toBe(0)
    stack.push({ type: 'delete', task: task('a'), index: 0 })
    expect(stack.size).toBe(1)
  })

  it('is bounded, discarding the oldest entries', () => {
    const stack = createUndoStack(3)
    for (const id of ['a', 'b', 'c', 'd']) {
      stack.push({ type: 'delete', task: task(id), index: 0 })
    }
    expect(stack.size).toBe(3)
    expect(stack.pop().task.id).toBe('d')
    expect(stack.pop().task.id).toBe('c')
    expect(stack.pop().task.id).toBe('b')
    expect(stack.pop()).toBe(null)
  })

  it('clears', () => {
    const stack = createUndoStack()
    stack.push({ type: 'delete', task: task('a'), index: 0 })
    stack.clear()
    expect(stack.size).toBe(0)
  })
})

describe('applyUndo', () => {
  it('restores a deleted task at its original index', () => {
    const after = [task('a'), task('c')]
    const entry = { type: 'delete', task: task('b'), index: 1 }
    expect(applyUndo(after, entry).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('restores a task deleted from the front', () => {
    const entry = { type: 'delete', task: task('a'), index: 0 }
    expect(applyUndo([task('b')], entry).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('restores at the end when the list has since shrunk', () => {
    const entry = { type: 'delete', task: task('b'), index: 5 }
    expect(applyUndo([task('a')], entry).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('restores a cleared batch in original positions', () => {
    const after = [task('b')]
    const entry = {
      type: 'clearCompleted',
      removed: [
        { task: task('a', true), index: 0 },
        { task: task('c', true), index: 2 },
      ],
    }
    expect(applyUndo(after, entry).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('restores a batch cleared from an entirely completed list', () => {
    const entry = {
      type: 'clearCompleted',
      removed: [
        { task: task('a', true), index: 0 },
        { task: task('b', true), index: 1 },
      ],
    }
    expect(applyUndo([], entry).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('is a no-op for a null entry', () => {
    const tasks = [task('a')]
    expect(applyUndo(tasks, null)).toBe(tasks)
  })

  it('is a no-op for an unrecognised entry type', () => {
    const tasks = [task('a')]
    expect(applyUndo(tasks, { type: 'nonsense' })).toBe(tasks)
  })

  it('does not mutate the input array', () => {
    const before = [task('a')]
    applyUndo(before, { type: 'delete', task: task('b'), index: 0 })
    expect(before).toHaveLength(1)
  })
})
