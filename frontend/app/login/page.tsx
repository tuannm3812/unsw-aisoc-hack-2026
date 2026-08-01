"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"

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

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="bg-grid-paper pointer-events-none absolute inset-0" />

      <div className="animate-rise relative w-full max-w-md">
        <div className="flex items-center gap-3">
          <PixelIcon />
          <span className="font-pixel text-[10px] tracking-[0.05em] text-[#1B1712]">SPATIAL BRAIN</span>
        </div>

        <h1 className="mt-8 font-sans text-3xl font-bold leading-tight">
          Pick who you are on the team.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          The board is already set up with all three of you on it. Everyone shares the password{" "}
          <code className="border-[2px] border-[#1B1712] bg-background px-1.5 py-0.5 font-mono text-xs">
            {DEMO_PASSWORD}
          </code>.
        </p>

        <div className="mt-8 overflow-hidden border-[3px] border-[#1B1712] bg-white shadow-[8px_8px_0_#1B1712]">
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
