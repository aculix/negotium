const TEXT_FIELDS = new Set(['INPUT', 'TEXTAREA'])

/**
 * Whether a keydown should trigger task undo.
 *
 * The subtlety is the text field. Deferring to a focused field's own undo
 * sounds right, but the add-task input is where focus normally sits — you
 * click it to add a task and focus stays there, and on macOS clicking a
 * button does not move focus. Guarding on focus alone therefore disables
 * undo in precisely the situation it is needed: right after deleting a task.
 *
 * So it defers only when the field actually holds text worth undoing. An
 * empty input has nothing for the browser to restore, and task undo wins.
 */
export function shouldHandleUndo(event) {
  const isUndoChord =
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey && // Shift+Cmd+Z means redo, which this app does not have.
    !event.altKey &&
    typeof event.key === 'string' &&
    event.key.toLowerCase() === 'z'

  if (!isUndoChord) return false

  const target = event.target
  if (!target) return true

  if (target.isContentEditable) return false
  if (TEXT_FIELDS.has(target.tagName) && target.value) return false

  return true
}
