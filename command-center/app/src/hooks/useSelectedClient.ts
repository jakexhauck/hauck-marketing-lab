import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAdminClientsQuery } from "./useApi";
import {
  readStoredClient,
  resolveSelectedClient,
  writeStoredClient,
} from "../lib/selectedClient";
import type { AdminClient } from "../lib/api";

// The Fulfillment client pick, wired to the URL and to localStorage. The
// resolution ladder itself lives in lib/selectedClient.ts; this adds the two
// side effects React owns.
//
// Both directions matter. Reading, the ladder answers "which client is this
// page on". Writing, the resolved id is pushed back into ?client= whenever the
// URL is missing it, so a sidebar link (which carries no param) immediately
// becomes a URL you can paste at someone. That write is a REPLACE: the Back
// button should walk the pages you visited, not the picks you made.

export interface UseSelectedClient {
  clients: AdminClient[];
  selected: AdminClient | null;
  tenantId: string | null;
  isLoading: boolean;
  isError: boolean;
  setClient: (tenantId: string) => void;
}

export function useSelectedClient(): UseSelectedClient {
  const [searchParams, setSearchParams] = useSearchParams();
  const clientsQuery = useAdminClientsQuery(true);

  const clients = useMemo(
    () => clientsQuery.data?.clients ?? [],
    [clientsQuery.data],
  );
  const urlParam = searchParams.get("client");

  const { tenantId } = resolveSelectedClient({
    urlParam,
    stored: readStoredClient(),
    clients,
  });

  // Keep the URL and storage caught up with whatever resolved. Guarded on
  // inequality, so this settles after one pass rather than looping.
  useEffect(() => {
    if (!tenantId) return;
    writeStoredClient(tenantId);
    if (urlParam === tenantId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("client", tenantId);
        return next;
      },
      { replace: true },
    );
  }, [tenantId, urlParam, setSearchParams]);

  const setClient = useCallback(
    (id: string) => {
      writeStoredClient(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("client", id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    clients,
    selected: clients.find((c) => c.id === tenantId) ?? null,
    tenantId,
    isLoading: clientsQuery.isLoading,
    isError: clientsQuery.isError,
    setClient,
  };
}
