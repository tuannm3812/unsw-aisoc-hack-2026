"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"

import { api } from "@/lib/api"
import type { CurrentUser } from "@/lib/types"

const DEMO_PASSWORD = "spatial"

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
      <div className="bg-grid-paper pointer-events-none absolute inset-0 opacity-50" />

      <div className="animate-rise relative w-full max-w-md">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary flex size-7 items-center justify-center rounded-md">
            <span className="bg-primary-foreground size-2 rounded-full" />
          </span>
          <span className="text-sm font-medium tracking-tight">Spatial Brain</span>
        </div>

        <h1 className="font-display mt-8 text-3xl leading-tight tracking-tight">
          Pick who you are on the team.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          The board is already set up with all three of you on it. Everyone shares the password{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{DEMO_PASSWORD}</code>.
        </p>

        <div className="border-border bg-card mt-8 divide-border divide-y overflow-hidden rounded-xl border">
          {accounts.length === 0 && !error && (
            <div className="text-muted-foreground flex items-center gap-2.5 p-5 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading the team
            </div>
          )}

          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => signIn(account.email)}
              disabled={pending !== null}
              className="hover:bg-accent focus-visible:ring-ring group flex w-full items-center gap-4 p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
            >
              <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                {account.name
                  .split(" ")
                  .filter((part) => part !== "Dr")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{account.name}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {account.discipline}
                </span>
              </span>
              {pending === account.email ? (
                <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
              ) : (
                <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-destructive mt-4 text-sm" role="alert">
            {error}
          </p>
        )}

        <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
          Start as <span className="text-foreground">Priya</span> to run the demo end to end. She
          is the board admin, so she can assign work into Jira.
        </p>
      </div>
    </main>
  )
}
