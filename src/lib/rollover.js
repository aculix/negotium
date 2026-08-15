import { toKey } from './dates.js'

/**
 * Applies the day-boundary rule and returns today's resulting task list.
 *
 * For every stored day earlier than `now`: unfinished tasks are carried into
 * today (oldest day first, within-day order preserved, ahead of anything
 * already in today), completed tasks are discarded, and the old key is
 * deleted. Pruning is therefore a side effect of carrying, so there is no
 * separate retention policy. Future keys, meaning Tomorrow, are never touched.
 *
 * `now` is a parameter rather than a `new Date()` call so the boundary is
 * testable. This replaces `checkAndMigrateTasks`, whose guard compared a
 * timestamp against itself and so never once executed.
 */
export function rollover(storage, now) {
  const todayKey = toKey(now)

  // listTaskKeys yields only well-formed ISO keys, which is what makes this
  // string comparison safe, and is why the key format changed.
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

  // Only persist when something actually moved. Prior days holding nothing but
  // completed tasks still get pruned above, but today's list is unchanged, and
  // rollover runs on every focus and visibility change.
  if (carried.length > 0) storage.saveTasks(todayKey, merged)

  return merged
}

/**
 * Milliseconds until the next local midnight, for scheduling the rollover
 * timer. Built from local calendar parts, so a spring-forward day correctly
 * yields 23 hours rather than a flat 24.
 */
export function msUntilNextMidnight(now) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return Math.max(1000, next.getTime() - now.getTime())
}
