"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import type { CurrentUser, Health } from "@/lib/types"
import { cn } from "@/lib/utils"
import { initials, useGraphStore } from "@/stores/graphStore"

export function TopBar({ user, health }: { user: CurrentUser | null; health: Health | null }) {
  const router = useRouter()
  const board = useGraphStore((state) => state.board)
  const members = useGraphStore((state) => state.members)
  const nodes = useGraphStore((state) => state.nodes)

  const taskCount = nodes.filter((node) => node.kind === "task").length

  async function signOut() {
    await api.logout().catch(() => undefined)
    router.push("/login")
  }

  return (
    <header className="border-border bg-card flex h-14 shrink-0 items-center gap-4 border-b px-4">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary flex size-6 items-center justify-center rounded">
          <span className="bg-primary-foreground size-1.5 rounded-full" />
        </span>
        <span className="hidden text-sm font-medium tracking-tight sm:inline">Spatial Brain</span>
      </div>

      <span className="bg-border h-6 w-px" />

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{board?.name ?? "Board"}</p>
        <p className="text-muted-foreground text-2xs truncate">
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · {taskCount} task
          {taskCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <IntegrationDots health={health} />

        <div className="flex -space-x-1.5">
          {members.map((member) => (
            <Tooltip key={member.id}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "bg-secondary text-secondary-foreground border-card flex size-7 items-center justify-center rounded-full border-2 text-[10px] font-medium",
                    member.id === user?.id && "bg-primary text-primary-foreground",
                  )}
                >
                  {initials(member.name)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {member.name}
                <span className="text-muted-foreground ml-1.5">{member.discipline}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg p-2 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Signed in as {user?.name ?? "unknown"}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

function IntegrationDots({ health }: { health: Health | null }) {
  const items = [
    { label: "Mistral", on: health?.mistral_configured ?? false, off: "MISTRAL_API_KEY not set" },
    { label: "Jira", on: health?.jira_configured ?? false, off: "JIRA_* not set in .env" },
  ]

  return (
    <div className="hidden items-center gap-3 md:flex">
      {items.map((item) => (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  item.on ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-2xs text-muted-foreground">{item.label}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {item.on ? `${item.label} is connected` : item.off}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
