import { Rocket } from "lucide-react";
import ClientPicker from "../ClientPicker";
import PickPrompt from "../PickPrompt";
import SetupSteps from "./SetupSteps";
import WiringCard from "./WiringCard";
import { useSelectedClient } from "../../../hooks/useSelectedClient";

// Client setup: one client, three sections.
//
// GoHighLevel and Meta ads are checkboxes against the steps in Onboarding >
// Management. Wiring is their credentials, saved onto the client row where the
// app reads them.
//
// Deliberately nothing else. This page used to carry the progress strip, the
// push-to-GHL button, the live-check panel and their intake answers as well,
// which made "what do I do next" a question you had to hunt for. Those readings
// have not been thrown away: the live checks now sit inside Wiring, where they
// answer the question that section raises.
//
// The client comes from the shared Fulfillment picker, so choosing someone here
// and then opening Paid Ads keeps you on the same client.

export default function ClientSetupView() {
  const { clients, selected, tenantId, isLoading, isError, setClient } = useSelectedClient();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClientPicker
          clients={clients}
          selected={selected}
          loading={isLoading}
          error={isError}
          onSelect={setClient}
        />
      </div>

      {!tenantId ? (
        <PickPrompt
          icon={<Rocket size={22} />}
          title="Pick a client"
          sub={
            clients.length === 0 && !isLoading
              ? "No clients yet. Approve someone on the Pipeline and they appear here."
              : "Choose a client to see their answers and work through their setup."
          }
        />
      ) : (
        // Keyed by tenant so switching client remounts both halves rather than
        // leaving one client's half-typed values on another's record.
        <div key={tenantId} className="flex w-full max-w-[900px] flex-col gap-4">
          <SetupSteps tenantId={tenantId} />
          <WiringCard tenantId={tenantId} />
        </div>
      )}
    </div>
  );
}
