import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
  AvailableNumber,
  CalendarPatch,
  CustomField,
  FormFacts,
  MediaItem,
  PhoneNumber,
  Profile,
  ProfileInput,
  SetupCalendar,
  SetupPipeline,
  SetupWorkflow,
  StaffInput,
  StaffUser,
} from "../../functions/lib/ghlSetup";

// Client > GHL setup pages (components/admin/cockpit/ghl/setup). Every read is
// live from the client's sub-account, re-read on focus, because the same
// settings also change inside GHL itself.

const enc = encodeURIComponent;
const root = (t: string) => `/api/admin/clients/${enc(t)}/ghl-setup`;
const live = { staleTime: 0, refetchOnWindowFocus: true, retry: false } as const;
const key = (t: string, part: string, ...rest: unknown[]) => ["admin", "ghl-setup", t, part, ...rest];

export function useGhlForm(t: string) {
  return useQuery({ queryKey: key(t, "form"), queryFn: () => api<{ facts: FormFacts | null }>(`${root(t)}/form`), staleTime: 60_000 });
}

// ---- Business Profile

type ProfileRes = { profile: Profile; timezones?: string[] };

export function useGhlProfile(t: string) {
  return useQuery({ queryKey: key(t, "profile"), queryFn: () => api<ProfileRes>(`${root(t)}/profile`), ...live });
}

export function useSaveGhlProfile(t: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => api<ProfileRes>(`${root(t)}/profile`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: (d) => qc.setQueryData<ProfileRes>(key(t, "profile"), (old) => ({ ...old, profile: d.profile })),
  });
}

// ---- Staff

export type StaffRes = { users: StaffUser[]; jakeIn: boolean; password?: string };

export function useGhlStaff(t: string) {
  return useQuery({ queryKey: key(t, "staff"), queryFn: () => api<StaffRes>(`${root(t)}/staff`), ...live });
}

export type StaffAction = { kind: "jake" } | { kind: "new"; input: StaffInput } | { kind: "edit"; id: string; input: StaffInput } | { kind: "remove"; id: string };

export function useGhlStaffAction(t: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: StaffAction) => {
      if (a.kind === "jake") return api<StaffRes>(`${root(t)}/staff`, { method: "POST", body: JSON.stringify({ kind: "jake" }) });
      if (a.kind === "new") return api<StaffRes>(`${root(t)}/staff`, { method: "POST", body: JSON.stringify({ kind: "new", ...a.input }) });
      if (a.kind === "edit") return api<StaffRes>(`${root(t)}/staff/${enc(a.id)}`, { method: "PUT", body: JSON.stringify(a.input) });
      return api<StaffRes>(`${root(t)}/staff/${enc(a.id)}`, { method: "DELETE" });
    },
    onSuccess: (d) => {
      qc.setQueryData(key(t, "staff"), { users: d.users, jakeIn: d.jakeIn });
      void qc.invalidateQueries({ queryKey: key(t, "calendars") });
    },
  });
}

// ---- Custom Fields

export function useGhlFields(t: string) {
  return useQuery({ queryKey: key(t, "fields"), queryFn: () => api<{ fields: CustomField[] }>(`${root(t)}/fields`), ...live });
}

export function useSaveGhlField(t: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id?: string; name: string; dataType: string; placeholder: string; remove?: boolean }) => {
      if (a.remove && a.id) return api<{ fields: CustomField[] }>(`${root(t)}/fields/${enc(a.id)}`, { method: "DELETE" });
      const body = JSON.stringify({ name: a.name, dataType: a.dataType, placeholder: a.placeholder });
      return a.id
        ? api<{ fields: CustomField[] }>(`${root(t)}/fields/${enc(a.id)}`, { method: "PUT", body })
        : api<{ fields: CustomField[] }>(`${root(t)}/fields`, { method: "POST", body });
    },
    onSuccess: (d) => qc.setQueryData(key(t, "fields"), d),
  });
}

// ---- Calendars

type CalendarsRes = { calendars: SetupCalendar[]; users: StaffUser[] };

export function useGhlCalendars(t: string) {
  return useQuery({ queryKey: key(t, "calendars"), queryFn: () => api<CalendarsRes>(`${root(t)}/calendars`), ...live });
}

export function useSaveGhlCalendar(t: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; patch: CalendarPatch }) =>
      api<{ calendar: SetupCalendar }>(`${root(t)}/calendars/${enc(a.id)}`, { method: "PUT", body: JSON.stringify(a.patch) }),
    onSuccess: (d) =>
      qc.setQueryData<CalendarsRes>(key(t, "calendars"), (old) => (old ? { ...old, calendars: old.calendars.map((c) => (c.id === d.calendar.id ? d.calendar : c)) } : old)),
  });
}

// ---- Pipelines, Workflows (read only)

export type PipelineRow = SetupPipeline & { opportunities: number | null };

export function useGhlPipelines(t: string) {
  return useQuery({ queryKey: key(t, "pipelines"), queryFn: () => api<{ pipelines: PipelineRow[] }>(`${root(t)}/pipelines`), ...live });
}

export function useGhlWorkflows(t: string) {
  return useQuery({ queryKey: key(t, "workflows"), queryFn: () => api<{ workflows: SetupWorkflow[] }>(`${root(t)}/workflows`), ...live });
}

// ---- Media

type MediaRes = { folders: MediaItem[]; files: MediaItem[] };

export function useGhlMedia(t: string, parentId: string) {
  return useQuery({
    queryKey: key(t, "media", parentId),
    queryFn: () => api<MediaRes>(`${root(t)}/media${parentId ? `?parentId=${enc(parentId)}` : ""}`),
    ...live,
  });
}

export function useGhlMediaUpload(t: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { parentId: string } & ({ driveFileIds: string[] } | { file: File })) => {
      if ("file" in a) {
        const form = new FormData();
        form.set("file", a.file);
        if (a.parentId) form.set("parentId", a.parentId);
        return api<{ uploaded: number }>(`${root(t)}/media`, { method: "POST", body: form });
      }
      return api<{ uploaded: number }>(`${root(t)}/media`, { method: "POST", body: JSON.stringify({ driveFileIds: a.driveFileIds, parentId: a.parentId }) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(t, "media") }),
  });
}

export function useGhlMediaFolder(t: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { name: string; parentId: string }) => api<{ ok: true }>(`${root(t)}/media/folder`, { method: "POST", body: JSON.stringify(a) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(t, "media") }),
  });
}

// ---- Phone numbers

export function useGhlNumbers(t: string) {
  return useQuery({ queryKey: key(t, "numbers"), queryFn: () => api<{ numbers: PhoneNumber[] }>(`${root(t)}/numbers`), ...live });
}

export function useGhlAvailableNumbers(t: string, area: string) {
  return useQuery({
    queryKey: key(t, "numbers-available", area),
    enabled: /^\d{3}$/.test(area),
    queryFn: () => api<{ available: AvailableNumber[]; fingerprintId: string }>(`${root(t)}/numbers?area=${enc(area)}`),
    staleTime: 60_000,
    retry: false,
  });
}

export function useBuyGhlNumber(t: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { number: string; fingerprintId: string }) =>
      api<{ numbers: PhoneNumber[] }>(`${root(t)}/numbers`, { method: "POST", body: JSON.stringify({ ...a, confirm: true }) }),
    onSuccess: (d) => qc.setQueryData(key(t, "numbers"), d),
  });
}
