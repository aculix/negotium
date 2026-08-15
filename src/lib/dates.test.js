import { describe, it, expect } from 'vitest'
import { toKey, fromKey, addDays, isKey, formatLong } from './dates.js'

describe('toKey', () => {
  it('formats a date as local YYYY-MM-DD', () => {
    expect(toKey(new Date(2026, 7, 15))).toBe('2026-08-15')
  })

  it('zero-pads single-digit months and days', () => {
    expect(toKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('uses local time, not UTC', () => {
    // 23:30 local on the 15th must not roll forward to the 16th.
    expect(toKey(new Date(2026, 7, 15, 23, 30))).toBe('2026-08-15')
  })
})

describe('fromKey', () => {
  it('returns local midnight for the key', () => {
    const date = fromKey('2026-08-15')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(7)
    expect(date.getDate()).toBe(15)
    expect(date.getHours()).toBe(0)
  })

  it('round-trips with toKey', () => {
    expect(toKey(fromKey('2026-08-15'))).toBe('2026-08-15')
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
    const date = new Date(2026, 7, 15)
    addDays(date, 5)
    expect(toKey(date)).toBe('2026-08-15')
  })
})

describe('isKey', () => {
  it('accepts ISO date keys', () => {
    expect(isKey('2026-08-15')).toBe(true)
  })

  it('rejects legacy toDateString keys', () => {
    expect(isKey('Sat Aug 15 2026')).toBe(false)
  })

  it('rejects arbitrary strings', () => {
    expect(isKey('not-a-date')).toBe(false)
  })
})

describe('formatLong', () => {
  it('renders the long-form date used in the header', () => {
    expect(formatLong('2026-08-15')).toBe('Saturday, August 15, 2026')
  })
})
