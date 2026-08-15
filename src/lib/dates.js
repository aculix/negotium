const KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A `Date` as a local-time `YYYY-MM-DD` key. Sortable, which is what the
 *  rollover logic relies on to find every day earlier than today. */
export function toKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local midnight for a key. Built from parts rather than `new Date(key)`,
 *  which parses bare ISO dates as UTC and shifts the day west of Greenwich. */
export function fromKey(key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Goes through `setDate`, so it stays on the same calendar day across a DST
 *  boundary rather than adding a fixed 24 hours. */
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
