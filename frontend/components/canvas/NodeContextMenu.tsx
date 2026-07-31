"use client"

import { useEffect, useRef } from "react"
import { Copy, FlaskConical, Focus, ListChecks, Ruler, Split, Trash2 } from "lucide-react"

interface Props {
  x: number
  y: number
  sourceKind?: string  // undefined = canvas context menu
  isTask?: boolean
  isDone?: boolean
  onClose: () => void
  onCreate: (kind: "finding" | "constraint" | "task", label: string, relation: string) => void
  onDelete?: () => void
  onFocus?: () => void
  onCopyId?: () => void
  onMarkDone?: () => void
  onDuplicate?: () => void
}

export function NodeContextMenu({
  x, y, sourceKind, isTask, isDone, onClose,
  onCreate, onDelete, onFocus, onCopyId, onMarkDone, onDuplicate,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    setTimeout(() => document.addEventListener("click", handleClick), 0)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  const isCanvas = !sourceKind

  return (
    <div
      ref={menuRef}
      className="border-border bg-card animate-menu-pop fixed z-50 min-w-[180px] overflow-hidden rounded-none border-[3px] py-1 shadow-[3px_3px_0_var(--border)]"
      style={{ left: x, top: y }}
    >
      {/* Create actions — node or canvas */}
      {isCanvas && (
        <>
          <Item icon={FlaskConical} label="Add finding" onClick={() => { onCreate("finding", "New finding", ""); onClose() }} />
          <Item icon={Ruler} label="Add constraint" onClick={() => { onCreate("constraint", "New constraint", ""); onClose() }} />
          <Item icon={ListChecks} label="Add task" onClick={() => { onCreate("task", "New task", ""); onClose() }} />
        </>
      )}

      {!isCanvas && sourceKind && (
        <>
          {(sourceKind === "finding" || sourceKind === "asset") && (
            <Item icon={FlaskConical} label="Add finding" onClick={() => { onCreate("finding", "New finding", "supports"); onClose() }} />
          )}
          {(sourceKind === "constraint" || sourceKind === "task" || sourceKind === "asset") && (
            <Item icon={Ruler} label="Add constraint" onClick={() => { onCreate("constraint", "New constraint", "constrains"); onClose() }} />
          )}
          {sourceKind !== "task" && (
            <Item icon={ListChecks} label="Create task from this" onClick={() => { onCreate("task", "New task", sourceKind === "constraint" ? "constrains" : "supports"); onClose() }} />
          )}
          {sourceKind === "task" && (
            <Item icon={ListChecks} label="Add subtask" onClick={() => { onCreate("task", "New subtask", "implements"); onClose() }} />
          )}

          <Divider />

          {/* Quick actions — node only */}
          {onFocus && <Item icon={Focus} label="Focus this node" onClick={() => { onFocus(); onClose() }} />}
          {onCopyId && <Item icon={Copy} label="Copy task ID" onClick={() => { onCopyId(); onClose() }} />}
          {isTask && onMarkDone && !isDone && (
            <Item icon={ListChecks} label="Mark done" onClick={() => { onMarkDone(); onClose() }} />
          )}

          <Divider />

          {onDuplicate && <Item icon={Split} label="Duplicate" onClick={() => { onDuplicate(); onClose() }} />}
          {onDelete && <Item icon={Trash2} label="Delete" onClick={() => { onDelete(); onClose() }} variant="destructive" />}
        </>
      )}
    </div>
  )
}

function Divider() {
  return <div className="bg-border my-1 h-px" />
}

function Item({ icon: Icon, label, onClick, variant }: {
  icon: typeof FlaskConical
  label: string
  onClick: () => void
  variant?: "destructive"
}) {
  return (
    <button
      type="button"
      className={`hover:bg-accent flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs transition-colors ${
        variant === "destructive" ? "text-destructive" : ""
      }`}
      onClick={(e) => { e.stopPropagation(); onClick() }}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2} />
      {label}
    </button>
  )
}
