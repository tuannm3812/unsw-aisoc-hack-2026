"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  FileText,
  FlaskConical,
  GitPullRequest,
  ListChecks,
  Loader2,
  Ruler,
  TriangleAlert,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { detectEffort, detectBlocked, detectDueDate, detectPriority } from "@/lib/lineage"
import type { GraphNode, NodeKind, ParseState } from "@/lib/types"

export interface GraphNodeData extends Record<string, unknown> {
  node: GraphNode
  assigneeName: string
  parseState: ParseState | null
  dimmed: boolean
  inLineage: boolean
  isFocusedTask: boolean
  depth: number | null
  /** Proposals from this source that nobody has accepted or dismissed yet. */
  pendingCandidates: number
  ancestorCount: number
  dependentCount: number
}

const KIND_META: Record<
  NodeKind,
  { label: string; icon: typeof FileText; accent: string; text: string }
> = {
  asset: {
    label: "Source",
    icon: FileText,
    accent: "border-l-kind-asset",
    text: "text-kind-asset",
  },
  finding: {
    label: "Finding",
    icon: FlaskConical,
    accent: "border-l-kind-finding",
    text: "text-kind-finding",
  },
  constraint: {
    label: "Constraint",
    icon: Ruler,
    accent: "border-l-kind-constraint",
    text: "text-kind-constraint",
  },
  task: {
    label: "Task",
    icon: ListChecks,
    accent: "border-l-kind-task",
    text: "text-kind-task",
  },
}

const PR_BADGE: Record<string, string> = {
  open: "bg-success text-white hover:bg-success",
  draft: "bg-muted text-muted-foreground hover:bg-muted",
  merged: "bg-[#E10500] text-white hover:bg-[#E10500]",
  closed: "bg-muted text-muted-foreground hover:bg-muted",
}

const PR_BADGE_LABEL: Record<string, string> = {
  open: "PR",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-[#E10500] text-white",
  P1: "bg-[#FF6A00] text-white",
  P2: "bg-[#F2A100] text-[#1B1712]",
  P3: "bg-[#F3EEE1] text-[#1B1712]",
  P4: "bg-[#F3EEE1]/60 text-muted-foreground",
}

const MEMBER_COLORS: Record<string, string> = {
  Aisha: "#E10500",
  Marco: "#FF6A00",
  Priya: "#F2A100",
}

function memberChip(name: string) {
  if (!name) return { bg: "#7A7266", initials: "?" }
  const first = name.split(" ")[0]
  if (MEMBER_COLORS[first]) {
    const parts = name.split(" ").filter((p) => p !== "Dr")
    return { bg: MEMBER_COLORS[first], initials: parts.slice(0, 2).map((p) => p[0]).join("") }
  }
  return { bg: "#7A7266", initials: "?" }
}

function GraphNodeCardImpl({ data, selected }: NodeProps & { data: GraphNodeData }) {
  const {
    node,
    assigneeName,
    parseState,
    dimmed,
    inLineage,
    isFocusedTask,
    depth,
    pendingCandidates,
    ancestorCount,
  } = data
  const meta = KIND_META[node.kind]
  const Icon = meta.icon
  const isTask = node.kind === "task"
  const toReview = node.kind === "asset" ? pendingCandidates : 0
  const priority = isTask ? detectPriority(node.title, node.body) : null
  const effort = isTask ? detectEffort(node.title, node.body) : null
  const blocked = isTask ? detectBlocked(node.title, node.body) : null
  const dueDate = isTask ? detectDueDate(node.title, node.body) : null
  const assigneeChip = isTask && assigneeName ? memberChip(assigneeName) : null

  const cardClass = cn(
    "group w-[264px] rounded-none transition-[opacity,box-shadow,border-color] duration-200",
    dimmed && "pointer-events-none opacity-25",
    inLineage && !isFocusedTask && "card-pixel-lineage",
    isFocusedTask && "card-pixel-focused",
    selected && !inLineage && !isFocusedTask && "card-pixel-selected",
    !selected && !inLineage && !isFocusedTask && "card-pixel",
  )

  return (
    <div className={cardClass}>
      {/* Kind colour top bar */}
      <div
        className="h-[4px] w-full"
        style={{
          backgroundColor:
            node.kind === "finding" ? "#F2A100" :
            node.kind === "constraint" ? "#FF6A00" :
            node.kind === "task" ? "#E10500" : "#1B1712",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!border-[#1B1712] !bg-[#F3EEE1] !size-2.5 !border-[2px] opacity-0 transition-opacity group-hover:opacity-100"
      />

      <div className="px-3.5 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Icon className="size-3.5" strokeWidth={2} style={{ color: node.kind === "finding" ? "#F2A100" : node.kind === "constraint" ? "#FF6A00" : node.kind === "task" ? "#E10500" : "#1B1712" }} />
            <span className="font-pixel text-[7px] tracking-[0.05em] uppercase" style={{ color: node.kind === "finding" ? "#F2A100" : node.kind === "constraint" ? "#FF6A00" : node.kind === "task" ? "#E10500" : "#1B1712" }}>{meta.label}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {depth !== null && depth > 0 && (
              <span className="text-2xs text-muted-foreground font-mono tabular-nums">
                {depth} hop{depth === 1 ? "" : "s"}
              </span>
            )}
            {parseState === "parsing" && (
              <span className="text-2xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                reading
              </span>
            )}
            {parseState === "failed" && (
              <span className="text-2xs text-destructive flex items-center gap-1">
                <TriangleAlert className="size-3" />
                failed
              </span>
            )}
            {node.confidence !== null && node.confidence !== undefined && (
              <span className="text-2xs text-muted-foreground font-mono tabular-nums">
                {Math.round(node.confidence * 100)}%
              </span>
            )}
          </div>
        </div>

        <p className="mt-2 line-clamp-3 text-sm leading-snug font-bold">{node.title}</p>

        {node.body && !node.source_quote && (
          <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs leading-relaxed">
            {node.body}
          </p>
        )}

        {node.source_quote && (
          <blockquote className="border-[#1B1712] text-muted-foreground mt-2.5 line-clamp-3 border-l-[3px] pl-2.5 font-mono text-[10.5px] leading-relaxed">
            {node.source_quote}
          </blockquote>
        )}
      </div>

      {(isTask || node.source_page !== null || toReview > 0 || Boolean(node.decision_state) || (node.alignment_payload?.conflicts?.length ?? 0) > 0) && (
        <div className="flex items-center gap-2 border-t-[3px] border-[#1B1712] px-3.5 py-2">
          {node.source_page !== null && (
            <span className="text-2xs text-muted-foreground font-mono">p.{node.source_page}</span>
          )}

          {toReview > 0 && (
            <span className="text-2xs bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">
              {toReview} to review
            </span>
          )}

          {node.kind === "task" && node.decision_state && (
            <span className="text-2xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-medium">
              {node.decision_state}
            </span>
          )}

          {node.kind === "task" && (node.alignment_payload?.conflicts?.length ?? 0) > 0 && (
            <span className="text-2xs text-warning-foreground bg-warning/15 rounded px-1.5 py-0.5 font-medium">
              {node.alignment_payload!.conflicts.length} conflict
              {node.alignment_payload!.conflicts.length === 1 ? "" : "s"}
            </span>
          )}

          {isTask && (
            <>
              {priority && (
                <span className={cn("footer-badge font-mono font-semibold", PRIORITY_COLORS[priority])}>
                  {priority}
                </span>
              )}
              {effort && (
                <span className="footer-badge bg-[#F3EEE1] text-[#1B1712] font-mono">{effort}</span>
              )}
              {blocked && (
                <span className="footer-badge bg-[#E10500] text-white font-bold">Blocked</span>
              )}
              {dueDate && (
                <span className="footer-badge bg-[#F3EEE1] text-[#1B1712] font-mono">due {dueDate}</span>
              )}
              {ancestorCount > 0 && (
                <span className="footer-badge bg-[#F2A100]/15 text-[#8A5C00] font-mono" title={`Grounded in ${ancestorCount} upstream node${ancestorCount === 1 ? "" : "s"}`}>←{ancestorCount}</span>
              )}
              {assigneeChip ? (
                <span
                  className="flex size-[22px] shrink-0 items-center justify-center border-[1.5px] border-[#1B1712] font-pixel text-[6px] text-white"
                  style={{ backgroundColor: assigneeChip.bg }}
                  title={assigneeName}
                >
                  {assigneeChip.initials}
                </span>
              ) : (
                <span className="flex size-[22px] shrink-0 items-center justify-center border-[1.5px] border-[#1B1712] bg-[#7A7266] font-pixel text-[6px] text-white" title="Unassigned">?</span>
              )}

              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {node.jira_sync_state === "creating" && (
                  <Loader2 className="text-muted-foreground size-3 animate-spin" />
                )}
                {node.jira_issue_key && (
                  <span className="footer-badge bg-[#1B1712] text-white font-mono font-bold">
                    {node.jira_issue_key}
                  </span>
                )}
                {(node.jira_sync_state === "failed" || node.jira_sync_state === "ambiguous") && (
                  <TriangleAlert className="text-warning size-3" />
                )}
                {node.pr_url && (
                  <a
                    href={node.pr_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    title={node.pr_title || node.pr_url}
                    className={cn(
                      "footer-badge flex items-center gap-1 font-bold transition-colors",
                      PR_BADGE[node.pr_state] ?? PR_BADGE.open,
                    )}
                  >
                    <GitPullRequest className="size-3" />
                    {PR_BADGE_LABEL[node.pr_state] ?? "PR"}
                  </a>
                )}
              </span>
            </>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!border-[#1B1712] !bg-[#F3EEE1] !size-2.5 !border-[2px] opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  )
}

export const GraphNodeCard = memo(GraphNodeCardImpl)
