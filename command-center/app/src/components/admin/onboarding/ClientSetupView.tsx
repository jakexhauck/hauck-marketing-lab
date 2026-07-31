import { useMemo, useState } from "react";
import { Rocket } from "lucide-react";
import ClientPicker from "../ClientPicker";
import PickPrompt from "../PickPrompt";
import SetupSteps from "./SetupSteps";
import WiringCard from "./WiringCard";
import { useSelectedClient } from "../../../hooks/useSelectedClient";

// Client setup: one client, their checklist, their wiring.
//
// This is the whole of Onboarding now. The picker defaults to the clients still
// being stood up, so the page is the queue rather than a page you consult after
// finding the client somewhere else. Pressing Go Live takes them off it.
//
// "Show all" is there because the queue is a default, not a cage: a client who
// went live last month and needs their checklist reopened is one click away, and
// the alternative was a client you simply could not reach from here.
//
// The client comes from the shared Fulfillment picker, so choosing someone here
// and then opening Paid Ads keeps you on the same client.

export default function ClientSetupView() {
  const { clients, selected, tenantId, isLoading, isError, setClient } = useSelectedClient();
  const [showAll, setShowAll] = useState(false);

  const onboarding = useMemo(
    () => clients.filter((c) => c.onboardingStatus === "setup"),
    [clients],
  );

  // The selected client stays in the list whatever the filter says. Without
  // this, pressing Go Live would empty the picker's label the instant it
  // succeeded, which reads as having lost the client rather than finished them.
  const listed = useMemo(() => {
    if (showAll) return clients;
    const withSelected = onboarding.some((c) => c.id === tenantId);
    if (withSelected || !selected) return onboarding;
    return [selected, ...onboarding];
  }, [showAll, clients, onboarding, tenantId, selected]);

  const noneInSetup = !isLoading && !isError && onboarding.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClientPicker
          clients={listed}
          selected={selected}
          loading={isLoading}
          error={isError}
          onSelect={setClient}
        />

        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-muted">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--brand)]"
          />
          Show clients who are already live
        </label>
      </div>

      {!tenantId ? (
        <PickPrompt
          icon={<Rocket size={22} />}
          title={noneInSetup ? "Nobody is being onboarded" : "Pick a client"}
          sub={
            clients.length === 0 && !isLoading
              ? "No clients yet. Add one, or send someone the intake form, and they appear here."
              : noneInSetup
                ? "Everyone is live. Tick “Show clients who are already live” to reopen someone's checklist."
                : "Choose a client to work through their setup."
          }
        />
      ) : (
        // Keyed by tenant so switching client remounts both halves rather than
        // leaving one client's half-typed values on another's record.
        <div key={tenantId} className="flex w-full flex-col gap-4">
          <SetupSteps tenantId={tenantId} />
          <WiringCard tenantId={tenantId} />
        </div>
      )}
    </div>
  );
}
