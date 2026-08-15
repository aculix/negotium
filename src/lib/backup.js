import { isKey } from './dates.js'

const APP = 'negotium'
const FORMAT_VERSION = 1

/** Everything currently stored, as a plain object ready to serialize. */
export function buildExport(storage, now = new Date()) {
  const days = {}

  for (const dateKey of storage.listTaskKeys().sort()) {
    const tasks = storage.loadTasks(dateKey)
    if (tasks.length > 0) days[dateKey] = tasks
  }

  return {
    app: APP,
    version: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    days,
  }
}

export function serialize(data) {
  return JSON.stringify(data, null, 2)
}

/** Keeps only the fields we know about, so an edited file can't smuggle
 *  anything unexpected into storage. Returns null if the task is unusable. */
function cleanTask(raw) {
  if (!raw || typeof raw !== 'object') return null

  const hasId = typeof raw.id === 'string' || typeof raw.id === 'number'
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!hasId || !text) return null

  return {
    id: String(raw.id),
    text,
    completed: Boolean(raw.completed),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  }
}

/**
 * Validates a file's contents without touching storage.
 *
 * Anything malformed is skipped rather than failing the whole import: one bad
 * row in a hand-edited file shouldn't cost someone the other two hundred.
 */
export function parseImport(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't a valid JSON file." }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: "That file doesn't look like a Negotium export." }
  }

  if (raw.app !== APP || !raw.days || typeof raw.days !== 'object' || Array.isArray(raw.days)) {
    return { ok: false, error: "That file doesn't look like a Negotium export." }
  }

  const days = {}
  let taskCount = 0
  let skipped = 0

  for (const [dateKey, value] of Object.entries(raw.days)) {
    if (!isKey(dateKey) || !Array.isArray(value)) continue

    const tasks = []
    for (const entry of value) {
      const task = cleanTask(entry)
      if (task) tasks.push(task)
      else skipped += 1
    }

    if (tasks.length > 0) {
      days[dateKey] = tasks
      taskCount += tasks.length
    }
  }

  return { ok: true, days, taskCount, skipped }
}

/**
 * Adds parsed tasks to storage. Additive by design: a task whose id is already
 * present is left alone, so importing the same file twice changes nothing and
 * importing into a live list can't lose work. The trade is that import cannot
 * be used to roll back to an earlier state.
 */
export function mergeImport(storage, parsed) {
  if (!parsed?.ok) return { imported: 0, duplicates: 0, days: 0 }

  let imported = 0
  let duplicates = 0
  let days = 0

  for (const [dateKey, incoming] of Object.entries(parsed.days)) {
    const existing = storage.loadTasks(dateKey)
    const seen = new Set(existing.map(task => String(task.id)))

    const additions = []
    for (const task of incoming) {
      if (seen.has(task.id)) duplicates += 1
      else {
        additions.push(task)
        seen.add(task.id)
      }
    }

    if (additions.length > 0) {
      storage.saveTasks(dateKey, [...existing, ...additions])
      imported += additions.length
      days += 1
    }
  }

  return { imported, duplicates, days }
}
