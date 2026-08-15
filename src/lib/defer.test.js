import { describe, it, expect } from 'vitest'
import { createStorage, createMemoryStore } from './storage.js'
import { moveTaskToDay } from './defer.js'

const task = (id, text = id) => ({ id, text, completed: false, createdAt: 1000 })

const setup = (seed = {}) => {
  const backend = createMemoryStore()
  for (const [day, tasks] of Object.entries(seed)) {
    backend.setItem(`negotium-tasks-${day}`, JSON.stringify(tasks))
  }
  return createStorage(backend)
}

const TODAY = '2026-08-16'
const TOMORROW = '2026-08-17'

describe('moveTaskToDay', () => {
  it('removes the task from the source day', () => {
    const storage = setup({ [TODAY]: [task('a'), task('b')] })
    moveTaskToDay(storage, TODAY, TOMORROW, 'a')
    expect(storage.loadTasks(TODAY).map(t => t.id)).toEqual(['b'])
  })

  it('appends the task to the destination day', () => {
    const storage = setup({ [TODAY]: [task('a')], [TOMORROW]: [task('existing')] })
    moveTaskToDay(storage, TODAY, TOMORROW, 'a')
    expect(storage.loadTasks(TOMORROW).map(t => t.id)).toEqual(['existing', 'a'])
  })

  it('works when the destination day has nothing stored yet', () => {
    const storage = setup({ [TODAY]: [task('a')] })
    moveTaskToDay(storage, TODAY, TOMORROW, 'a')
    expect(storage.loadTasks(TOMORROW).map(t => t.id)).toEqual(['a'])
  })

  it('carries the task across unchanged', () => {
    const original = { id: 'a', text: 'buy milk', completed: true, createdAt: 42 }
    const storage = setup({ [TODAY]: [original] })
    moveTaskToDay(storage, TODAY, TOMORROW, 'a')
    expect(storage.loadTasks(TOMORROW)[0]).toEqual(original)
  })

  it('returns the source day’s remaining tasks', () => {
    const storage = setup({ [TODAY]: [task('a'), task('b')] })
    const result = moveTaskToDay(storage, TODAY, TOMORROW, 'a')
    expect(result.map(t => t.id)).toEqual(['b'])
  })

  it('leaves the other tasks in their original order', () => {
    const storage = setup({ [TODAY]: [task('a'), task('b'), task('c')] })
    moveTaskToDay(storage, TODAY, TOMORROW, 'b')
    expect(storage.loadTasks(TODAY).map(t => t.id)).toEqual(['a', 'c'])
  })

  it('is a no-op for an id that is not there', () => {
    const storage = setup({ [TODAY]: [task('a')] })
    const result = moveTaskToDay(storage, TODAY, TOMORROW, 'zzz')
    expect(result.map(t => t.id)).toEqual(['a'])
    expect(storage.loadTasks(TOMORROW)).toEqual([])
  })

  it('is a no-op when source and destination are the same day', () => {
    const storage = setup({ [TODAY]: [task('a')] })
    const result = moveTaskToDay(storage, TODAY, TODAY, 'a')
    expect(result.map(t => t.id)).toEqual(['a'])
    expect(storage.loadTasks(TODAY).map(t => t.id)).toEqual(['a'])
  })

  it('moves back the other way just as well', () => {
    const storage = setup({ [TOMORROW]: [task('a')], [TODAY]: [task('b')] })
    moveTaskToDay(storage, TOMORROW, TODAY, 'a')
    expect(storage.loadTasks(TODAY).map(t => t.id)).toEqual(['b', 'a'])
    expect(storage.loadTasks(TOMORROW)).toEqual([])
  })

  it('does not duplicate a task already present at the destination', () => {
    const storage = setup({ [TODAY]: [task('a')], [TOMORROW]: [task('a')] })
    moveTaskToDay(storage, TODAY, TOMORROW, 'a')
    expect(storage.loadTasks(TOMORROW).map(t => t.id)).toEqual(['a'])
    expect(storage.loadTasks(TODAY)).toEqual([])
  })
})
