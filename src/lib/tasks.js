/** crypto.randomUUID requires a secure context, and Negotium over plain HTTP
 *  on a LAN is a real deployment shape for this app, hence the fallback. */
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
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

/**
 * Rewrites a task's text in place, keeping its id, position and completion.
 *
 * Blank input is refused rather than treated as a delete. Someone who selects
 * all and hits enter by accident should get their task back, not lose it, and
 * an empty row would be unreadable anyway. Returning the original array when
 * nothing changed also keeps a pointless write out of storage.
 */
export function renameTask(tasks, id, text) {
  const trimmed = text.trim()
  if (!trimmed) return tasks

  const current = tasks.find((task) => task.id === id)
  if (!current || current.text === trimmed) return tasks

  return tasks.map((task) => (task.id === id ? { ...task, text: trimmed } : task))
}
