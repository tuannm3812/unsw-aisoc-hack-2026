export type NodeKind = "asset" | "finding" | "constraint" | "task"

export type RelationType =
  | "derived_from"
  | "supports"
  | "constrains"
  | "implements"
  | "assigned_to"

export type ParseState = "pending" | "parsing" | "parsed" | "failed"

export type SyncState = "pending" | "creating" | "synced" | "ambiguous" | "failed"

export interface Member {
  id: string
  email: string
  name: string
  role: string
  discipline: string
  jira_account_id: string
  board_role: string
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: string
  discipline: string
  jira_account_id?: string
}

export interface Board {
  id: string
  name: string
  summary: string
  jira_project_key: string
}

export interface GraphNode {
  id: string
  board_id: string
  kind: NodeKind
  title: string
  body: string
  x: number
  y: number
  evidence_class: "observed" | "extracted" | "asserted"
  source_asset_id: string | null
  source_page: number | null
  source_quote: string
  confidence: number | null
  assignee_id: string | null
  task_status: string
  jira_issue_key: string
  jira_url: string
  jira_sync_state: SyncState
  jira_sync_error: string
  pr_url: string
  pr_title: string
  pr_state: string
  pr_reported_by: string
  pr_reported_at: string | null
  created_by: string
  revision: number
  updated_at: string
}

export interface GraphEdge {
  id: string
  board_id: string
  source_id: string
  target_id: string
  relation: RelationType
}

export interface GraphAsset {
  id: string
  board_id: string
  filename: string
  media_type: string
  byte_size: number
  page_count: number
  parse_state: ParseState
  parse_error: string
  created_at: string
}

export interface GraphPayload {
  board: Board
  members: Member[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  assets: GraphAsset[]
}

export interface LineageNode {
  id: string
  kind: NodeKind
  title: string
  body: string
  depth: number
  relation_path: RelationType[]
  evidence_class: string
  source_asset: string | null
  source_page: number | null
  source_quote: string
  confidence: number | null
  revision: number
}

export interface Lineage {
  task_id: string
  task_title: string
  nodes: LineageNode[]
  edges: { source_id: string; target_id: string; relation: RelationType }[]
  truncated: boolean
  dropped_count: number
  lineage_hash: string
}

export interface TaskBrief {
  objective: string
  relevant_findings: string[]
  constraints: string[]
  acceptance_criteria: string[]
  open_questions: string[]
  citations: string[]
  generated_by: string
}

export interface TaskContext {
  task: GraphNode
  assignee: CurrentUser | null
  jira_issue_key: string
  jira_url: string
  lineage: Lineage
  brief: TaskBrief
}

export interface Health {
  ok: boolean
  mistral_configured: boolean
  jira_configured: boolean
  notifications: { slack: boolean; discord: boolean }
}

export const KIND_LABEL: Record<NodeKind, string> = {
  asset: "Source",
  finding: "Finding",
  constraint: "Constraint",
  task: "Task",
}

export const RELATION_LABEL: Record<RelationType, string> = {
  derived_from: "derived from",
  supports: "supports",
  constrains: "constrains",
  implements: "implements",
  assigned_to: "assigned to",
}

// Relations a user can draw, with the direction that reads correctly on the canvas.
export const DRAWABLE_RELATIONS: { value: RelationType; label: string; hint: string }[] = [
  { value: "supports", label: "supports", hint: "Evidence backing the target" },
  { value: "constrains", label: "constrains", hint: "A limit the target must respect" },
  { value: "derived_from", label: "derived from", hint: "Target was produced from the source" },
  { value: "implements", label: "implements", hint: "Target is work that realises the source" },
]
