// Onboarding Hub — read-only kanban of the GHL pipeline the user has
// designated as their onboarding pipeline. The same pipeline ID is what
// the OnboardingChecklist syncs into when a phase completes.

import { PipelineHubPage } from "./PipelineHubPage";

export function OnboardingHubPage() {
  return (
    <PipelineHubPage
      hubKey="onboarding"
      title="Onboarding Hub"
      subtitle="Every client's onboarding phase, mirrored from GoHighLevel. Stages advance automatically when phases complete in the per-client checklist."
    />
  );
}
