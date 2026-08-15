import { describe, it, expect } from 'vitest'
import { addTask, toggleTask, deleteTask, reorderTask, clearCompleted } from './tasks.js'

const task = (id, completed = false) => ({ id, text: id, completed })

describe('addTask', () => {
  it('appends a task', () => {
    const result = addTask([], 'buy milk')
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('buy milk')
    expect(result[0].completed).toBe(false)
  })

  it('trims surrounding whitespace', () => {
    expect(addTask([], '  spaced  ')[0].text).toBe('spaced')
  })

  it('rejects whitespace-only input', () => {
    const before = [task('a')]
    expect(addTask(before, '   ')).toBe(before)
  })

  it('rejects empty input', () => {
    const before = [task('a')]
    expect(addTask(before, '')).toBe(before)
  })

  it('assigns unique ids', () => {
    const one = addTask([], 'a')
    const two = addTask(one, 'b')
    expect(two[0].id).not.toBe(two[1].id)
  })

  it('assigns unique ids even when added in the same millisecond', () => {
    let tasks = []
    for (let i = 0; i < 50; i += 1) tasks = addTask(tasks, `task ${i}`, 1_000_000)
    expect(new Set(tasks.map((t) => t.id)).size).toBe(50)
  })

  it('records the supplied creation time', () => {
    expect(addTask([], 'x', 1_234_567)[0].createdAt).toBe(1_234_567)
  })

  it('does not mutate the input array', () => {
    const before = [task('a')]
    addTask(before, 'b')
    expect(before).toHaveLength(1)
  })
})

describe('toggleTask', () => {
  it('flips completion', () => {
    expect(toggleTask([task('a')], 'a')[0].completed).toBe(true)
  })

  it('flips back', () => {
    expect(toggleTask([task('a', true)], 'a')[0].completed).toBe(false)
  })

  it('ignores an unknown id', () => {
    expect(toggleTask([task('a')], 'zzz')[0].completed).toBe(false)
  })

  it('does not mutate the input array', () => {
    const before = [task('a')]
    toggleTask(before, 'a')
    expect(before[0].completed).toBe(false)
  })
})

describe('deleteTask', () => {
  it('removes the matching task', () => {
    expect(deleteTask([task('a'), task('b')], 'a').map((t) => t.id)).toEqual(['b'])
  })

  it('ignores an unknown id', () => {
    expect(deleteTask([task('a')], 'zzz')).toHaveLength(1)
  })
})

describe('reorderTask', () => {
  const three = [task('a'), task('b'), task('c')]

  it('moves an item later', () => {
    expect(reorderTask(three, 0, 2).map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item earlier', () => {
    expect(reorderTask(three, 2, 0).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('moves an item into the middle', () => {
    expect(reorderTask(three, 0, 1).map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })

  it('is a no-op when indices match', () => {
    expect(reorderTask(three, 1, 1)).toBe(three)
  })

  it('is a no-op for an out-of-range destination', () => {
    expect(reorderTask(three, 0, 9)).toBe(three)
  })

  it('is a no-op for an out-of-range source', () => {
    expect(reorderTask(three, -1, 0)).toBe(three)
  })

  it('does not mutate the input array', () => {
    const before = [task('a'), task('b')]
    reorderTask(before, 0, 1)
    expect(before.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('clearCompleted', () => {
  it('removes completed tasks', () => {
    const result = clearCompleted([task('a', true), task('b'), task('c', true)])
    expect(result.map((t) => t.id)).toEqual(['b'])
  })

  it('is a no-op when nothing is completed', () => {
    expect(clearCompleted([task('a')])).toHaveLength(1)
  })

  it('can empty the list entirely', () => {
    expect(clearCompleted([task('a', true)])).toEqual([])
  })
})
