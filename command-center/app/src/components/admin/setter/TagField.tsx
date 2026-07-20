import { useState } from "react";
import { X, Plus, TriangleAlert } from "lucide-react";
import { useSetterTagsMutation } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import type { ApiSetterDial } from "../../../lib/api";

interface Props {
  tenantId: string;
  contactId: string;
  tags: string[];
  dials: ApiSetterDial[];
}

// Derives suggestions from tags this contact's own dial history has already
// applied (setter_dials.tags_applied), minus whatever is already on the
// contact. Real, live, contact-specific data rather than a fabricated
// location-wide catalog the backend does not expose.
function suggestionsFrom(dials: ApiSetterDial[], current: string[]): string[] {
  const currentSet = new Set(current.map((t) => t.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dials) {
    for (const t of d.tagsApplied) {
      const key = t.toLowerCase();
      if (currentSet.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out.slice(0, 6);
}

// Current tags as removable chips, a free input to add a new one, and a
// short row of tags previously applied on this contact's own call history.
// Every add/remove goes straight to the live CRM contact and fires that
// client's automations, so this never guesses at the result: the chip list
// always reflects the mutation response, the CRM's actual tag list after
// the write (functions/api/admin/setter/tags.ts re-reads rather than
// echoes).
export default function TagField({ tenantId, contactId, tags, dials }: Props) {
  const { showToast } = useToast();
  const tagsMutation = useSetterTagsMutation();
  const [draft, setDraft] = useState("");
  const [busyTag, setBusyTag] = useState<string | null>(null);

  const suggestions = suggestionsFrom(dials, tags);

  const addTag = (tag: string) => {
    const value = tag.trim();
    if (!value || tags.some((t) => t.toLowerCase() === value.toLowerCase())) return;
    tagsMutation.mutate(
      { tenantId, contactId, add: [value] },
      {
        onSuccess: () => setDraft(""),
        onError: () => showToast("Could not add that tag, please try again"),
      },
    );
  };

  const removeTag = (tag: string) => {
    setBusyTag(tag);
    tagsMutation.mutate(
      { tenantId, contactId, remove: [tag] },
      {
        onSuccess: () => setBusyTag(null),
        onError: () => {
          setBusyTag(null);
          showToast("Could not remove that tag, please try again");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <p className="text-[12.5px] text-faint">No tags on this contact yet.</p>
        ) : (
          tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1.5 text-[11.5px] font-semibold text-muted"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={tagsMutation.isPending}
                aria-label={`Remove tag ${tag}`}
                className="grid h-4 w-4 place-items-center rounded-full text-faint transition-colors hover:bg-surface-3 hover:text-danger disabled:opacity-50"
              >
                {busyTag === tag && tagsMutation.isPending ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-faint" aria-hidden />
                ) : (
                  <X size={11} />
                )}
              </button>
            </span>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTag(draft);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a tag"
          className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || tagsMutation.isPending}
          aria-label="Add tag"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] border border-border bg-surface text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
        >
          <Plus size={14} />
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Used before
          </span>
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              disabled={tagsMutation.isPending}
              className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text disabled:opacity-50"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-warning">
        <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
        Adding or removing a tag fires this client&apos;s automations immediately, only tag
        what you mean to trigger.
      </p>
    </div>
  );
}
