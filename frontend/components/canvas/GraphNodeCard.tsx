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
import type { GraphNode, NodeKind, ParseState } from "@/lib/types"

export interface GraphNodeData extends Record<string, unknown> {
  node: GraphNode
  assigneeName: string
  parseState: ParseState | null
  dimmed: boolean
  inLineage: boolean
  isFocusedTask: boolean
  depth: number | null
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

// A merged pull request is the payoff of the whole demo, so it reads differently
// from one that is still open.
const PR_BADGE: Record<string, string> = {
  open: "bg-success/15 text-success hover:bg-success/25",
  draft: "bg-secondary text-muted-foreground hover:bg-accent",
  merged: "bg-kind-task/15 text-kind-task hover:bg-kind-task/25",
  closed: "bg-secondary text-muted-foreground hover:bg-accent",
}

const PR_BADGE_LABEL: Record<string, string> = {
  open: "PR",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-destructive/15 text-destructive",
  P1: "bg-warning/20 text-warning-foreground",
  P2: "bg-info/15 text-info-foreground",
  P3: "bg-secondary text-muted-foreground",
  P4: "bg-secondary/50 text-muted-foreground/70",
}

function detectPriority(node: GraphNode): string | null {
  const text = `${node.title} ${node.body}`.toLowerCase()
  if (text.includes("p0") || text.includes("urgent") || text.includes("critical")) return "P0"
  if (text.includes("p1") || text.includes("high") || text.includes("blocker")) return "P1"
  if (text.includes("p2") || text.includes("medium")) return "P2"
  if (text.includes("p3") || text.includes("low")) return "P3"
  if (text.includes("p4") || text.includes("nice") || text.includes("later")) return "P4"
  return null
}

function GraphNodeCardImpl({ data, selected }: NodeProps & { data: GraphNodeData }) {
  const { node, assigneeName, parseState, dimmed, inLineage, isFocusedTask, depth } = data
  const meta = KIND_META[node.kind]
  const Icon = meta.icon
  const isTask = node.kind === "task"
  const priority = isTask ? detectPriority(node) : null

  return (
    <div
      className={cn(
        "group bg-card w-[264px] rounded-none border-[3px] border-border shadow-[3px_3px_0_var(--border)] transition-[opacity,box-shadow,border-color] duration-200",
        dimmed && "pointer-events-none opacity-25",
        inLineage && !isFocusedTask && "ring-primary ring-2",
        isFocusedTask && "ring-primary ring-2",
        selected && !inLineage && "ring-ring ring-2",
      )}
    >
      <div className="bg-kind-asset h-[4px] w-full -mx-0 -mt-0 mb-2 rounded-none"
        style={{ backgroundColor: `var(--kind-${node.kind})` }} />
      <Handle
        type="target"
        position={Position.Left}
        className="!border-border-strong !bg-background !size-2.5 !border opacity-0 transition-opacity group-hover:opacity-100"
      />

      <div className="px-3.5 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className={cn("flex items-center gap-1.5", meta.text)}>
            <Icon className="size-3.5" strokeWidth={2} />
            <span className="text-2xs font-medium tracking-[0.08em] uppercase">{meta.label}</span>
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

        <p className="mt-2 line-clamp-3 text-sm leading-snug font-medium">{node.title}</p>

        {node.body && !node.source_quote && (
          <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs leading-relaxed">
            {node.body}
          </p>
        )}

        {node.source_quote && (
          <blockquote className="border-border-strong text-muted-foreground mt-2.5 line-clamp-3 border-l-2 pl-2.5 font-mono text-[10.5px] leading-relaxed">
            {node.source_quote}
          </blockquote>
        )}
      </div>

      {(isTask || node.source_page !== null) && (
        <div className="border-border flex items-center gap-2 border-t px-3.5 py-2">
          {node.source_page !== null && (
            <span className="text-2xs text-muted-foreground font-mono">p.{node.source_page}</span>
          )}

          {isTask && (
            <>
              {priority && (
              <span className={cn("text-2xs rounded px-1.5 py-0.5 font-mono font-semibold", PRIORITY_COLORS[priority])}>
                {priority}
              </span>
            )}
            {assigneeName ? (
                <span className="text-2xs text-muted-foreground truncate">{assigneeName}</span>
              ) : (
                <span className="text-2xs text-muted-foreground/70">Unassigned</span>
              )}

              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {node.jira_sync_state === "creating" && (
                  <Loader2 className="text-muted-foreground size-3 animate-spin" />
                )}
                {node.jira_issue_key && (
                  <span className="text-2xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono font-medium">
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
                    // The canvas swallows clicks to pan and select, so the link
                    // has to claim this one for itself.
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    title={node.pr_title || node.pr_url}
                    className={cn(
                      "text-2xs flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
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
        className="!border-border-strong !bg-background !size-2.5 !border opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  )
}

export const GraphNodeCard = memo(GraphNodeCardImpl)
