"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Key, Loader2, Users } from "lucide-react"

import { api } from "@/lib/api"
import type { CurrentUser } from "@/lib/types"

const DEMO_PASSWORD = "spatial"

const MEMBER_COLORS: Record<string, { bg: string; initials: string }> = {
  Aisha: { bg: "#E10500", initials: "AI" },
  Marco: { bg: "#FF6A00", initials: "MA" },
  Priya: { bg: "#F2A100", initials: "PR" },
}

function memberChip(name: string) {
  const first = name.split(" ")[0]
  return MEMBER_COLORS[first] ?? { bg: "#7A7266", initials: name.split(" ").filter((p) => p !== "Dr").slice(0, 2).map((p) => p[0]).join("") }
}

function PixelIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
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

export default function LoginPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<CurrentUser[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [teamPw, setTeamPw] = useState("")
  const [teamLoading, setTeamLoading] = useState(false)
  const teamRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api
      .demoAccounts()
      .then(setAccounts)
      .catch((err: Error) => setError(err.message))
  }, [])

  async function signIn(email: string) {
    setPending(email)
    setError(null)
    try {
      await api.login(email, DEMO_PASSWORD)
      const boards = await api.boards()
      if (boards.length === 0) {
        setError("No board is seeded yet. Run the seed script in the backend.")
        setPending(null)
        return
      }
      router.push(`/board/${boards[0].id}`)
    } catch (err) {
      setError((err as Error).message)
      setPending(null)
    }
  }

  const teamSignIn = useCallback(async () => {
    if (!teamPw.trim()) return
    setTeamLoading(true)
    setError(null)
    try {
      await api.teamLogin(teamPw.trim())
      const boards = await api.boards()
      if (boards.length === 0) {
        setError("No board is seeded yet. Run the seed script in the backend.")
        setTeamLoading(false)
        return
      }
      router.push(`/board/${boards[0].id}`)
    } catch (err) {
      setError((err as Error).message)
      setTeamLoading(false)
    }
  }, [teamPw, router])

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="bg-grid-paper pointer-events-none absolute inset-0" />

      <div className="animate-rise relative w-full max-w-md">
        <div className="flex items-center gap-3">
          <PixelIcon />
          <span className="font-pixel text-[10px] tracking-[0.05em] text-[#1B1712]">SPATIAL BRAIN</span>
        </div>

        <h1 className="mt-8 font-sans text-3xl font-bold leading-tight">
          Your team&rsquo;s spatial brain.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          One password for the whole startup. Below that, pick your role if you need a
          specific persona for the demo.
        </p>

        <div className="mt-8 overflow-hidden border-[3px] border-[#1B1712] bg-white shadow-[8px_8px_0_#1B1712]">
          <form
          onSubmit={(e) => { e.preventDefault(); teamSignIn() }}
          className="mt-8 border-[3px] border-[#1B1712] bg-white p-5 shadow-[8px_8px_0_#1B1712]"
        >
          <div className="flex items-center gap-2">
            <Key className="size-4 text-[#1B1712]" strokeWidth={2} />
            <span className="font-pixel text-[8px] tracking-[0.05em] uppercase">Team Access</span>
          </div>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Your startup team shares one password. No accounts, no invites — just type it and go.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              ref={teamRef}
              type="password"
              value={teamPw}
              onChange={(e) => setTeamPw(e.target.value)}
              placeholder="Team password"
              className="h-10 flex-1 border-[2px] border-[#1B1712] bg-background px-3 text-sm font-mono placeholder:text-muted-foreground/50 focus:border-[#E10500] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!teamPw.trim() || teamLoading}
              className="flex h-10 items-center gap-2 border-[2px] border-[#1B1712] bg-[#1B1712] px-4 text-sm font-bold text-white pixel-btn hover:bg-[#E10500] hover:border-[#E10500] disabled:opacity-50 transition-colors"
            >
              {teamLoading ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
              Join
            </button>
          </div>
        </form>

        <div className="mt-8 flex items-center gap-3">
          <span className="bg-[#1B1712] h-px flex-1" />
          <span className="font-pixel text-[8px] text-muted-foreground tracking-[0.05em]">or pick your role</span>
          <span className="bg-[#1B1712] h-px flex-1" />
        </div>

        {accounts.length === 0 && !error && (
            <div className="text-muted-foreground flex items-center gap-2.5 p-5 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading the team
            </div>
          )}

          {accounts.map((account) => {
            const chip = memberChip(account.name)
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => signIn(account.email)}
                disabled={pending !== null}
                className="group flex w-full items-center gap-4 border-b-[3px] border-[#1B1712] p-4 text-left transition-colors pixel-btn last:border-b-0 hover:bg-[#F3EEE1] focus-visible:outline-none focus-visible:bg-[#F3EEE1] disabled:opacity-60"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center border-[2px] border-[#1B1712] font-pixel text-[8px] text-white"
                  style={{ backgroundColor: chip.bg }}
                >
                  {chip.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{account.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {account.discipline}
                  </span>
                </span>
                {pending === account.email ? (
                  <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
                ) : (
                  <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0" />
                )}
              </button>
            )
          })}
        </div>

        {error && (
          <p className="text-destructive mt-4 text-sm" role="alert">
            {error}
          </p>
        )}

        <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
          Start as <span className="text-[#E10500] font-bold">Priya</span> to run the demo end to
          end. She is the board admin, so she can assign work into Jira.
        </p>
      </div>
    </main>
  )
}
