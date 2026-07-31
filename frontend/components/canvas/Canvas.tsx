"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
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

  // Nodes are rebuilt from the store on every change, which would throw away the
  // sizes React Flow measured. The minimap needs them, so they are kept here and
  // handed back on each rebuild.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})

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
        return {
          id: edge.id,
          source: edge.source_id,
          target: edge.target_id,
          type: "smoothstep",
          label: RELATION_LABEL[edge.relation],
          className: lineageActive ? (inLineage ? "lineage" : "dimmed") : undefined,
          labelBgPadding: [5, 2] as [number, number],
          labelBgBorderRadius: 4,
          labelStyle: {
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fill: "var(--muted-foreground)",
          },
          labelBgStyle: { fill: "var(--background)", fillOpacity: 0.92 },
        }
      }),
    [edges, lineageActive, lineageIds],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode<GraphNodeData>>[]) => {
      // Nodes are derived from the store, so a drag only has to update it locally.
      // The write to the server happens once, on drag end.
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
          title: `Connected as “${RELATION_LABEL[activeRelation]}”`,
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
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{ type: "smoothstep" }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="var(--border-strong)" />
        {/* Top left keeps the zoom controls clear of the toolbar at bottom left. */}
        <Controls
          position="top-left"
          showInteractive={false}
          className="!border-border !bg-card !rounded-lg !border !shadow-none"
        />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="!border-border !bg-card !rounded-lg !border"
          maskColor="rgba(120, 120, 130, 0.14)"
          nodeClassName={(node) => `mm-${node.type ?? "asset"}`}
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
        />
      </ReactFlow>

      {dragOver && (
        <div className="border-primary bg-primary/5 pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed">
          <p className="bg-card border-border rounded-lg border px-4 py-2.5 text-sm font-medium">
            Drop a PDF or Markdown file to read it into the graph
          </p>
        </div>
      )}

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-sm text-center">
            <p className="text-sm font-medium">This board is empty</p>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Drop a research PDF anywhere, or add a node from the toolbar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
