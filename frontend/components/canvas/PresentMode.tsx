"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { ExternalLink, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PresentResult } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useGraphStore } from "@/stores/graphStore"

/** Fullscreen stakeholder present — portaled to body so the sidebar cannot trap it. */
export function PresentMode({
  present,
  onClose,
}: {
  present: PresentResult
  onClose: () => void
}) {
  const select = useGraphStore((state) => state.select)
  const focusLineage = useGraphStore((state) => state.focusLineage)

  const hasDelivery = Boolean(
    present.work_summary || present.pr_url || present.jira_issue_key || present.delivery_notes,
  )

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Present mode"
      className="bg-background fixed inset-0 z-[100] flex flex-col"
    >
      <header className="border-border flex items-start justify-between gap-4 border-b px-6 py-5 sm:px-10">
        <div className="min-w-0 max-w-4xl">
          <p className="text-2xs text-muted-foreground font-medium tracking-[0.08em] uppercase">
            Present mode · end to end
          </p>
          <h2 className="mt-1 text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
            {present.headline}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
            {present.audience_summary}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0 gap-2">
          <X className="size-4" />
          Back to canvas
        </Button>
      </header>

      <div className="thin-scrollbar flex-1 overflow-y-auto px-6 py-6 sm:px-10">
        {hasDelivery && (
          <section className="border-border mx-auto mb-8 max-w-3xl rounded-xl border px-5 py-4 sm:max-w-4xl">
            <h3 className="text-2xs text-muted-foreground mb-2 font-medium tracking-[0.08em] uppercase">
              Engineering delivery
            </h3>
            {present.work_summary && (
              <p className="text-sm leading-relaxed sm:text-base">{present.work_summary}</p>
            )}
            <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
              {present.assignee_name && <span>Assignee · {present.assignee_name}</span>}
              {present.task_status && <span>Status · {present.task_status}</span>}
              {present.pr_state && <span>PR · {present.pr_state}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {present.jira_url && present.jira_issue_key && (
                <a
                  href={present.jira_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline"
                >
                  {present.jira_issue_key}
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              {present.pr_url && (
                <a
                  href={present.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline"
                >
                  {present.pr_title || "Pull request"}
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
            {present.delivery_notes && (
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed whitespace-pre-wrap sm:text-base">
                {present.delivery_notes}
              </p>
            )}
            {present.checklist_summary && (
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                Checklist · {present.checklist_summary}
              </p>
            )}
          </section>
        )}

        <ol className="mx-auto max-w-3xl space-y-4 sm:max-w-4xl">
          {present.beats.map((beat, index) => (
            <li
              key={`${beat.title}-${index}`}
              className={cn(
                "border-border rounded-xl border px-5 py-4 sm:px-6 sm:py-5",
                beat.kind === "constraint" && "border-l-kind-constraint border-l-3",
                beat.kind === "finding" && "border-l-kind-finding border-l-3",
                beat.kind === "task" && "border-l-kind-task border-l-3",
                (beat.kind === "delivery" || beat.kind === "review") &&
                  "border-l-primary border-l-3",
              )}
            >
              <p className="text-2xs text-muted-foreground font-medium tracking-[0.08em] uppercase">
                {index + 1}. {beat.kind || "beat"}
              </p>
              <p className="mt-1 text-lg font-medium">{beat.title}</p>
              {beat.body && (
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                  {beat.body}
                </p>
              )}
              {beat.quote && (
                <blockquote className="border-border-strong text-muted-foreground mt-3 border-l-2 pl-3 font-mono text-xs leading-relaxed sm:text-sm">
                  {beat.quote}
                </blockquote>
              )}
              {beat.node_id && (
                <button
                  type="button"
                  className="text-primary mt-3 text-sm underline-offset-2 hover:underline"
                  onClick={() => {
                    select(beat.node_id)
                    focusLineage(present.task_id, [present.task_id, beat.node_id!])
                    onClose()
                  }}
                >
                  Show on canvas
                </button>
              )}
            </li>
          ))}
        </ol>

        {present.open_risks.length > 0 && (
          <section className="mx-auto mt-8 max-w-3xl sm:max-w-4xl">
            <h3 className="text-2xs text-muted-foreground mb-2 font-medium tracking-[0.08em] uppercase">
              Open risks
            </h3>
            <ul className="space-y-1.5">
              {present.open_risks.map((risk) => (
                <li key={risk} className="text-muted-foreground text-sm leading-relaxed sm:text-base">
                  {risk}
                </li>
              ))}
            </ul>
          </section>
        )}

        {present.image_url &&
          (present.image_url.startsWith("http") || present.image_url.startsWith("data:")) && (
            <section className="mx-auto mt-8 max-w-3xl sm:max-w-4xl">
              <h3 className="text-2xs text-muted-foreground mb-2 font-medium tracking-[0.08em] uppercase">
                One-pager
              </h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={present.image_url}
                alt="Generated stakeholder one-pager"
                className="border-border max-h-[32rem] w-full rounded-xl border object-contain"
              />
            </section>
          )}
        {present.image_url?.startsWith("mistral-file:") && (
          <section className="mx-auto mt-8 max-w-3xl sm:max-w-4xl">
            <p className="text-muted-foreground text-sm">
              One-pager was generated but needs a refresh — run Prepare stakeholder brief again.
            </p>
          </section>
        )}
      </div>
    </div>,
    document.body,
  )
}
