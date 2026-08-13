import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../../ui/Button";
import { useAdminOnboardingQuery, useClientSecrets } from "../../../hooks/useApi";
import { useIntakeSubmission } from "../../../hooks/useIntake";
import { sheetSections, sheetText, type SheetSection } from "../../../lib/onboardingSheet";

// The client sheet, open underneath their row.
//
// A document, not a form. Everything we hold about one client in the order the
// funnel asked for it, with the wiring at the end, and every line copyable:
// click a line to take that value, or take the lot. Standing a sub-account up
// means pasting these values into GoHighLevel and Meta, and hunting for them
// across four screens was the actual complaint.

export function ClientSheet({ tenantId }: { tenantId: string }) {
  const record = useAdminOnboardingQuery(tenantId);
  const secrets = useClientSecrets(tenantId);

  const sections = useMemo(
    () =>
      sheetSections(
        record.data?.intake ?? {},
        secrets.data?.fields ?? [],
        record.data?.password,
      ),
    [record.data?.intake, record.data?.password, secrets.data?.fields],
  );

  return (
    <SheetView
      sections={sections}
      loading={record.isLoading || secrets.isLoading}
      error={record.isError ? "That client's record did not load." : null}
    />
  );
}

export function SubmissionSheet({ submissionId }: { submissionId: string }) {
  const detail = useIntakeSubmission(submissionId);

  const sections = useMemo(
    () => sheetSections(detail.data?.answers ?? {}, [], detail.data?.password),
    [detail.data?.answers, detail.data?.password],
  );

  return (
    <SheetView
      sections={sections}
      loading={detail.isLoading}
      error={detail.isError ? "That form did not load." : null}
    />
  );
}

function SheetView({
  sections,
  loading,
  error,
}: {
  sections: SheetSection[];
  loading: boolean;
  error: string | null;
}) {
  // One key at a time, so the flash lands on the line that was actually taken.
  const [copied, setCopied] = useState<string | null>(null);

  const flash = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
  };

  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value);
    flash(key);
  };

  if (loading) {
    return (
      <div className="border-t border-divider bg-surface-2 px-5 py-6 text-[13px] text-muted">
        Loading their details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-divider bg-surface-2 px-5 py-6 text-[13px] text-danger">
        {error}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="border-t border-divider bg-surface-2 px-5 py-6 text-[13px] text-muted">
        Nothing on file yet. Their answers appear here once they fill the form in.
      </div>
    );
  }

  return (
    <div className="border-t border-divider bg-surface-2 p-4">
      <div className="rounded-[var(--radius)] border border-border bg-surface">
        <div className="flex justify-end px-3 pt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => copy("__all", sheetText(sections))}
          >
            {copied === "__all" ? (
              <>
                <Check size={13} aria-hidden />
                Copied the sheet
              </>
            ) : (
              <>
                <Copy size={13} aria-hidden />
                Copy the whole sheet
              </>
            )}
          </Button>
        </div>

        {/* Two columns of a single flow on a wide screen, so a long section can
            run over the fold instead of leaving a column half empty. */}
        <div className="px-5 pb-4 pt-3 lg:columns-2 lg:gap-x-9">
          {sections.map((section) => (
            <section key={section.key} className="mb-5 break-inside-avoid last:mb-0">
              <h4 className="mb-1.5 border-b border-divider pb-1.5 text-[10px] font-bold uppercase tracking-[0.09em] text-brand-text">
                {section.label}
              </h4>
              {section.fields.map((field) => {
                const key = `${section.key}.${field.key}`;
                const isCopied = copied === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={field.value === null}
                    onClick={() => copy(key, field.value ?? "")}
                    className={
                      "group grid w-full grid-cols-[132px_1fr_auto] items-baseline gap-2.5 rounded-[6px] px-1 py-1 text-left transition-colors " +
                      (isCopied
                        ? "bg-positive-tint"
                        : "hover:bg-surface-2 disabled:hover:bg-transparent") +
                      " disabled:cursor-default"
                    }
                  >
                    <span className="text-[11.5px] leading-normal text-faint">
                      {field.label}
                    </span>
                    <span
                      className={
                        "break-words text-[13px] leading-normal " +
                        (field.value === null
                          ? "italic text-faint"
                          : "font-medium text-text ") +
                        (field.mono && field.value !== null ? "font-mono text-[12px]" : "")
                      }
                    >
                      {field.value ?? field.placeholder}
                    </span>
                    <span
                      className={
                        "text-[10.5px] font-semibold transition-opacity " +
                        (isCopied
                          ? "text-positive opacity-100"
                          : "text-brand-text opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")
                      }
                      aria-hidden
                    >
                      {isCopied ? "Copied" : field.value === null ? "" : "Copy"}
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
