"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"

import { useToast } from "@/components/ui/use-toast"
import { RELATION_LABEL, type RelationType } from "@/lib/types"
import { useGraphStore } from "@/stores/graphStore"

import { GraphNodeCard, type GraphNodeData } from "./GraphNodeCard"

import "@xyflow/react/dist/style.css"

const nodeTypes: NodeTypes = {
  asset: GraphNodeCard,
  finding: GraphNodeCard,
  constraint: GraphNodeCard,
  task: GraphNodeCard,
} as unknown as NodeTypes

const RELATION_COLOR: Record<string, string> = {
  supports: "#3FA34D",
  constrains: "#FF6A00",
  derives: "#E10500",
  depends_on: "#1B1712",
}

const TASK_STATUS_DASH: Record<string, string> = {
  open: "4 4",
  in_progress: "2 4",
  done: "none",
}

interface CanvasProps {
  activeRelation: RelationType
  onUpload: (file: File, x: number, y: number) => void
}

export function Canvas({ activeRelation, onUpload }: CanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const { toast } = useToast()
  const [dragOver, setDragOver] = useState(false)

  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const members = useGraphStore((state) => state.members)
  const assets = useGraphStore((state) => state.assets)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const focusedTaskId = useGraphStore((state) => state.focusedTaskId)
  const lineageIds = useGraphStore((state) => state.lineageIds)

  const select = useGraphStore((state) => state.select)
  const nudgeNode = useGraphStore((state) => state.nudgeNode)
  const persistPosition = useGraphStore((state) => state.persistPosition)
  const setDragging = useGraphStore((state) => state.setDragging)
  const addEdge = useGraphStore((state) => state.addEdge)
  const removeNode = useGraphStore((state) => state.removeNode)

  const lineageActive = focusedTaskId !== null && lineageIds.size > 0

  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const flowNodes = useMemo<FlowNode<GraphNodeData>[]>(() => {
    const memberNames = new Map(members.map((member) => [member.id, member.name]))
    const parseStates = new Map(assets.map((asset) => [asset.id, asset.parse_state]))

    return nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: { x: node.x, y: node.y },
      selected: node.id === selectedNodeId,
      measured: measured[node.id],
      data: {
        node,
        assigneeName: node.assignee_id ? memberNames.get(node.assignee_id) ?? "" : "",
        parseState:
          node.kind === "asset" && node.source_asset_id
            ? parseStates.get(node.source_asset_id) ?? null
            : null,
        dimmed: lineageActive && !lineageIds.has(node.id),
        inLineage: lineageActive && lineageIds.has(node.id),
        isFocusedTask: node.id === focusedTaskId,
        depth: null,
      },
    }))
  }, [nodes, members, assets, selectedNodeId, lineageActive, lineageIds, focusedTaskId, measured])

  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      edges.map((edge) => {
        const inLineage = lineageActive && lineageIds.has(edge.source_id) && lineageIds.has(edge.target_id)
        const targetNode = nodeMap.get(edge.target_id)
        const taskDash = targetNode?.kind === "task" && targetNode.task_status
          ? TASK_STATUS_DASH[targetNode.task_status]
          : undefined
        const relColor = RELATION_COLOR[edge.relation] ?? "#1B1712"

        return {
          id: edge.id,
          source: edge.source_id,
          target: edge.target_id,
          type: "default",
          label: RELATION_LABEL[edge.relation],
          className: lineageActive ? (inLineage ? "lineage" : "dimmed") : undefined,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: inLineage ? "var(--primary)" : relColor,
          },
          style: {
            stroke: inLineage ? "var(--primary)" : relColor,
            strokeWidth: 2.5,
            strokeLinejoin: "miter",
            strokeDasharray: taskDash ?? "none",
          },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 0,
          labelStyle: {
            fontSize: 9,
            fontFamily: "var(--font-pixel)",
            fill: "#1B1712",
          },
          labelBgStyle: {
            fill: "#F3EEE1",
            stroke: "#1B1712",
            strokeWidth: 1.5,
            fillOpacity: 1,
          },
        }
      }),
    [edges, lineageActive, lineageIds, nodeMap],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode<GraphNodeData>>[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          nudgeNode(change.id, change.position.x, change.position.y)
        }
        if (change.type === "dimensions" && change.dimensions) {
          const { width, height } = change.dimensions
          setMeasured((previous) =>
            previous[change.id]?.width === width && previous[change.id]?.height === height
              ? previous
              : { ...previous, [change.id]: { width, height } },
          )
        }
      }
    },
    [nudgeNode],
  )

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const edge = await addEdge(connection.source, connection.target, activeRelation)
      if (edge) {
        toast({
          title: `Connected as "${RELATION_LABEL[activeRelation]}"`,
          description: "The link is part of the task's context from now on.",
        })
      }
    },
    [addEdge, activeRelation, toast],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setDragOver(false)
      const files = Array.from(event.dataTransfer.files)
      if (files.length === 0) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      files.forEach((file, index) => onUpload(file, position.x, position.y + index * 150))
    },
    [screenToFlowPosition, onUpload],
  )

  return (
    <div
      ref={wrapper}
      className="relative h-full w-full"
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, node) => setDragging(node.id)}
        onNodeDragStop={(_, node) => {
          setDragging(null)
          void persistPosition(node.id, node.position.x, node.position.y)
        }}
        onNodeClick={(_, node) => select(node.id)}
        onPaneClick={() => select(null)}
        onConnect={onConnect}
        onNodesDelete={(deleted) => deleted.forEach((node) => removeNode(node.id))}
        connectionLineType={ConnectionLineType.Straight}
        defaultEdgeOptions={{
          type: "default",
          style: { stroke: "#1B1712", strokeWidth: 2.5, strokeLinejoin: "miter" },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#1B1712" },
        }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="#D8CEB4" />
        <Controls
          position="top-left"
          showInteractive={false}
          className="!border-[3px] !border-[#1B1712] !bg-white !shadow-[3px_3px_0_#1B1712]"
        />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="!border-[3px] !border-[#1B1712] !bg-white"
          maskColor="rgba(120, 120, 130, 0.14)"
          nodeClassName={(node) => `mm-${node.type ?? "asset"}`}
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
        />
      </ReactFlow>

      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center border-[3px] border-dashed border-[#1B1712] bg-[#F3EEE1]/70">
          <p className="border-[3px] border-[#1B1712] bg-white px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_#1B1712]">
            Drop a PDF or Markdown file to read it into the graph
          </p>
        </div>
      )}

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-sm text-center">
            <p className="text-sm font-bold">This board is empty</p>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Drop a research PDF anywhere, or add a node from the toolbar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
