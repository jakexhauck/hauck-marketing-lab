import { useState } from "react";
import { Check, User, X } from "lucide-react";
import { useUpsertContact } from "../../hooks/useApi";
import type { ApiContact } from "../../lib/api";

// Edit the core fields GHL lets us write back on a contact. Name is stored as
// first + last, so we split the display name on the first space for defaults.
export default function EditContactModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: ApiContact;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [first, rest] = splitName(contact.name);
  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(rest);
  const [email, setEmail] = useState(contact.email);
  const [postalCode, setPostalCode] = useState("");
  const upsert = useUpsertContact();

  const canSave = firstName.trim().length > 0 && !upsert.isPending;

  function save() {
    if (!canSave) return;
    upsert.mutate(
      {
        contactId: contact.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        postalCode: postalCode.trim(),
      },
      {
        onSuccess: () => {
          onSaved("Contact updated");
          onClose();
        },
        onError: () => onSaved("Could not update contact"),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-[22px] pb-3.5 pt-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand/10 text-brand">
            <User size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16.5px] font-semibold text-text">
              Edit contact
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">{contact.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-[22px] py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </Field>
            <Field label="Last name">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Postal code">
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-[22px] py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-border bg-surface px-3.5 py-2 font-display text-[13px] font-semibold text-text hover:border-brand/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
            style={{ backgroundImage: "var(--grad-brand)" }}
          >
            <Check size={15} /> {upsert.isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-[10px] border border-border bg-[var(--bg)] px-3 py-2.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-display text-[12.5px] font-semibold text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function splitName(name: string): [string, string] {
  const trimmed = name.trim();
  const i = trimmed.indexOf(" ");
  if (i === -1) return [trimmed, ""];
  return [trimmed.slice(0, i), trimmed.slice(i + 1)];
}
