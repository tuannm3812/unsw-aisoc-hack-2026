"use client"

import { useRef } from "react"
import { useReactFlow } from "@xyflow/react"
import { FlaskConical, ListChecks, Ruler, Upload } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DRAWABLE_RELATIONS, type NodeKind, type RelationType } from "@/lib/types"
import { useGraphStore } from "@/stores/graphStore"

const ADD_BUTTONS: { kind: NodeKind; label: string; icon: typeof FlaskConical; hint: string }[] = [
  {
    kind: "finding",
    label: "Finding",
    icon: FlaskConical,
    hint: "Something the research established",
  },
  {
    kind: "constraint",
    label: "Constraint",
    icon: Ruler,
    hint: "A limit any implementation has to respect",
  },
  {
    kind: "task",
    label: "Task",
    icon: ListChecks,
    hint: "Work that can be assigned and pushed to Jira",
  },
]

const PLACEHOLDER: Record<NodeKind, string> = {
  asset: "Source document",
  finding: "New finding",
  constraint: "New constraint",
  task: "New task",
}

const COLUMN = 300
const ROW = 168

/** Walk down and then across from the viewport centre until nothing is in the way. */
function findFreeSpot(
  nodes: { x: number; y: number }[],
  start: { x: number; y: number },
): { x: number; y: number } {
  for (let column = 0; column < 6; column += 1) {
    for (let row = 0; row < 6; row += 1) {
      const x = start.x + column * COLUMN
      const y = start.y + row * ROW
      const occupied = nodes.some(
        (node) => Math.abs(node.x - x) < COLUMN * 0.9 && Math.abs(node.y - y) < ROW * 0.9,
      )
      if (!occupied) return { x, y }
    }
  }
  return start
}

interface ToolbarProps {
  activeRelation: RelationType
  onRelationChange: (relation: RelationType) => void
  onUpload: (file: File, x: number, y: number) => void
}

export function Toolbar({ activeRelation, onRelationChange, onUpload }: ToolbarProps) {
  const { screenToFlowPosition } = useReactFlow()
  const addNode = useGraphStore((state) => state.addNode)
  const nodes = useGraphStore((state) => state.nodes)
  const fileInput = useRef<HTMLInputElement>(null)

  function centreOfView() {
    // Drop new nodes left of centre so the inspector does not cover them.
    return screenToFlowPosition({
      x: window.innerWidth * 0.35,
      y: (window.innerHeight - 58) * 0.4,
    })
  }

  async function handleAdd(kind: NodeKind) {
    const position = findFreeSpot(nodes, centreOfView())
    await addNode(kind, PLACEHOLDER[kind], position.x, position.y)
  }

  return (
    <div className="absolute bottom-5 left-5 z-10 flex items-center gap-1 border-[3px] border-[#1B1712] bg-white p-1.5 shadow-[4px_4px_0_#1B1712]">
      {ADD_BUTTONS.map(({ kind, label, icon: Icon, hint }) => (
        <Tooltip key={kind}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleAdd(kind)}
              className="flex h-8 items-center gap-1.5 border-[2px] border-transparent px-2.5 text-xs font-bold pixel-btn hover:border-[#1B1712] hover:bg-[#F3EEE1] focus-visible:outline-none focus-visible:border-[#1B1712] transition-colors"
            >
              <Icon className="size-3.5" strokeWidth={2} />
              {label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{hint}</TooltipContent>
        </Tooltip>
      ))}

      <span className="bg-[#1B1712] mx-1 h-6 w-[3px]" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-8 items-center gap-1.5 border-[2px] border-transparent px-2.5 text-xs font-bold pixel-btn hover:border-[#1B1712] hover:bg-[#F3EEE1] focus-visible:outline-none focus-visible:border-[#1B1712] transition-colors"
          >
            <Upload className="size-3.5" strokeWidth={2} />
            Document
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Or drop a PDF straight onto the canvas
        </TooltipContent>
      </Tooltip>

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.md,.markdown,.txt"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          const position = centreOfView()
          files.forEach((file, index) => onUpload(file, position.x, position.y + index * 150))
          event.target.value = ""
        }}
      />

      <span className="bg-[#1B1712] mx-1 h-6 w-[3px]" />

      <div className="flex items-center gap-2 pr-1 pl-1.5">
        <span className="text-2xs text-muted-foreground font-mono whitespace-nowrap">new links mean</span>
        <Select value={activeRelation} onValueChange={(value) => onRelationChange(value as RelationType)}>
          <SelectTrigger className="h-8 w-[9.5rem] border-[2px] border-[#1B1712] bg-white px-2 text-xs font-bold shadow-none focus:border-[#E10500] focus:outline-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DRAWABLE_RELATIONS.map((relation) => (
              <SelectItem
                key={relation.value}
                value={relation.value}
                hint={relation.hint}
                className="text-xs"
              >
                <span className="font-bold">{relation.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
