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
  type EdgeTypes,
  type Node as FlowNode,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"

import { useToast } from "@/components/ui/use-toast"
import { getAncestorIds } from "@/lib/lineage"
import { RELATION_LABEL, type NodeKind, type RelationType } from "@/lib/types"
import { useGraphStore } from "@/stores/graphStore"

import { CustomEdge } from "./CustomEdge"
import { EdgeContextMenu } from "./EdgeContextMenu"
import { GraphNodeCard, type GraphNodeData } from "./GraphNodeCard"
import { NodeContextMenu } from "./NodeContextMenu"

import "@xyflow/react/dist/style.css"

const nodeTypes: NodeTypes = {
  asset: GraphNodeCard,
  finding: GraphNodeCard,
  constraint: GraphNodeCard,
  task: GraphNodeCard,
} as unknown as NodeTypes

const edgeTypes = {
  custom: CustomEdge,
} as unknown as EdgeTypes

interface CanvasProps {
  activeRelation: RelationType
  onUpload: (file: File, x: number, y: number) => void
}

export function Canvas({ activeRelation, onUpload }: CanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setCenter } = useReactFlow()
  const { toast } = useToast()
  const [dragOver, setDragOver] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; kind: string; isTask?: boolean; isDone?: boolean } | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; edgeId: string; relation: string } | null>(null)
  // ponytail: kind is string not NodeKind because "" signals canvas context menu
  const connectingSource = useRef<{ nodeId: string; kind: NodeKind } | null>(null)
  const taskStatusMapPrev = useRef<{ map: Map<string, string>; len: number; ids: string[]; stats: string[] } | null>(null)

  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const members = useGraphStore((state) => state.members)
  const assets = useGraphStore((state) => state.assets)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const focusedTaskId = useGraphStore((state) => state.focusedTaskId)
  const lineageIds = useGraphStore((state) => state.lineageIds)

  const select = useGraphStore((state) => state.select)
  const focusLineage = useGraphStore((state) => state.focusLineage)
  const clearLineage = useGraphStore((state) => state.clearLineage)
  const myTaskFilter = useGraphStore((state) => state.myTaskFilter)
  const nudgeNode = useGraphStore((state) => state.nudgeNode)
  const persistPosition = useGraphStore((state) => state.persistPosition)
  const setDragging = useGraphStore((state) => state.setDragging)
  const addEdge = useGraphStore((state) => state.addEdge)
  const removeEdge = useGraphStore((state) => state.removeEdge)
  const removeNode = useGraphStore((state) => state.removeNode)
  const replaceNode = useGraphStore((state) => state.replaceNode)
  const patchNode = useGraphStore((state) => state.patchNode)
  const addNode = useGraphStore((state) => state.addNode)

  const handleDerive = useCallback(
    (edgeId: string, kind: "finding" | "constraint" | "task", position: { x: number; y: number }) => {
      const edge = edges.find((e) => e.id === edgeId)
      if (!edge) return
      const titles: Record<string, string> = { finding: "New finding", constraint: "New constraint", task: "New task" }
      void addNode(kind, titles[kind], position.x, position.y + 50).then((newNode) => {
        if (newNode) void addEdge(edge.source_id, newNode.id, "derived_from")
      })
    },
    [edges, addNode, addEdge],
  )

  const handleContextMenuAction = useCallback(
    (kind: "finding" | "constraint" | "task", label: string, relation: string) => {
      if (!contextMenu) return
      const pos = screenToFlowPosition({ x: contextMenu.x + 20, y: contextMenu.y + 20 })
      void addNode(kind, label, pos.x, pos.y).then((newNode) => {
        // Canvas right-click: just create the node, no edge wiring
        if (contextMenu.nodeId === "__canvas__" || !relation) return
        if (newNode) void addEdge(contextMenu.nodeId, newNode.id, relation as RelationType)
      })
    },
    [contextMenu, addNode, addEdge, screenToFlowPosition],
  )

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
        dimmed: (lineageActive && !lineageIds.has(node.id)) || (!!myTaskFilter && node.kind === "task" && node.assignee_id !== myTaskFilter),
        inLineage: lineageActive && lineageIds.has(node.id),
        isFocusedTask: node.id === focusedTaskId,
        depth: null,
      },
    }))
  }, [nodes, members, assets, selectedNodeId, lineageActive, lineageIds, focusedTaskId, measured])

  // Precompute task statuses — avoids O(E×N) on every drag frame
  const taskStatusMap = useMemo(() => {
    const prev = taskStatusMapPrev.current
    const same = prev && nodes.length === prev.len && nodes.every((n, i) => n.id === prev.ids[i] && n.task_status === prev.stats[i])
    if (same) return prev.map
    const map = new Map(nodes.filter((n) => n.kind === "task").map((n) => [n.id, n.task_status]))
    taskStatusMapPrev.current = { map, len: nodes.length, ids: nodes.map((n) => n.id), stats: nodes.map((n) => n.task_status) }
    return map
  }, [nodes])

  const flowEdges = useMemo<FlowEdge[]>(
    () => {
      // Role colours: scientist (derived_from) → teal, PM (supports/constrains) → indigo, engineer (implements) → purple
      const relationColor = (rel: string) => {
        if (rel === "derived_from") return "#00b894"
        if (rel === "implements") return "#7c3aed"
        return "#4f46e5" // supports, constrains
      }
      // Pipeline status from target task: done → solid, in_progress/assigned → dash-dot, open → dotted
      return edges.map((edge) => {
        const targetStatus = taskStatusMap.get(edge.target_id) ?? ""
        const isTaskTarget = taskStatusMap.has(edge.target_id)
        const inLineage = lineageActive && lineageIds.has(edge.source_id) && lineageIds.has(edge.target_id)
        const color = relationColor(edge.relation)
        const isActive = isTaskTarget && (targetStatus === "in_progress" || targetStatus === "assigned")
        const isOpen = isTaskTarget && targetStatus === "open"
        const isDone = isTaskTarget && (targetStatus === "done" || targetStatus === "in_review")

        const classes = [
          lineageActive ? (inLineage ? "lineage" : "dimmed") : "",
          isActive && !inLineage ? "edge-active" : "",
          isOpen && !inLineage ? "edge-open" : "",
          isDone && !inLineage ? "edge-done" : "",
        ].filter(Boolean).join(" ")

        return {
          id: edge.id,
          source: edge.source_id,
          target: edge.target_id,
          type: "custom",
          data: { onDerive: handleDerive, edgeRelation: edge.relation },
          label: RELATION_LABEL[edge.relation],
          className: classes || undefined,
          style: inLineage ? undefined : { stroke: color, strokeWidth: isActive ? 3.5 : 2.5 },
          markerEnd: { type: "arrowclosed", color },
          labelBgPadding: [5, 2] as [number, number],
          labelBgBorderRadius: 4,
          labelStyle: {
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fill: "var(--muted-foreground)",
          },
          labelBgStyle: { fill: "var(--background)", fillOpacity: 0.92 },
        }
      })
    },
    [edges, taskStatusMap, handleDerive, lineageActive, lineageIds],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode<GraphNodeData>>[]) => {
      // React Flow manages drag positions internally (zero store churn).
      // Only track dimensions for the minimap.
      for (const change of changes) {
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
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, node) => setDragging(node.id)}
        onNodeDragStop={(_, node) => {
          setDragging(null)
          void persistPosition(node.id, node.position.x, node.position.y)
        }}
        onNodeClick={(_, node) => {
          select(node.id)
          const graphNode = (node.data as GraphNodeData).node
          if (graphNode.kind === "task") {
            const ancestorIds = getAncestorIds(node.id, nodes, edges)
            focusLineage(node.id, ancestorIds)
          } else {
            clearLineage()
          }
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          const graphNode = (node.data as GraphNodeData).node
          setContextMenu({
            x: event.clientX, y: event.clientY,
            nodeId: node.id, kind: graphNode.kind,
            isTask: graphNode.kind === "task",
            isDone: graphNode.task_status === "done",
          })
        }}
        onPaneClick={() => { select(null); setContextMenu(null); setEdgeMenu(null); }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault()
          const rel = ((edge.data as Record<string, unknown>)?.edgeRelation as string) ?? "supports"
          setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id, relation: rel })
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          setContextMenu({ x: event.clientX, y: event.clientY, nodeId: "__canvas__", kind: "" })
        }}
        onConnect={onConnect}
        isValidConnection={(connection) => connection.source !== connection.target}
        onConnectStart={(_, { nodeId }) => {
          if (!nodeId) return
          const found = nodes.find((n) => n.id === nodeId)
          if (found) connectingSource.current = { nodeId, kind: found.kind as NodeKind }
        }}
        onConnectEnd={(event) => {
          if (!event.target || (event.target as HTMLElement).classList.contains("react-flow__pane")) {
            const source = connectingSource.current
            const pos = event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null
            if (source && pos) {
              setContextMenu({ x: pos.x, y: pos.y, nodeId: source.nodeId, kind: source.kind as string, isTask: source.kind === "task" })
            }
          }
          connectingSource.current = null
        }}
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

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sourceKind={contextMenu.kind}
          isTask={contextMenu.isTask}
          isDone={contextMenu.isDone}
          onClose={() => setContextMenu(null)}
          onCreate={handleContextMenuAction}
          onDelete={() => { removeNode(contextMenu.nodeId); setContextMenu(null); }}
          onFocus={() => {
            const node = nodes.find((n) => n.id === contextMenu.nodeId)
            if (node) setCenter(node.x + 132, node.y + 50, { duration: 300 })
            setContextMenu(null)
          }}
          onCopyId={() => {
            navigator.clipboard.writeText(contextMenu.nodeId).catch(() => {})
            toast({ title: "Copied", description: "Paste this ID into your agent" })
            setContextMenu(null)
          }}
          onMarkDone={() => {
            patchNode(contextMenu.nodeId, { task_status: "done" })
            setContextMenu(null)
          }}
          onDuplicate={contextMenu.kind !== "asset" ? () => {
            const src = nodes.find((n) => n.id === contextMenu.nodeId)
            if (src && src.kind !== "asset") {
              void addNode(src.kind as "finding" | "constraint" | "task", `${src.title} (copy)`, src.x + 40, src.y + 40)
            }
            setContextMenu(null)
          } : undefined}
        />
      )}

      {edgeMenu && (
        <EdgeContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          currentRelation={edgeMenu.relation as RelationType}
          onClose={() => setEdgeMenu(null)}
          onDelete={() => { removeEdge(edgeMenu.edgeId); setEdgeMenu(null); }}
          onChangeRelation={async (rel) => {
            const existing = edges.find((e) => e.id === edgeMenu.edgeId)
            if (existing) {
              const created = await addEdge(existing.source_id, existing.target_id, rel)
              if (created) removeEdge(edgeMenu.edgeId)
            }
            setEdgeMenu(null)
          }}
        />
      )}

      {lineageActive && (
        <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2">
          <button
            type="button"
            onClick={() => { useGraphStore.getState().clearLineage(); select(null); }}
            className="bg-card border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors"
          >
            Stop highlighting
          </button>
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
