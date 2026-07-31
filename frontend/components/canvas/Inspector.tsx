"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Check,
  Copy,
  ExternalLink,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Route,
  Scale,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react"

import { CandidateReview } from "@/components/canvas/CandidateReview"
import { PresentMode } from "@/components/canvas/PresentMode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { api } from "@/lib/api"
import { KIND_LABEL, type AlignmentResult, type GraphNode, type PresentResult, type ReviewChecklistResult, type TaskContext, type TaskRecommendationResult } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useGraphStore } from "@/stores/graphStore"

export function Inspector() {
  const nodes = useGraphStore((state) => state.nodes)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const select = useGraphStore((state) => state.select)

  const node = useMemo(
    () => nodes.find((candidate) => candidate.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  if (!node) return null

  return (
    <aside className="border-border bg-card animate-rise flex w-[25rem] shrink-0 flex-col border-l">
      <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground font-medium tracking-[0.08em] uppercase">
            {KIND_LABEL[node.kind]}
          </p>
          <p className="text-muted-foreground mt-1 truncate font-mono text-[11px]">{node.id}</p>
        </div>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="Close inspector"
          className="hover:bg-accent text-muted-foreground hover:text-foreground -mt-1 -mr-1.5 rounded-lg p-1.5 transition-colors"
        >
          <X className="size-4" />
        </button>
      </header>

      {node.kind === "task" ? (
        <TaskInspector node={node} />
      ) : node.kind === "asset" ? (
        <AssetInspector node={node} />
      ) : (
        <KnowledgeInspector node={node} />
      )}
    </aside>
  )
}

/** A source document: what it is, what Mistral proposed from it, and a re-read. */
function AssetInspector({ node }: { node: GraphNode }) {
  const boardId = useGraphStore((state) => state.boardId)
  const assets = useGraphStore((state) => state.assets)
  const refresh = useGraphStore((state) => state.refresh)
  const { toast } = useToast()
  const [reparsing, setReparsing] = useState(false)

  const asset = assets.find((entry) => entry.id === node.source_asset_id)

  async function reparse() {
    if (!boardId || !asset) return
    setReparsing(true)
    try {
      await api.reparseAsset(boardId, asset.id)
      await refresh()
      toast({
        title: "Reading it again",
        description: "New proposals will appear here. Nodes you already added stay put.",
      })
    } catch (error) {
      toast({ title: "Could not re-read", description: (error as Error).message, variant: "error" })
    } finally {
      setReparsing(false)
    }
  }

  return (
    <div className="thin-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <div>
        <p className="text-sm leading-relaxed font-medium">{node.title}</p>
        {asset && (
          <p className="text-muted-foreground mt-1 font-mono text-[11px]">
            {asset.page_count > 0 && `${asset.page_count} pages · `}
            {Math.max(1, Math.round(asset.byte_size / 1024))} KB
          </p>
        )}
      </div>

      {asset ? (
        <CandidateReview asset={asset} />
      ) : (
        <p className="text-muted-foreground text-xs leading-relaxed">
          The uploaded file behind this node is missing, so there is nothing to review.
        </p>
      )}

      {asset && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reparse}
          disabled={reparsing || asset.parse_state === "parsing"}
          className="text-muted-foreground -ml-3 h-8 gap-2 text-xs"
        >
          {reparsing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Read the document again
        </Button>
      )}
    </div>
  )
}

function NodeFields({ node }: { node: GraphNode }) {
  const patchNode = useGraphStore((state) => state.patchNode)
  const [title, setTitle] = useState(node.title)
  const [body, setBody] = useState(node.body)

  useEffect(() => {
    setTitle(node.title)
    setBody(node.body)
  }, [node.id, node.title, node.body])

  return (
    <div className="space-y-3.5">
      <div>
        <label className="text-2xs text-muted-foreground mb-1.5 block font-medium tracking-[0.08em] uppercase">
          Title
        </label>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title !== node.title && patchNode(node.id, { title })}
          className="h-9 text-sm"
        />
      </div>
      <div>
        <label className="text-2xs text-muted-foreground mb-1.5 block font-medium tracking-[0.08em] uppercase">
          Detail
        </label>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onBlur={() => body !== node.body && patchNode(node.id, { body })}
          rows={4}
          className="resize-none text-sm leading-relaxed"
          placeholder="What does this add to the picture?"
        />
      </div>
    </div>
  )
}

function Provenance({ node }: { node: GraphNode }) {
  const assets = useGraphStore((state) => state.assets)
  const asset = assets.find((candidate) => candidate.id === node.source_asset_id)

  if (node.evidence_class === "asserted") {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        Added by hand, so it carries no document citation. Findings pulled out of an uploaded
        document quote their source.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {asset && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Source</span>
          <span className="truncate font-medium">{asset.filename}</span>
        </div>
      )}
      {node.source_page !== null && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Page</span>
          <span className="font-mono">{node.source_page}</span>
        </div>
      )}
      {node.confidence !== null && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-mono">{Math.round(node.confidence * 100)}%</span>
        </div>
      )}
      {node.source_quote && (
        <blockquote className="border-border-strong text-muted-foreground mt-1 border-l-2 pl-3 font-mono text-[11px] leading-relaxed">
          {node.source_quote}
        </blockquote>
      )}
    </div>
  )
}

function KnowledgeInspector({ node }: { node: GraphNode }) {
  const removeNode = useGraphStore((state) => state.removeNode)

  return (
    <div className="thin-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <NodeFields node={node} />

      <section>
        <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
          Where this came from
        </h3>
        <Provenance node={node} />
      </section>

      {(node.kind === "finding" || node.kind === "constraint") && (
        <RecommendTasksBlock node={node} />
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => removeNode(node.id)}
        className="text-muted-foreground hover:text-destructive -ml-3 h-8 gap-2 text-xs"
      >
        <Trash2 className="size-3.5" />
        Delete this node
      </Button>
    </div>
  )
}

function RecommendTasksBlock({ node }: { node: GraphNode }) {
  const boardId = useGraphStore((state) => state.boardId)
  const refresh = useGraphStore((state) => state.refresh)
  const select = useGraphStore((state) => state.select)
  const arrangeLayout = useGraphStore((state) => state.arrangeLayout)
  const pushAgentEvents = useGraphStore((state) => state.pushAgentEvents)
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TaskRecommendationResult | null>(null)

  async function run() {
    if (!boardId) return
    setBusy(true)
    try {
      const payload = await api.recommendTasks(boardId, node.id)
      setResult(payload)
      pushAgentEvents(payload.events.length ? payload.events : [payload.summary])
      await refresh()
      await arrangeLayout()
      const first = payload.created_nodes[0]
      if (first) select(first.id)
      toast({
        title: `Created ${payload.created_nodes.length} task${payload.created_nodes.length === 1 ? "" : "s"}`,
        description: payload.summary,
      })
    } catch (error) {
      pushAgentEvents([(error as Error).message], "error")
      toast({
        title: "Could not recommend tasks",
        description: (error as Error).message,
        variant: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
        Recommend tasks
      </h3>
      <p className="text-muted-foreground mb-2.5 text-xs leading-relaxed">
        Mistral turns this {node.kind} (and neighbours) into concrete tasks and places them on
        the canvas, already linked.
      </p>
      <Button size="sm" onClick={run} disabled={busy} className="h-8 w-full gap-2 text-xs">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Create recommended tasks
      </Button>
      {result && (
        <ul className="mt-3 space-y-2">
          {result.tasks.map((task) => (
            <li key={`${task.title}-${task.priority}`} className="border-border rounded-lg border px-2.5 py-2 text-xs">
              <p className="font-medium">{task.title}</p>
              <p className="text-muted-foreground mt-1">
                {task.priority} · {task.relation}
                {task.rationale ? ` — ${task.rationale}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TaskInspector({ node }: { node: GraphNode }) {
  const boardId = useGraphStore((state) => state.boardId)
  const members = useGraphStore((state) => state.members)
  const focusLineage = useGraphStore((state) => state.focusLineage)
  const clearLineage = useGraphStore((state) => state.clearLineage)
  const focusedTaskId = useGraphStore((state) => state.focusedTaskId)
  const replaceNode = useGraphStore((state) => state.replaceNode)
  const patchNode = useGraphStore((state) => state.patchNode)
  const { toast } = useToast()

  const [assignee, setAssignee] = useState(node.assignee_id ?? "")
  const [assigning, setAssigning] = useState(false)
  const [context, setContext] = useState<TaskContext | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setAssignee(node.assignee_id ?? "")
    setContext(null)
  }, [node.id, node.assignee_id])

  const tracing = focusedTaskId === node.id

  async function loadContext(refresh = false) {
    if (!boardId) return
    setLoadingContext(true)
    try {
      const payload = await api.taskContext(boardId, node.id, refresh)
      setContext(payload)
      focusLineage(
        node.id,
        payload.lineage.nodes.map((lineageNode) => lineageNode.id),
      )
    } catch (error) {
      toast({
        title: "Could not read the context",
        description: (error as Error).message,
        variant: "error",
      })
    } finally {
      setLoadingContext(false)
    }
  }

  async function assign() {
    if (!boardId || !assignee) return
    setAssigning(true)
    try {
      const updated = await api.assignTask(boardId, node.id, assignee)
      replaceNode(updated)
      const name = members.find((member) => member.id === assignee)?.name ?? "them"
      toast({
        title: `Assigned to ${name}`,
        description: updated.jira_issue_key
          ? `Jira issue ${updated.jira_issue_key} created.`
          : updated.jira_sync_state === "pending"
            ? "Jira is not configured, so the task stays on the canvas."
            : `Jira sync ${updated.jira_sync_state}.`,
      })
    } catch (error) {
      toast({
        title: "Assignment failed",
        description: (error as Error).message,
        variant: "error",
      })
    } finally {
      setAssigning(false)
    }
  }

  return (
    <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col">
      <div className="border-border border-b px-5 pt-3">
        <TabsList className="h-9 bg-transparent p-0">
          <TabsTrigger value="details" className="h-8 rounded-lg px-3 text-xs">
            Details
          </TabsTrigger>
          <TabsTrigger value="context" className="h-8 rounded-lg px-3 text-xs">
            What an agent sees
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="details"
        className="thin-scrollbar mt-0 flex-1 space-y-6 overflow-y-auto px-5 py-5"
      >
        <NodeFields node={node} />

        <section>
          <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
            Owner
          </h3>
          <div className="flex gap-2">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue placeholder="Nobody yet" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem
                    key={member.id}
                    value={member.id}
                    hint={member.discipline}
                    className="text-sm"
                  >
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={assign}
              disabled={assigning || !assignee || assignee === node.assignee_id}
              className="h-9 shrink-0 gap-2 text-xs"
            >
              {assigning && <Loader2 className="size-3.5 animate-spin" />}
              Assign
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Assigning is the moment work leaves the canvas. It creates the Jira issue with this
            task&rsquo;s context in the description.
          </p>
        </section>

        <section>
          <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
            Status
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={node.task_status}
              onValueChange={(value) => patchNode(node.id, { task_status: value })}
            >
              <SelectTrigger className="h-8 w-[8.5rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["open", "assigned", "in_progress", "in_review", "done"].map((status) => (
                  <SelectItem key={status} value={status} className="text-xs">
                    {status.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <JiraBlock node={node} />
        <PullRequestBlock node={node} />
        <AlignmentBlock node={node} />
        <PresentBlock node={node} />
        <ReviewChecklistBlock node={node} />
      </TabsContent>

      <TabsContent
        value="context"
        className="thin-scrollbar mt-0 flex-1 space-y-5 overflow-y-auto px-5 py-5"
      >
        <div className="space-y-2.5">
          <p className="text-muted-foreground text-xs leading-relaxed">
            This is exactly what an agent receives over MCP: the task, every node it descends
            from, and a Mistral brief over that set.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={context ? "secondary" : "default"}
              onClick={() => loadContext(false)}
              disabled={loadingContext}
              className="h-8 gap-2 text-xs"
            >
              {loadingContext ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Route className="size-3.5" />
              )}
              {context ? "Reload" : "Trace the lineage"}
            </Button>
            {context && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => loadContext(true)}
                disabled={loadingContext}
                className="h-8 gap-2 text-xs"
              >
                <RefreshCw className="size-3.5" />
                Rewrite brief
              </Button>
            )}
            {tracing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearLineage}
                className="text-muted-foreground h-8 text-xs"
              >
                Stop highlighting
              </Button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(node.id)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          className="border-border hover:bg-accent flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
        >
          <span className="min-w-0">
            <span className="text-2xs text-muted-foreground block font-medium tracking-[0.08em] uppercase">
              Task id for your agent
            </span>
            <span className="mt-0.5 block truncate font-mono text-[11px]">{node.id}</span>
          </span>
          {copied ? (
            <Check className="text-success size-3.5 shrink-0" />
          ) : (
            <Copy className="text-muted-foreground size-3.5 shrink-0" />
          )}
        </button>

        {context && <ContextView context={context} />}
      </TabsContent>
    </Tabs>
  )
}

function ContextView({ context }: { context: TaskContext }) {
  const { lineage, brief } = context
  const ancestors = lineage.nodes.filter((node) => node.depth > 0)

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h3 className="text-2xs text-muted-foreground font-medium tracking-[0.08em] uppercase">
            Ancestry
          </h3>
          <span className="text-2xs text-muted-foreground font-mono">
            {ancestors.length} upstream node{ancestors.length === 1 ? "" : "s"}
          </span>
        </div>

        {ancestors.length === 0 && (
          <p className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-3 text-xs leading-relaxed">
            Nothing feeds this task yet, so an agent picking it up would get the title and
            nothing else. Draw a link from the findings and constraints that justify it.
          </p>
        )}

        {lineage.truncated && (
          <p className="text-warning-foreground bg-warning/15 mb-2.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-relaxed">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Capped at the budget, so {lineage.dropped_count} lower-priority node
            {lineage.dropped_count === 1 ? "" : "s"} were left out. Constraints and direct parents
            are kept first.
          </p>
        )}

        <ol className="space-y-1.5">
          {ancestors
            .map((node) => (
              <li
                key={node.id}
                className="border-border rounded-lg border px-2.5 py-2 text-xs leading-relaxed"
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-2xs shrink-0 font-medium tracking-[0.08em] uppercase",
                      node.kind === "constraint" && "text-kind-constraint",
                      node.kind === "finding" && "text-kind-finding",
                      node.kind === "asset" && "text-kind-asset",
                    )}
                  >
                    {node.kind}
                  </span>
                  <span className="text-muted-foreground text-2xs font-mono">
                    {node.depth} hop{node.depth === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 font-medium">{node.title}</p>
                {node.relation_path.length > 0 && (
                  <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                    via {node.relation_path.join(" ← ")}
                  </p>
                )}
                {node.source_quote && (
                  <blockquote className="border-border-strong text-muted-foreground mt-1.5 border-l-2 pl-2 font-mono text-[10px] leading-relaxed">
                    {node.source_quote}
                    {node.source_page !== null && ` (p.${node.source_page})`}
                  </blockquote>
                )}
              </li>
            ))}
        </ol>
      </section>

      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h3 className="text-2xs text-muted-foreground font-medium tracking-[0.08em] uppercase">
            Brief
          </h3>
          <span className="text-2xs text-muted-foreground truncate font-mono">
            {brief.generated_by}
          </span>
        </div>

        <p className="text-sm leading-relaxed">{brief.objective}</p>

        <BriefList label="Findings that matter" items={brief.relevant_findings} />
        <BriefList label="Constraints" items={brief.constraints} />
        <BriefList label="Done when" items={brief.acceptance_criteria} />
        <BriefList label="Still open" items={brief.open_questions} />
        <BriefList label="Citations" items={brief.citations} mono />
      </section>
    </div>
  )
}

function BriefList({
  label,
  items,
  mono = false,
}: {
  label: string
  items: string[]
  mono?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div className="mt-3.5">
      <h4 className="text-2xs text-muted-foreground mb-1.5 font-medium tracking-[0.08em] uppercase">
        {label}
      </h4>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li
            key={index}
            className={cn(
              "text-muted-foreground border-border border-l pl-2.5 text-xs leading-relaxed",
              mono && "font-mono text-[10.5px]",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function JiraBlock({ node }: { node: GraphNode }) {
  const boardId = useGraphStore((state) => state.boardId)
  const replaceNode = useGraphStore((state) => state.replaceNode)
  const { toast } = useToast()
  const [retrying, setRetrying] = useState(false)

  const ambiguous = node.jira_sync_state === "ambiguous"
  const failed = node.jira_sync_state === "failed" || ambiguous

  async function retry() {
    if (!boardId) return
    setRetrying(true)
    try {
      const updated = await api.retryJira(boardId, node.id, ambiguous)
      replaceNode(updated)
      if (updated.jira_issue_key) {
        toast({ title: `Jira issue ${updated.jira_issue_key} created` })
      } else {
        toast({
          title: "Still not synced",
          description: updated.jira_sync_error || `Sync ${updated.jira_sync_state}.`,
          variant: "error",
        })
      }
    } catch (error) {
      toast({ title: "Retry failed", description: (error as Error).message, variant: "error" })
    } finally {
      setRetrying(false)
    }
  }

  return (
    <section>
      <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
        Jira
      </h3>

      {node.jira_issue_key ? (
        <a
          href={node.jira_url}
          target="_blank"
          rel="noreferrer"
          className="border-border hover:bg-accent flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors"
        >
          <span className="min-w-0">
            <span className="block font-mono text-sm font-medium">{node.jira_issue_key}</span>
            <span className="text-muted-foreground mt-0.5 block text-xs">
              Live on your Jira site
            </span>
          </span>
          <ExternalLink className="text-muted-foreground size-3.5 shrink-0" />
        </a>
      ) : failed ? (
        <div className="bg-warning/15 rounded-lg px-3 py-2.5">
          <p className="text-warning-foreground flex items-center gap-2 text-xs font-medium">
            <TriangleAlert className="size-3.5" />
            {node.jira_sync_state === "ambiguous"
              ? "Jira did not answer in time"
              : "Jira rejected the issue"}
          </p>
          {node.jira_sync_error && (
            <p className="text-muted-foreground mt-1.5 font-mono text-[10.5px] leading-relaxed">
              {node.jira_sync_error}
            </p>
          )}
          {ambiguous && (
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
              Check the project before retrying. The issue may already exist.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="mt-2.5 h-7 w-full text-xs"
            onClick={retry}
            disabled={retrying}
          >
            {retrying ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-3" />
            )}
            {ambiguous ? "Retry anyway" : "Retry"}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs leading-relaxed">
          No issue yet. Assigning this task creates one.
        </p>
      )}
    </section>
  )
}

/** The backend stores naive UTC, so an absent zone is read as UTC rather than local. */
function formatReportedAt(value: string) {
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return value

  const secondsAgo = (Date.now() - at.getTime()) / 1000
  if (secondsAgo < 60) return "just now"
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`
  return at.toLocaleDateString()
}

function PullRequestBlock({ node }: { node: GraphNode }) {
  if (!node.pr_url) {
    return (
      <section>
        <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
          Pull request
        </h3>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Nothing reported yet. An agent that finishes this task reports its pull request through
          MCP and it appears here.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
        Pull request
      </h3>
      <a
        href={node.pr_url}
        target="_blank"
        rel="noreferrer"
        className="border-border hover:bg-accent block rounded-lg border px-3 py-2.5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <GitPullRequest className="text-success size-3.5 shrink-0" />
          <span className="truncate text-sm font-medium">{node.pr_title || node.pr_url}</span>
        </span>
        <span className="text-muted-foreground mt-1 block text-xs">
          {node.pr_state}
          {node.pr_reported_by && ` · reported by ${node.pr_reported_by}`}
          {node.pr_reported_at && ` · ${formatReportedAt(node.pr_reported_at)}`}
        </span>
      </a>
    </section>
  )
}

function AlignmentBlock({ node }: { node: GraphNode }) {
  const boardId = useGraphStore((state) => state.boardId)
  const focusLineage = useGraphStore((state) => state.focusLineage)
  const replaceNode = useGraphStore((state) => state.replaceNode)
  const pushAgentEvents = useGraphStore((state) => state.pushAgentEvents)
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AlignmentResult | null>(
    (node.alignment_payload as AlignmentResult | null) ?? null,
  )
  const [rationale, setRationale] = useState("")

  useEffect(() => {
    setResult((node.alignment_payload as AlignmentResult | null) ?? null)
  }, [node.id, node.alignment_payload])

  async function run() {
    if (!boardId) return
    setBusy(true)
    try {
      const run = await api.agentRun(boardId, node.id, "align")
      pushAgentEvents(run.events)
      if (run.alignment) {
        setResult(run.alignment)
        const ids = new Set<string>([node.id])
        for (const conflict of run.alignment.conflicts) {
          ids.add(conflict.node_a_id)
          ids.add(conflict.node_b_id)
        }
        focusLineage(node.id, [...ids])
      }
      const refreshed = await api.graph(boardId)
      const updated = refreshed.nodes.find((n) => n.id === node.id)
      if (updated) replaceNode(updated)
    } catch (error) {
      pushAgentEvents([(error as Error).message], "error")
      toast({ title: "Alignment failed", description: (error as Error).message, variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  async function decide(state: "decided" | "deferred" | "rejected") {
    if (!boardId) return
    try {
      const updated = await api.recordDecision(boardId, node.id, state, rationale)
      replaceNode(updated)
      toast({ title: `Recorded as ${state}` })
    } catch (error) {
      toast({ title: "Could not record", description: (error as Error).message, variant: "error" })
    }
  }

  return (
    <section>
      <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
        Align on decisions
      </h3>
      <p className="text-muted-foreground mb-2.5 text-xs leading-relaxed">
        Arbiter checks whether findings and constraints feeding this task contradict each other.
      </p>
      <Button size="sm" onClick={run} disabled={busy} className="h-8 w-full gap-2 text-xs">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Scale className="size-3.5" />}
        Check alignment
      </Button>

      {result && (
        <div className="mt-3 space-y-2">
          <p className="text-xs leading-relaxed">{result.summary}</p>
          {result.conflicts.length === 0 ? (
            <p className="text-muted-foreground text-xs">No contradictions found.</p>
          ) : (
            <ul className="space-y-2">
              {result.conflicts.map((conflict) => (
                <li
                  key={`${conflict.node_a_id}-${conflict.node_b_id}`}
                  className="bg-warning/15 rounded-lg px-2.5 py-2 text-xs leading-relaxed"
                >
                  <p className="text-warning-foreground font-medium">
                    {conflict.node_a_title} ↔ {conflict.node_b_title}
                  </p>
                  <p className="text-muted-foreground mt-1">{conflict.description}</p>
                </li>
              ))}
            </ul>
          )}

          <Textarea
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            rows={2}
            placeholder="Decision rationale"
            className="mt-2 resize-none text-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {(["decided", "deferred", "rejected"] as const).map((state) => (
              <Button
                key={state}
                size="sm"
                variant={node.decision_state === state ? "default" : "outline"}
                className="h-7 text-[11px]"
                onClick={() => decide(state)}
              >
                {state}
              </Button>
            ))}
          </div>
          {node.decision_state && (
            <p className="text-muted-foreground text-[11px]">
              {node.decision_state}
              {node.decision_by && ` · ${node.decision_by}`}
              {node.decision_rationale && ` — ${node.decision_rationale}`}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function PresentBlock({ node }: { node: GraphNode }) {
  const boardId = useGraphStore((state) => state.boardId)
  const replaceNode = useGraphStore((state) => state.replaceNode)
  const focusLineage = useGraphStore((state) => state.focusLineage)
  const pushAgentEvents = useGraphStore((state) => state.pushAgentEvents)
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [present, setPresent] = useState<PresentResult | null>(
    (node.present_payload as PresentResult | null) ?? null,
  )
  const [modeOpen, setModeOpen] = useState(false)

  useEffect(() => {
    setPresent((node.present_payload as PresentResult | null) ?? null)
  }, [node.id, node.present_payload])

  async function run() {
    if (!boardId) return
    setBusy(true)
    try {
      const run = await api.agentRun(boardId, node.id, "present")
      pushAgentEvents(run.events)
      if (run.present) {
        setPresent(run.present)
        const ids = [
          node.id,
          ...run.present.beats.map((beat) => beat.node_id).filter(Boolean),
        ] as string[]
        focusLineage(node.id, ids)
        setModeOpen(true)
      }
      const refreshed = await api.graph(boardId)
      const updated = refreshed.nodes.find((n) => n.id === node.id)
      if (updated) replaceNode(updated)
    } catch (error) {
      pushAgentEvents([(error as Error).message], "error")
      toast({ title: "Present failed", description: (error as Error).message, variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
        Present ideas
      </h3>
      <Button size="sm" onClick={run} disabled={busy} className="h-8 w-full gap-2 text-xs">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Generate stakeholder present
      </Button>
      {present && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 w-full text-xs"
          onClick={() => setModeOpen(true)}
        >
          Open Present Mode
        </Button>
      )}
      {modeOpen && present && <PresentMode present={present} onClose={() => setModeOpen(false)} />}
    </section>
  )
}

function ReviewChecklistBlock({ node }: { node: GraphNode }) {
  const boardId = useGraphStore((state) => state.boardId)
  const replaceNode = useGraphStore((state) => state.replaceNode)
  const pushAgentEvents = useGraphStore((state) => state.pushAgentEvents)
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<ReviewChecklistResult["items"]>(
    (node.review_checklist as ReviewChecklistResult["items"]) ?? [],
  )
  const [summary, setSummary] = useState("")

  useEffect(() => {
    setItems((node.review_checklist as ReviewChecklistResult["items"]) ?? [])
  }, [node.id, node.review_checklist])

  async function run() {
    if (!boardId) return
    setBusy(true)
    try {
      const run = await api.agentRun(boardId, node.id, "review")
      pushAgentEvents(run.events)
      if (run.status === "needs_pr") {
        toast({ title: "Link a PR first", variant: "error" })
        return
      }
      if (run.review) {
        setItems(run.review.items)
        setSummary(run.review.summary)
      }
      const refreshed = await api.graph(boardId)
      const updated = refreshed.nodes.find((n) => n.id === node.id)
      if (updated) replaceNode(updated)
    } catch (error) {
      pushAgentEvents([(error as Error).message], "error")
      toast({ title: "Review failed", description: (error as Error).message, variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase">
        Review constraints
      </h3>
      <Button
        size="sm"
        variant="outline"
        onClick={run}
        disabled={busy || !node.pr_url}
        className="h-8 w-full gap-2 text-xs"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Constraint checklist
      </Button>
      {summary && <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{summary}</p>}
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.constraint_id} className="border-border rounded-lg border px-2.5 py-2 text-xs">
              <span
                className={cn(
                  "text-2xs mr-2 font-medium tracking-[0.08em] uppercase",
                  item.status === "pass" && "text-success",
                  item.status === "fail" && "text-destructive",
                  item.status === "unknown" && "text-muted-foreground",
                )}
              >
                {item.status}
              </span>
              {item.title}
              {item.note && <p className="text-muted-foreground mt-1">{item.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
