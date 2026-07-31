"use client"

import { useState } from "react"
import { Activity, X } from "lucide-react"

interface ActivityItem {
  action: string
  detail: string
  who: string
  when: string
}

export function ActivityPanel() {
  const [open, setOpen] = useState(false)

  // ponytail: demo mock — wire to GET /api/boards/{id}/activity when backed
  const activities: ActivityItem[] = [
    { action: "PR reported", detail: "Pull request #14 merged — source-span citation component", who: "Marco", when: "2 min ago" },
    { action: "Node created", detail: "Constraint: 'Every claim must cite a source span'", who: "Aisha", when: "8 min ago" },
    { action: "Edge connected", detail: "supports: 'Retrieval latency' → 'Cite source span'", who: "Priya", when: "15 min ago" },
    { action: "Document parsed", detail: "retrieval-grounding-study.pdf — 3 findings, 2 constraints", who: "Mistral", when: "20 min ago" },
    { action: "Task assigned", detail: "'Add inline source spans' assigned to Marco — Jira SB-142", who: "Priya", when: "25 min ago" },
    { action: "Agent queried", detail: "spatial_get_task_context called for task 'Add inline source spans'", who: "Cursor Agent", when: "30 min ago" },
  ]

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="border-border bg-card absolute right-4 top-[70px] z-20 flex size-9 items-center justify-center rounded-none border-[3px] shadow-[2px_2px_0_#1B1712] hover:bg-accent pixel-btn"
        title="Activity log">
        <Activity className="size-4" strokeWidth={2} />
      </button>
    )
  }

  return (
    <div className="border-border bg-card animate-menu-pop absolute right-4 top-[70px] z-20 w-72 rounded-none border-[3px] shadow-[3px_3px_0_#1B1712]">
      <header className="border-border flex items-center justify-between border-b-[3px] px-3.5 py-2.5">
        <span className="font-[family-name:var(--font-label)] text-[9px]">ACTIVITY LOG</span>
        <button onClick={() => setOpen(false)} className="hover:bg-accent rounded p-0.5">
          <X className="size-3.5" />
        </button>
      </header>
      <div className="thin-scrollbar max-h-80 space-y-0.5 overflow-y-auto p-0.5">
        {activities.map((a, i) => (
          <div key={i} className="hover:bg-accent/50 rounded px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium">{a.action}</span>
              <span className="text-2xs text-muted-foreground font-mono">{a.when}</span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-2xs">{a.detail}</p>
            <span className="text-muted-foreground/70 mt-0.5 block text-2xs">— {a.who}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
