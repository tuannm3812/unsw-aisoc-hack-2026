import type { GraphEdge, GraphNode } from "@/lib/types"

const ORIGIN_X = 80
const ORIGIN_Y = 80
const COL = 340
const ROW = 168
const COMPONENT_GAP = 220

/**
 * Connection-first layout: each linked cluster is a block; within a cluster,
 * depth follows graph distance from sources and Y stays near neighbours.
 */
export function computeAutoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const undirected = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()

  for (const node of nodes) {
    undirected.set(node.id, [])
    outgoing.set(node.id, [])
  }
  for (const edge of edges) {
    if (!byId.has(edge.source_id) || !byId.has(edge.target_id)) continue
    undirected.get(edge.source_id)!.push(edge.target_id)
    undirected.get(edge.target_id)!.push(edge.source_id)
    // Context flows source → dependent (finding supports task, etc.).
    outgoing.get(edge.source_id)!.push(edge.target_id)
  }

  const components = connectedComponents(
    nodes.map((node) => node.id),
    undirected,
  )

  // Larger / more-rooted clusters first so the canvas reads top-down as stories.
  components.sort((a, b) => {
    const aRoots = a.filter((id) => byId.get(id)?.kind === "asset").length
    const bRoots = b.filter((id) => byId.get(id)?.kind === "asset").length
    if (aRoots !== bRoots) return bRoots - aRoots
    return b.length - a.length
  })

  const positions = new Map<string, { x: number; y: number }>()
  let cursorY = ORIGIN_Y

  for (const component of components) {
    const local = layoutComponent(component, byId, undirected, outgoing)
    let minY = Infinity
    let maxY = -Infinity
    for (const pos of local.values()) {
      minY = Math.min(minY, pos.y)
      maxY = Math.max(maxY, pos.y)
    }
    if (!Number.isFinite(minY)) {
      minY = 0
      maxY = 0
    }
    const shiftY = cursorY - minY
    for (const [id, pos] of local) {
      positions.set(id, { x: ORIGIN_X + pos.x, y: pos.y + shiftY })
    }
    cursorY += maxY - minY + ROW + COMPONENT_GAP
  }

  return resolveCollisions(positions)
}

function connectedComponents(
  ids: string[],
  neighbours: Map<string, string[]>,
): string[][] {
  const seen = new Set<string>()
  const components: string[][] = []
  for (const start of ids) {
    if (seen.has(start)) continue
    const stack = [start]
    const group: string[] = []
    seen.add(start)
    while (stack.length) {
      const id = stack.pop()!
      group.push(id)
      for (const next of neighbours.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
    components.push(group)
  }
  return components
}

function layoutComponent(
  ids: string[],
  byId: Map<string, GraphNode>,
  undirected: Map<string, string[]>,
  outgoing: Map<string, string[]>,
): Map<string, { x: number; y: number }> {
  const idSet = new Set(ids)
  const roots = pickRoots(ids, byId, undirected, outgoing)

  // Depth = shortest hop distance from any root (connection distance, not kind).
  const depth = new Map<string, number>()
  const queue = [...roots]
  for (const root of roots) depth.set(root, 0)
  while (queue.length) {
    const id = queue.shift()!
    const d = depth.get(id) ?? 0
    for (const next of undirected.get(id) ?? []) {
      if (!idSet.has(next) || depth.has(next)) continue
      depth.set(next, d + 1)
      queue.push(next)
    }
  }
  for (const id of ids) {
    if (!depth.has(id)) depth.set(id, 0)
  }

  const maxDepth = Math.max(0, ...depth.values())
  const layers: string[][] = Array.from({ length: maxDepth + 1 }, () => [])
  for (const id of ids) {
    layers[depth.get(id) ?? 0].push(id)
  }

  const positions = new Map<string, { x: number; y: number }>()

  layers.forEach((layer, depthIndex) => {
    layer.sort((a, b) => {
      const aY = neighbourBarycenter(a, positions, undirected)
      const bY = neighbourBarycenter(b, positions, undirected)
      if (aY !== bY) return aY - bY
      const aNode = byId.get(a)!
      const bNode = byId.get(b)!
      const kindRank = kindPriority(aNode.kind) - kindPriority(bNode.kind)
      if (kindRank !== 0) return kindRank
      return aNode.title.localeCompare(bNode.title)
    })

    layer.forEach((id, index) => {
      const preferred = neighbourBarycenter(id, positions, undirected)
      const y =
        Number.isFinite(preferred) && preferred < 1e8
          ? preferred
          : index * ROW
      positions.set(id, { x: depthIndex * COL, y })
    })

    // Compact this layer while preserving neighbour order (no kind regrouping).
    const ordered = layer
      .map((id) => [id, positions.get(id)!.y] as const)
      .sort((a, b) => a[1] - b[1])
    ordered.forEach(([id], index) => {
      positions.set(id, { x: depthIndex * COL, y: index * ROW })
    })
  })

  // One more barycenter pass so children slide toward their linked parents.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let depthIndex = 1; depthIndex <= maxDepth; depthIndex += 1) {
      const layer = layers[depthIndex]
      const scored = layer.map((id) => ({
        id,
        y: neighbourBarycenter(id, positions, undirected),
      }))
      scored.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
      scored.forEach((item, index) => {
        positions.set(item.id, { x: depthIndex * COL, y: index * ROW })
      })
    }
  }

  return positions
}

function pickRoots(
  ids: string[],
  byId: Map<string, GraphNode>,
  undirected: Map<string, string[]>,
  outgoing: Map<string, string[]>,
): string[] {
  const idSet = new Set(ids)
  const inbound = new Map<string, number>()
  for (const id of ids) inbound.set(id, 0)
  for (const id of ids) {
    for (const next of outgoing.get(id) ?? []) {
      if (!idSet.has(next)) continue
      inbound.set(next, (inbound.get(next) ?? 0) + 1)
    }
  }

  const assets = ids.filter((id) => byId.get(id)?.kind === "asset")
  if (assets.length) return assets.sort((a, b) => byId.get(a)!.title.localeCompare(byId.get(b)!.title))

  const sources = ids.filter((id) => (inbound.get(id) ?? 0) === 0)
  if (sources.length) {
    return sources.sort(
      (a, b) =>
        kindPriority(byId.get(a)!.kind) - kindPriority(byId.get(b)!.kind) ||
        byId.get(a)!.title.localeCompare(byId.get(b)!.title),
    )
  }

  // Fully cyclic / no clear source: start from the most connected node.
  return [
    [...ids].sort(
      (a, b) =>
        (undirected.get(b)?.length ?? 0) - (undirected.get(a)?.length ?? 0) ||
        byId.get(a)!.title.localeCompare(byId.get(b)!.title),
    )[0],
  ]
}

function neighbourBarycenter(
  nodeId: string,
  placed: Map<string, { x: number; y: number }>,
  neighbours: Map<string, string[]>,
): number {
  const ys = (neighbours.get(nodeId) ?? [])
    .map((id) => placed.get(id)?.y)
    .filter((y): y is number => typeof y === "number")
  if (!ys.length) return Number.POSITIVE_INFINITY
  return ys.reduce((sum, y) => sum + y, 0) / ys.length
}

function kindPriority(kind: GraphNode["kind"]): number {
  switch (kind) {
    case "asset":
      return 0
    case "finding":
      return 1
    case "constraint":
      return 2
    case "task":
      return 3
    default:
      return 9
  }
}

/** Nudge overlapping cards apart without breaking cluster structure. */
function resolveCollisions(
  positions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const entries = [...positions.entries()].sort(
    (a, b) => a[1].x - b[1].x || a[1].y - b[1].y,
  )
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const a = entries[i][1]
      const b = entries[j][1]
      if (Math.abs(a.x - b.x) < COL * 0.5 && Math.abs(a.y - b.y) < ROW * 0.85) {
        a.y = b.y + ROW
      }
    }
  }
  for (const [id, pos] of entries) positions.set(id, pos)
  return positions
}
