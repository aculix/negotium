# Negotium Fix and Harden — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Negotium's never-working day-rollover and carry-over, harden storage and accessibility, cut the bundle by ~90%, and bring the toolchain current — without changing the two-day model or the visual design.

**Architecture:** Non-visual logic is extracted from `App.svelte` into small plain-JS modules under `src/lib/`, each taking the current time as an argument rather than calling `new Date()` internally. Storage is a factory taking an injectable backend, so every module is unit-testable without a DOM. `App.svelte` is reduced to a view layer over those modules.

**Tech Stack:** Svelte 5, Vite 8, Vitest 4, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-fix-and-harden-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/dates.js` | Date-key formatting, parsing, arithmetic, display labels. No I/O. |
| `src/lib/storage.js` | Persistence factory over an injectable backend; legacy key migration. |
| `src/lib/rollover.js` | Day-boundary rules and midnight scheduling arithmetic. |
| `src/lib/tasks.js` | Pure task operations returning new arrays. |
| `src/lib/undo.js` | Bounded undo stack and undo application. |
| `src/App.svelte` | View layer only. |
| `src/lib/*.test.js` | Colocated Vitest suites. |

**Deviation from spec, noted:** the spec placed undo inside `tasks.js`. It gets its own module here so `tasks.js` stays purely functional while the stack stays stateful. Same behaviour, cleaner boundary.

---

## Chunk 1: Foundations

### Task 1: Test tooling and repo hygiene

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `Dockerfile:14`
- Create: `vitest.config.js`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^4
```

- [ ] **Step 2: Add the test scripts to `package.json`**

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
})
```

Node environment, not jsdom — every module under test takes its dependencies as arguments.

- [ ] **Step 4: Fix `.gitignore`**

```
.DS_Store
/node_modules
/dist
```

Three changes: `.DS_Store` is no longer root-anchored so nested copies are covered, `/package-lock.json` is removed so the lockfile can be committed, and `/dist` is added.

- [ ] **Step 5: Switch the Dockerfile to `npm ci`**

Replace `Dockerfile:14`:

```dockerfile
RUN npm ci --include=optional
```

`npm ci` requires the committed lockfile and installs it exactly, which is what makes the daily cron rebuild reproducible.

- [ ] **Step 6: Verify the suite runs**

Run: `npm test`
Expected: exits 0, "No test files found" is acceptable at this point.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js .gitignore Dockerfile
git commit -m "chore: add vitest, commit lockfile, fix gitignore and docker install"
```

Note: `index.html` carries a deliberate uncommitted analytics line. Stage explicitly by path — never `git add -A`.

---

### Task 2: `src/lib/dates.js`

**Files:**
- Create: `src/lib/dates.js`
- Test: `src/lib/dates.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { toKey, fromKey, addDays, isKey, labelFor, formatLong } from './dates.js'

describe('toKey', () => {
  it('formats a date as local YYYY-MM-DD', () => {
    expect(toKey(new Date(2026, 7, 15))).toBe('2026-08-15')
  })

  it('zero-pads single-digit months and days', () => {
    expect(toKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('uses local time, not UTC', () => {
    // 23:30 local on the 15th must not roll to the 16th
    expect(toKey(new Date(2026, 7, 15, 23, 30))).toBe('2026-08-15')
  })
})

describe('fromKey', () => {
  it('returns local midnight for the key', () => {
    const d = fromKey('2026-08-15')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(0)
  })

  it('round-trips with toKey', () => {
    expect(toKey(fromKey('2026-02-29'))).toBe('2026-03-01') // 2026 is not a leap year
  })
})

describe('addDays', () => {
  it('advances across a month boundary', () => {
    expect(toKey(addDays(new Date(2026, 7, 31), 1))).toBe('2026-09-01')
  })

  it('advances across a year boundary', () => {
    expect(toKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01')
  })

  it('does not mutate its argument', () => {
    const d = new Date(2026, 7, 15)
    addDays(d, 5)
    expect(toKey(d)).toBe('2026-08-15')
  })
})

describe('isKey', () => {
  it('accepts ISO date keys', () => {
    expect(isKey('2026-08-15')).toBe(true)
  })

  it('rejects legacy toDateString keys', () => {
    expect(isKey('Sat Aug 15 2026')).toBe(false)
  })
})

describe('labelFor', () => {
  it('labels today', () => {
    expect(labelFor('2026-08-15', '2026-08-15')).toBe('Today')
  })

  it('labels tomorrow', () => {
    expect(labelFor('2026-08-16', '2026-08-15')).toBe('Tomorrow')
  })

  it('labels tomorrow across a month boundary', () => {
    expect(labelFor('2026-09-01', '2026-08-31')).toBe('Tomorrow')
  })

  it('falls back to a short date for other days', () => {
    expect(labelFor('2026-08-20', '2026-08-15')).toBe('Aug 20')
  })
})

describe('formatLong', () => {
  it('renders the long-form date used in the header', () => {
    expect(formatLong('2026-08-15')).toBe('Saturday, August 15, 2026')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- dates`
Expected: FAIL, cannot resolve `./dates.js`

- [ ] **Step 3: Implement**

```js
const KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromKey(key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(date, amount) {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + amount)
  return next
}

export function isKey(value) {
  return KEY_PATTERN.test(value)
}

export function labelFor(dateKey, todayKey) {
  if (dateKey === todayKey) return 'Today'
  if (dateKey === toKey(addDays(fromKey(todayKey), 1))) return 'Tomorrow'
  return fromKey(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatLong(dateKey) {
  return fromKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
```

Two details that matter. `fromKey` builds via `new Date(y, m - 1, d)` rather than `new Date('2026-08-15')`, because the string form is parsed as UTC and shifts the day for anyone west of Greenwich. `addDays` goes through `setDate`, which is DST-correct — it preserves the calendar day rather than adding a fixed 24 hours.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- dates`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.js src/lib/dates.test.js
git commit -m "feat: add date-key module with local-time formatting"
```

---

### Task 3: `src/lib/storage.js`

**Files:**
- Create: `src/lib/storage.js`
- Test: `src/lib/storage.test.js`

The factory takes a backend so tests never need a DOM. `createMemoryStore()` is exported for that purpose and doubles as the production fallback when `localStorage` is unavailable.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { createStorage, createMemoryStore } from './storage.js'

const setup = (seed = {}) => {
  const backend = createMemoryStore()
  for (const [k, v] of Object.entries(seed)) backend.setItem(k, v)
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
    backend.setItem = () => { throw new DOMException('QuotaExceededError') }
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
      'unrelated': 'x',
    })
    expect(storage.listTaskKeys().sort()).toEqual(['2026-08-15', '2026-08-16'])
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

  it('merges legacy before existing when the ISO key is occupied', () => {
    const legacy = [{ id: 'l', text: 'legacy', completed: false }]
    const current = [{ id: 'c', text: 'current', completed: false }]
    const { storage } = setup({
      'negotium-tasks-Sat Aug 15 2026': JSON.stringify(legacy),
      'negotium-tasks-2026-08-15': JSON.stringify(current),
    })
    storage.migrateLegacyKeys()
    expect(storage.loadTasks('2026-08-15').map(t => t.id)).toEqual(['l', 'c'])
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

  it('does nothing when there is nothing to migrate', () => {
    const { storage } = setup({ 'negotium-tasks-2026-08-15': '[]' })
    storage.migrateLegacyKeys()
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- storage`
Expected: FAIL, cannot resolve `./storage.js`

- [ ] **Step 3: Implement**

```js
import { isKey, toKey } from './dates.js'

const TASK_PREFIX = 'negotium-tasks-'
const THEME_KEY = 'negotium-theme'

export function createMemoryStore() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
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
    // Safari private mode, disabled storage, or an exhausted quota.
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
      // authoritative; losing the write is preferable to losing the app.
    }
  }

  function loadTasks(dateKey) {
    const raw = read(TASK_PREFIX + dateKey)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function saveTasks(dateKey, tasks) {
    write(TASK_PREFIX + dateKey, JSON.stringify(tasks))
  }

  function listTaskKeys() {
    let keys = []
    try {
      keys = store.keys()
    } catch {
      return []
    }
    return keys
      .filter((k) => k.startsWith(TASK_PREFIX))
      .map((k) => k.slice(TASK_PREFIX.length))
      .filter(isKey)
  }

  function listLegacyKeys() {
    let keys = []
    try {
      keys = store.keys()
    } catch {
      return []
    }
    return keys
      .filter((k) => k.startsWith(TASK_PREFIX))
      .map((k) => k.slice(TASK_PREFIX.length))
      .filter((suffix) => !isKey(suffix))
  }

  function removeTasks(dateKey) {
    try {
      store.removeItem(TASK_PREFIX + dateKey)
    } catch {
      // Nothing actionable.
    }
  }

  function loadTheme() {
    return read(THEME_KEY)
  }

  function saveTheme(mode) {
    write(THEME_KEY, mode)
  }

  function migrateLegacyKeys() {
    for (const suffix of listLegacyKeys()) {
      const parsed = new Date(suffix)
      if (Number.isNaN(parsed.getTime())) continue // Never destroy what we cannot read.

      const isoKey = toKey(parsed)
      const legacy = loadTasksRaw(TASK_PREFIX + suffix)
      const existing = loadTasks(isoKey)

      saveTasks(isoKey, [...legacy, ...existing])
      try {
        store.removeItem(TASK_PREFIX + suffix)
      } catch {
        // Leave it; the merge above is already durable.
      }
    }
  }

  function loadTasksRaw(fullKey) {
    const raw = read(fullKey)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- storage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.js src/lib/storage.test.js
git commit -m "feat: add resilient storage module with legacy key migration"
```

---

### Task 4: `src/lib/rollover.js`

**Files:**
- Create: `src/lib/rollover.js`
- Test: `src/lib/rollover.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { createStorage, createMemoryStore } from './storage.js'
import { rollover, msUntilNextMidnight } from './rollover.js'

const task = (id, completed = false) => ({ id, text: id, completed })

const setup = (seed = {}) => {
  const backend = createMemoryStore()
  for (const [k, v] of Object.entries(seed)) {
    backend.setItem(`negotium-tasks-${k}`, JSON.stringify(v))
  }
  return createStorage(backend)
}

describe('rollover', () => {
  it('is a no-op when only today has tasks', () => {
    const storage = setup({ '2026-08-15': [task('a')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map(t => t.id)).toEqual(['a'])
    expect(storage.listTaskKeys()).toEqual(['2026-08-15'])
  })

  it('carries unfinished tasks forward from yesterday', () => {
    const storage = setup({ '2026-08-14': [task('old')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map(t => t.id)).toEqual(['old'])
    expect(storage.loadTasks('2026-08-15').map(t => t.id)).toEqual(['old'])
  })

  it('drops completed tasks from prior days', () => {
    const storage = setup({ '2026-08-14': [task('done', true), task('open')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map(t => t.id)).toEqual(['open'])
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
    expect(result.map(t => t.id)).toEqual(['mon', 'tue', 'wed'])
  })

  it('preserves within-day order', () => {
    const storage = setup({ '2026-08-14': [task('first'), task('second'), task('third')] })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map(t => t.id)).toEqual(['first', 'second', 'third'])
  })

  it('places carried tasks above tasks already in today', () => {
    const storage = setup({
      '2026-08-14': [task('carried')],
      '2026-08-15': [task('existing')],
    })
    const result = rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(result.map(t => t.id)).toEqual(['carried', 'existing'])
  })

  it('never touches future keys', () => {
    const storage = setup({
      '2026-08-15': [task('today')],
      '2026-08-16': [task('tomorrow')],
    })
    rollover(storage, new Date(2026, 7, 15, 9, 0))
    expect(storage.loadTasks('2026-08-16').map(t => t.id)).toEqual(['tomorrow'])
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

  it('carries across a year boundary', () => {
    const storage = setup({ '2026-12-31': [task('nye')] })
    const result = rollover(storage, new Date(2027, 0, 1, 9, 0))
    expect(result.map(t => t.id)).toEqual(['nye'])
  })
})

describe('msUntilNextMidnight', () => {
  it('counts down to the next local midnight', () => {
    const ms = msUntilNextMidnight(new Date(2026, 7, 15, 23, 0, 0))
    expect(ms).toBe(60 * 60 * 1000)
  })

  it('returns a full day just after midnight', () => {
    const ms = msUntilNextMidnight(new Date(2026, 7, 15, 0, 0, 0))
    expect(ms).toBe(24 * 60 * 60 * 1000)
  })

  it('never returns a non-positive value', () => {
    expect(msUntilNextMidnight(new Date(2026, 7, 15, 23, 59, 59, 999))).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rollover`
Expected: FAIL, cannot resolve `./rollover.js`

- [ ] **Step 3: Implement**

```js
import { toKey } from './dates.js'

export function rollover(storage, now) {
  const todayKey = toKey(now)

  const pastKeys = storage
    .listTaskKeys()
    .filter((key) => key < todayKey)
    .sort()

  if (pastKeys.length === 0) return storage.loadTasks(todayKey)

  const carried = []
  for (const key of pastKeys) {
    carried.push(...storage.loadTasks(key).filter((task) => !task.completed))
    storage.removeTasks(key)
  }

  const merged = [...carried, ...storage.loadTasks(todayKey)]
  storage.saveTasks(todayKey, merged)
  return merged
}

export function msUntilNextMidnight(now) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return Math.max(1000, next.getTime() - now.getTime())
}
```

`listTaskKeys` already filters to well-formed ISO keys, so the `< todayKey` string comparison is safe — and sortable keys are exactly why the format changed. Building next midnight from local calendar parts keeps it DST-correct: on a spring-forward day the interval is genuinely 23 hours, and this returns 23 hours.

Note the empty-carry case: when every prior day held only completed tasks, `carried` is empty but the prior keys are still deleted, and today's list is rewritten unchanged. That is intended — pruning is the point.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- rollover`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rollover.js src/lib/rollover.test.js
git commit -m "feat: add day-rollover with multi-day carry-forward"
```

---

### Task 5: `src/lib/tasks.js` and `src/lib/undo.js`

**Files:**
- Create: `src/lib/tasks.js`, `src/lib/undo.js`
- Test: `src/lib/tasks.test.js`, `src/lib/undo.test.js`

- [ ] **Step 1: Write the failing tests for `tasks.js`**

```js
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
})

describe('deleteTask', () => {
  it('removes the matching task', () => {
    expect(deleteTask([task('a'), task('b')], 'a').map(t => t.id)).toEqual(['b'])
  })

  it('ignores an unknown id', () => {
    expect(deleteTask([task('a')], 'zzz')).toHaveLength(1)
  })
})

describe('reorderTask', () => {
  const three = [task('a'), task('b'), task('c')]

  it('moves an item later', () => {
    expect(reorderTask(three, 0, 2).map(t => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item earlier', () => {
    expect(reorderTask(three, 2, 0).map(t => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('moves an item into the middle', () => {
    expect(reorderTask(three, 0, 1).map(t => t.id)).toEqual(['b', 'a', 'c'])
  })

  it('is a no-op when indices match', () => {
    expect(reorderTask(three, 1, 1).map(t => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op for out-of-range indices', () => {
    expect(reorderTask(three, 0, 9).map(t => t.id)).toEqual(['a', 'b', 'c'])
    expect(reorderTask(three, -1, 0).map(t => t.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('clearCompleted', () => {
  it('removes completed tasks', () => {
    const result = clearCompleted([task('a', true), task('b'), task('c', true)])
    expect(result.map(t => t.id)).toEqual(['b'])
  })

  it('is a no-op when nothing is completed', () => {
    expect(clearCompleted([task('a')])).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tasks`
Expected: FAIL

- [ ] **Step 3: Implement `tasks.js`**

```js
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createTask(text, now = Date.now()) {
  return { id: newId(), text, completed: false, createdAt: now }
}

export function addTask(tasks, text, now = Date.now()) {
  const trimmed = text.trim()
  if (!trimmed) return tasks
  return [...tasks, createTask(trimmed, now)]
}

export function toggleTask(tasks, id) {
  return tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task))
}

export function deleteTask(tasks, id) {
  return tasks.filter((task) => task.id !== id)
}

export function reorderTask(tasks, from, to) {
  if (from === to) return tasks
  if (from < 0 || from >= tasks.length) return tasks
  if (to < 0 || to >= tasks.length) return tasks

  const next = [...tasks]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function clearCompleted(tasks) {
  return tasks.filter((task) => !task.completed)
}
```

`newId` falls back when `crypto.randomUUID` is missing — it requires a secure context, and self-hosted Negotium over plain HTTP on a LAN is a real deployment shape for this app.

- [ ] **Step 4: Write the failing tests for `undo.js`**

```js
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
})

describe('applyUndo', () => {
  it('restores a deleted task at its original index', () => {
    const after = [task('a'), task('c')]
    const entry = { type: 'delete', task: task('b'), index: 1 }
    expect(applyUndo(after, entry).map(t => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('restores at the end when the list has since shrunk', () => {
    const entry = { type: 'delete', task: task('b'), index: 5 }
    expect(applyUndo([task('a')], entry).map(t => t.id)).toEqual(['a', 'b'])
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
    expect(applyUndo(after, entry).map(t => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op for a null entry', () => {
    const tasks = [task('a')]
    expect(applyUndo(tasks, null)).toBe(tasks)
  })
})
```

- [ ] **Step 5: Implement `undo.js`**

```js
export function createUndoStack(limit = 10) {
  const entries = []

  return {
    push(entry) {
      entries.push(entry)
      if (entries.length > limit) entries.shift()
    },
    pop() {
      return entries.length > 0 ? entries.pop() : null
    },
    get size() {
      return entries.length
    },
    clear() {
      entries.length = 0
    },
  }
}

export function applyUndo(tasks, entry) {
  if (!entry) return tasks

  if (entry.type === 'delete') {
    const next = [...tasks]
    next.splice(Math.min(entry.index, next.length), 0, entry.task)
    return next
  }

  if (entry.type === 'clearCompleted') {
    const next = [...tasks]
    for (const { task, index } of entry.removed) {
      next.splice(Math.min(index, next.length), 0, task)
    }
    return next
  }

  return tasks
}
```

`clearCompleted` entries must record `removed` in ascending index order, so re-inserting front to back lands each task at its original position.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, all suites

- [ ] **Step 7: Commit**

```bash
git add src/lib/tasks.js src/lib/tasks.test.js src/lib/undo.js src/lib/undo.test.js
git commit -m "feat: add pure task operations and bounded undo stack"
```

---

## Chunk 2: Rewire, modernize, and polish

### Task 6: Rewire `App.svelte` onto the modules (still Svelte 4)

The riskiest step in the plan. It runs before the Svelte 5 upgrade so that if behaviour shifts, the `lib/` tests are already green and the cause is unambiguous.

**Files:**
- Modify: `src/App.svelte`

- [ ] **Step 1: Replace the storage and date helpers**

Delete `getDateKey`, `loadTasksForDate`, `saveTasksForDate`, and `checkAndMigrateTasks` from `src/App.svelte:101-139`. Replace the local task mutators with calls into `tasks.js`. Track `selectedKey` (an ISO key) instead of `selectedDate` (a `toDateString()` value).

- [ ] **Step 2: Wire rollover to all four triggers**

```js
let midnightTimer = null

function scheduleMidnight() {
  clearTimeout(midnightTimer)
  midnightTimer = setTimeout(() => {
    runRollover()
    scheduleMidnight()
  }, msUntilNextMidnight(new Date()))
}

function runRollover() {
  const now = new Date()
  const newTodayKey = toKey(now)
  const wasViewingToday = selectedKey === todayKey

  todayKey = newTodayKey
  rollover(storage, now)

  if (wasViewingToday) selectedKey = todayKey
  tasks = storage.loadTasks(selectedKey)
}
```

If the user was looking at Today when midnight passed, they stay on the new Today. If they were looking at Tomorrow, that key is now Today and they follow it there — which is the existing mental model, preserved.

- [ ] **Step 3: Verify manually against the running app**

Run: `npm run dev`

Check each: adding, completing, deleting, clear-completed, the Today/Tomorrow toggle, the date label, drag reordering, theme toggle and its persistence, and a reload preserving tasks.

- [ ] **Step 4: Verify the legacy migration against real data**

In devtools, seed a legacy key and reload:

```js
localStorage.setItem('negotium-tasks-' + new Date(Date.now() - 86400000).toDateString(),
  JSON.stringify([{ id: 1, text: 'carried from legacy', completed: false }]))
```

Expected: the task appears in Today, the legacy key is gone, and an ISO key holds it.

- [ ] **Step 5: Commit**

```bash
git add src/App.svelte
git commit -m "refactor: rewire App.svelte onto extracted lib modules"
```

---

### Task 7: Upgrade Vite 5 → 8 and Svelte 4 → 5

**Files:**
- Modify: `package.json`, `src/main.js`, `src/App.svelte`

- [ ] **Step 1: Upgrade**

```bash
npm install -D svelte@^5 vite@^8 @sveltejs/vite-plugin-svelte@^7
```

- [ ] **Step 2: Update the mount API in `src/main.js`**

```js
import { mount } from 'svelte'
import App from './App.svelte'

export default mount(App, { target: document.getElementById('app') })
```

- [ ] **Step 3: Migrate reactivity in `src/App.svelte`**

`let x = …` for reactive state becomes `let x = $state(…)`. `$: y = …` becomes `const y = $derived(…)`. The persistence blocks at `src/App.svelte:166-172` become `$effect`. Event handlers move from `on:click` to `onclick`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build && npm run dev`
Expected: tests pass, build succeeds with no warnings, app behaves identically.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main.js src/App.svelte
git commit -m "chore: upgrade to svelte 5 and vite 8"
```

---

### Task 8: Drop Lottie, remove the splash, fix the theme flash

**Files:**
- Modify: `src/App.svelte`, `index.html`, `vite.config.mjs`, `package.json`
- Create: `public/` — move `assets/logo.svg` here
- Move: `assets/screenshot.png` → `docs/screenshot.png`
- Delete: `assets/lottie_empty_state.json`

- [ ] **Step 1: Remove the dependency**

```bash
npm uninstall lottie-web
```

- [ ] **Step 2: Replace the empty state**

Delete `initLottie` (`src/App.svelte:174-203`) and the `lottie-web` import. Replace the `.lottie-animation` div with an inline SVG using `currentColor` and a CSS animation, sized to the existing 200×200 box so no layout shifts.

- [ ] **Step 3: Remove the splash**

Delete `isLoading`, the `setTimeout` at `src/App.svelte:212-215`, and the entire `.loading-overlay` block. Keep `isInitialized`, which still gates the persistence effects against firing during hydration.

- [ ] **Step 4: Apply the theme before first paint**

In `index.html`, before the stylesheet:

```html
<script>
  (function () {
    try {
      var stored = localStorage.getItem('negotium-theme');
      var dark = stored ? stored === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (dark) document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
</script>
```

Update `body`'s hardcoded colours at `index.html:12-24` to read from the same custom properties, and move the `.dark` selector to `html.dark` in `src/style.css` so both the pre-paint script and the runtime toggle target one element.

**Preserve the analytics line at `index.html:9` exactly as-is.** It is a deliberate uncommitted local change and must not be staged.

- [ ] **Step 5: Stop shipping the screenshot**

Move `assets/screenshot.png` to `docs/screenshot.png`, update the README reference, move `assets/logo.svg` into a new `public/`, and set `publicDir: 'public'` in `vite.config.mjs:6`.

- [ ] **Step 6: Verify the bundle**

Run: `npm run build`
Expected: JS drops from ~337 KB to roughly 30 KB, and `dist/` no longer contains `screenshot.png` or `lottie_empty_state.json`.

- [ ] **Step 7: Commit**

```bash
git add src/App.svelte src/style.css vite.config.mjs package.json package-lock.json public docs/screenshot.png README.md
git rm assets/lottie_empty_state.json assets/screenshot.png assets/logo.svg
git commit -m "perf: drop lottie, remove splash, fix theme flash"
```

---

### Task 9: Accessibility fixes

**Files:**
- Modify: `src/App.svelte`, `src/style.css`

- [ ] **Step 1: Fix the invisible delete button**

`src/style.css:365` — reveal on focus as well as hover:

```css
.task-item:hover .delete-btn,
.task-item:focus-within .delete-btn {
  opacity: 1;
}
```

- [ ] **Step 2: Remove the invalid nested interactives**

Drop `role="button"` and `tabindex="0"` from the task row (`src/App.svelte:336-337`). Give the checkbox `aria-pressed` and an accessible name carrying the task text, so a screen reader announces the task and its state from one control.

- [ ] **Step 3: Retire Backspace-to-delete**

In `handleTaskKeydown` (`src/App.svelte:51-58`), keep `Delete`, drop `Backspace`.

- [ ] **Step 4: Add undo**

Bind `Cmd/Ctrl+Z` on the window. Push a `{ type: 'delete', task, index }` entry on every delete and a `clearCompleted` entry on clear.

- [ ] **Step 5: Verify by keyboard only**

Tab through the app with the mouse untouched. Every control must be reachable and visibly focused. Delete a task, press `Cmd+Z`, confirm it returns to its original position.

- [ ] **Step 6: Commit**

```bash
git add src/App.svelte src/style.css
git commit -m "fix: keyboard-visible delete, valid aria, undo support"
```

---

### Task 10: Pointer Events reordering

Largest and most isolated step. Sequenced last so it can be deferred without affecting anything above.

**Files:**
- Modify: `src/App.svelte`, `src/style.css`

- [ ] **Step 1: Remove HTML5 drag-and-drop**

Delete `handleDragStart`, `handleDragOver`, `handleDragEnd`, `handleDragLeave` (`src/App.svelte:60-87`) and the `draggable`/`on:drag*` attributes. This also disposes of `event.dataTransfer.setData('text/html', event.target)` at `src/App.svelte:63`, which passes a DOM node where the API requires a string.

- [ ] **Step 2: Implement pointer-based reordering**

`pointerdown` on a row captures the pointer and records the start position. Movement past a small threshold (8 px) begins a drag — the threshold is what keeps a tap-to-complete from being read as a drag. `pointermove` computes the target index from row midpoints; `pointerup` commits via `reorderTask` and releases capture. Set `touch-action: none` on rows so the browser does not claim the gesture for scrolling.

- [ ] **Step 3: Add keyboard reordering**

`Alt+↑` / `Alt+↓` on a focused row calls `reorderTask`, then restores focus to the moved row.

- [ ] **Step 4: Verify on all three input types**

Desktop mouse drag, touch drag in a mobile viewport (devtools device emulation is sufficient), and `Alt+Arrow`. Confirm a tap still toggles completion without triggering a drag.

- [ ] **Step 5: Commit**

```bash
git add src/App.svelte src/style.css
git commit -m "fix: pointer-events reordering with touch and keyboard support"
```

---

### Task 11: README corrections

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Correct the claims**

Carry-over documented as actually implemented: unfinished tasks from *any* prior day move to Today, completed ones are cleared. Keyboard shortcuts updated — Backspace removed, `Cmd/Ctrl+Z` and `Alt+Arrow` added. Storage section updated to the ISO key format with a note on the automatic one-time migration. Screenshot path updated to `docs/screenshot.png`.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: correct carry-over behaviour and shortcuts"
```

---

## Verification

Final gate before calling this done:

- [ ] `npm test` — all suites pass
- [ ] `npm run build` — succeeds, JS bundle ≈30 KB
- [ ] `docker build -t negotium-test .` — succeeds using `npm ci`
- [ ] Legacy-key migration confirmed against seeded real-format data
- [ ] Rollover confirmed by setting the system clock forward past midnight with the app open
- [ ] Full keyboard pass with no mouse
- [ ] Touch reordering confirmed in a mobile viewport
- [ ] `git status` still shows `index.html` modified with only the analytics line
