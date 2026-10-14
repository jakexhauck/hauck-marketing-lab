import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAdminClientsQuery } from "../../hooks/useApi";
import { legacyClientPath } from "../../lib/clientNav";
import { readStoredClient, resolveSelectedClient } from "../../lib/selectedClient";
import { adminHomeFor } from "./AdminLayout";

// Every retired per-client address, landed on the client sub-account page that
// replaced it (Jake, 2026-10-05):
//
//   /admin/fulfillment[/:page]?client=&sub=   the Fulfillment service pages
//   /admin/delivery[/:tenantId]?tab=&sub=     the cockpit before those
//   /admin/onboarding/:tenantId[/setup]        a client's onboarding record
//   /admin/clients/:id                         the old client hub
//   /admin/ads[/:clientId]                     the old ad tracker
//
// The page comes from the `page` prop, else the :page param, else ?tab=. The
// client comes from the address when it carries one; a bare Fulfillment link
// falls back to the sub-account last opened, then the first client, then the
// agency when there are none.

export default function LegacyClientRedirect({ page }: { page?: string }) {
  const params = useParams<{ page?: string; tenantId?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const explicit = params.tenantId ?? params.id ?? searchParams.get("client");
  const target = page ?? params.page ?? searchParams.get("tab");
  const sub = searchParams.get("sub");

  const clientsQuery = useAdminClientsQuery(!explicit);

  if (explicit) return <Navigate to={legacyClientPath(target, sub, explicit)} replace />;
  if (clientsQuery.isLoading) return null;

  const { tenantId } = resolveSelectedClient({
    urlParam: null,
    stored: readStoredClient(),
    clients: clientsQuery.data?.clients ?? [],
  });
  if (!tenantId) return <Navigate to={adminHomeFor("owner")} replace />;
  return <Navigate to={legacyClientPath(target, sub, tenantId)} replace />;
}
