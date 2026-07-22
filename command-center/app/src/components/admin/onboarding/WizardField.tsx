import { useRef, type ChangeEvent } from "react";
import { Upload, X } from "lucide-react";
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
  files,
  error,
  onChange,
  onFiles,
}: {
  field: OnboardingField;
  value: string | boolean | undefined;
  files?: File[];
  error?: string;
  onChange: (key: string, value: string | boolean) => void;
  onFiles: (key: string, files: File[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const text = typeof value === "string" ? value : "";
  const cls = cn(inputCls, error && errorCls);
  const describedBy = error
    ? `${field.key}-error`
    : field.help
      ? `${field.key}-help`
      : undefined;

  function pickFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    onFiles(field.key, field.multiple ? [...(files ?? []), ...picked] : picked);
    // Reset so re-picking the same file still fires a change event.
    e.target.value = "";
  }

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

      case "file":
        return (
          <div className="mt-1">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple={field.multiple}
              onChange={pickFiles}
              className="sr-only"
              aria-label={field.label}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-border-strong bg-surface-2 px-3 py-5 text-[13px] font-medium text-muted transition-colors hover:border-brand hover:text-brand-text"
            >
              <Upload size={15} aria-hidden />
              {field.multiple ? "Add photos" : "Choose a file"}
            </button>

            {(files?.length ?? 0) > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {files?.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5"
                  >
                    <img
                      src={URL.createObjectURL(f)}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-[4px] object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() =>
                        onFiles(
                          field.key,
                          (files ?? []).filter((_, j) => j !== i),
                        )
                      }
                      className="shrink-0 rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-danger"
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
