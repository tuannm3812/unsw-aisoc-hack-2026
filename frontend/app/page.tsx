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
    <main className="relative min-h-dvh overflow-hidden bg-[#F3EEE1]">
      <div className="bg-grid-paper pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-10 sm:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-[#F3EEE1] flex size-9 items-center justify-center rounded-none border-[3px] border-[#1B1712] shadow-[3px_3px_0_#1B1712]">
              <span className="bg-[#E10500] size-2.5" />
            </span>
            <span className="font-[family-name:var(--font-label)] text-[10px] tracking-[0.05em]">SPATIAL BRAIN</span>
          </div>
          <Link
            href="/login"
            className="font-[family-name:var(--font-label)] text-[9px] bg-transparent border-[3px] border-[#1B1712] shadow-[3px_3px_0_#1B1712] px-4 py-2 text-[#1B1712] hover:bg-[#F3EEE1] pixel-btn"
          >
            SIGN IN
          </Link>
        </header>

        <div className="flex flex-1 flex-col justify-center py-16">
          <p className="font-[family-name:var(--font-label)] text-[10px] text-[#E10500] tracking-[0.1em] flex items-center gap-3">
            <span className="inline-block w-5 h-2.5 bg-[#FFAF00]" />
            MISTRAL &times; ATLASSIAN
          </p>
          <h1 className="font-[family-name:var(--font-sans)] mt-5 max-w-3xl text-4xl leading-[1.04] font-bold tracking-[-0.02em] text-balance sm:text-5xl">
            The reasoning between a paper and a pull request stops disappearing.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#5C5647]">
            A scientist&rsquo;s finding, the constraint it implies, and the ticket an engineer
            picks up are the same object seen from different sides. Spatial Brain keeps them
            connected, so an agent can walk back from the task to the page it came from.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="font-[family-name:var(--font-label)] text-[11px] text-white bg-[#E10500] border-[3px] border-[#1B1712] shadow-[5px_5px_0_#1B1712] px-5 py-4 inline-flex items-center gap-3 hover:bg-[#c40400] pixel-btn"
            >
              OPEN THE DEMO BOARD
              <ArrowRight className="size-4" />
            </Link>
            <span className="font-[family-name:var(--font-mono)] text-[13px] text-[#7A7266]">
              Three seeded accounts, no signup.
            </span>
          </div>
        </div>

        <div className="border-t-[3px] border-[#1B1712] pt-[30px] grid sm:grid-cols-3 gap-[26px]">
          {chain.map(({ icon: Icon, label, copy }, index) => (
            <div key={label} className="border-l-[3px] border-[#E4DCC7] pl-4">
              <div className="flex items-center gap-[10px]">
                <span className="bg-[#FFAF00] w-[30px] h-[30px] border-[3px] border-[#1B1712] flex items-center justify-center">{index === 0 ? <FileText className="size-4" /> : index === 1 ? <Share2 className="size-4" /> : <GitPullRequest className="size-4" />}</span>
                <span className="font-[family-name:var(--font-label)] text-[10px] text-[#B4A98C]">0{index + 1}</span>
              </div>
              <h2 className="mt-[14px] text-[15px] font-semibold">{label}</h2>
              <p className="text-[#6B6455] mt-2 text-[13.5px] leading-[1.55]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
