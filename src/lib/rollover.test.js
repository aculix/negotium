import { describe, it, expect } from 'vitest'
import { createStorage, createMemoryStore } from './storage.js'
import { rollover, msUntilNextMidnight } from './rollover.js'

const task = (id, completed = false) => ({ id, text: id, completed })

const setup = (seed = {}) => {
  const backend = createMemoryStore()
  for (const [dateKey, tasks] of Object.entries(seed)) {
    backend.setItem(`negotium-tasks-${dateKey}`, JSON.stringify(tasks))
  }
  return createStorage(backend)
}

describe('rollover', () => {
  it('is a no-op when only today has tasks', () => {
    const storage = setup({ '2026-08-15': [task('a')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['a'])
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
  })

  it('carries unfinished tasks forward from yesterday', () => {
    const storage = setup({ '2026-08-14': [task('old')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['old'])
    expect(storage.loadTasks('2026-08-15').map((t) => t.id)).toEqual(['old'])
  })

  it('drops completed tasks from prior days', () => {
    const storage = setup({ '2026-08-14': [task('done', true), task('open')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['open'])
  })

  it('deletes prior-day keys after carrying', () => {
    const storage = setup({ '2026-08-14': [task('old')] })
    rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
  })

  it('spans a multi-day gap, oldest day first', () => {
    const storage = setup({
      '2026-08-12': [task('mon')],
      '2026-08-13': [task('tue')],
      '2026-08-14': [task('wed')],
    })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['mon', 'tue', 'wed'])
  })

  it('preserves within-day order', () => {
    const storage = setup({ '2026-08-14': [task('first'), task('second'), task('third')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['first', 'second', 'third'])
  })

  it('places carried tasks above tasks already in today', () => {
    const storage = setup({
      '2026-08-14': [task('carried')],
      '2026-08-15': [task('existing')],
    })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['carried', 'existing'])
  })

  it('never touches future keys', () => {
    const storage = setup({
      '2026-08-15': [task('today')],
      '2026-08-16': [task('tomorrow')],
    })
    rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(storage.loadTasks('2026-08-16').map((t) => t.id)).toEqual(['tomorrow'])
  })

  it('handles prior days that hold only completed tasks', () => {
    const storage = setup({ '2026-08-14': [task('done', true)] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result).toEqual([])
    expect(storage.listTaskKeys()).toEqual([])
  })

  it('returns an empty list when nothing is stored at all', () => {
    const storage = setup()
    expect(rollover(storage, new Date(2026, 7, 15, 9, 0))).toEqual([])
  })

  it('carries across a month boundary', () => {
    const storage = setup({ '2026-07-31': [task('july')] })
    const result = rollover(storage, new Date(2026, 7, 1, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['july'])
  })

  it('carries across a year boundary', () => {
    const storage = setup({ '2026-12-31': [task('nye')] })
    const result = rollover(storage, new Date(2027, 0, 1, 9, 0))
    expect(result.map((t) => t.id)).toEqual(['nye'])
  })

  it('is idempotent when run twice on the same day', () => {
    const storage = setup({ '2026-08-14': [task('old')] })
    const now = new Date(2026, 7, 15, 9, 0)
    rollover(storage, now)
    const second = rollover(storage, now)
    expect(second.map((t) => t.id)).toEqual(['old'])
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
  })

  it('leaves an unparseable legacy key in place rather than treating it as past', () => {
    const backend = createMemoryStore()
    backend.setItem('negotium-tasks-not-a-date', '[{"id":"x"}]')
    const storage = createStorage(backend)
    rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(backend.getItem('negotium-tasks-not-a-date')).toBe('[{"id":"x"}]')
  })
})

describe('msUntilNextMidnight', () => {
  it('counts down to the next local midnight', () => {
    expect(msUntilNextMidnight(new Date(2026, 7, 15, 23, 0, 0))).toBe(60 * 60 * 1000)
  })

  it('returns a full day just after midnight', () => {
    expect(msUntilNextMidnight(new Date(2026, 7, 15, 0, 0, 0))).toBe(24 * 60 * 60 * 1000)
  })

  it('never returns a non-positive value', () => {
    expect(msUntilNextMidnight(new Date(2026, 7, 15, 23, 59, 59, 999))).toBeGreaterThan(0)
  })

  it('lands exactly on the next calendar day', () => {
    const now = new Date(2026, 7, 15, 17, 42, 13)
    const landing = new Date(now.getTime() + msUntilNextMidnight(now))
    expect(landing.getDate()).toBe(16)
    expect(landing.getHours()).toBe(0)
    expect(landing.getMinutes()).toBe(0)
  })

  it('lands on the next calendar day across a month boundary', () => {
    const now = new Date(2026, 7, 31, 20, 0, 0)
    const landing = new Date(now.getTime() + msUntilNextMidnight(now))
    expect(landing.getMonth()).toBe(8)
    expect(landing.getDate()).toBe(1)
  })
})
