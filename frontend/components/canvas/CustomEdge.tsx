"use client"

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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const onDerive = (data as Record<string, unknown> | undefined)
    ?.onDerive as ((edgeId: string, position: { x: number; y: number }) => void) | undefined

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          className="nodrag nopan absolute cursor-pointer rounded-full bg-primary text-primary-foreground flex size-5 items-center justify-center text-[11px] font-bold leading-none opacity-25 transition-all hover:scale-125 hover:opacity-100 hover:shadow-lg"
          style={{
            left: labelX,
            top: labelY,
            transform: "translate(-50%, -50%)",
          }}
          onClick={(e) => {
            e.stopPropagation()
            onDerive?.(id, { x: labelX, y: labelY })
          }}
          title="Branch from here"
        >
          ⊕
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
