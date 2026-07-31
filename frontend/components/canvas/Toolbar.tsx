"use client"

import { useRef, useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { BarChart3, FlaskConical, ListChecks, Loader2, Ruler, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DRAWABLE_RELATIONS, type NodeKind, type RelationType } from "@/lib/types"
import { useGraphStore } from "@/stores/graphStore"

const ADD_BUTTONS: { kind: NodeKind; label: string; icon: typeof FlaskConical; hint: string }[] = [
  {
    kind: "finding",
    label: "Finding",
    icon: FlaskConical,
    hint: "Something the research established",
  },
  {
    kind: "constraint",
    label: "Constraint",
    icon: Ruler,
    hint: "A limit any implementation has to respect",
  },
  {
    kind: "task",
    label: "Task",
    icon: ListChecks,
    hint: "Work that can be assigned and pushed to Jira",
  },
]

const PLACEHOLDER: Record<NodeKind, string> = {
  asset: "Source document",
  finding: "New finding",
  constraint: "New constraint",
  task: "New task",
}

const COLUMN = 300
const ROW = 168

/** Walk down and then across from the viewport centre until nothing is in the way. */
function findFreeSpot(
  nodes: { x: number; y: number }[],
  start: { x: number; y: number },
): { x: number; y: number } {
  for (let column = 0; column < 6; column += 1) {
    for (let row = 0; row < 6; row += 1) {
      const x = start.x + column * COLUMN
      const y = start.y + row * ROW
      const occupied = nodes.some(
        (node) => Math.abs(node.x - x) < COLUMN * 0.9 && Math.abs(node.y - y) < ROW * 0.9,
      )
      if (!occupied) return { x, y }
    }
  }
  return start
}

interface ToolbarProps {
  activeRelation: RelationType
  onRelationChange: (relation: RelationType) => void
  onUpload: (file: File, x: number, y: number) => void
}

export function Toolbar({ activeRelation, onRelationChange, onUpload }: ToolbarProps) {
  const { screenToFlowPosition } = useReactFlow()
  const addNode = useGraphStore((state) => state.addNode)
  const nodes = useGraphStore((state) => state.nodes)
  const fileInput = useRef<HTMLInputElement>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewData, setReviewData] = useState<{
    shipped: { title: string; assignee: string; summary: string }[]
    blocked: { title: string; assignee: string; summary: string }[]
    next: { title: string; assignee: string; summary: string }[]
  } | null>(null)

  async function handleSprintReview() {
    setReviewLoading(true)
    try {
      // ponytail: demo mock — wire to /api/sprint-review when backend supports it
      await new Promise((resolve) => setTimeout(resolve, 800))
      setReviewData({
        shipped: [
          { title: "Build 2-Step Checkout", assignee: "Marco", summary: "PaymentElement integration complete, saved-payment selector working E2E." },
          { title: "Auth System Migration", assignee: "Aisha", summary: "Magic-link auth replaces OTP — clean migration for 100% of users." },
        ],
        blocked: [
          { title: "Payment Selector UI", assignee: "Priya", summary: "Waiting on final design mockups — feedback sent, expecting final by EOD Friday." },
        ],
        next: [
          { title: "PCI Compliance Audit", assignee: "Marco", summary: "External audit scheduled Aug 5. SAQ-A self-assessment + documentation." },
          { title: "Onboarding Flow Rewrite", assignee: "Aisha", summary: "Move from 5-step to 2-step. Design specs finalised." },
        ],
      })
      setReviewOpen(true)
    } finally {
      setReviewLoading(false)
    }
  }

  function centreOfView() {
    // Drop new nodes left of centre so the inspector does not cover them.
    return screenToFlowPosition({
      x: window.innerWidth * 0.38,
      y: window.innerHeight * 0.4,
    })
  }

  async function handleAdd(kind: NodeKind) {
    const position = findFreeSpot(nodes, centreOfView())
    await addNode(kind, PLACEHOLDER[kind], position.x, position.y)
  }

  return (
    <>
    <div className="border-border bg-card/95 absolute bottom-5 left-5 z-10 flex items-center gap-1 rounded-xl border p-1.5 backdrop-blur">
      {ADD_BUTTONS.map(({ kind, label, icon: Icon, hint }) => (
        <Tooltip key={kind}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleAdd(kind)}
              className="hover:bg-accent focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Icon className="size-3.5" strokeWidth={2} />
              {label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{hint}</TooltipContent>
        </Tooltip>
      ))}

      <span className="bg-border mx-1 h-6 w-px" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="hover:bg-accent focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Upload className="size-3.5" strokeWidth={2} />
            Document
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Or drop a PDF straight onto the canvas
        </TooltipContent>
      </Tooltip>

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.md,.markdown,.txt"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          const position = centreOfView()
          files.forEach((file, index) => onUpload(file, position.x, position.y + index * 150))
          event.target.value = ""
        }}
      />

      <span className="bg-border mx-1 h-6 w-px" />

      <div className="flex items-center gap-2 pr-1 pl-1.5">
        <span className="text-2xs text-muted-foreground whitespace-nowrap">new links mean</span>
        <Select value={activeRelation} onValueChange={(value) => onRelationChange(value as RelationType)}>
          <SelectTrigger className="h-8 w-[9.5rem] border-0 bg-transparent px-2 text-xs font-medium shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DRAWABLE_RELATIONS.map((relation) => (
              <SelectItem
                key={relation.value}
                value={relation.value}
                hint={relation.hint}
                className="text-xs"
              >
                <span className="font-medium">{relation.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <span className="bg-border mx-1 h-6 w-px" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleSprintReview}
            disabled={reviewLoading}
            className="hover:bg-accent focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {reviewLoading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <BarChart3 className="size-3.5" strokeWidth={2} />
            )}
            Sprint Review
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Mistral summarises what shipped, what's blocked, what's next</TooltipContent>
      </Tooltip>
    </div>

    {/* Sprint Review Dialog */}
    {reviewOpen && reviewData && (
      <div className="border-border bg-card animate-review-in fixed inset-4 z-50 flex flex-col overflow-hidden rounded-none border-[3px] shadow-[5px_5px_0_#1B1712] md:inset-10 lg:inset-x-60">
        <header className="border-border flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold">Sprint Review</h2>
          <button
            type="button"
            onClick={() => { setReviewOpen(false); setReviewData(null); }}
            className="hover:bg-accent rounded-lg p-1.5 transition-colors"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          {reviewData.shipped.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-success uppercase tracking-[0.08em] mb-3">
                Shipped ({reviewData.shipped.length})
              </h3>
              <div className="space-y-2">
                {reviewData.shipped.map((item, i) => (
                  <div key={i} className="bg-success/5 border-success/20 rounded-lg border p-3">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                      {item.title}
                      <span className="text-muted-foreground text-xs font-normal">— {item.assignee}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">{item.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {reviewData.blocked.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-destructive uppercase tracking-[0.08em] mb-3">
                Blocked ({reviewData.blocked.length})
              </h3>
              <div className="space-y-2">
                {reviewData.blocked.map((item, i) => (
                  <div key={i} className="bg-destructive/5 border-destructive/25 rounded-lg border p-3">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                      {item.title}
                      <span className="text-muted-foreground text-xs font-normal">— {item.assignee}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">{item.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {reviewData.next.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-3">
                Next ({reviewData.next.length})
              </h3>
              <div className="space-y-2">
                {reviewData.next.map((item, i) => (
                  <div key={i} className="bg-accent/30 rounded-lg border p-3">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                      {item.title}
                      <span className="text-muted-foreground text-xs font-normal">— {item.assignee}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">{item.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    )}
    {reviewOpen && <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm" onClick={() => { setReviewOpen(false); setReviewData(null); }} />}
    </>
  )
}
