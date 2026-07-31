"use client"

import { useEffect, useRef } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { RELATION_LABEL, DRAWABLE_RELATIONS, type RelationType } from "@/lib/types"

interface Props {
  x: number
  y: number
  currentRelation: RelationType
  onClose: () => void
  onDelete: () => void
  onChangeRelation: (relation: RelationType) => void
}

export function EdgeContextMenu({ x, y, currentRelation, onClose, onDelete, onChangeRelation }: Props) {
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

  return (
    <div
      ref={menuRef}
      className="border-border bg-card animate-menu-pop fixed z-50 min-w-[200px] overflow-hidden rounded-none border-[3px] py-1 shadow-[3px_3px_0_#1B1712]"
      style={{ left: x, top: y }}
    >
      <p className="text-muted-foreground px-3.5 py-1.5 text-2xs font-medium tracking-[0.08em] uppercase">
        Current: {RELATION_LABEL[currentRelation]}
      </p>
      <div className="bg-border my-1 h-px" />
      {DRAWABLE_RELATIONS.map((rel) => (
        <button
          key={rel.value}
          type="button"
          className={`hover:bg-accent flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs transition-colors ${
            rel.value === currentRelation ? "text-primary font-medium" : ""
          }`}
          onClick={(e) => { e.stopPropagation(); onChangeRelation(rel.value); onClose() }}
        >
          <Pencil className="size-3.5 shrink-0" strokeWidth={2} />
          {rel.label}
          <span className="text-muted-foreground ml-auto text-2xs">{rel.hint}</span>
        </button>
      ))}
      <div className="bg-border my-1 h-px" />
      <button
        type="button"
        className="hover:bg-accent text-destructive flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs transition-colors"
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose() }}
      >
        <Trash2 className="size-3.5 shrink-0" strokeWidth={2} />
        Delete edge
      </button>
    </div>
  )
}
