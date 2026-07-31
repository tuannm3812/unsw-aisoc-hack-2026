"use client"

import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PresentResult } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useGraphStore } from "@/stores/graphStore"

/** Fullscreen walkthrough of a stakeholder present — canvas stays the source of truth. */
export function PresentMode({
  present,
  onClose,
}: {
  present: PresentResult
  onClose: () => void
}) {
  const select = useGraphStore((state) => state.select)
  const focusLineage = useGraphStore((state) => state.focusLineage)

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-sm">
      <header className="border-border flex items-start justify-between gap-4 border-b px-8 py-5">
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground font-medium tracking-[0.08em] uppercase">
            Present mode
          </p>
          <h2 className="mt-1 text-2xl leading-tight font-semibold tracking-tight">
            {present.headline}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
            {present.audience_summary}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0 gap-2">
          <X className="size-4" />
          Back to canvas
        </Button>
      </header>

      <div className="thin-scrollbar flex-1 overflow-y-auto px-8 py-6">
        <ol className="mx-auto max-w-3xl space-y-4">
          {present.beats.map((beat, index) => (
            <li
              key={`${beat.title}-${index}`}
              className={cn(
                "border-border rounded-xl border px-5 py-4",
                beat.kind === "constraint" && "border-l-kind-constraint border-l-3",
                beat.kind === "finding" && "border-l-kind-finding border-l-3",
                beat.kind === "task" && "border-l-kind-task border-l-3",
              )}
            >
              <p className="text-2xs text-muted-foreground font-medium tracking-[0.08em] uppercase">
                {index + 1}. {beat.kind || "beat"}
              </p>
              <p className="mt-1 text-base font-medium">{beat.title}</p>
              {beat.body && (
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{beat.body}</p>
              )}
              {beat.quote && (
                <blockquote className="border-border-strong text-muted-foreground mt-3 border-l-2 pl-3 font-mono text-[11px] leading-relaxed">
                  {beat.quote}
                </blockquote>
              )}
              {beat.node_id && (
                <button
                  type="button"
                  className="text-primary mt-3 text-xs underline-offset-2 hover:underline"
                  onClick={() => {
                    select(beat.node_id)
                    focusLineage(present.task_id, [present.task_id, beat.node_id!])
                  }}
                >
                  Show on canvas
                </button>
              )}
            </li>
          ))}
        </ol>

        {present.open_risks.length > 0 && (
          <section className="mx-auto mt-8 max-w-3xl">
            <h3 className="text-2xs text-muted-foreground mb-2 font-medium tracking-[0.08em] uppercase">
              Open risks
            </h3>
            <ul className="space-y-1.5">
              {present.open_risks.map((risk) => (
                <li key={risk} className="text-muted-foreground text-sm leading-relaxed">
                  {risk}
                </li>
              ))}
            </ul>
          </section>
        )}

        {present.image_url && (
          <section className="mx-auto mt-8 max-w-3xl">
            <h3 className="text-2xs text-muted-foreground mb-2 font-medium tracking-[0.08em] uppercase">
              One-pager
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={present.image_url}
              alt="Generated stakeholder one-pager"
              className="border-border max-h-[28rem] w-full rounded-xl border object-contain"
            />
          </section>
        )}
      </div>
    </div>
  )
}
