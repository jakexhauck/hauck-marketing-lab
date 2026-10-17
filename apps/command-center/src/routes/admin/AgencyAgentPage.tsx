import { Navigate, useParams } from "react-router-dom";
import AgentPage from "../../components/admin/agents/AgentPage";

// /admin/agents/:agent. Only the Manager has an agency address; anything else
// typed here lands on it.
export default function AgencyAgentPage() {
  const { agent } = useParams();
  if (agent !== "manager") return <Navigate to="/admin/agents/manager" replace />;
  return <AgentPage tenantId={null} agent="manager" />;
}
