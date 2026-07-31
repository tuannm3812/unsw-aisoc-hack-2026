import Link from "next/link"
import { ArrowRight, FileText, GitPullRequest, Share2 } from "lucide-react"

const chain = [
  {
    icon: FileText,
    label: "Research lands",
    copy: "Drop the paper. Mistral pulls out findings and constraints, each holding the quote and page it came from.",
    color: "#F2A100",
  },
  {
    icon: Share2,
    label: "Work gets connected",
    copy: "Draw a task off the nodes that justify it. The connection is the handover, so nothing needs re-explaining.",
    color: "#FF6A00",
  },
  {
    icon: GitPullRequest,
    label: "Code comes back",
    copy: "An agent reads the task's whole ancestry over MCP, opens a pull request, and it lands on the node and the Jira issue.",
    color: "#E10500",
  },
]

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

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="bg-grid-paper pointer-events-none absolute inset-0" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-10 sm:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PixelIcon />
            <span className="font-pixel text-[10px] tracking-[0.05em] text-[#1B1712]">SPATIAL BRAIN</span>
          </div>
          <Link
            href="/login"
            className="border-[3px] border-[#1B1712] bg-white px-4 py-2 font-pixel text-[9px] text-[#1B1712] pixel-btn hover:bg-accent transition-colors"
          >
            SIGN IN
          </Link>
        </header>

        <div className="flex flex-1 flex-col justify-center py-16">
          <p className="flex items-center gap-2 text-xs tracking-[0.14em] uppercase">
            <span className="inline-block h-2.5 w-2.5 bg-[#E10500]" />
            <span className="font-pixel text-[8px] text-[#E10500]">Mistral × Atlassian</span>
          </p>
          <h1 className="mt-5 max-w-3xl font-sans text-4xl font-bold leading-[1.05] text-balance sm:text-5xl">
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
              className="inline-flex h-11 items-center gap-2 border-[3px] border-[#1B1712] bg-[#E10500] px-6 font-pixel text-[9px] text-white shadow-[5px_5px_0_#1B1712] pixel-btn transition-colors hover:bg-[#C80400]"
            >
              OPEN THE DEMO
              <ArrowRight className="size-4" />
            </Link>
            <span className="text-muted-foreground text-sm">
              Three seeded accounts, no signup.
            </span>
          </div>
        </div>

        <div className="grid gap-0 sm:grid-cols-3">
          {chain.map(({ icon: Icon, label, copy, color }, index) => (
            <div key={label} className="border-[#1B1712] pt-7 sm:border-r sm:pr-8 last:border-r-0">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center border-[2px] border-[#1B1712]" style={{ backgroundColor: color }}>
                  <Icon className="size-3.5 text-white" strokeWidth={2.5} />
                </span>
                <span className="font-mono text-[10px] text-[#7A7266] tabular-nums">
                  0{index + 1}
                </span>
              </div>
              <h2 className="mt-3 text-sm font-bold">{label}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{copy}</p>
            </div>
          ))}
        </div>

        <div className="border-t-[3px] border-[#1B1712] mt-12 pt-6 pb-8">
          <p className="text-muted-foreground text-xs text-center">
            Built for the Mistral × Atlassian hackathon · August 2026
          </p>
        </div>
      </div>
    </main>
  )
}
