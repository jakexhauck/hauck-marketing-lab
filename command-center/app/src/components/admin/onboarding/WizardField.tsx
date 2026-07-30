import { cn } from "../../../lib/cn";
import type { OnboardingField } from "../../../lib/clientOnboarding";

// Renders one onboarding field from its schema entry. Every input type the
// wizard supports lives in this one switch, so AdminClientNew never grows a
// per-field branch and adding a field stays a one-line change in
// lib/clientOnboarding.ts.

const inputCls =
  "mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const errorCls = "border-danger focus:border-danger focus:ring-danger/25";

export default function WizardField({
  field,
  value,
  error,
  onChange,
}: {
  field: OnboardingField;
  value: string | boolean | undefined;
  error?: string;
  onChange: (key: string, value: string | boolean) => void;
}) {
  const text = typeof value === "string" ? value : "";
  const cls = cn(inputCls, error && errorCls);
  const describedBy = error
    ? `${field.key}-error`
    : field.help
      ? `${field.key}-help`
      : undefined;

  function control() {
    switch (field.type) {
      case "textarea":
        return (
          <textarea
            id={field.key}
            value={text}
            rows={3}
            placeholder={field.placeholder}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(field.key, e.target.value)}
            className={cn(cls, "resize-y")}
          />
        );

      case "select":
        return (
          <select
            id={field.key}
            value={text}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(field.key, e.target.value)}
            className={cls}
          >
            <option value="">Select...</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );

      case "radio":
        return (
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={field.label}>
            {field.options?.map((o) => {
              const active = text === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(field.key, active ? "" : o.value)}
                  className={cn(
                    "rounded-[var(--radius)] border px-3.5 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "border-brand bg-brand-tint text-brand-text"
                      : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        );

      case "checkbox":
        return (
          <label className="mt-1 flex cursor-pointer items-center gap-2.5 text-[14px] text-text">
            <input
              id={field.key}
              type="checkbox"
              checked={value === true}
              aria-describedby={describedBy}
              onChange={(e) => onChange(field.key, e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            {field.label}
          </label>
        );

      case "color":
        return (
          <div className="mt-1 flex items-center gap-2.5">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : "#1d6fb8"}
              onChange={(e) => onChange(field.key, e.target.value)}
              aria-label={`${field.label} swatch`}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-border bg-surface p-1"
            />
            <input
              id={field.key}
              value={text}
              placeholder="#1d6fb8"
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={cn(cls, "mt-0 font-mono")}
            />
          </div>
        );

      default:
        return (
          <input
            id={field.key}
            type={field.type}
            value={text}
            placeholder={field.placeholder}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(field.key, e.target.value)}
            className={cls}
          />
        );
    }
  }

  return (
    <div className={field.wide ? "sm:col-span-2" : undefined}>
      {/* The checkbox carries its own inline label, so it does not get a second. */}
      {field.type !== "checkbox" && (
        <label htmlFor={field.key} className="label-cap block">
          {field.label}
          {field.required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
      )}

      {control()}

      {error ? (
        <p id={`${field.key}-error`} className="mt-1.5 text-[12px] font-medium text-danger">
          {error}
        </p>
      ) : field.help ? (
        <p id={`${field.key}-help`} className="mt-1.5 text-[12px] leading-snug text-faint">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}
