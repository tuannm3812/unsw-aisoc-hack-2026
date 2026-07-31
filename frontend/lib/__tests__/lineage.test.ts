import { describe, expect, test } from "vitest"
import {
  countAncestors,
  countDependents,
  detectBlocked,
  detectDueDate,
  detectEffort,
  detectPriority,
  getAncestorIds,
} from "../lineage"
import type { GraphEdge, GraphNode } from "../types"

function node(id: string, kind = "task"): GraphNode {
  return {
    id,
    board_id: "brd_1",
    kind: kind as GraphNode["kind"],
    title: `Node ${id}`,
    body: "",
    x: 0,
    y: 0,
    evidence_class: "asserted",
    source_asset_id: null,
    source_page: null,
    source_quote: "",
    confidence: null,
    assignee_id: null,
    task_status: "open",
    jira_issue_key: "",
    jira_url: "",
    jira_sync_state: "pending",
    jira_sync_error: "",
    pr_url: "",
    pr_title: "",
    pr_state: "",
    pr_reported_by: "",
    pr_reported_at: null,
    created_by: "",
    revision: 1,
    updated_at: "",
  }
}

function edge(source: string, target: string, relation = "supports"): GraphEdge {
  return { id: `e_${source}_${target}`, board_id: "brd_1", source_id: source, target_id: target, relation: relation as GraphEdge["relation"] }
}

// ── detectEffort ──────────────────────────────────────────────

describe("detectEffort", () => {
  test("picks up XS from title", () => {
    expect(detectEffort("Fix XS typo", "")).toBe("XS")
  })
  test("picks up Small from body", () => {
    expect(detectEffort("Fix", "Small bug")).toBe("S")
  })
  test("picks up Medium", () => {
    expect(detectEffort("Medium priority", "")).toBe("M")
  })
  test("picks up Large", () => {
    expect(detectEffort("Large refactor", "")).toBe("L")
  })
  test("picks up XL", () => {
    expect(detectEffort("XL migration", "")).toBe("XL")
  })
  test("picks up tiny as XS", () => {
    expect(detectEffort("", "tiny fix")).toBe("XS")
  })
  test("picks up huge as XL", () => {
    expect(detectEffort("", "huge rewrite")).toBe("XL")
  })
  test("returns null when no size word", () => {
    expect(detectEffort("Refactor", "Clean up code")).toBeNull()
  })
  test("case insensitive", () => {
    expect(detectEffort("SMALL BUG", "")).toBe("S")
  })
})

// ── detectBlocked ─────────────────────────────────────────────

describe("detectBlocked", () => {
  test("detects blocked", () => {
    expect(detectBlocked("Blocked by API", "")).toBe("Blocked")
  })
  test("detects stuck", () => {
    expect(detectBlocked("", "Stuck on review")).toBe("Blocked")
  })
  test("detects waiting on", () => {
    expect(detectBlocked("Waiting on design", "")).toBe("Blocked")
  })
  test("detects depends on", () => {
    expect(detectBlocked("Depends on #42", "")).toBe("Blocked")
  })
  test("null for normal text", () => {
    expect(detectBlocked("Normal task", "")).toBeNull()
  })
})

// ── detectDueDate ─────────────────────────────────────────────

describe("detectDueDate", () => {
  test("parses due: YYYY-MM-DD", () => {
    expect(detectDueDate("due: 2026-12-25", "")).toBe("2026-12-25")
  })
  test("parses Due with month name", () => {
    expect(detectDueDate("Due: Aug 15", "")).toBe("Aug 15")
  })
  test("null when no due", () => {
    expect(detectDueDate("Normal text", "")).toBeNull()
  })
})

// ── detectPriority ────────────────────────────────────────────

describe("detectPriority", () => {
  test("P0 from urgent", () => { expect(detectPriority("urgent fix", "")).toBe("P0") })
  test("P0 from critical", () => { expect(detectPriority("critical bug", "")).toBe("P0") })
  test("P1 from high", () => { expect(detectPriority("high priority", "")).toBe("P1") })
  test("P2 from medium", () => { expect(detectPriority("medium", "")).toBe("P2") })
  test("P3 from low", () => { expect(detectPriority("low effort", "")).toBe("P3") })
  test("P4 from nice", () => { expect(detectPriority("nice to have", "")).toBe("P4") })
  test("null when no priority word", () => {
    expect(detectPriority("Regular task", "")).toBeNull()
  })
})

// ── getAncestorIds ────────────────────────────────────────────

describe("getAncestorIds", () => {
  test("returns empty when no edges", () => {
    const nodes = [node("a")]
    expect(getAncestorIds("a", nodes, [])).toEqual([])
  })

  test("follows a single chain", () => {
    const nodes = [node("a", "finding"), node("b", "task")]
    const edgesList = [edge("a", "b", "supports")]
    expect(getAncestorIds("b", nodes, edgesList)).toEqual(["a"])
  })

  test("follows two hops", () => {
    const nodes = [node("a", "finding"), node("b", "constraint"), node("c", "task")]
    const edgesList = [edge("a", "b", "supports"), edge("b", "c", "constrains")]
    expect(getAncestorIds("c", nodes, edgesList).sort()).toEqual(["a", "b"].sort())
  })

  test("collects both branches", () => {
    const nodes = [node("a", "finding"), node("b", "constraint"), node("c", "task")]
    const edgesList = [edge("a", "c", "supports"), edge("b", "c", "constrains")]
    expect(getAncestorIds("c", nodes, edgesList).sort()).toEqual(["a", "b"].sort())
  })

  test("ignores assigned_to edges", () => {
    const nodes = [node("a", "finding"), node("b", "task")]
    const edgesList = [edge("a", "b", "assigned_to")]
    expect(getAncestorIds("b", nodes, edgesList)).toEqual([])
  })

  test("stops at max", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => node(`n${i}`, "finding"))
    const edgesList = nodes.slice(1).map((_, i) => edge(`n${i}`, `n${i + 1}`, "supports"))
    const taskNode = node("task", "task")
    const allNodes = [...nodes, taskNode]
    const allEdges = [...edgesList, edge("n9", "task", "supports")]
    const result = getAncestorIds("task", allNodes, allEdges, 3)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  test("does not include the task itself", () => {
    const nodes = [node("a", "finding"), node("b", "task")]
    const edgesList = [edge("a", "b", "supports")]
    const result = getAncestorIds("b", nodes, edgesList)
    expect(result).not.toContain("b")
  })
})

// ── countAncestors ────────────────────────────────────────────

describe("countAncestors", () => {
  test("counts correctly", () => {
    const nodes = [node("a", "finding"), node("b", "constraint"), node("c", "task")]
    const edgesList = [edge("a", "c", "supports"), edge("b", "c", "constrains")]
    expect(countAncestors("c", nodes, edgesList)).toBe(2)
  })
})

// ── countDependents ───────────────────────────────────────────

describe("countDependents", () => {
  test("counts only task-kind downstream targets", () => {
    const nodes = [node("b", "task"), node("c", "finding"), node("d", "task")]
    const edgesList = [
      edge("a", "b", "supports"),
      edge("a", "c", "constrains"),   // finding, not a task
      edge("a", "d", "implements"),
    ]
    expect(countDependents("a", edgesList, nodes)).toBe(2)
  })

  test("returns 0 when no dependents", () => {
    expect(countDependents("orphan", [], [])).toBe(0)
  })

  test("deduplicates same-target edges", () => {
    const nodes = [node("b", "task")]
    const edgesList = [
      edge("a", "b", "supports"),
      edge("a", "b", "constrains"),
    ]
    expect(countDependents("a", edgesList, nodes)).toBe(1)
  })

  test("ignores non-task targets", () => {
    const nodes = [node("b", "finding"), node("c", "constraint")]
    const edgesList = [
      edge("a", "b", "supports"),
      edge("a", "c", "constrains"),
    ]
    expect(countDependents("a", edgesList, nodes)).toBe(0)
  })
})
