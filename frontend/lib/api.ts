import type {
  Board,
  CurrentUser,
  GraphAsset,
  GraphEdge,
  GraphNode,
  GraphPayload,
  Health,
  NodeKind,
  RelationType,
  TaskContext,
} from "./types"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const body = await response.json()
      const detail = body.detail ?? body.message
      if (typeof detail === "string") message = detail
      else if (Array.isArray(detail)) message = detail.map((d) => d?.msg ?? String(d)).join("; ")
    } catch {
      // keep the status text
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  health: () => request<Health>("/api/health"),
  verifyMistral: () => request<{ ok: boolean }>("/api/integrations/mistral/verify"),

  demoAccounts: () => request<CurrentUser[]>("/api/auth/demo-accounts"),
  login: (email: string, password: string) =>
    request<CurrentUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<CurrentUser>("/api/auth/me"),

  boards: () => request<Board[]>("/api/boards"),
  graph: (boardId: string) => request<GraphPayload>(`/api/boards/${boardId}/graph`),

  createNode: (
    boardId: string,
    payload: { kind: NodeKind; title: string; body?: string; x: number; y: number },
  ) =>
    request<GraphNode>(`/api/boards/${boardId}/nodes`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateNode: (
    boardId: string,
    nodeId: string,
    payload: { title?: string; body?: string; task_status?: string },
  ) =>
    request<GraphNode>(`/api/boards/${boardId}/nodes/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  moveNode: (boardId: string, nodeId: string, x: number, y: number) =>
    request<GraphNode>(`/api/boards/${boardId}/nodes/${nodeId}/position`, {
      method: "PUT",
      body: JSON.stringify({ x, y }),
    }),

  deleteNode: (boardId: string, nodeId: string) =>
    request<{ ok: boolean }>(`/api/boards/${boardId}/nodes/${nodeId}`, { method: "DELETE" }),

  createEdge: (
    boardId: string,
    payload: { source_id: string; target_id: string; relation: RelationType },
  ) =>
    request<GraphEdge>(`/api/boards/${boardId}/edges`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteEdge: (boardId: string, edgeId: string) =>
    request<{ ok: boolean }>(`/api/boards/${boardId}/edges/${edgeId}`, { method: "DELETE" }),

  uploadAsset: (boardId: string, file: File, x: number, y: number) => {
    const form = new FormData()
    form.append("file", file)
    return request<GraphAsset>(
      `/api/boards/${boardId}/assets?x=${Math.round(x)}&y=${Math.round(y)}`,
      { method: "POST", body: form },
    )
  },

  reparseAsset: (boardId: string, assetId: string) =>
    request<GraphAsset>(`/api/boards/${boardId}/assets/${assetId}/reparse`, { method: "POST" }),

  taskContext: (boardId: string, taskId: string, refresh = false) =>
    request<TaskContext>(
      `/api/boards/${boardId}/tasks/${taskId}/context${refresh ? "?refresh=true" : ""}`,
    ),

  assignTask: (boardId: string, taskId: string, assigneeId: string, createJiraIssue = true) =>
    request<GraphNode>(`/api/boards/${boardId}/tasks/${taskId}/assign`, {
      method: "POST",
      body: JSON.stringify({ assignee_id: assigneeId, create_jira_issue: createJiraIssue }),
    }),

  retryJira: (boardId: string, taskId: string, force = false) =>
    request<GraphNode>(
      `/api/boards/${boardId}/tasks/${taskId}/jira-retry${force ? "?force=true" : ""}`,
      { method: "POST" },
    ),
}
