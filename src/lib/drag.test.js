import { describe, it, expect } from 'vitest'
import { displacement } from './drag.js'

const SHIFT = 70

describe('displacement', () => {
  it('is zero when nothing is being dragged', () => {
    expect(displacement(2, null, null, SHIFT)).toBe(0)
  })

  it('is zero for the dragged row itself', () => {
    expect(displacement(1, 1, 3, SHIFT)).toBe(0)
  })

  it('is zero when the row would not move', () => {
    expect(displacement(2, 2, 2, SHIFT)).toBe(0)
  })

  describe('dragging downward', () => {
    // Row 0 heading to slot 2: rows 1 and 2 slide up into the vacated space,
    // row 3 stays put.
    it('slides passed rows up', () => {
      expect(displacement(1, 0, 2, SHIFT)).toBe(-SHIFT)
      expect(displacement(2, 0, 2, SHIFT)).toBe(-SHIFT)
    })

    it('leaves rows beyond the destination alone', () => {
      expect(displacement(3, 0, 2, SHIFT)).toBe(0)
    })

    it('leaves rows above the origin alone', () => {
      expect(displacement(0, 1, 3, SHIFT)).toBe(0)
    })

    it('includes the destination row itself', () => {
      expect(displacement(3, 0, 3, SHIFT)).toBe(-SHIFT)
    })
  })

  describe('dragging upward', () => {
    // Row 3 heading to slot 1: rows 1 and 2 slide down.
    it('slides passed rows down', () => {
      expect(displacement(1, 3, 1, SHIFT)).toBe(SHIFT)
      expect(displacement(2, 3, 1, SHIFT)).toBe(SHIFT)
    })

    it('leaves rows above the destination alone', () => {
      expect(displacement(0, 3, 1, SHIFT)).toBe(0)
    })

    it('leaves rows below the origin alone', () => {
      expect(displacement(4, 3, 1, SHIFT)).toBe(0)
    })

    it('includes the destination row itself', () => {
      expect(displacement(0, 2, 0, SHIFT)).toBe(SHIFT)
    })
  })

  it('moves exactly one row for a single-step drag', () => {
    expect(displacement(1, 0, 1, SHIFT)).toBe(-SHIFT)
    expect(displacement(2, 0, 1, SHIFT)).toBe(0)
  })

  it('displaces every row between the ends of a full-list drag', () => {
    const shifts = [0, 1, 2, 3, 4].map(i => displacement(i, 0, 4, SHIFT))
    expect(shifts).toEqual([0, -SHIFT, -SHIFT, -SHIFT, -SHIFT])
  })
})
