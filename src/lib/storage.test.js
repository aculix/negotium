import { describe, it, expect } from 'vitest'
import { createStorage, createMemoryStore } from './storage.js'

const setup = (seed = {}) => {
  const backend = createMemoryStore()
  for (const [key, value] of Object.entries(seed)) backend.setItem(key, value)
  return { backend, storage: createStorage(backend) }
}

describe('loadTasks', () => {
  it('returns an empty array for a missing key', () => {
    const { storage } = setup()
    expect(storage.loadTasks('2026-08-15')).toEqual([])
  })

  it('returns stored tasks', () => {
    const tasks = [{ id: 'a', text: 'buy milk', completed: false }]
    const { storage } = setup({ 'negotium-tasks-2026-08-15': JSON.stringify(tasks) })
    expect(storage.loadTasks('2026-08-15')).toEqual(tasks)
  })

  it('returns an empty array for corrupt JSON instead of throwing', () => {
    const { storage } = setup({ 'negotium-tasks-2026-08-15': '{not json' })
    expect(storage.loadTasks('2026-08-15')).toEqual([])
  })

  it('returns an empty array when the stored value is not an array', () => {
    const { storage } = setup({ 'negotium-tasks-2026-08-15': '{"a":1}' })
    expect(storage.loadTasks('2026-08-15')).toEqual([])
  })

  it('survives a throwing backend', () => {
    const backend = createMemoryStore()
    backend.getItem = () => {
      throw new Error('storage revoked')
    }
    const storage = createStorage(backend)
    expect(storage.loadTasks('2026-08-15')).toEqual([])
  })
})

describe('saveTasks', () => {
  it('round-trips through the backend', () => {
    const { storage } = setup()
    const tasks = [{ id: 'a', text: 'x', completed: true }]
    storage.saveTasks('2026-08-15', tasks)
    expect(storage.loadTasks('2026-08-15')).toEqual(tasks)
  })

  it('swallows a throwing backend rather than propagating', () => {
    const backend = createMemoryStore()
    backend.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    const storage = createStorage(backend)
    expect(() => storage.saveTasks('2026-08-15', [])).not.toThrow()
  })
})

describe('listTaskKeys', () => {
  it('returns only date keys, with the prefix stripped', () => {
    const { storage } = setup({
      'negotium-tasks-2026-08-15': '[]',
      'negotium-tasks-2026-08-16': '[]',
      'negotium-theme': 'dark',
      unrelated: 'x',
    })
    expect(storage.listTaskKeys().sort()).toEqual(['2026-08-15', '2026-08-16'])
  })

  it('excludes legacy-format keys', () => {
    const { storage } = setup({
      'negotium-tasks-2026-08-15': '[]',
      'negotium-tasks-Sat Aug 15 2026': '[]',
    })
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
  })

  it('returns an empty array when enumeration throws', () => {
    const backend = createMemoryStore()
    backend.keys = () => {
      throw new Error('nope')
    }
    expect(createStorage(backend).listTaskKeys()).toEqual([])
  })
})

describe('removeTasks', () => {
  it('deletes the entry', () => {
    const { storage } = setup({ 'negotium-tasks-2026-08-15': '[]' })
    storage.removeTasks('2026-08-15')
    expect(storage.listTaskKeys()).toEqual([])
  })
})

describe('theme', () => {
  it('returns null when unset', () => {
    const { storage } = setup()
    expect(storage.loadTheme()).toBe(null)
  })

  it('round-trips', () => {
    const { storage } = setup()
    storage.saveTheme('dark')
    expect(storage.loadTheme()).toBe('dark')
  })
})

describe('migrateLegacyKeys', () => {
  it('rewrites a legacy key to ISO form', () => {
    const tasks = [{ id: 'a', text: 'legacy', completed: false }]
    const { storage } = setup({ 'negotium-tasks-Sat Aug 15 2026': JSON.stringify(tasks) })
    storage.migrateLegacyKeys()
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
    expect(storage.loadTasks('2026-08-15')).toEqual(tasks)
  })

  it('removes the legacy key once migrated', () => {
    const { backend, storage } = setup({ 'negotium-tasks-Sat Aug 15 2026': '[]' })
    storage.migrateLegacyKeys()
    expect(backend.getItem('negotium-tasks-Sat Aug 15 2026')).toBe(null)
  })

  it('merges legacy before existing when the ISO key is occupied', () => {
    const legacy = [{ id: 'l', text: 'legacy', completed: false }]
    const current = [{ id: 'c', text: 'current', completed: false }]
    const { storage } = setup({
      'negotium-tasks-Sat Aug 15 2026': JSON.stringify(legacy),
      'negotium-tasks-2026-08-15': JSON.stringify(current),
    })
    storage.migrateLegacyKeys()
    expect(storage.loadTasks('2026-08-15').map((t) => t.id)).toEqual(['l', 'c'])
  })

  it('leaves an unparseable key untouched rather than destroying it', () => {
    const { storage, backend } = setup({ 'negotium-tasks-not-a-date': '[{"id":"x"}]' })
    storage.migrateLegacyKeys()
    expect(backend.getItem('negotium-tasks-not-a-date')).toBe('[{"id":"x"}]')
  })

  it('is idempotent', () => {
    const { storage } = setup({ 'negotium-tasks-Sat Aug 15 2026': '[{"id":"a"}]' })
    storage.migrateLegacyKeys()
    storage.migrateLegacyKeys()
    expect(storage.loadTasks('2026-08-15')).toEqual([{ id: 'a' }])
  })

  it('migrates several legacy days independently', () => {
    const { storage } = setup({
      'negotium-tasks-Fri Aug 14 2026': '[{"id":"fri"}]',
      'negotium-tasks-Sat Aug 15 2026': '[{"id":"sat"}]',
    })
    storage.migrateLegacyKeys()
    expect(storage.listTaskKeys().sort()).toEqual(['2026-08-14', '2026-08-15'])
    expect(storage.loadTasks('2026-08-14')).toEqual([{ id: 'fri' }])
    expect(storage.loadTasks('2026-08-15')).toEqual([{ id: 'sat' }])
  })

  it('does nothing when there is nothing to migrate', () => {
    const { storage } = setup({ 'negotium-tasks-2026-08-15': '[]' })
    storage.migrateLegacyKeys()
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
  })

  it('leaves the theme key alone', () => {
    const { backend, storage } = setup({ 'negotium-theme': 'dark' })
    storage.migrateLegacyKeys()
    expect(backend.getItem('negotium-theme')).toBe('dark')
  })
})
