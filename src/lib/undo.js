/** Bounded stack of reversible operations. Kept separate from tasks.js so that
 *  module stays purely functional while this one holds the state. */
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

/**
 * Reverses one entry against the current task list.
 *
 * Indices are clamped because the list may have changed since the entry was
 * recorded — a task deleted from position 5 can be restored into a list that
 * has since shrunk to two items, and landing at the end beats throwing.
 *
 * `clearCompleted` entries must record `removed` in ascending index order, so
 * re-inserting front to back puts each task back where it was.
 */
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
