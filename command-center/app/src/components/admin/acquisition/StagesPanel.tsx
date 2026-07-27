import { useMemo } from "react";
import { Check, CircleAlert, CircleHelp } from "lucide-react";
import { useAgencyPipelinesQuery } from "../../../hooks/useColdCall";
import { compareStages, type StageMatch } from "../../../lib/stageDrift";

// Cold Call > Settings: the app's stages beside GoHighLevel's own.
//
// The app's list is hard-coded and the CRM is free to change. When they part
// company, leads arrive carrying a status with no page behind it. That no longer
// crashes anything, but a grey pill on a call screen is a poor place to find out,
// and it is found out mid-shift by whoever is dialing.
//
// So the drift is put where the person who can fix it will see it, next to the
// script he already comes here to edit. Read-only on purpose: the fix is in
// GoHighLevel, and a button here that renamed a stage over there would be this
// app moving Jake's pipeline behind his back.

const TONE: Record<StageMatch, { icon: typeof Check; label: string; color: string }> = {
  matched: { icon: Check, label: "In both", color: "var(--positive)" },
  missing: {
    icon: CircleAlert,
    label: "Not in GoHighLevel",
    color: "var(--warning)",
  },
  extra: {
    icon: CircleHelp,
    label: "No page in the console",
    color: "var(--warning)",
  },
};

export default function StagesPanel() {
  const query = useAgencyPipelinesQuery();
  const pipelines = query.data?.pipelines;
  const result = useMemo(() => compareStages(pipelines ?? []), [pipelines]);

  if (query.isLoading) {
    return <Frame>Checking the pipeline in GoHighLevel...</Frame>;
  }
  if (query.isError) {
    return <Frame>Could not reach GoHighLevel to compare the stages.</Frame>;
  }
  if (query.data && !query.data.configured) {
    return <Frame>GoHighLevel is not connected, so there is nothing to compare against.</Frame>;
  }
  if (!result.pipelineName) {
    return (
      <Frame>
        No board in that account looks like the Cold Calling pipeline. If it has
        been renamed or rebuilt, the console&apos;s six stages have nothing to
        match against.
      </Frame>
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-border p-5">
      <h3 className="text-[15px] font-semibold">Pipeline stages</h3>
      <p className="mt-1 text-[13px] text-muted">
        The console&apos;s pages beside the live stages of{" "}
        <span className="font-medium text-text">{result.pipelineName}</span>.{" "}
        {result.inSync
          ? "They agree."
          : "They do not agree, and a lead in a stage with no page here will show as a plain grey status."}
      </p>

      <ul className="mt-4 flex flex-col gap-1.5">
        {result.rows.map((row) => {
          const tone = TONE[row.match];
          const Icon = tone.icon;
          return (
            <li
              key={`${row.match}-${row.name}`}
              className="flex items-center gap-2.5 rounded-[var(--radius)] border border-divider px-3 py-2 text-[13px]"
            >
              <Icon size={15} aria-hidden style={{ color: tone.color, flexShrink: 0 }} />
              <span className="flex-1 font-medium">{row.name}</span>
              <span className="text-[12px] text-muted">{tone.label}</span>
            </li>
          );
        })}
      </ul>

      {!result.inSync && (
        <p className="mt-4 text-[12.5px] text-muted">
          Fix it in GoHighLevel rather than here: rename the stage back, or delete
          one the console no longer has. The console only ever writes tags, so it
          will follow.
        </p>
      )}
    </section>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border p-5">
      <h3 className="text-[15px] font-semibold">Pipeline stages</h3>
      <p className="mt-1 text-[13px] text-muted">{children}</p>
    </section>
  );
}
