import Link from "next/link"
import { ArrowRight, FileText, GitPullRequest, Share2 } from "lucide-react"

const chain = [
  {
    icon: FileText,
    label: "Research lands",
    copy: "Drop the paper. Mistral pulls out findings and constraints, each holding the quote and page it came from.",
  },
  {
    icon: Share2,
    label: "Work gets connected",
    copy: "Draw a task off the nodes that justify it. The connection is the handover, so nothing needs re-explaining.",
  },
  {
    icon: GitPullRequest,
    label: "Code comes back",
    copy: "An agent reads the task's whole ancestry over MCP, opens a pull request, and it lands on the node and the Jira issue.",
  },
]

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="bg-grid-paper pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-10 sm:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="bg-primary flex size-7 items-center justify-center rounded-md">
              <span className="bg-primary-foreground size-2 rounded-full" />
            </span>
            <span className="text-sm font-medium tracking-tight">Spatial Brain</span>
          </div>
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Sign in
          </Link>
        </header>

        <div className="flex flex-1 flex-col justify-center py-16">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
            Mistral × Atlassian
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">
            The reasoning between a paper and a pull request stops disappearing.
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">
            A scientist&rsquo;s finding, the constraint it implies, and the ticket an engineer
            picks up are the same object seen from different sides. Spatial Brain keeps them
            connected, so an agent can walk back from the task to the page it came from.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Open the demo board
              <ArrowRight className="size-4" />
            </Link>
            <span className="text-muted-foreground text-sm">
              Three seeded accounts, no signup.
            </span>
          </div>
        </div>

        <div className="border-border grid gap-px border-t pt-px sm:grid-cols-3">
          {chain.map(({ icon: Icon, label, copy }, index) => (
            <div key={label} className="pt-7 sm:pr-8">
              <div className="flex items-center gap-2.5">
                <Icon className="text-muted-foreground size-4" strokeWidth={1.75} />
                <span className="text-2xs text-muted-foreground font-mono tabular-nums">
                  0{index + 1}
                </span>
              </div>
              <h2 className="mt-3 text-sm font-medium">{label}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
