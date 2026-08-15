import { describe, it, expect } from 'vitest'
import { createStorage, createMemoryStore } from './storage.js'
import { buildExport, serialize, parseImport, mergeImport } from './backup.js'

const task = (id, text = id, completed = false) => ({ id, text, completed, createdAt: 1000 })

const setup = (seed = {}) => {
  const backend = createMemoryStore()
  for (const [day, tasks] of Object.entries(seed)) {
    backend.setItem(`negotium-tasks-${day}`, JSON.stringify(tasks))
  }
  return createStorage(backend)
}

const file = (days, extra = {}) =>
  JSON.stringify({ app: 'negotium', version: 1, exportedAt: '2026-08-16T00:00:00.000Z', days, ...extra })

describe('buildExport', () => {
  it('stamps the app, version and time', () => {
    const result = buildExport(setup(), new Date(Date.UTC(2026, 7, 16, 12)))
    expect(result.app).toBe('negotium')
    expect(result.version).toBe(1)
    expect(result.exportedAt).toBe('2026-08-16T12:00:00.000Z')
  })

  it('includes every stored day', () => {
    const storage = setup({ '2026-08-16': [task('a')], '2026-08-17': [task('b')] })
    expect(Object.keys(buildExport(storage).days).sort()).toEqual(['2026-08-16', '2026-08-17'])
  })

  it('omits days holding no tasks', () => {
    const storage = setup({ '2026-08-16': [task('a')], '2026-08-17': [] })
    expect(Object.keys(buildExport(storage).days)).toEqual(['2026-08-16'])
  })

  it('exports an empty days object when nothing is stored', () => {
    expect(buildExport(setup()).days).toEqual({})
  })

  it('serializes to text a human can read', () => {
    const text = serialize(buildExport(setup({ '2026-08-16': [task('a')] })))
    expect(text).toContain('\n')
    expect(JSON.parse(text).days['2026-08-16']).toHaveLength(1)
  })
})

describe('parseImport', () => {
  it('rejects text that is not JSON', () => {
    const result = parseImport('{not json')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/valid JSON/i)
  })

  it('rejects a file from somewhere else', () => {
    const result = parseImport(JSON.stringify({ app: 'other', days: {} }))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/negotium/i)
  })

  it('rejects a file with no days object', () => {
    expect(parseImport(JSON.stringify({ app: 'negotium' })).ok).toBe(false)
  })

  it('rejects a top-level array', () => {
    expect(parseImport('[]').ok).toBe(false)
  })

  it('accepts a valid file and counts what it found', () => {
    const result = parseImport(file({ '2026-08-16': [task('a'), task('b')], '2026-08-17': [task('c')] }))
    expect(result.ok).toBe(true)
    expect(result.taskCount).toBe(3)
    expect(Object.keys(result.days)).toHaveLength(2)
  })

  it('ignores unknown top-level fields', () => {
    const result = parseImport(file({ '2026-08-16': [task('a')] }, { somethingElse: 42 }))
    expect(result.ok).toBe(true)
    expect(result.taskCount).toBe(1)
  })

  it('skips days whose key is not a date', () => {
    const result = parseImport(file({ 'not-a-date': [task('a')], '2026-08-16': [task('b')] }))
    expect(Object.keys(result.days)).toEqual(['2026-08-16'])
  })

  it('skips a day that is not an array', () => {
    const result = parseImport(file({ '2026-08-16': { nope: true } }))
    expect(result.days).toEqual({})
  })

  it('skips tasks with no usable text and counts them', () => {
    const result = parseImport(file({ '2026-08-16': [task('a'), { id: 'b' }, { id: 'c', text: '   ' }] }))
    expect(result.taskCount).toBe(1)
    expect(result.skipped).toBe(2)
  })

  it('skips tasks with no id', () => {
    const result = parseImport(file({ '2026-08-16': [{ text: 'orphan' }] }))
    expect(result.taskCount).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('coerces completed to a boolean', () => {
    const result = parseImport(file({ '2026-08-16': [{ id: 'a', text: 'x', completed: 'yes' }] }))
    expect(result.days['2026-08-16'][0].completed).toBe(true)
  })

  it('trims task text', () => {
    const result = parseImport(file({ '2026-08-16': [{ id: 'a', text: '  spaced  ' }] }))
    expect(result.days['2026-08-16'][0].text).toBe('spaced')
  })

  it('drops fields it does not recognise', () => {
    const result = parseImport(file({ '2026-08-16': [{ id: 'a', text: 'x', evil: '<script>' }] }))
    expect(result.days['2026-08-16'][0]).not.toHaveProperty('evil')
  })
})

describe('mergeImport', () => {
  it('imports into an empty store', () => {
    const storage = setup()
    const parsed = parseImport(file({ '2026-08-16': [task('a'), task('b')] }))
    const result = mergeImport(storage, parsed)

    expect(result.imported).toBe(2)
    expect(storage.loadTasks('2026-08-16').map(t => t.id)).toEqual(['a', 'b'])
  })

  it('appends to a day that already has tasks', () => {
    const storage = setup({ '2026-08-16': [task('existing')] })
    mergeImport(storage, parseImport(file({ '2026-08-16': [task('new')] })))
    expect(storage.loadTasks('2026-08-16').map(t => t.id)).toEqual(['existing', 'new'])
  })

  it('never overwrites a task already present', () => {
    const storage = setup({ '2026-08-16': [task('a', 'mine')] })
    mergeImport(storage, parseImport(file({ '2026-08-16': [task('a', 'theirs')] })))

    const stored = storage.loadTasks('2026-08-16')
    expect(stored).toHaveLength(1)
    expect(stored[0].text).toBe('mine')
  })

  it('reports duplicates as skipped', () => {
    const storage = setup({ '2026-08-16': [task('a')] })
    const result = mergeImport(storage, parseImport(file({ '2026-08-16': [task('a'), task('b')] })))
    expect(result.imported).toBe(1)
    expect(result.duplicates).toBe(1)
  })

  it('is a no-op the second time the same file is imported', () => {
    const storage = setup()
    const parsed = parseImport(file({ '2026-08-16': [task('a'), task('b')] }))

    mergeImport(storage, parsed)
    const second = mergeImport(storage, parsed)

    expect(second.imported).toBe(0)
    expect(storage.loadTasks('2026-08-16')).toHaveLength(2)
  })

  it('counts the days it touched', () => {
    const storage = setup()
    const parsed = parseImport(file({ '2026-08-16': [task('a')], '2026-08-17': [task('b')] }))
    expect(mergeImport(storage, parsed).days).toBe(2)
  })

  it('round-trips an export back into an empty store', () => {
    const source = setup({ '2026-08-16': [task('a'), task('b')], '2026-08-17': [task('c')] })
    const text = serialize(buildExport(source))

    const target = setup()
    mergeImport(target, parseImport(text))

    expect(target.loadTasks('2026-08-16')).toEqual(source.loadTasks('2026-08-16'))
    expect(target.loadTasks('2026-08-17')).toEqual(source.loadTasks('2026-08-17'))
  })
})
