import type { GraphEdge, GraphNode } from "./types"

const CONTEXT_RELATIONS = new Set(["derived_from", "supports", "constrains", "implements"])

/**
 * BFS count of upstream ancestors reachable via context relations.
 * Cycle-safe, deduplicated, matches backend lineage._walk semantics.
 */
export function countAncestors(
  taskId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  max = 60,
): number {
  const adjacency = new Map<string, string[]>()
  for (const e of edges) {
    if (!CONTEXT_RELATIONS.has(e.relation)) continue
    const list = adjacency.get(e.source_id) ?? []
    list.push(e.target_id)
    adjacency.set(e.source_id, list)
  }

  const visited = new Set<string>()
  const queue = [taskId]
  while (queue.length > 0 && visited.size < max) {
    const current = queue.shift()!
    const neighbours = adjacency.get(current) ?? []
    for (const n of neighbours) {
      if (!visited.has(n) && n !== taskId) {
        visited.add(n)
        queue.push(n)
      }
    }
  }
  return visited.size
}

/**
 * Count of downstream tasks that depend on this node.
 */
export function countDependents(
  nodeId: string,
  edges: GraphEdge[],
): number {
  const deps = new Set<string>()
  for (const e of edges) {
    if (e.source_id === nodeId && !deps.has(e.target_id)) deps.add(e.target_id)
  }
  return deps.size
}
