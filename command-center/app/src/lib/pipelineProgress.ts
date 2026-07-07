export type StepState = "done" | "current" | "upcoming";

export interface StageStep {
  id: string;
  name: string;
  state: StepState;
}

// Read-only progress along a pipeline. The current stage is located by id; when
// it is missing (nullish or not in this pipeline) nothing is marked reached, so
// the UI never implies a position we cannot prove.
export function resolveStageProgress(
  stages: { id: string; name: string }[],
  currentStageId: string | null | undefined,
): StageStep[] {
  const currentIndex = currentStageId
    ? stages.findIndex((s) => s.id === currentStageId)
    : -1;
  return stages.map((s, i) => {
    let state: StepState = "upcoming";
    if (currentIndex >= 0) {
      if (i < currentIndex) state = "done";
      else if (i === currentIndex) state = "current";
    }
    return { id: s.id, name: s.name, state };
  });
}
