import { useCallback } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import type { AgentId } from "../../../lib/agents";
import type {
  AgentItem,
  AgentLesson,
  AgentMessage,
  BriefResponse,
  BriefSection,
  ChatSummary,
  RunnerStatus,
} from "../../../lib/agentWire";
import { pollMs } from "../../../lib/agentView";
import type { BrainScope } from "../../../lib/brainGraph";

// Every call the Agents page makes (functions/api/admin/agents). The tenant is
// a client uuid or "agency" for the agency Manager (tenant_id is null there).

export type TenantKey = string;
export const tenantKey = (tenantId: string | null): TenantKey => tenantId ?? "agency";

const BASE = "/api/admin/agents";
const qs = (params: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();

export type ItemAction = "approve" | "decline" | "change";
export type LessonAction = "edit" | "delete";

export const agentApi = {
  chats: (tenant: TenantKey, agent: AgentId) => api<ChatSummary[]>(`${BASE}/chats?${qs({ tenant, agent })}`),
  newChat: (tenant: TenantKey, agent: AgentId) =>
    api<ChatSummary>(`${BASE}/chats`, { method: "POST", body: JSON.stringify({ tenant, agent }) }),
  messages: (chatId: string) => api<{ messages: AgentMessage[] }>(`${BASE}/chats/${encodeURIComponent(chatId)}`),
  send: (chatId: string, body: string) =>
    api<AgentMessage>(`${BASE}/chats/${encodeURIComponent(chatId)}`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  items: (tenant: TenantKey, agent?: AgentId) => api<{ items: AgentItem[] }>(`${BASE}/items?${qs({ tenant, agent })}`),
  actOnItem: (id: string, action: ItemAction, note?: string) =>
    api<unknown>(`${BASE}/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ action, note }),
    }),
  lessons: (tenant: TenantKey, agent: AgentId, scope: BrainScope) =>
    api<{ lessons: AgentLesson[]; pendingEditIds: string[] }>(`${BASE}/lessons?${qs({ tenant, agent, scope })}`),
  editLesson: (lessonId: string, action: LessonAction, text?: string) =>
    api<unknown>(`${BASE}/lessons`, { method: "POST", body: JSON.stringify({ lessonId, action, text }) }),
  status: () => api<RunnerStatus>(`${BASE}/status`),
  brief: (tenantId: string) => api<BriefResponse>(`${BASE}/brief?${qs({ tenant: tenantId })}`),
  saveBrief: (tenantId: string, section: BriefSection["section"], body: string, version: number) =>
    api<{ section: BriefSection }>(`${BASE}/brief?${qs({ tenant: tenantId })}`, {
      method: "PUT",
      body: JSON.stringify({ section, body, version }),
    }),
};

const keys = {
  chats: (tenant: TenantKey, agent: AgentId) => ["admin", "agents", "chats", tenant, agent] as const,
  messages: (chatId: string) => ["admin", "agents", "messages", chatId] as const,
  // One items read per tenant, every agent at once: the rail badges, the
  // Building panel and the Manager's Clients tab all filter the same list.
  items: (tenant: TenantKey) => ["admin", "agents", "items", tenant] as const,
  lessons: (tenant: TenantKey, agent: AgentId, scope: BrainScope) =>
    ["admin", "agents", "lessons", tenant, agent, scope] as const,
  status: ["admin", "agents", "status"] as const,
  brief: (tenantId: string) => ["admin", "agents", "brief", tenantId] as const,
};

export function useAgentChats(tenant: TenantKey, agent: AgentId) {
  return useQuery({
    queryKey: keys.chats(tenant, agent),
    queryFn: () => agentApi.chats(tenant, agent),
    refetchInterval: 15_000,
  });
}

export function useNewChat(tenant: TenantKey, agent: AgentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => agentApi.newChat(tenant, agent),
    onSuccess: (chat) => {
      qc.setQueryData<ChatSummary[]>(keys.chats(tenant, agent), (prev) => [chat, ...(prev ?? [])]);
    },
  });
}

// 2s while a reply is owed, else 15s (agentView.pollMs).
export function useAgentMessages(chatId: string | null) {
  return useQuery({
    queryKey: keys.messages(chatId ?? ""),
    enabled: !!chatId,
    queryFn: () => agentApi.messages(chatId as string),
    refetchInterval: (q) => pollMs(q.state.data?.messages),
  });
}

export function useSendMessage(tenant: TenantKey, agent: AgentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, body }: { chatId: string; body: string }) => agentApi.send(chatId, body),
    onSuccess: (msg, { chatId }) => {
      qc.setQueryData<{ messages: AgentMessage[] }>(keys.messages(chatId), (prev) => ({
        messages: [...(prev?.messages ?? []).filter((m) => m.id !== msg.id), msg],
      }));
      void qc.invalidateQueries({ queryKey: keys.chats(tenant, agent) });
    },
  });
}

export function useAgentItems(tenant: TenantKey, enabled = true) {
  return useQuery({
    queryKey: keys.items(tenant),
    enabled,
    queryFn: () => agentApi.items(tenant),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// The Manager's Clients tab: one items read per client, shared with the rail.
export function useClientsItems(tenantIds: string[]) {
  return useQueries({
    queries: tenantIds.map((id) => ({
      queryKey: keys.items(id),
      queryFn: () => agentApi.items(id),
      staleTime: 10_000,
      refetchInterval: 30_000,
    })),
  });
}

export function useItemAction(tenant: TenantKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: ItemAction; note?: string }) =>
      agentApi.actOnItem(id, action, note),
    // A 409 means another click already moved it: refetching shows the truth
    // either way, and the follow-up message lands in the chat.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.items(tenant) });
      void qc.invalidateQueries({ queryKey: ["admin", "agents", "messages"] });
      void qc.invalidateQueries({ queryKey: ["admin", "agents", "chats", tenant] });
    },
  });
}

export function useAgentLessons(tenant: TenantKey, agent: AgentId, scope: BrainScope) {
  return useQuery({
    queryKey: keys.lessons(tenant, agent, scope),
    queryFn: () => agentApi.lessons(tenant, agent, scope),
    staleTime: 15_000,
    // Faster while an edit waits on the PC, so "Saving" clears soon after.
    refetchInterval: (q) => ((q.state.data?.pendingEditIds.length ?? 0) > 0 ? 5_000 : 60_000),
  });
}

export function useLessonEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, action, text }: { lessonId: string; action: LessonAction; text?: string }) =>
      agentApi.editLesson(lessonId, action, text),
    // Returned, not voided: the mutation reads pending until the refetch lands.
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "agents", "lessons"] }),
  });
}

export function useRunnerStatus() {
  return useQuery({
    queryKey: keys.status,
    queryFn: agentApi.status,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

// The Client Brief: one read per client, shared by the side panel on every
// agent page and the Brief page. 15s so an agent's edit shows up on its own.
export function useClientBrief(tenantId: string) {
  return useQuery({
    queryKey: keys.brief(tenantId),
    queryFn: () => agentApi.brief(tenantId),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export type BriefSaveResult = { saved: BriefSection } | { stale: BriefSection };

/**
 * Save one section at the version it was based on. A 409 is an answer, not an
 * error: it carries the newer section, which the editor shows (briefDraft.ts).
 * Either way the cached brief takes the server's copy of that section.
 */
export function useSaveBriefSection(tenantId: string) {
  const qc = useQueryClient();
  return useCallback(
    async (section: BriefSection["section"], body: string, version: number): Promise<BriefSaveResult> => {
      const put = (next: BriefSection) =>
        qc.setQueryData<BriefResponse>(keys.brief(tenantId), (prev) =>
          prev ? { ...prev, sections: prev.sections.map((s) => (s.section === next.section ? next : s)) } : prev,
        );
      try {
        const res = await agentApi.saveBrief(tenantId, section, body, version);
        put(res.section);
        // The Drive chip: the sync runs after the save, so look again shortly.
        setTimeout(() => void qc.invalidateQueries({ queryKey: keys.brief(tenantId) }), 4_000);
        return { saved: res.section };
      } catch (e) {
        const current =
          e instanceof ApiError && e.status === 409 ? (e.body as { section?: BriefSection } | null)?.section : null;
        if (!current) throw e;
        put(current);
        return { stale: current };
      }
    },
    [qc, tenantId],
  );
}
