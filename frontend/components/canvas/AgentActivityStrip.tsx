"use client"

import { Bot, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useGraphStore } from "@/stores/graphStore"

/** Slim strip that narrates Coordinator → specialist handoffs during canvas actions. */
export function AgentActivityStrip() {
  const events = useGraphStore((state) => state.agentEvents)
  const clear = useGraphStore((state) => state.clearAgentEvents)

  if (events.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto border-border bg-background/95 flex max-w-xl items-start gap-3 rounded-xl border px-3.5 py-2.5 shadow-sm backdrop-blur-sm">
        <Bot className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
        <ul className="min-w-0 flex-1 space-y-1">
          {events.slice(-4).map((event) => (
            <li
              key={event.id}
              className={cn(
                "text-xs leading-relaxed",
                event.kind === "error" && "text-destructive",
                event.kind === "done" && "text-muted-foreground",
              )}
            >
              {event.message}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0"
          onClick={clear}
          aria-label="Dismiss agent activity"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
