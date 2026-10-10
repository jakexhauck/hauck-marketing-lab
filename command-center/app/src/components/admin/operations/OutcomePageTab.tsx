// Operations > Outcome Page (Jake, 2026-10-10): the owner outcome page as the
// owner sees it, live but saving nothing (/api/admin/outcome-preview), beside
// what each answer does. The real page is api/outcome; its rules live in
// functions/lib/outcome.ts and the move in functions/lib/outcomeMove.ts, so
// keep this list in step with those.

const ANSWERS: { label: string; asks: string; does: string[] }[] = [
  {
    label: "Estimate booked",
    asks: "Day and time, street address, services, notes",
    does: [
      "Books the estimate on the Home Estimate calendar, or moves the one already booked",
      "Saves the answers to the contact",
      "Moves the lead to Estimate Booked",
    ],
  },
  {
    label: "Job closed",
    asks: "Amount, job day and time, street address, services, notes",
    does: [
      "Books the job on the Job calendar",
      "Counts a job and its revenue on the Ads Dashboard",
      "Sends Meta a Purchase for the amount",
      "Moves the lead to Job Booked",
    ],
  },
  {
    label: "Call back later",
    asks: "Day and time",
    does: ["Moves the lead to Follow Up at that time", "Texts the owner a reminder when it comes round"],
  },
  {
    label: "No answer",
    asks: "Nothing",
    does: [
      "Moves the lead to No Answer, to call again this time tomorrow",
      "Counts one more try",
      "Texts the owner a reminder tomorrow",
    ],
  },
  {
    label: "Not interested",
    asks: "Reason",
    does: ["Moves the lead to Lost with the reason"],
  },
];

const LINK = "{{custom_values.outcome_link}}&c={{contact.id}}";

export default function OutcomePageTab() {
  return (
    <div className="flex flex-col gap-6 px-5 pb-10 pt-2 lg:flex-row lg:items-start lg:px-6">
      <iframe
        title="Outcome page"
        src="/api/admin/outcome-preview"
        className="h-[760px] w-full shrink-0 rounded-[28px] border border-border bg-[#0A1D19] shadow-[var(--shadow-sm)] lg:w-[390px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {ANSWERS.map((a) => (
          <section key={a.label} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
            <h2 className="font-display text-[15px] font-semibold text-text">{a.label}</h2>
            <p className="mt-1 text-[13px] text-muted">Asks: {a.asks}</p>
            <ul className="mt-2 list-disc pl-5 text-[13.5px] text-text">
              {a.does.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
          <h2 className="font-display text-[15px] font-semibold text-text">Link for GHL texts</h2>
          <code className="mt-2 block break-all rounded-[var(--radius)] bg-surface-2 px-3 py-2 text-[13px] text-text">{LINK}</code>
        </section>
      </div>
    </div>
  );
}
