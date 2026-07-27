import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { normalizeSlots, type WeekAvailability } from "../lib/availabilityWeek";

// Cold Call > Availability: when a caller is on the phones (0057).
//
// One query per person per week. `callerId` is part of the key, so switching
// person in the owner's picker swaps to a separate cache entry instead of
// briefly showing the previous person's week under the new name.

export interface AvailabilityResponse {
  callerId: string;
  days: WeekAvailability;
}

function key(callerId: string, from: string) {
  return ["admin", "cold-call", "availability", callerId, from] as const;
}

// `callerId` "" means the signed-in person, which is what a cold caller always
// gets. Disabled until there is a week to ask about.
export function useAvailabilityQuery(callerId: string, from: string, to: string) {
  return useQuery({
    queryKey: key(callerId, from),
    enabled: !!from && !!to,
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (callerId) params.set("callerId", callerId);
      const res = await api<AvailabilityResponse>(
        `/api/admin/cold-call/availability?${params.toString()}`,
      );
      // Re-normalise on arrival: the grid indexes straight into this, and a
      // malformed day should read as empty rather than paint a stray cell.
      const days: WeekAvailability = {};
      for (const [day, slots] of Object.entries(res.days ?? {})) {
        days[day] = normalizeSlots(slots);
      }
      return { callerId: res.callerId, days };
    },
  });
}

export interface TeamAvailabilityMember {
  id: string;
  name: string;
  role: string;
  days: WeekAvailability;
}

// The whole roster's week, for the owner's Management > Team availability page.
// Owner-only server side; this hook is only ever mounted there.
export function useTeamAvailabilityQuery(from: string, to: string) {
  return useQuery({
    queryKey: ["admin", "cold-call", "availability", "team", from] as const,
    enabled: !!from && !!to,
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      const res = await api<{ members: TeamAvailabilityMember[] }>(
        `/api/admin/cold-call/availability/team?${params.toString()}`,
      );
      return (res.members ?? []).map((m) => {
        const days: WeekAvailability = {};
        for (const [day, slots] of Object.entries(m.days ?? {})) {
          days[day] = normalizeSlots(slots);
        }
        return { ...m, days };
      });
    },
  });
}

export interface SaveDayInput {
  callerId: string;
  // The week this day belongs to, so the right cache entry is updated.
  weekFrom: string;
  day: string;
  slots: number[];
}

export function useSaveAvailabilityDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveDayInput) =>
      api<{ callerId: string; day: string; slots: number[] }>(
        "/api/admin/cold-call/availability",
        {
          method: "PUT",
          body: JSON.stringify({
            callerId: input.callerId || null,
            day: input.day,
            slots: input.slots,
          }),
        },
      ),
    // The grid already shows the painted cells; writing the server's echo back
    // into the cache keeps a later refetch from flashing the pre-drag state.
    onSuccess: (res, input) => {
      qc.setQueryData<AvailabilityResponse>(key(input.callerId, input.weekFrom), (prev) =>
        prev
          ? { ...prev, days: { ...prev.days, [res.day]: normalizeSlots(res.slots) } }
          : prev,
      );
    },
    // A failed save must not leave the screen claiming hours nobody stored.
    onError: (_err, input) => {
      qc.invalidateQueries({ queryKey: key(input.callerId, input.weekFrom) });
    },
  });
}
