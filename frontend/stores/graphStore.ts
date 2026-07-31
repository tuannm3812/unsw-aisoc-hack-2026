import { create } from "zustand"

import { api } from "@/lib/api"
import type {
  Board,
  GraphAsset,
  GraphEdge,
  GraphNode,
  Member,
  NodeKind,
  RelationType,
} from "@/lib/types"

interface GraphState {
  boardId: string | null
  board: Board | null
  members: Member[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  assets: GraphAsset[]

  selectedNodeId: string | null
  /** Task whose ancestry is currently highlighted on the canvas. */
  focusedTaskId: string | null
  lineageIds: Set<string>

  /** Node the user has under the cursor right now, so polling leaves it alone. */
  draggingNodeId: string | null

  myTaskFilter: string | null
  setMyTaskFilter: (userId: string | null) => void

  lastSync: number | null

  loading: boolean
  error: string | null

  load: (boardId: string) => Promise<void>
  refresh: () => Promise<void>
  syncRemote: () => Promise<void>
  setDragging: (nodeId: string | null) => void

  select: (nodeId: string | null) => void
  focusLineage: (taskId: string, nodeIds: string[]) => void
  clearLineage: () => void

  addNode: (kind: NodeKind, title: string, x: number, y: number) => Promise<GraphNode | null>
  patchNode: (
    nodeId: string,
    payload: { title?: string; body?: string; task_status?: string },
  ) => Promise<void>
  nudgeNode: (nodeId: string, x: number, y: number) => void
  persistPosition: (nodeId: string, x: number, y: number) => Promise<void>
  removeNode: (nodeId: string) => Promise<void>

  addEdge: (
    sourceId: string,
    targetId: string,
    relation: RelationType,
  ) => Promise<GraphEdge | null>
  removeEdge: (edgeId: string) => Promise<void>

  replaceNode: (node: GraphNode) => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  boardId: null,
  board: null,
  members: [],
  nodes: [],
  edges: [],
  assets: [],

  selectedNodeId: null,
  focusedTaskId: null,
  lineageIds: new Set<string>(),
  draggingNodeId: null,

  myTaskFilter: null,
  setMyTaskFilter: (userId) => set({ myTaskFilter: userId }),

  lastSync: null,

  loading: false,
  error: null,

  load: async (boardId) => {
    set({ loading: true, error: null, boardId })
    try {
      const payload = await api.graph(boardId)
      set({
        board: payload.board,
        members: payload.members,
        nodes: payload.nodes,
        edges: payload.edges,
        assets: payload.assets,
        loading: false,
      })
    } catch (error) {
      set({ loading: false, error: (error as Error).message })
    }
  },

  refresh: async () => {
    const boardId = get().boardId
    if (!boardId) return
    try {
      const payload = await api.graph(boardId)
      set({
        board: payload.board,
        members: payload.members,
        nodes: payload.nodes,
        edges: payload.edges,
        assets: payload.assets,
      })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  /** Background poll. Picks up work done elsewhere, an agent reporting a pull
   *  request or a parse finishing, without disturbing what the user is doing. */
  syncRemote: async () => {
    const boardId = get().boardId
    if (!boardId) return
    let payload
    try {
      payload = await api.graph(boardId)
    } catch {
      // A dropped poll is not worth an error banner; the next tick retries.
      return
    }
    if (get().boardId !== boardId) return

    const local = new Map(get().nodes.map((node) => [node.id, node]))
    const dragging = get().draggingNodeId

    const nodes = payload.nodes.map((incoming) => {
      const current = local.get(incoming.id)
      if (!current) return incoming
      // A local edit not yet acknowledged outranks the response in flight beside it.
      if (current.revision > incoming.revision) return current
      if (incoming.id === dragging) return { ...incoming, x: current.x, y: current.y }
      return incoming
    })

    set({
      lastSync: Date.now(),
      board: payload.board,
      members: payload.members,
      nodes,
      edges: payload.edges,
      assets: payload.assets,
    })
  },

  setDragging: (nodeId) => set({ draggingNodeId: nodeId }),

  select: (nodeId) => set({ selectedNodeId: nodeId }),

  focusLineage: (taskId, nodeIds) =>
    set({ focusedTaskId: taskId, lineageIds: new Set(nodeIds) }),

  clearLineage: () => set({ focusedTaskId: null, lineageIds: new Set<string>() }),

  addNode: async (kind, title, x, y) => {
    const boardId = get().boardId
    if (!boardId) return null
    try {
      const node = await api.createNode(boardId, { kind, title, x, y })
      set((state) => ({ nodes: [...state.nodes, node], selectedNodeId: node.id }))
      return node
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  patchNode: async (nodeId, payload) => {
    const boardId = get().boardId
    if (!boardId) return
    const previous = get().nodes.find((node) => node.id === nodeId)
    // Optimistic, so editing a title feels immediate on a dense canvas.
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, ...payload } : node)),
    }))
    try {
      const updated = await api.updateNode(boardId, nodeId, payload)
      get().replaceNode(updated)
    } catch (error) {
      if (previous) get().replaceNode(previous)
      set({ error: (error as Error).message })
    }
  },

  nudgeNode: (nodeId, x, y) =>
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node)),
    })),

  persistPosition: async (nodeId, x, y) => {
    const boardId = get().boardId
    if (!boardId) return
    try {
      await api.moveNode(boardId, nodeId, x, y)
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  removeNode: async (nodeId) => {
    const boardId = get().boardId
    if (!boardId) return
    try {
      await api.deleteNode(boardId, nodeId)
      set((state) => ({
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        edges: state.edges.filter(
          (edge) => edge.source_id !== nodeId && edge.target_id !== nodeId,
        ),
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        focusedTaskId: state.focusedTaskId === nodeId ? null : state.focusedTaskId,
      }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  addEdge: async (sourceId, targetId, relation) => {
    const boardId = get().boardId
    if (!boardId) return null
    const duplicate = get().edges.some(
      (edge) =>
        edge.source_id === sourceId &&
        edge.target_id === targetId &&
        edge.relation === relation,
    )
    if (duplicate) return null
    try {
      const edge = await api.createEdge(boardId, {
        source_id: sourceId,
        target_id: targetId,
        relation,
      })
      set((state) => ({ edges: [...state.edges, edge] }))
      return edge
    } catch (error) {
      set({ error: (error as Error).message })
      return null
    }
  },

  removeEdge: async (edgeId) => {
    const boardId = get().boardId
    if (!boardId) return
    try {
      await api.deleteEdge(boardId, edgeId)
      set((state) => ({ edges: state.edges.filter((edge) => edge.id !== edgeId) }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  replaceNode: (node) =>
    set((state) => ({
      nodes: state.nodes.map((existing) => (existing.id === node.id ? node : existing)),
    })),
}))

export const selectMemberById = (members: Member[], id: string | null) =>
  id ? members.find((member) => member.id === id) ?? null : null

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => part && !part.startsWith("Dr"))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
