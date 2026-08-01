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
  type EdgeTypes,
  type Node as FlowNode,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"

import { useToast } from "@/components/ui/use-toast"
import { countAncestors, countDependents } from "@/lib/lineage"
import { RELATION_LABEL, type NodeKind, type RelationType } from "@/lib/types"
import { findFreeSpot } from "@/lib/utils"
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

const edgeTypes = { default: CustomEdge } as unknown as EdgeTypes

const RELATION_COLOR: Record<string, string> = {
  supports: "#3FA34D",
  constrains: "#FF6A00",
  derives: "#E10500",
  depends_on: "#1B1712",
}

function edgeStatusClass(taskStatus: string | undefined): string {
  if (!taskStatus) return ""
  if (taskStatus === "done") return "edge-done"
  if (taskStatus === "in_progress" || taskStatus === "in_review") return "edge-active"
  return "edge-open"
}

interface ContextMenuState {
  type: "edge" | "node" | "canvas"
  x: number
  y: number
  edgeId?: string
  nodeId?: string
}

interface CanvasProps {
  activeRelation: RelationType
  onUpload: (file: File, x: number, y: number) => void
}

export function Canvas({ activeRelation, onUpload }: CanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setCenter } = useReactFlow()
  const { toast } = useToast()
  const [dragOver, setDragOver] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  // Source node of a connection drag, so dropping on empty canvas can still
  // offer kind-appropriate create options for that source.
  const connectingSource = useRef<{ nodeId: string; kind: NodeKind } | null>(null)

  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const members = useGraphStore((state) => state.members)
  const assets = useGraphStore((state) => state.assets)
  const candidates = useGraphStore((state) => state.candidates)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const focusedTaskId = useGraphStore((state) => state.focusedTaskId)
  const lineageIds = useGraphStore((state) => state.lineageIds)

  const select = useGraphStore((state) => state.select)
  const myTaskFilter = useGraphStore((state) => state.myTaskFilter)
  const nudgeNode = useGraphStore((state) => state.nudgeNode)
  const persistPosition = useGraphStore((state) => state.persistPosition)
  const setDragging = useGraphStore((state) => state.setDragging)
  const addEdge = useGraphStore((state) => state.addEdge)
  const addNode = useGraphStore((state) => state.addNode)
  const removeNode = useGraphStore((state) => state.removeNode)
  const removeEdge = useGraphStore((state) => state.removeEdge)
  const patchEdge = useGraphStore((state) => state.patchEdge)
  const selectEdge = useGraphStore((state) => state.selectEdge)
  const patchNode = useGraphStore((state) => state.patchNode)

  const lineageActive = focusedTaskId !== null && lineageIds.size > 0

  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({})

  const seenNodeIds = useRef<Set<string>>(new Set())
  const seenEdgeIds = useRef<Set<string>>(new Set())

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // Build lineage counts per task node (grounded in / depended on).
  const lineageCounts = useMemo(() => {
    const counts = new Map<string, { ancestors: number; dependents: number }>()
    for (const node of nodes) {
      if (node.kind !== "task") continue
      counts.set(node.id, {
        ancestors: countAncestors(node.id, nodes, edges),
        dependents: countDependents(node.id, edges, nodes),
      })
    }
    return counts
  }, [nodes, edges])

  const flowNodes = useMemo<FlowNode<GraphNodeData>[]>(() => {
    const memberNames = new Map(members.map((m) => [m.id, m.name]))
    const parseStates = new Map(assets.map((asset) => [asset.id, asset.parse_state]))

    const pendingByAsset = new Map<string, number>()
    for (const candidate of candidates) {
      if (candidate.promoted_node_id) continue
      pendingByAsset.set(candidate.asset_id, (pendingByAsset.get(candidate.asset_id) ?? 0) + 1)
    }

    return nodes.map((node) => {
      const isNew = !seenNodeIds.current.has(node.id)
      if (isNew) seenNodeIds.current.add(node.id)
      const lc = lineageCounts.get(node.id)

      return {
        id: node.id,
        type: node.kind,
        position: { x: node.x, y: node.y },
        selected: node.id === selectedNodeId,
        measured: measured[node.id],
        className: isNew ? "node-new" : undefined,
        data: {
          node,
          assigneeName: node.assignee_id ? memberNames.get(node.assignee_id) ?? "" : "",
          parseState:
            node.kind === "asset" && node.source_asset_id
              ? parseStates.get(node.source_asset_id) ?? null
              : null,
          dimmed:
            (lineageActive && !lineageIds.has(node.id)) ||
            (!!myTaskFilter && node.kind === "task" && node.assignee_id !== myTaskFilter),
          inLineage: lineageActive && lineageIds.has(node.id),
          isFocusedTask: node.id === focusedTaskId,
          depth: null,
          pendingCandidates: node.source_asset_id
            ? pendingByAsset.get(node.source_asset_id) ?? 0
            : 0,
          ancestorCount: lc?.ancestors ?? 0,
          dependentCount: lc?.dependents ?? 0,
        },
      }
    })
  }, [
    nodes,
    members,
    assets,
    candidates,
    selectedNodeId,
    lineageActive,
    lineageIds,
    focusedTaskId,
    measured,
    myTaskFilter,
    lineageCounts,
  ])

  // Build onDerive per-edge callback referencing latest store state via refs.
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const onDerive = useCallback(
    (edgeId: string, kind: "finding" | "constraint" | "task", position: { x: number; y: number }) => {
      const edge = edges.find((e) => e.id === edgeId)
      if (!edge) return
      const label = kind === "finding" ? "New finding" : kind === "constraint" ? "New constraint" : "New task"
      const rel = kind === "constraint" ? "constrains" : "supports"
      // ponytail: avoid overlapping existing nodes.
      const spot = findFreeSpot(nodesRef.current, { x: position.x + 20, y: position.y + 20 })
      addNode(kind, label, spot.x, spot.y).then((newNode) => {
        if (newNode) addEdge(edge.source_id, newNode.id, rel as RelationType)
      })
    },
    [edges, addNode, addEdge],
  )

  const flowEdges = useMemo<FlowEdge[]>(() => {
      // ponytail: detect parallel edges (same source→target) so labels don't overlap.
      const parallel = new Map<string, number>()
      for (const edge of edges) {
        const key = `${edge.source_id}→${edge.target_id}`
        parallel.set(key, (parallel.get(key) ?? 0) + 1)
      }
      const seen = new Map<string, number>()

      return edges.map((edge) => {
        const inLineage = lineageActive && lineageIds.has(edge.source_id) && lineageIds.has(edge.target_id)
        const targetNode = nodeMap.get(edge.target_id)
        const statusClass = targetNode?.kind === "task" ? edgeStatusClass(targetNode.task_status) : ""
        const relColor = RELATION_COLOR[edge.relation] ?? "#1B1712"
        const isNew = !seenEdgeIds.current.has(edge.id)
        if (isNew) seenEdgeIds.current.add(edge.id)

        const pairKey = `${edge.source_id}→${edge.target_id}`
        const pairTotal = parallel.get(pairKey) ?? 1
        const pairIndex = seen.get(pairKey) ?? 0
        seen.set(pairKey, pairIndex + 1)
        const labelOffsetY = pairTotal > 1 ? (pairIndex - (pairTotal - 1) / 2) * 14 : 0

        const classes = [
          isNew ? "edge-new" : "",
          lineageActive ? (inLineage ? "lineage" : "dimmed") : "",
          statusClass,
        ].filter(Boolean).join(" ")

        return {
          id: edge.id,
          source: edge.source_id,
          target: edge.target_id,
          type: "default",
          label: RELATION_LABEL[edge.relation],
          className: classes || undefined,
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
          data: { onDerive, labelOffsetY },
        }
      })
    }, [edges, lineageActive, lineageIds, nodeMap, onDerive])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: FlowEdge) => {
      event.preventDefault()
      setContextMenu({ type: "edge", x: event.clientX, y: event.clientY, edgeId: edge.id })
    },
    [],
  )

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FlowNode<GraphNodeData>) => {
      event.preventDefault()
      setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: node.id })
    },
    [],
  )

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      const pos = "clientX" in event ? { x: event.clientX, y: event.clientY } : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }
      setContextMenu({ type: "canvas", x: pos.x, y: pos.y })
    },
    [],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode<GraphNodeData>>[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          nudgeNode(change.id, change.position.x, change.position.y)
        }
        if (change.type === "dimensions" && change.dimensions) {
          const { width, height } = change.dimensions
          setMeasured((prev) =>
            prev[change.id]?.width === width && prev[change.id]?.height === height
              ? prev
              : { ...prev, [change.id]: { width, height } },
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

  const contextEdge = contextMenu?.type === "edge" && contextMenu.edgeId
    ? edges.find((e) => e.id === contextMenu.edgeId) ?? null
    : null

  return (
    <div
      ref={wrapper}
      className="relative h-full w-full"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
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
        onNodeClick={(_, node) => select(node.id)}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onEdgeContextMenu={handleEdgeContextMenu}
        onPaneClick={() => { select(null); selectEdge(null); closeContextMenu() }}
        onPaneContextMenu={handlePaneContextMenu}
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
              // Reuses the node-context-menu path so the picker offers options
              // appropriate to the source node's kind.
              setContextMenu({ type: "node", x: pos.x, y: pos.y, nodeId: source.nodeId })
            }
          }
          connectingSource.current = null
        }}
        onNodesDelete={(deleted) => {
          if (deleted.length === 0) return
          if (!confirm(`Delete ${deleted.length} node${deleted.length > 1 ? "s" : ""}?`)) return
          deleted.forEach((n) => removeNode(n.id))
        }}
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
          nodeClassName={(n) => `mm-${n.type ?? "asset"}`}
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
        />
      </ReactFlow>

      {/* Context menus */}
      {contextMenu?.type === "edge" && contextEdge && (
        <EdgeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          currentRelation={contextEdge.relation}
          onClose={closeContextMenu}
          onDelete={() => { removeEdge(contextEdge.id); closeContextMenu() }}
          onChangeRelation={(relation) => {
            patchEdge(contextEdge.id, relation)
            closeContextMenu()
          }}
        />
      )}

      {contextMenu?.type === "node" && contextMenu.nodeId && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sourceKind={nodeMap.get(contextMenu.nodeId)?.kind}
          isTask={nodeMap.get(contextMenu.nodeId)?.kind === "task"}
          isDone={nodeMap.get(contextMenu.nodeId)?.task_status === "done"}
          onClose={closeContextMenu}
          onCreate={(kind, label, relation) => {
            const src = nodeMap.get(contextMenu.nodeId!)
            if (!src) return
            const spot = findFreeSpot(nodesRef.current, { x: src.x + 280, y: src.y + 60 })
            addNode(kind, label, spot.x, spot.y).then((newNode) => {
              if (newNode && relation) addEdge(contextMenu.nodeId!, newNode.id, relation as RelationType)
            })
            closeContextMenu()
          }}
          onDelete={() => { if (confirm("Delete this node?")) { removeNode(contextMenu.nodeId!); closeContextMenu() } }}
          onFocus={() => {
            const n = nodeMap.get(contextMenu.nodeId!)
            if (n) setCenter(n.x, n.y, { duration: 300, zoom: 0.9 })
            closeContextMenu()
          }}
          onCopyId={() => {
            navigator.clipboard.writeText(contextMenu.nodeId!)
            toast({ title: "Copied", description: "Paste this ID into your agent" })
            closeContextMenu()
          }}
          onMarkDone={() => {
            patchNode(contextMenu.nodeId!, { task_status: "done" })
            closeContextMenu()
          }}
          onDuplicate={nodeMap.get(contextMenu.nodeId)?.kind !== "asset" ? () => {
            const src = nodeMap.get(contextMenu.nodeId!)
            if (src && src.kind !== "asset") {
              void addNode(src.kind as "finding" | "constraint" | "task", `${src.title} (copy)`, src.x + 40, src.y + 40)
            }
            closeContextMenu()
          } : undefined}
        />
      )}

      {contextMenu?.type === "canvas" && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onCreate={(kind, label) => {
            const pos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
            const spot = findFreeSpot(nodesRef.current, pos)
            addNode(kind, label, spot.x, spot.y)
            closeContextMenu()
          }}
        />
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center border-[3px] border-dashed border-[#1B1712] bg-[#F3EEE1]/70">
          <p className="border-[3px] border-[#1B1712] bg-white px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_#1B1712]">
            Drop a PDF or Markdown file to read it into the graph
          </p>
        </div>
      )}

      {lineageActive && (
        <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2">
          <button
            type="button"
            onClick={() => { useGraphStore.getState().clearLineage(); select(null) }}
            className="bg-card border-border hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors"
          >
            Stop highlighting
          </button>
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
