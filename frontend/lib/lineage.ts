import type { GraphEdge, GraphNode } from "./types"

const CONTEXT_RELATIONS = new Set(["derived_from", "supports", "constrains", "implements"])

// ponytail: heuristic — single-letter \bs\b/\bm\b/\bl\b false-positives on any isolated
// S/M/L in prose. Only match full words and multi-letter abbreviations; if real story-point
// fields land in the DB, switch to those.
export function detectEffort(title: string, body: string): string | null {
  const text = `${title} ${body}`.toLowerCase()
  if (/\bxs\b|\btiny\b/.test(text)) return "XS"
  if (/\bsmall\b/.test(text)) return "S"
  if (/\bmedium\b/.test(text)) return "M"
  if (/\blarge\b/.test(text)) return "L"
  if (/\bxl\b|\bhuge\b/.test(text)) return "XL"
  return null
}

export function detectBlocked(title: string, body: string): string | null {
  const text = `${title} ${body}`.toLowerCase()
  if (/\bblocked\b|\bstuck\b|\bwaiting on\b|\bdepends on\b/.test(text)) return "Blocked"
  return null
}

export function detectDueDate(title: string, body: string): string | null {
  const m = `${title} ${body}`.match(/due[:\s]+(\d{4}-\d{2}-\d{2}|\w+ \d{1,2})/i)
  return m ? m[1] : null
}

export function detectPriority(title: string, body: string): string | null {
  const text = `${title} ${body}`.toLowerCase()
  if (/\bp0\b|\burgent\b|\bcritical\b/.test(text)) return "P0"
  if (/\bp1\b|\bhigh\b|\bblocker\b/.test(text)) return "P1"
  if (/\bp2\b|\bmedium\b/.test(text)) return "P2"
  if (/\bp3\b|\blow\b/.test(text)) return "P3"
  if (/\bp4\b|\bnice\b|\blater\b/.test(text)) return "P4"
  return null
}

export function getAncestorIds(taskId: string, _nodes: GraphNode[], edges: GraphEdge[], max = 60): string[] {
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

export function countAncestors(taskId: string, nodes: GraphNode[], edges: GraphEdge[], max = 60): number {
  return getAncestorIds(taskId, nodes, edges, max).length
}

export function countDependents(nodeId: string, edges: GraphEdge[], nodes: GraphNode[]): number {
  const taskIds = new Set(nodes.filter((n) => n.kind === "task").map((n) => n.id))
  const deps = new Set<string>()
  for (const e of edges) {
    if (e.source_id === nodeId && taskIds.has(e.target_id) && !deps.has(e.target_id)) deps.add(e.target_id)
  }
  return deps.size
}
