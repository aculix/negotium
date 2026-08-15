import { isKey, toKey } from './dates.js'

const TASK_PREFIX = 'negotium-tasks-'
const THEME_KEY = 'negotium-theme'

/** Backend used in tests, and as the production fallback when localStorage is
 *  unavailable (Safari private mode, disabled storage, exhausted quota). */
export function createMemoryStore() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
    keys: () => [...map.keys()],
  }
}

function wrapWebStorage(webStorage) {
  return {
    getItem: (key) => webStorage.getItem(key),
    setItem: (key, value) => webStorage.setItem(key, value),
    removeItem: (key) => webStorage.removeItem(key),
    keys: () => Object.keys(webStorage),
  }
}

function resolveBackend() {
  try {
    const probe = '__negotium_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return wrapWebStorage(window.localStorage)
  } catch {
    return createMemoryStore()
  }
}

export function createStorage(backend) {
  const store = backend ?? resolveBackend()

  function read(key) {
    try {
      return store.getItem(key)
    } catch {
      return null
    }
  }

  function write(key, value) {
    try {
      store.setItem(key, value)
    } catch {
      // Quota exhausted or storage revoked mid-session. In-memory state stays
      // authoritative; losing a write beats losing the app.
    }
  }

  function drop(key) {
    try {
      store.removeItem(key)
    } catch {
      // Nothing actionable.
    }
  }

  function allKeys() {
    try {
      return store.keys()
    } catch {
      return []
    }
  }

  function parseTasks(raw) {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function loadTasks(dateKey) {
    return parseTasks(read(TASK_PREFIX + dateKey))
  }

  function saveTasks(dateKey, tasks) {
    write(TASK_PREFIX + dateKey, JSON.stringify(tasks))
  }

  function taskSuffixes() {
    return allKeys()
      .filter((key) => key.startsWith(TASK_PREFIX))
      .map((key) => key.slice(TASK_PREFIX.length))
  }

  function listTaskKeys() {
    return taskSuffixes().filter(isKey)
  }

  function removeTasks(dateKey) {
    drop(TASK_PREFIX + dateKey)
  }

  function loadTheme() {
    return read(THEME_KEY)
  }

  function saveTheme(mode) {
    write(THEME_KEY, mode)
  }

  /** One-time conversion of `negotium-tasks-Sat Aug 15 2026` keys written by
   *  versions before the ISO format. Idempotent, and deliberately conservative:
   *  a suffix that will not parse is left in place rather than discarded. */
  function migrateLegacyKeys() {
    for (const suffix of taskSuffixes().filter((s) => !isKey(s))) {
      const parsed = new Date(suffix)
      if (Number.isNaN(parsed.getTime())) continue

      const isoKey = toKey(parsed)
      const legacy = parseTasks(read(TASK_PREFIX + suffix))
      const existing = loadTasks(isoKey)

      saveTasks(isoKey, [...legacy, ...existing])
      drop(TASK_PREFIX + suffix)
    }
  }

  return {
    loadTasks,
    saveTasks,
    listTaskKeys,
    removeTasks,
    loadTheme,
    saveTheme,
    migrateLegacyKeys,
  }
}
