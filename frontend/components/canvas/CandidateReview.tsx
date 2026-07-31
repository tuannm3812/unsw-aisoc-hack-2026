"use client"

import { useMemo, useState } from "react"
import { Check, Loader2, Sparkles, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import type { Candidate, GraphAsset, NodeKind } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useGraphStore } from "@/stores/graphStore"

const GROUPS: { kind: NodeKind; label: string; blurb: string }[] = [
  {
    kind: "finding",
    label: "Findings",
    blurb: "Results and claims the document asserts",
  },
  {
    kind: "constraint",
    label: "Constraints",
    blurb: "Limits an implementation would have to respect",
  },
]

/** The review step between Mistral reading a document and the canvas changing.
 *
 *  Extraction used to create every node it found, which buried a board under
 *  dozens of unread cards. Proposals live here on the source node instead, and
 *  only what someone ticks becomes part of the graph. */
export function CandidateReview({ asset }: { asset: GraphAsset }) {
  const candidates = useGraphStore((state) => state.candidates)
  const promoteCandidates = useGraphStore((state) => state.promoteCandidates)
  const dismissCandidates = useGraphStore((state) => state.dismissCandidates)
  const { toast } = useToast()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<"promote" | "dismiss" | null>(null)

  const pending = useMemo(
    () =>
      candidates.filter(
        (candidate) => candidate.asset_id === asset.id && !candidate.promoted_node_id,
      ),
    [candidates, asset.id],
  )

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(kind: NodeKind) {
    const ids = pending.filter((candidate) => candidate.kind === kind).map((c) => c.id)
    const allOn = ids.every((id) => selected.has(id))
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  async function commit(action: "promote" | "dismiss") {
    const ids = [...selected]
    if (ids.length === 0) return
    setBusy(action)
    try {
      if (action === "promote") {
        const added = await promoteCandidates(asset.id, ids)
        if (added > 0) {
          toast({
            title: `Added ${added} node${added === 1 ? "" : "s"}`,
            description: "Linked back to the document, so the citation travels with them.",
          })
        }
      } else {
        await dismissCandidates(asset.id, ids)
      }
      setSelected(new Set())
    } finally {
      setBusy(null)
    }
  }

  if (asset.parse_state === "parsing" || asset.parse_state === "pending") {
    return (
      <section>
        <SectionHeading>What Mistral found</SectionHeading>
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          Reading {asset.page_count > 0 ? `${asset.page_count} pages` : "the document"}&hellip;
        </p>
      </section>
    )
  }

  if (asset.parse_state === "failed") {
    return (
      <section>
        <SectionHeading>What Mistral found</SectionHeading>
        <p className="text-warning-foreground bg-warning/15 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-relaxed">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {asset.parse_error || "Extraction failed."}
        </p>
      </section>
    )
  }

  if (pending.length === 0) {
    return (
      <section>
        <SectionHeading>What Mistral found</SectionHeading>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Everything from this document has been reviewed. Re-read it below if you want a fresh
          pass.
        </p>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <SectionHeading className="mb-0">What Mistral found</SectionHeading>
        <span className="text-2xs text-muted-foreground font-mono">{pending.length} proposed</span>
      </div>

      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        None of these are on the canvas. Pick the ones worth keeping, so the graph holds what your
        team decided matters rather than everything a model could name.
      </p>

      <div className="space-y-4">
        {GROUPS.map((group) => {
          const rows = pending.filter((candidate) => candidate.kind === group.kind)
          if (rows.length === 0) return null
          const allOn = rows.every((row) => selected.has(row.id))

          return (
            <div key={group.kind}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h4
                  className={cn(
                    "text-2xs font-medium tracking-[0.08em] uppercase",
                    group.kind === "finding" && "text-kind-finding",
                    group.kind === "constraint" && "text-kind-constraint",
                  )}
                >
                  {group.label}
                  <span className="text-muted-foreground ml-1.5 font-mono">{rows.length}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.kind)}
                  className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {allOn ? "none" : "all"}
                </button>
              </div>
              <p className="text-muted-foreground mb-2 text-[11px] leading-relaxed">
                {group.blurb}
              </p>
              <ul className="space-y-1.5">
                {rows.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    checked={selected.has(candidate.id)}
                    onToggle={() => toggle(candidate.id)}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="bg-card border-border sticky bottom-0 -mx-5 mt-4 flex gap-2 border-t px-5 pt-3 pb-1">
        <Button
          size="sm"
          onClick={() => commit("promote")}
          disabled={selected.size === 0 || busy !== null}
          className="h-8 flex-1 gap-2 text-xs"
        >
          {busy === "promote" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {selected.size === 0 ? "Select what to add" : `Add ${selected.size} to canvas`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => commit("dismiss")}
          disabled={selected.size === 0 || busy !== null}
          className="text-muted-foreground h-8 shrink-0 text-xs"
        >
          {busy === "dismiss" ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : null}
          Not useful
        </Button>
      </div>
    </section>
  )
}

function CandidateRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: Candidate
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className={cn(
          "hover:border-border-strong flex w-full gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
          checked ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
            checked ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-xs leading-relaxed font-medium">{candidate.title}</span>

          <span className="text-muted-foreground mt-1 flex items-center gap-2 font-mono text-[10px]">
            {candidate.confidence !== null && (
              <span>{Math.round(candidate.confidence * 100)}%</span>
            )}
            {candidate.source_page !== null && <span>p.{candidate.source_page}</span>}
          </span>

          {candidate.source_quote && (
            <span className="border-border-strong text-muted-foreground mt-1.5 block border-l-2 pl-2 font-mono text-[10px] leading-relaxed">
              {candidate.source_quote.slice(0, 220)}
              {candidate.source_quote.length > 220 && "\u2026"}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h3
      className={cn(
        "text-2xs text-muted-foreground mb-2.5 font-medium tracking-[0.08em] uppercase",
        className,
      )}
    >
      {children}
    </h3>
  )
}
