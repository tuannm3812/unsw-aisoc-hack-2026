import { describe, it, expect } from "vitest"
import { countAncestors, getAncestorIds, countDependents } from "../lib/lineage"
import type { GraphNode, GraphEdge, NodeKind, RelationType } from "../lib/types"

const makeNode = (id: string, kind: NodeKind = "finding"): GraphNode => ({
  id, kind, title: id, body: "", x: 0, y: 0, board_id: "b1",
  evidence_class: "asserted", source_asset_id: null, source_page: null,
  source_quote: "", confidence: null, assignee_id: null, task_status: "",
  jira_issue_key: "", jira_url: "", jira_sync_state: "pending", jira_sync_error: "",
  pr_url: "", pr_title: "", pr_state: "", pr_reported_by: "", pr_reported_at: null,
  created_by: "", revision: 1, updated_at: new Date().toISOString(),
})

const makeEdge = (source: string, target: string, relation: RelationType = "supports"): GraphEdge => ({
  id: `e_${source}_${target}`, board_id: "b1", source_id: source, target_id: target, relation,
})

describe("countAncestors", () => {
  it("returns 0 for task with no edges", () => {
    expect(countAncestors("t1", [makeNode("t1", "task")], [])).toBe(0)
  })

  it("counts 2 direct ancestors", () => {
    const nodes = [makeNode("t1", "task"), makeNode("f1"), makeNode("f2")]
    const edges = [makeEdge("f1", "t1"), makeEdge("f2", "t1")]
    expect(countAncestors("t1", nodes, edges)).toBe(2)
  })

  it("follows supports + constrains + derived_from", () => {
    const nodes = [makeNode("t1", "task"), makeNode("f1"), makeNode("c1", "constraint")]
    const edges = [makeEdge("f1", "t1", "supports"), makeEdge("c1", "f1", "constrains")]
    expect(countAncestors("t1", nodes, edges)).toBe(2)
  })

  it("ignores assigned_to relation", () => {
    const nodes = [makeNode("t1", "task"), makeNode("f1")]
    const edges = [makeEdge("f1", "t1", "assigned_to")]
    expect(countAncestors("t1", nodes, edges)).toBe(0)
  })

  it("stops at max limit", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => makeNode(`n${i}`))
    const edges = nodes.slice(1).map((_, i) => makeEdge(`n${i}`, `n${i + 1}`))
    expect(countAncestors("n99", nodes, edges, 10)).toBe(10)
  })
})

describe("getAncestorIds", () => {
  it("returns empty for isolated task", () => {
    expect(getAncestorIds("t1", [makeNode("t1", "task")], [])).toEqual([])
  })

  it("returns ancestor IDs in order", () => {
    const nodes = [makeNode("t1", "task"), makeNode("f1"), makeNode("f2")]
    const edges = [makeEdge("f1", "t1"), makeEdge("f2", "t1")]
    const result = getAncestorIds("t1", nodes, edges).sort()
    expect(result).toEqual(["f1", "f2"])
  })
})

describe("countDependents", () => {
  it("counts downstream tasks", () => {
    const edges = [makeEdge("f1", "t1"), makeEdge("f1", "t2")]
    expect(countDependents("f1", edges)).toBe(2)
  })
})
