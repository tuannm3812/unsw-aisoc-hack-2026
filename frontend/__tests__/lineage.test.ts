import { describe, it, expect } from "vitest"
import { countAncestors, getAncestorIds, countDependents, detectPriority } from "../lib/lineage"
import type { GraphNode, GraphEdge, NodeKind, RelationType } from "../lib/types"

const n = (id: string, kind: NodeKind = "finding"): GraphNode => ({
  id, kind, title: id, body: "", x: 0, y: 0, board_id: "b1",
  evidence_class: "asserted", source_asset_id: null, source_page: null,
  source_quote: "", confidence: null, assignee_id: null, task_status: "",
  jira_issue_key: "", jira_url: "", jira_sync_state: "pending", jira_sync_error: "",
  pr_url: "", pr_title: "", pr_state: "", pr_reported_by: "", pr_reported_at: null,
  created_by: "", revision: 1, updated_at: new Date().toISOString(),
})

const e = (source: string, target: string, relation: RelationType = "supports"): GraphEdge => ({
  id: `e_${source}_${target}`, board_id: "b1", source_id: source, target_id: target, relation,
})

// ── countAncestors ──

describe("countAncestors", () => {
  it("isolated task → 0", () => {
    expect(countAncestors("t1", [n("t1", "task")], [])).toBe(0)
  })

  it("empty graph → 0", () => {
    expect(countAncestors("t1", [], [])).toBe(0)
  })

  it("two direct ancestors", () => {
    const nodes = [n("t1", "task"), n("f1"), n("f2")]
    const edges = [e("f1", "t1"), e("f2", "t1")]
    expect(countAncestors("t1", nodes, edges)).toBe(2)
  })

  it("chained: f1→c1→t1 → 2 ancestors", () => {
    const nodes = [n("t1", "task"), n("f1"), n("c1", "constraint")]
    const edges = [e("f1", "t1", "supports"), e("c1", "f1", "constrains")]
    expect(countAncestors("t1", nodes, edges)).toBe(2)
  })

  it("diamond: f1+f2→c1→t1 → 3 ancestors", () => {
    const nodes = [n("t1", "task"), n("f1"), n("f2"), n("c1", "constraint")]
    const edges = [e("f1", "c1"), e("f2", "c1"), e("c1", "t1")]
    expect(countAncestors("t1", nodes, edges)).toBe(3)
  })

  it("cycle: f1→t1→f1 → terminates at 1", () => {
    const nodes = [n("t1", "task"), n("f1")]
    const edges = [e("f1", "t1"), e("t1", "f1", "implements")]
    expect(countAncestors("t1", nodes, edges)).toBe(1)
  })

  it("assigned_to is excluded from context", () => {
    const nodes = [n("t1", "task"), n("f1")]
    const edges = [e("f1", "t1", "assigned_to")]
    expect(countAncestors("t1", nodes, edges)).toBe(0)
  })

  it("implements relation is included", () => {
    const nodes = [n("t1", "task"), n("t2", "task")]
    const edges = [e("t2", "t1", "implements")]
    expect(countAncestors("t1", nodes, edges)).toBe(1)
  })

  it("derived_from is included", () => {
    const nodes = [n("t1", "task"), n("a1", "asset")]
    const edges = [e("a1", "t1", "derived_from")]
    expect(countAncestors("t1", nodes, edges)).toBe(1)
  })

  it("stops at max 5", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => n(`n${i}`))
    const edges = nodes.slice(1).map((_, i) => e(`n${i}`, `n${i + 1}`))
    expect(countAncestors("n49", nodes, edges, 5)).toBe(5)
  })

  it("default max 60 is sufficient", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => n(`n${i}`))
    const edges = [e("n0", "n1"), e("n1", "n2"), e("n2", "n3"), e("n3", "n4")]
    expect(countAncestors("n4", nodes, edges)).toBe(4)
  })
})

// ── getAncestorIds ──

describe("getAncestorIds", () => {
  it("isolated → []", () => {
    expect(getAncestorIds("t1", [n("t1", "task")], [])).toEqual([])
  })

  it("two ancestors → sorted IDs", () => {
    const nodes = [n("t1", "task"), n("f1"), n("f2")]
    const edges = [e("f1", "t1"), e("f2", "t1")]
    expect(getAncestorIds("t1", nodes, edges).sort()).toEqual(["f1", "f2"])
  })

  it("deduplicates shared ancestor in diamond", () => {
    const nodes = [n("t1", "task"), n("f1"), n("f2"), n("c1", "constraint")]
    const edges = [e("f1", "c1"), e("f2", "c1"), e("c1", "t1")]
    expect(getAncestorIds("t1", nodes, edges).length).toBe(3)
  })

  it("excludes the task itself from results", () => {
    const nodes = [n("t1", "task"), n("f1")]
    const edges = [e("f1", "t1")]
    expect(getAncestorIds("t1", nodes, edges)).not.toContain("t1")
  })
})

// ── countDependents ──

describe("countDependents", () => {
  it("no edges → 0", () => {
    expect(countDependents("f1", [])).toBe(0)
  })

  it("feeds two tasks → 2", () => {
    const edges = [e("f1", "t1"), e("f1", "t2")]
    expect(countDependents("f1", edges)).toBe(2)
  })

  it("deduplicates same target", () => {
    const edges = [e("f1", "t1"), e("f1", "t1", "constrains")]
    expect(countDependents("f1", edges)).toBe(1)
  })
})

// ── detectPriority ──

describe("detectPriority", () => {
  it("no match → null", () => {
    expect(detectPriority("Fix login bug", "")).toBeNull()
  })

  it("P0 from urgent keyword", () => {
    expect(detectPriority("Fix urgent crash", "")).toBe("P0")
  })

  it("P0 from p0 in body", () => {
    expect(detectPriority("Crash fix", "This is p0 priority")).toBe("P0")
  })

  it("P1 from high", () => {
    expect(detectPriority("High priority: auth", "")).toBe("P1")
  })

  it("P1 from blocker", () => {
    expect(detectPriority("", "blocker for release")).toBe("P1")
  })

  it("P2 from medium", () => {
    expect(detectPriority("medium cleanup", "")).toBe("P2")
  })

  it("P3 from low", () => {
    expect(detectPriority("low effort improvement", "")).toBe("P3")
  })

  it("P4 from nice-to-have", () => {
    expect(detectPriority("nice to have dark mode", "")).toBe("P4")
  })

  it("word boundary: 'highway' does NOT match P1", () => {
    expect(detectPriority("Build highway signage", "")).toBeNull()
  })

  it("partial: 'glow' does NOT match P3", () => {
    expect(detectPriority("Add glow effect", "")).toBeNull()
  })
})
