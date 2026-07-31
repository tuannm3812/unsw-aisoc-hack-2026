"use client"

import { useEffect, useRef, useState } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const handle = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false) }
    setTimeout(() => document.addEventListener("click", handle), 0)
    document.addEventListener("keydown", key)
    return () => { document.removeEventListener("click", handle); document.removeEventListener("keydown", key) }
  }, [menuOpen])

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const onDerive = (data as Record<string, unknown> | undefined)
    ?.onDerive as ((edgeId: string, kind: "finding" | "constraint" | "task", position: { x: number; y: number }) => void) | undefined

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {!menuOpen && (
          <button
            className="nodrag nopan absolute cursor-pointer rounded-full bg-primary text-primary-foreground flex size-5 items-center justify-center text-[11px] font-bold leading-none opacity-[0.01] hover:opacity-100 hover:scale-125 transition-all"
            style={{ left: labelX, top: labelY, transform: "translate(-50%, -50%)" }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }}
            title="Branch from here"
          >⊕</button>
        )}
        {menuOpen && (
          <div ref={menuRef} className="nodrag nopan absolute z-50 min-w-[140px] rounded-none border-[3px] border-[#1B1712] bg-white shadow-[3px_3px_0_#1B1712] py-0.5"
            style={{ left: labelX, top: labelY, transform: "translate(-50%, -50%)" }}>
            {(["finding", "constraint", "task"] as const).map((kind) => (
              <button key={kind} className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"
                onClick={(e) => { e.stopPropagation(); onDerive?.(id, kind, { x: labelX, y: labelY }); setMenuOpen(false) }}>
                {kind === "finding" ? "Add Finding" : kind === "constraint" ? "Add Constraint" : "Create Task"}
              </button>
            ))}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}
