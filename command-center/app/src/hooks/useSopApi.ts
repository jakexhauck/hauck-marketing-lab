import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Sheet } from "../lib/customValuesSheet";
import type { CopyItem, CopyKind, CopyRecord, CopySettings } from "../lib/followUpCopy";

// Data hooks for the client setup pages built from the Client Setup SOP.
// Kept out of useApi.ts so these pages are one file to read.

const enc = encodeURIComponent;

// ---- Custom Values -------------------------------------------------------

export function useCustomValuesSheet(tenantId: string) {
  return useQuery({
    queryKey: ["sop", "custom-values", tenantId],
    queryFn: () => api<{ sheet: Sheet; linked: boolean }>(`/api/admin/clients/${enc(tenantId)}/custom-values`),
  });
}

export function useSaveCustomValue(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; value: string }) =>
      api<{ ok: true }>(`/api/admin/clients/${enc(tenantId)}/custom-values`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sop", "custom-values", tenantId] }),
  });
}

export interface PushResult {
  ok: boolean;
  written: string[];
  failed: { name: string; status: number }[];
  notFound: string[];
}

export function usePushCustomValues(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<PushResult>(`/api/admin/clients/${enc(tenantId)}/custom-values/push`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sop", "custom-values", tenantId] }),
  });
}

// ---- CAPI ----------------------------------------------------------------

export interface CapiView {
  datasetId: string;
  token: string;
  hasToken: boolean;
  updatedAt: string | null;
}

export function useCapiQuery(tenantId: string) {
  return useQuery({
    queryKey: ["sop", "capi", tenantId],
    queryFn: () => api<CapiView>(`/api/admin/clients/${enc(tenantId)}/capi`),
  });
}

export function useRevealCapiToken(tenantId: string) {
  return useMutation({
    mutationFn: () => api<CapiView>(`/api/admin/clients/${enc(tenantId)}/capi?reveal=1`),
  });
}

export function useSaveCapi(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { datasetId?: string; accessToken?: string }) =>
      api<{ ok: true; ghl: { pushed: boolean; missing: string[] } | null }>(
        `/api/admin/clients/${enc(tenantId)}/capi`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sop", "capi", tenantId] }),
  });
}

export function useTestCapi(tenantId: string) {
  return useMutation({
    mutationFn: () =>
      api<{ ok: boolean; name?: string; error?: string }>(`/api/admin/clients/${enc(tenantId)}/capi/test`, {
        method: "POST",
      }),
  });
}

// ---- Follow-up Texts -----------------------------------------------------

const copyKey = (tenantId: string, kind: CopyKind) => ["sop", "copy", tenantId, kind];

export function useCopyQuery(tenantId: string, kind: CopyKind) {
  return useQuery({
    queryKey: copyKey(tenantId, kind),
    queryFn: () => api<CopyRecord>(`/api/admin/clients/${enc(tenantId)}/copy/${kind}`),
  });
}

export function useSaveCopy(tenantId: string, kind: CopyKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { items?: CopyItem[]; settings?: CopySettings }) =>
      api<CopyRecord>(`/api/admin/clients/${enc(tenantId)}/copy/${kind}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (rec) => qc.setQueryData(copyKey(tenantId, kind), rec),
  });
}

export function useWriteCopy(tenantId: string, kind: CopyKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { only?: string }) =>
      api<CopyRecord>(`/api/admin/clients/${enc(tenantId)}/copy/${kind}/write`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (rec) => qc.setQueryData(copyKey(tenantId, kind), rec),
  });
}
