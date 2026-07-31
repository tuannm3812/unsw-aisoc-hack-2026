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
  // Walk backwards: ancestors are sources of edges that target the current node
  const sourcesOf = new Map<string, string[]>()
  for (const e of edges) {
    if (!CONTEXT_RELATIONS.has(e.relation)) continue
    const list = sourcesOf.get(e.target_id) ?? []
    list.push(e.source_id)
    sourcesOf.set(e.target_id, list)
  }

  const visited = new Set<string>()
  const queue = [taskId]
  while (queue.length > 0 && visited.size < max) {
    const current = queue.shift()!
    for (const n of (sourcesOf.get(current) ?? [])) {
      if (!visited.has(n) && n !== taskId) { visited.add(n); queue.push(n) }
    }
  }
  return visited.size
}

/**
 * Return the IDs of all upstream ancestors reachable via context relations.
 */
export function getAncestorIds(
  taskId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  max = 60,
): string[] {
  const sourcesOf = new Map<string, string[]>()
  for (const e of edges) {
    if (!CONTEXT_RELATIONS.has(e.relation)) continue
    const list = sourcesOf.get(e.target_id) ?? []
    list.push(e.source_id)
    sourcesOf.set(e.target_id, list)
  }
  const visited = new Set<string>()
  const queue = [taskId]
  while (queue.length > 0 && visited.size < max) {
    const current = queue.shift()!
    for (const n of (sourcesOf.get(current) ?? [])) {
      if (!visited.has(n) && n !== taskId) { visited.add(n); queue.push(n) }
    }
  }
  return Array.from(visited)
}

/**
 * Count of downstream tasks that depend on this node.
 */
/**
 * Detect priority from title/body text. Returns null if no priority found.
 */
export function detectPriority(title: string, body: string): string | null {
  const text = `${title} ${body}`.toLowerCase()
  if (/\bp0\b|\burgent\b|\bcritical\b/.test(text)) return "P0"
  if (/\bp1\b|\bhigh\b|\bblocker\b/.test(text)) return "P1"
  if (/\bp2\b|\bmedium\b/.test(text)) return "P2"
  if (/\bp3\b|\blow\b/.test(text)) return "P3"
  if (/\bp4\b|\bnice\b|\blater\b/.test(text)) return "P4"
  return null
}

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
