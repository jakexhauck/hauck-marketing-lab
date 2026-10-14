import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { LeadForm } from "../../functions/lib/adLeadForms";
import type { MirrorValue } from "../../functions/lib/customValuesMirror";

// Data hooks for the client setup pages built from the Client Setup SOP.
// Kept out of useApi.ts so these pages are one file to read.

const enc = encodeURIComponent;

// ---- Custom Values (live mirror of the sub-account) -----------------------

const valuesKey = (tenantId: string) => ["sop", "custom-values", tenantId];

export function useCustomValues(tenantId: string) {
  return useQuery({
    queryKey: valuesKey(tenantId),
    queryFn: () => api<{ values: MirrorValue[] }>(`/api/admin/clients/${enc(tenantId)}/custom-values`),
    // A mirror: re-read whenever the tab comes back into focus, since the
    // values also change inside GHL itself.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useSaveCustomValue(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; value: string; remove?: boolean }) => {
      const root = `/api/admin/clients/${enc(tenantId)}/custom-values`;
      if (input.remove && input.id) {
        return api<{ values: MirrorValue[] }>(`${root}/${enc(input.id)}`, { method: "DELETE" });
      }
      const body = JSON.stringify({ name: input.name, value: input.value });
      return input.id
        ? api<{ values: MirrorValue[] }>(`${root}/${enc(input.id)}`, { method: "PUT", body })
        : api<{ values: MirrorValue[] }>(root, { method: "POST", body });
    },
    onSuccess: (data) => qc.setQueryData(valuesKey(tenantId), data),
  });
}

// ---- Fill in docs --------------------------------------------------------

export function useFillClientDocs(tenantId: string) {
  return useMutation({
    mutationFn: () =>
      api<{ docs: number; spots: number; problems: string[] }>(
        `/api/admin/onboarding/${enc(tenantId)}/drive-folder/fill`,
        { method: "POST" },
      ),
  });
}

// ---- Lead form into Meta -------------------------------------------------

const formsKey = (tenantId: string) => ["admin", "ad-lead-forms", tenantId];

export function useMetaPage(tenantId: string) {
  return useQuery({
    queryKey: ["sop", "meta-page", tenantId],
    queryFn: () =>
      api<{ pageId: string | null; pages: { id: string; name: string }[]; pagesError: string | null }>(
        `/api/admin/clients/${enc(tenantId)}/meta-page`,
      ),
    staleTime: 60_000,
  });
}

export function useSetMetaPage(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) =>
      api<{ ok: true }>(`/api/admin/clients/${enc(tenantId)}/meta-page`, {
        method: "PUT",
        body: JSON.stringify({ pageId }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sop", "meta-page", tenantId] }),
  });
}

export function useCreateInMeta(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) =>
      api<{ form: LeadForm; manual: string[]; metaName: string }>(
        `/api/admin/ads/forms/${enc(formId)}/create-in-meta`,
        { method: "POST" },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: formsKey(tenantId) }),
  });
}

export function useSopTemplateForm(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) =>
      api<{ form: LeadForm; claude: string | null }>(`/api/admin/ads/forms/${enc(formId)}/sop-template`, {
        method: "POST",
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: formsKey(tenantId) }),
  });
}

export function useDuplicateLeadForm(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) =>
      api<{ form: LeadForm }>(`/api/admin/ads/forms/${enc(formId)}/duplicate`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: formsKey(tenantId) }),
  });
}
