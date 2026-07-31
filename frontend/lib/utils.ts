import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const COLUMN = 300
const ROW = 168

/** Walk down and then across from the start point until nothing is in the way. */
export function findFreeSpot(
  nodes: { x: number; y: number }[],
  start: { x: number; y: number },
): { x: number; y: number } {
  for (let column = 0; column < 6; column += 1) {
    for (let row = 0; row < 6; row += 1) {
      const x = start.x + column * COLUMN
      const y = start.y + row * ROW
      const occupied = nodes.some(
        (node) => Math.abs(node.x - x) < COLUMN * 0.9 && Math.abs(node.y - y) < ROW * 0.9,
      )
      if (!occupied) return { x, y }
    }
  }
  return start
}
