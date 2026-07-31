import { describe, expect, test } from "vitest"
import { findFreeSpot } from "../utils"

describe("findFreeSpot", () => {
  test("returns start when no nodes exist", () => {
    expect(findFreeSpot([], { x: 100, y: 200 })).toEqual({ x: 100, y: 200 })
  })

  test("shifts to next row when column occupied", () => {
    const nodes = [{ x: 100, y: 200 }]
    const spot = findFreeSpot(nodes, { x: 100, y: 200 })
    // First column row 0 is occupied; should go to row 1 (same column)
    expect(spot.y).toBe(368) // 200 + 168
    expect(spot.x).toBe(100)
  })

  test("shifts to next row when column is occupied", () => {
    const nodes = [
      { x: 100, y: 200 },
      { x: 400, y: 200 },
    ]
    const spot = findFreeSpot(nodes, { x: 100, y: 200 })
    // Second column is occupied, should move to row 2
    expect(spot.y).toBe(368) // 200 + 168
  })

  test("finds a free spot in a dense area", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      x: 100 + i * 50,
      y: 200 + i * 30,
    }))
    const spot = findFreeSpot(nodes, { x: 100, y: 200 })
    expect(spot.x).toBeDefined()
    expect(spot.y).toBeDefined()
    // Should not be on top of any existing node
    const overlapping = nodes.some(
      (n) => Math.abs(n.x - spot.x) < 270 && Math.abs(n.y - spot.y) < 151,
    )
    expect(overlapping).toBe(false)
  })

  test("returns start after exhausting search (degenerate)", () => {
    // Fill the entire search grid — should fall back to start
    const nodes = Array.from({ length: 200 }, (_, i) => ({
      x: (i % 6) * 300,
      y: Math.floor(i / 6) * 168,
    }))
    const spot = findFreeSpot(nodes, { x: 0, y: 0 })
    // Falls back to start when no free spot in 6x6 grid
    expect(spot).toEqual({ x: 0, y: 0 })
  })
})
