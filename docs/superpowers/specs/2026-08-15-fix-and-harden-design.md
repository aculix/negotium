# Negotium: Fix and Harden — Design

**Date:** 2026-08-15
**Status:** Approved, not yet implemented

## Context

Negotium is a minimalist Svelte to-do app scoped to exactly two days, Today and Tomorrow. Tasks are stored client-side in `localStorage`, one key per date. It ships as a static nginx image published to GHCR.

The app has not been updated in roughly ten months. An audit found that its headline feature — automatic carry-over of tasks across the day boundary — has never worked, alongside several correctness, accessibility, and payload problems.

This design covers correctness and foundations only. No new user-facing features, no changes to the two-day model, and no visual redesign.

## Findings this design addresses

### Correctness

1. **Carry-over is dead code.** `checkAndMigrateTasks()` (`src/App.svelte:118`) guards on `currentDate !== today`. `currentDate` is initialized from `new Date().toDateString()` at `src/App.svelte:14` and compared against a fresh `new Date().toDateString()` milliseconds later in `onMount`. The condition is never true.

   "Tomorrow becomes Today" does work, but incidentally — tomorrow's tasks are written under tomorrow's date key, which is simply what gets read as today after midnight. What is genuinely broken is carry-over of *unfinished* work: those tasks remain under the previous day's key, are never displayed again, and are never cleaned up.

2. **No midnight rollover while open.** There is no timer or `visibilitychange` listener. A tab left open overnight keeps `selectedDate` pinned to the previous day, still labels it "Today" (`buttonText` at `src/App.svelte:153` only recomputes when `selectedDate` changes; the `new Date()` inside it is not a reactive dependency), and writes all subsequent edits into the previous day's key.

3. **Only one day back.** Even had the guard been correct, the logic inspects yesterday alone. A three-day absence would still drop work.

4. **Unbounded storage growth.** Every date key ever written persists indefinitely.

5. **Unguarded `JSON.parse`.** `src/App.svelte:108` will throw on any corrupt value and white-screen the app. `localStorage` access is also unguarded against Safari private mode and quota exhaustion.

### Accessibility

6. **Delete button invisible to keyboard users.** `.delete-btn` is `opacity: 0`, revealed only by `.task-item:hover` (`src/style.css:360`). The `:focus-visible` outline (`src/style.css:509`) renders on a zero-opacity element and is therefore also invisible.

7. **Invalid nested interactives.** The task row is `role="button"` with `tabindex="0"` (`src/App.svelte:336`) and contains two real `<button>` elements.

8. **Backspace destroys a task with no recovery.** `src/App.svelte:55`, on a focusable row.

9. **Reordering is desktop-mouse-only.** HTML5 drag events do not fire on touch, and there is no keyboard alternative.

### Payload and startup

10. **`lottie-web` is 305 KB of a 337 KB bundle** (~91%), statically imported at `src/App.svelte:5` to play one decorative empty-state animation. It ships to every visitor regardless of whether the empty state renders.

11. **The 200 KB README screenshot is served to users.** `publicDir: 'assets'` (`vite.config.mjs:6`) copies `assets/screenshot.png` into `dist/`.

12. **A 500 ms artificial loading screen** on every launch (`src/App.svelte:212`) for an app with no async work.

13. **Dark-mode flash.** `index.html:16` hardcodes the light background; `darkMode` is only read from `localStorage` after mount.

### Build and infrastructure

14. **Non-reproducible Docker builds.** `package-lock.json` is gitignored and untracked, so the `npm install` in `Dockerfile:14` resolves fresh versions on every build. Combined with the daily cron in `.github/workflows/docker-publish.yml:9`, the published `:main` image drifts silently.
15. `dist/` is not gitignored.
16. Svelte 4.2 → current 5.56; Vite 5.0 → current 8.2.
17. No tests, no linting.

## Goals

- Carry-over works, across arbitrary multi-day gaps, and is covered by tests.
- Rollover is detected while the app is open.
- Storage is bounded, resilient to corruption, and survives an unavailable `localStorage`.
- Reordering works on touch and by keyboard.
- Initial payload drops by roughly 90%.
- Dependencies are current and builds are reproducible.

## Non-goals

- The two-day model. No projects, tags, due dates, or recurrence.
- Visual redesign. Layout, palette, and type stay as they are.
- Sync, accounts, or any server component.
- PWA/offline and data export/import — deliberately deferred to a later pass.
- TypeScript.

## Approach

Extract non-visual logic from `App.svelte` into small, individually testable plain-JS modules, then fix the defects inside those modules where they can be verified. `App.svelte` is reduced to a view layer and keeps its existing markup and CSS.

The extraction is a precondition, not incidental cleanup: the defects that matter most are time-dependent, and `new Date()` is currently called inline in five places inside a component that needs a DOM to instantiate. Injecting the clock is what makes "what happens at midnight" an ordinary unit test.

Alternatives considered and rejected:

- **Surgical in-place patches.** Lowest risk, but the rollover fix would ship verified only by hand — which is how it shipped broken originally — and the dependency drift would remain.
- **Full rewrite in Svelte 5 + TypeScript with stores.** Cleanest end state, but a ground-up rebuild of a working UI carries a materially higher chance of silently altering UX, and TypeScript is heavy ceremony for an app with three data shapes.

## Module design

```
src/
  lib/
    dates.js      date-key formatting and display labels
    storage.js    localStorage persistence, enumeration, pruning
    rollover.js   day-boundary rules
    tasks.js      pure task operations
  App.svelte      view only
  main.js
  style.css
```

Every function needing the current time receives it as an argument. No module below calls `new Date()` internally.

### `dates.js`

| Function | Purpose |
|---|---|
| `toKey(date)` | `Date` → `YYYY-MM-DD` in local time |
| `fromKey(key)` | `YYYY-MM-DD` → `Date` at local midnight |
| `addDays(date, n)` | Date arithmetic |
| `labelFor(dateKey, todayKey)` | `"Today"` / `"Tomorrow"` / formatted long date |

### `storage.js`

| Function | Purpose |
|---|---|
| `loadTasks(dateKey)` | Returns `[]` on missing, unparseable, or non-array values |
| `saveTasks(dateKey, tasks)` | Persists; never throws to the caller |
| `listTaskKeys()` | All `negotium-tasks-*` keys currently present |
| `removeTasks(dateKey)` | Deletes one date's entry |
| `loadTheme()` / `saveTheme(mode)` | Theme preference |
| `migrateLegacyKeys()` | One-time old-format → ISO conversion |

All access is wrapped. If `localStorage` throws on access, the module falls back to an in-memory `Map` for the session so the app still runs.

### `rollover.js`

| Function | Purpose |
|---|---|
| `rollover(now)` | Applies carry-over for all past dates; returns the resulting Today list |
| `nextMidnight(now)` | Milliseconds until the next local midnight, for scheduling |

### `tasks.js`

Pure functions over task arrays, returning new arrays: `addTask`, `toggleTask`, `deleteTask`, `reorderTask`, `clearCompleted`. Plus a bounded undo stack (last 10 operations) recording enough state to restore a deleted task at its original index.

Task shape is unchanged except that `id` becomes `crypto.randomUUID()` rather than `Date.now()`.

## Storage format and migration

Keys move from `negotium-tasks-Mon Aug 15 2026` to `negotium-tasks-2026-08-15`.

The multi-day carry-over rule requires enumerating stored dates and comparing them against today. ISO keys make that a string comparison; `toDateString()` keys would require re-parsing every key. Sortable keys keep the rollover logic simple enough to be visibly correct.

Migration runs once, before any other storage read:

1. Enumerate `negotium-tasks-*` keys.
2. For each key not already matching `YYYY-MM-DD`, parse the legacy suffix via `new Date(suffix)`.
3. On a valid parse, rewrite the value under the ISO key. If the ISO key already holds tasks, concatenate legacy first, then existing.
4. Delete the legacy key.
5. On an unparseable suffix, leave the key untouched and skip it — never destroy data that cannot be interpreted.

The live deployment at `negotium.aculix.org` holds real data in the legacy format. This path is written and tested before anything else.

## Rollover behaviour

On rollover, for every stored date key strictly earlier than today:

1. Unfinished tasks are collected, oldest date first, preserving within-day order.
2. They are placed **above** any tasks already present in Today.
3. Completed tasks from those dates are discarded.
4. The old date key is deleted.

Pruning is therefore a side effect of carry-over; there is no separate retention policy.

Future-dated keys (Tomorrow) are never touched.

Rollover is triggered from four places:

- On mount.
- On `visibilitychange` when the document becomes visible.
- On window `focus`.
- From a `setTimeout` scheduled to the next local midnight, which reschedules itself on fire.

The timer covers a pinned tab crossing midnight unattended. `visibilitychange` and `focus` cover machine sleep, where timers do not fire reliably.

## Error handling

| Condition | Behaviour |
|---|---|
| Corrupt JSON in a task entry | Treated as empty; app continues |
| Value present but not an array | Treated as empty |
| `localStorage` throws on access | In-memory fallback for the session |
| Quota exceeded on write | Write dropped; in-memory state stays authoritative |
| Legacy key with unparseable date | Left in place, skipped |

Nothing in this table is permitted to prevent the app from starting.

## Testing

Vitest against `src/lib/`. No component tests in this pass — that requires jsdom and testing-library, and by then all consequential logic lives in `lib/`.

**Migration:** legacy → ISO conversion; collision with an existing ISO key merges in the correct order; unparseable suffix is left alone; migration is idempotent across repeated runs.

**Rollover:** same day is a no-op; one-day gap; multi-day gap ordering; completed tasks dropped; within-day order preserved; carried tasks precede existing Today tasks; future keys untouched; empty prior days; DST spring-forward and fall-back boundaries; `nextMidnight` correctness across a DST change.

**Storage:** corrupt JSON returns `[]`; non-array returns `[]`; throwing `localStorage` falls back to memory.

**Tasks:** whitespace-only input rejected; text trimmed; toggle; delete; reorder to first, last, and middle positions; `clearCompleted`; undo restores a deleted task at its original index; undo stack is bounded at 10.

## UX changes

Three deliberate deviations, each approved:

1. **Backspace no longer deletes a focused task.** `Delete` still does, as documented. Backspace is the accidental trigger — pressed meaning "go back", or while typing — and it currently destroys a task irrecoverably.
2. **Undo is `Cmd/Ctrl+Z`, with no new on-screen UI.** A toast would be more discoverable but introduces a UI element to an app that has none. Documented in the README instead.
3. **The 500 ms splash screen is removed.** It fronts no async work.

Everything else — the two-day toggle, the input, the checkbox and delete affordances, the stats line, the empty state, the palette, spacing, and type — is unchanged.

## Accessibility changes

- Task row loses `role="button"` and `tabindex="0"`; it becomes a plain container. The checkbox button carries the accessible name.
- Delete button revealed on `:focus-within` as well as `:hover`.
- `Alt+↑` / `Alt+↓` reorders a task when its row has focus.

## Reordering rewrite

HTML5 drag-and-drop is replaced with Pointer Events, which unifies mouse, touch, and pen through one code path. Roughly 80 lines, no new dependency. `event.dataTransfer.setData('text/html', event.target)` at `src/App.svelte:63` — which passes a DOM node where a string is required — disappears with it.

Keyboard reordering via `Alt+Arrow` is included, so reordering is no longer pointer-exclusive.

## Payload and build

- **Lottie removed**, empty-state animation redrawn as an inline animated SVG in the existing accent colour. Expected bundle: 337 KB → ~30 KB.
- **Theme applied pre-paint** by an inline script in `<head>` that reads the stored preference and sets a class on `<html>` before first paint.
- **`publicDir`** switched to a dedicated `public/` holding only runtime assets. `screenshot.png` moves to `docs/` and is referenced from the README by its new path.
- **`.gitignore`**: add `dist/`, remove `/package-lock.json`, change `/.DS_Store` to `.DS_Store` so nested copies are covered.
- **`package-lock.json` committed**; `Dockerfile` switched from `npm install` to `npm ci`.
- **Vite 5 → 8**, **Svelte 4 → 5**. The Svelte upgrade rewrites reactive declarations (`$:` → `$derived` / `$effect`) and the mount API at `src/main.js:3`. Mechanical at this size, but it touches nearly every reactive line.

## Sequencing

1. Tooling: Vitest, `.gitignore`, commit the lockfile, `npm ci` in the Dockerfile.
2. `dates.js` and `storage.js` with the legacy migration, fully tested, before any behaviour changes.
3. `rollover.js` with the full carry-over test matrix.
4. `tasks.js` including undo.
5. Rewire `App.svelte` to the modules, still on Svelte 4, verifying no visible change.
6. Svelte 4 → 5 and Vite 5 → 8.
7. Drop Lottie; inline SVG empty state; remove the splash; pre-paint theme.
8. Accessibility fixes.
9. Pointer Events reordering plus `Alt+Arrow`.
10. README corrections: the carry-over rule as actually implemented, revised keyboard shortcuts, the new storage key format.

Steps 2–4 are independently verifiable before anything user-visible moves. Step 5 is the riskiest single step and should be reviewed against the running app.

## Risks

| Risk | Mitigation |
|---|---|
| Migration loses real user data | Written and tested first; unparseable keys are never deleted; merge order defined |
| Svelte 5 upgrade alters behaviour subtly | Sequenced after the rewire, so `lib/` tests are already green and isolate the cause |
| Redrawn empty-state animation is not liked | Self-contained and easily iterated; the lazy dynamic-import route remains available as a fallback |
| Pointer Events regress desktop dragging | Largest and most isolated step, sequenced last so it can be dropped without affecting the rest |

## Deferred

- PWA manifest, service worker, offline support, installability.
- Data export/import for backup and portability.
- Component-level tests.
- Linting and formatting configuration.

These were considered and consciously postponed. PWA and export/import are the natural next pass — for a local-first, privacy-oriented app they are the largest genuine capability gaps.
