"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ReactFlowProvider } from "@xyflow/react"
import { Loader2 } from "lucide-react"

import { Canvas } from "@/components/canvas/Canvas"
import { AgentActivityStrip } from "@/components/canvas/AgentActivityStrip"
import { Inspector } from "@/components/canvas/Inspector"
import { Toolbar } from "@/components/canvas/Toolbar"
import { TopBar } from "@/components/canvas/TopBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import { ApiError, api } from "@/lib/api"
import type { CurrentUser, Health, RelationType } from "@/lib/types"
import { useGraphStore } from "@/stores/graphStore"

const PARSE_POLL_MS = 2200
// Slow background poll so an agent reporting a pull request over MCP lands on the
// canvas on its own. There is no websocket in this build.
const IDLE_POLL_MS = 5000

export default function BoardPage() {
  const params = useParams<{ boardId: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [user, setUser] = useState<CurrentUser | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [activeRelation, setActiveRelation] = useState<RelationType>("supports")

  const load = useGraphStore((state) => state.load)
  const refresh = useGraphStore((state) => state.refresh)
  const syncRemote = useGraphStore((state) => state.syncRemote)
  const loading = useGraphStore((state) => state.loading)
  const error = useGraphStore((state) => state.error)
  const board = useGraphStore((state) => state.board)
  const assets = useGraphStore((state) => state.assets)
  const candidates = useGraphStore((state) => state.candidates)
  const nodes = useGraphStore((state) => state.nodes)
  const boardId = params.boardId

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenPrs = useRef<Set<string> | null>(null)
  const seenParsed = useRef<Set<string> | null>(null)

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login")
      })
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [router])

  useEffect(() => {
    if (boardId) void load(boardId)
  }, [boardId, load])

  // Extraction and agent write-backs both happen off-screen. Poll quickly while a
  // document is being read, slowly the rest of the time.
  const parsing = assets.some((asset) => asset.parse_state === "parsing")
  useEffect(() => {
    if (!boardId) return
    const every = parsing ? PARSE_POLL_MS : IDLE_POLL_MS
    pollTimer.current = setInterval(() => {
      if (document.visibilityState === "visible") void syncRemote()
    }, every)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [boardId, parsing, syncRemote])

  // Announce a pull request the moment it arrives, since it is the closing beat of
  // the demo and one badge is easy to miss on a full canvas. Pull requests already
  // present when the board opens are recorded silently.
  useEffect(() => {
    if (!nodes.length) return
    const withPr = nodes.filter((node) => node.kind === "task" && node.pr_url)

    if (!seenPrs.current) {
      seenPrs.current = new Set(withPr.map((node) => node.id))
      return
    }

    for (const node of withPr) {
      if (seenPrs.current.has(node.id)) continue
      seenPrs.current.add(node.id)
      toast({
        title: "Pull request reported",
        description: `${node.pr_title || node.pr_url} on “${node.title}”.`,
      })
    }
  }, [nodes, toast])

  // A finished parse changes nothing visible on its own now that proposals wait on
  // the source node, so say so once rather than leaving the canvas looking idle.
  useEffect(() => {
    const parsed = assets.filter((asset) => asset.parse_state === "parsed")

    if (!seenParsed.current) {
      seenParsed.current = new Set(parsed.map((asset) => asset.id))
      return
    }

    for (const asset of parsed) {
      if (seenParsed.current.has(asset.id)) continue
      seenParsed.current.add(asset.id)
      const waiting = candidates.filter((candidate) => candidate.asset_id === asset.id).length
      toast({
        title: `Mistral read ${asset.filename}`,
        description:
          waiting > 0
            ? `${waiting} proposals are waiting on the source node. Open it to choose what joins the graph.`
            : "It found nothing worth proposing.",
      })
    }
  }, [assets, candidates, toast])

  const handleUpload = useCallback(
    async (file: File, x: number, y: number) => {
      if (!boardId) return
      try {
        await api.uploadAsset(boardId, file, x, y)
        await refresh()
        toast({
          title: `Reading ${file.name}`,
          description: health?.mistral_configured
            ? "Mistral will propose findings and constraints for you to review on the source node."
            : "Stored, but MISTRAL_API_KEY is not set so nothing will be extracted.",
        })
      } catch (err) {
        toast({
          title: "Upload failed",
          description: (err as Error).message,
          variant: "error",
        })
      }
    },
    [boardId, refresh, toast, health],
  )

  if (loading && !board) {
    return (
      <div className="text-muted-foreground flex h-dvh items-center justify-center gap-2.5 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading the board
      </div>
    )
  }

  if (error && !board) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">This board would not load</p>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar user={user} health={health} />
        <div className="flex min-h-0 flex-1">
          <ReactFlowProvider>
            <div className="relative min-w-0 flex-1">
              <Canvas activeRelation={activeRelation} onUpload={handleUpload} />
              <Toolbar
                activeRelation={activeRelation}
                onRelationChange={setActiveRelation}
                onUpload={handleUpload}
              />
              <AgentActivityStrip />
            </div>
          </ReactFlowProvider>
          <Inspector />
        </div>
      </div>
    </TooltipProvider>
  )
}
