import { create } from "zustand"

import { api } from "@/lib/api"
import { computeAutoLayout } from "@/lib/autoLayout"
import type {
  Board,
  Candidate,
  GraphAsset,
  GraphEdge,
  GraphNode,
  Member,
  NodeKind,
  RelationType,
} from "@/lib/types"

export interface AgentActivityEvent {
  id: string
  message: string
  kind: "info" | "done" | "error"
  at: number
}

interface GraphState {
  boardId: string | null
  board: Board | null
  members: Member[]
  nodes: GraphNode[]
  edges: GraphEdge[]
  assets: GraphAsset[]
  /** Proposals from Mistral that nobody has accepted onto the canvas yet. */
  candidates: Candidate[]

  selectedNodeId: string | null
  selectedEdgeId: string | null
  /** Task whose ancestry is currently highlighted on the canvas. */
  focusedTaskId: string | null
  lineageIds: Set<string>

  /** Node the user has under the cursor right now, so polling leaves it alone. */
  draggingNodeId: string | null

  /** Live Coordinator → specialist narration for Align / Present / Review. */
  agentEvents: AgentActivityEvent[]

  myTaskFilter: string | null
  setMyTaskFilter: (userId: string | null) => void

  loading: boolean
  error: string | null

  load: (boardId: string) => Promise<void>
  refresh: () => Promise<void>
  syncRemote: () => Promise<void>
  setDragging: (nodeId: string | null) => void

  select: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  focusLineage: (taskId: string, nodeIds: string[]) => void
  clearLineage: () => void

  pushAgentEvents: (messages: string[], kind?: AgentActivityEvent["kind"]) => void
  clearAgentEvents: () => void

  addNode: (kind: NodeKind, title: string, x: number, y: number) => Promise<GraphNode | null>
  patchNode: (
    nodeId: string,
    payload: { title?: string; body?: string; task_status?: string },
  ) => Promise<void>
  nudgeNode: (nodeId: string, x: number, y: number) => void
  persistPosition: (nodeId: string, x: number, y: number) => Promise<void>
  removeNode: (nodeId: string) => Promise<void>

  arrangeLayout: () => Promise<void>

  promoteCandidates: (assetId: string, candidateIds: string[]) => Promise<number>
  dismissCandidates: (assetId: string, candidateIds: string[]) => Promise<void>

  addEdge: (
    sourceId: string,
    targetId: string,
    relation: RelationType,
  ) => Promise<GraphEdge | null>
  removeEdge: (edgeId: string) => Promise<void>
  patchEdge: (edgeId: string, relation: RelationType) => Promise<void>

  replaceNode: (node: GraphNode) => void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  boardId: null,
  board: null,
  members: [],
  nodes: [],
  edges: [],
  assets: [],

  candidates: [],

  selectedNodeId: null,
  selectedEdgeId: null,
  focusedTaskId: null,
  lineageIds: new Set<string>(),
  draggingNodeId: null,
  agentEvents: [],

  myTaskFilter: null,
  setMyTaskFilter: (userId) => set({ myTaskFilter: userId }),

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
        candidates: payload.candidates,
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
        candidates: payload.candidates,
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
      board: payload.board,
      members: payload.members,
      nodes,
      edges: payload.edges,
      assets: payload.assets,
      candidates: payload.candidates,
    })
  },

  setDragging: (nodeId) => set({ draggingNodeId: nodeId }),

  select: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),

  focusLineage: (taskId, nodeIds) =>
    set({ focusedTaskId: taskId, lineageIds: new Set(nodeIds) }),

  clearLineage: () => set({ focusedTaskId: null, lineageIds: new Set<string>() }),

  pushAgentEvents: (messages, kind = "info") => {
    const now = Date.now()
    const next = messages
      .filter(Boolean)
      .map((message, index) => ({
        id: `${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        message,
        kind,
        at: now + index,
      }))
    if (!next.length) return
    set({ agentEvents: [...get().agentEvents, ...next].slice(-12) })
  },
  clearAgentEvents: () => set({ agentEvents: [] }),

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

  arrangeLayout: async () => {
    const boardId = get().boardId
    const { nodes, edges } = get()
    if (!boardId || nodes.length === 0) return

    const layout = computeAutoLayout(nodes, edges)
    const next = nodes.map((node) => {
      const pos = layout.get(node.id)
      return pos ? { ...node, x: pos.x, y: pos.y } : node
    })
    set({ nodes: next })

    await Promise.all(
      next.map(async (node) => {
        const before = nodes.find((item) => item.id === node.id)
        if (!before || (before.x === node.x && before.y === node.y)) return
        try {
          await api.moveNode(boardId, node.id, node.x, node.y)
        } catch (error) {
          set({ error: (error as Error).message })
        }
      }),
    )
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

  /** Accept proposals: they become nodes here, and drop out of the review list. */
  promoteCandidates: async (assetId, candidateIds) => {
    const boardId = get().boardId
    if (!boardId || candidateIds.length === 0) return 0
    try {
      const { nodes, edges } = await api.promoteCandidates(boardId, assetId, candidateIds)
      const chosen = new Set(candidateIds)
      set((state) => ({
        nodes: [...state.nodes, ...nodes],
        edges: [
          ...state.edges,
          ...edges.filter((edge) => !state.edges.some((existing) => existing.id === edge.id)),
        ],
        candidates: state.candidates.filter((candidate) => !chosen.has(candidate.id)),
        selectedNodeId: nodes[0]?.id ?? state.selectedNodeId,
      }))
      return nodes.length
    } catch (error) {
      set({ error: (error as Error).message })
      return 0
    }
  },

  dismissCandidates: async (assetId, candidateIds) => {
    const boardId = get().boardId
    if (!boardId || candidateIds.length === 0) return
    const chosen = new Set(candidateIds)
    const previous = get().candidates
    set((state) => ({
      candidates: state.candidates.filter((candidate) => !chosen.has(candidate.id)),
    }))
    try {
      await api.dismissCandidates(boardId, assetId, candidateIds)
    } catch (error) {
      set({ candidates: previous, error: (error as Error).message })
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
      set((state) => ({
        edges: state.edges.filter((edge) => edge.id !== edgeId),
        selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId,
      }))
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  patchEdge: async (edgeId, relation) => {
    const boardId = get().boardId
    if (!boardId) return
    try {
      const updated = await api.updateEdge(boardId, edgeId, relation)
      set((state) => ({
        edges: state.edges.map((edge) => (edge.id === edgeId ? updated : edge)),
      }))
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
