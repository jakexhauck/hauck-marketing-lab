// Where the close-out queue lives: the Sales pipeline's "Job Completed" stage.
//
// Split out of closeOut.ts so both the count endpoint (the nudges) and the
// close-out endpoint (the guard that refuses to close out a card that is not
// actually in the stage) share one resolver, and so the naming rules below are
// tested rather than assumed.

export interface StageLike {
  id: string;
  name: string;
}

export interface PipelineLike {
  id: string;
  name: string;
  stages: StageLike[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve the Sales pipeline's completed stage BY NAME. Willis's live stage is
// "Job Completed ✅", so matching is lower-cased contains.
//
// Matching on "completed" rather than "job" is deliberate: "Job Booked 💼" also
// starts with "Job", and mistaking it for the queue would put a red
// needs-close-out badge on every job that has not happened yet.
//
// Returns null rather than guessing: a client with no Sales pipeline, or no
// completed stage in it, simply has no close-out queue.
export function resolveJobCompletedStage(
  pipes: PipelineLike[],
): { pipelineId: string; stageId: string } | null {
  const sales =
    pipes.find((p) => norm(p.name) === "sales") ??
    pipes.find((p) => norm(p.name).includes("sales"));
  if (!sales) return null;

  const stage = sales.stages.find((s) => norm(s.name).includes("completed"));
  if (!stage) return null;

  return { pipelineId: sales.id, stageId: stage.id };
}
