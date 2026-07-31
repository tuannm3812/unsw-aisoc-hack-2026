"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import type { CurrentUser, Health } from "@/lib/types"
import { cn } from "@/lib/utils"
import { initials, useGraphStore } from "@/stores/graphStore"

const MEMBER_COLORS: Record<string, string> = {
  Aisha: "#E10500",
  Marco: "#FF6A00",
  Priya: "#F2A100",
}

function memberBg(name: string) {
  const first = name.split(" ")[0]
  return MEMBER_COLORS[first] ?? "#7A7266"
}

function PixelIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <rect x="2" y="0" width="4" height="2" fill="#E10500" />
      <rect x="1" y="2" width="2" height="2" fill="#E10500" />
      <rect x="3" y="2" width="2" height="2" fill="#FF6A00" />
      <rect x="5" y="2" width="2" height="2" fill="#E10500" />
      <rect x="0" y="4" width="2" height="2" fill="#E10500" />
      <rect x="2" y="4" width="2" height="2" fill="#F2A100" />
      <rect x="4" y="4" width="2" height="2" fill="#E10500" />
      <rect x="6" y="4" width="2" height="2" fill="#E10500" />
      <rect x="2" y="6" width="4" height="2" fill="#1B1712" />
    </svg>
  )
}

export function TopBar({ user, health }: { user: CurrentUser | null; health: Health | null }) {
  const router = useRouter()
  const board = useGraphStore((state) => state.board)
  const members = useGraphStore((state) => state.members)
  const nodes = useGraphStore((state) => state.nodes)
  const myTaskFilter = useGraphStore((state) => state.myTaskFilter)
  const setMyTaskFilter = useGraphStore((state) => state.setMyTaskFilter)

  const taskCount = nodes.filter((node) => node.kind === "task").length

  async function signOut() {
    await api.logout().catch(() => undefined)
    useGraphStore.getState().clearLineage()
    useGraphStore.getState().setMyTaskFilter(null)
    router.push("/login")
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b-[3px] border-[#1B1712] bg-white px-4">
      <div className="flex items-center gap-2.5">
        <PixelIcon />
        <span className="hidden font-pixel text-[8px] tracking-[0.05em] text-[#1B1712] sm:inline">SPATIAL BRAIN</span>
      </div>

      <span className="bg-[#1B1712] h-6 w-[3px]" />

      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{board?.name ?? "Board"}</p>
        <p className="text-muted-foreground text-2xs truncate">
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · {taskCount} task
          {taskCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {user && (
          <button
            type="button"
            onClick={() => setMyTaskFilter(myTaskFilter === user.id ? null : user.id)}
            className={cn(
              "text-2xs rounded-lg px-2.5 py-1.5 font-medium transition-colors",
              myTaskFilter === user.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            My Tasks
          </button>
        )}
        <IntegrationDots health={health} />

        <div className="flex items-center gap-2">
          {members.map((member) => (
            <Tooltip key={member.id}>
              <TooltipTrigger asChild>
                <span
                  className="flex size-7 items-center justify-center border-[2px] border-[#1B1712] font-pixel text-[7px] text-white"
                  style={{ backgroundColor: memberBg(member.name) }}
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
              className="border-[2px] border-[#1B1712] bg-white p-2 pixel-btn hover:bg-[#F3EEE1] transition-colors"
            >
              <LogOut className="size-3.5 text-[#1B1712]" />
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
                  "size-2 border-[1.5px] border-[#1B1712]",
                  item.on ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-2xs text-muted-foreground font-mono">{item.label}</span>
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
