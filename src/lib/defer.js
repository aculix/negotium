/**
 * Moves one task from one day to another and returns what is left on the
 * source day.
 *
 * This is the verb a two-day app is built around: "not today, tomorrow". Both
 * days are written before returning, so a caller only has to reload the day it
 * is showing.
 *
 * A task already sitting at the destination is not duplicated. It still leaves
 * the source day, which is what someone dragging a stray copy around would
 * expect.
 */
export function moveTaskToDay(storage, fromKey, toKey, taskId) {
  const source = storage.loadTasks(fromKey)
  if (fromKey === toKey) return source

  const moving = source.find(task => task.id === taskId)
  if (!moving) return source

  const remaining = source.filter(task => task.id !== taskId)
  const destination = storage.loadTasks(toKey)
  const alreadyThere = destination.some(task => task.id === taskId)

  storage.saveTasks(fromKey, remaining)
  if (!alreadyThere) storage.saveTasks(toKey, [...destination, moving])

  return remaining
}
