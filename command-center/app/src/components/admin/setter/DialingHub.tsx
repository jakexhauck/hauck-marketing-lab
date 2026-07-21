import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { useSetterDialHubQuery, useSaveSetterDialHubMutation } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import {
  addRow,
  addSection,
  newId,
  removeRow,
  removeSection,
  rowKind,
  setRowLabel,
  setRowValue,
  setSectionNote,
  setSectionTitle,
  type DialHub,
} from "../../../lib/dialHubModel";

interface Props {
  tenantId: string;
  clientName: string;
}

const AUTOSAVE_MS = 600;
const EMPTY: DialHub = { sections: [] };

// A queued save carries the tenant it was typed under. Without that, editing
// one client's hub and immediately switching client files those edits against
// the next client. The component is keyed on tenantId so it remounts on a
// switch, and the unmount flush below is what actually lands the write; the
// tenant on the record is the belt to that braces.
interface PendingSave {
  tenantId: string;
  hub: DialHub;
}

// Shared cell chrome. The inputs are borderless until focused so the whole
// thing reads as a grid you type directly into, the way the sheet it replaces
// did, rather than as a form made of boxes.
const CELL_INPUT =
  "w-full rounded-[3px] border border-transparent bg-transparent px-2 py-1.5 outline-none placeholder:text-faint hover:border-border focus:border-brand/60 focus:bg-surface";

// The Setter Suite's Dialing Hub tab: one client's dialing reference, laid out
// as the two-column sheet it replaces. Left column is what the thing is, right
// column is the link or the tag string. Section headings are rows within the
// same table, not separate cards, because that is how the sheet reads: the
// heading's own right-hand cell carries its note ("copy paste their contact
// info").
//
// Every edit is immediate in local state and debounced to the server, so
// nothing here has a Save button to forget to press. Values are plain strings
// straight through with no coercion, which is why (unlike the numeric Business
// Health grid) there is no separate draft state: there is nothing a server
// response could snap back under the cursor.
export default function DialingHub({ tenantId, clientName }: Props) {
  const { showToast } = useToast();
  const hubQuery = useSetterDialHubQuery(tenantId, true);
  const save = useSaveSetterDialHubMutation(tenantId);

  const [hub, setHub] = useState<DialHub>(EMPTY);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmSection, setConfirmSection] = useState<string | null>(null);

  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saves that have left but not landed. pendingRef alone is not enough to
  // protect an edit: flush() clears it at the moment it fires the write, so
  // between that and the response there is a window where the edit exists only
  // on the server and nothing stops a stale GET from painting over it.
  const inFlightRef = useRef(0);

  const saveMutate = save.mutate;
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    inFlightRef.current += 1;
    saveMutate(pending, {
      onSettled: () => {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      },
    });
  }, [saveMutate]);

  // Seed from the server, but never on top of an edit that is queued OR still
  // in flight. Both matter: the query is stale after 60s and refetches on
  // window focus, so alt-tabbing away to copy a booking link and back can put a
  // GET in the air that resolves AFTER a save the admin made in the meantime.
  // Without the in-flight guard that stale response wins and the edit vanishes
  // from under the cursor.
  const serverHub = hubQuery.data?.hub;
  useEffect(() => {
    if (!serverHub) return;
    if (pendingRef.current || inFlightRef.current > 0) return;
    setHub(serverHub);
  }, [serverHub]);

  // An unsaved edit must not be stranded by a client switch or a tab change.
  useEffect(() => {
    return () => flush();
  }, [tenantId, flush]);

  const apply = (next: DialHub) => {
    setHub(next);
    const pending = pendingRef.current;
    if (pending && pending.tenantId !== tenantId) {
      // Leftover from another client: its own write, not part of this one.
      saveMutate(pending);
    }
    pendingRef.current = { tenantId, hub: next };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_MS);
  };

  const copyValue = (rowId: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopiedId(rowId);
        setTimeout(() => setCopiedId((id) => (id === rowId ? null : id)), 1200);
      },
      () => showToast("Could not copy"),
    );
  };

  const deleteSection = (sectionId: string, rowCount: number) => {
    // A section with rows takes two clicks. Deleting it takes its rows with it
    // and there is no undo, so a stray click should not cost the whole Calendar
    // block.
    if (rowCount > 0 && confirmSection !== sectionId) {
      setConfirmSection(sectionId);
      setTimeout(() => setConfirmSection((id) => (id === sectionId ? null : id)), 4000);
      return;
    }
    setConfirmSection(null);
    apply(removeSection(hub, sectionId));
  };

  if (hubQuery.isLoading) return <div className="pk-empty">Loading dialing hub...</div>;
  if (hubQuery.isError) return <div className="pk-empty">Could not load the dialing hub.</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          Everything {clientName}&apos;s setters need while dialing. Edit any cell in place, it
          saves itself.
        </p>
        <span className="flex items-center gap-1.5 text-[11.5px] text-faint" aria-live="polite">
          {save.isPending ? (
            <>
              <Loader2 size={12} className="animate-spin" aria-hidden />
              Saving
            </>
          ) : save.isError ? (
            <span className="text-danger">Could not save, your last edit may be lost</span>
          ) : (
            <>
              <Check size={12} aria-hidden />
              Saved
            </>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <colgroup>
            <col className="w-[42%]" />
            <col />
          </colgroup>
          <thead>
            <tr className="bg-surface-2">
              <th className="border-b border-r border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-faint">
                Item
              </th>
              <th className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-faint">
                Links
              </th>
            </tr>
          </thead>
          <tbody>
            {hub.sections.map((section) => (
              <Fragment key={section.id}>
                {/* Section heading is a row IN the table, its note in the
                    right-hand cell, exactly as the sheet has it. */}
                <tr className="bg-surface-2">
                  <td className="border-b border-r border-border align-middle">
                    <input
                      value={section.title}
                      onChange={(e) => apply(setSectionTitle(hub, section.id, e.target.value))}
                      onBlur={flush}
                      placeholder="Section name"
                      aria-label="Section name"
                      className={`${CELL_INPUT} text-[12px] font-semibold uppercase tracking-wide text-text`}
                    />
                  </td>
                  <td className="border-b border-border align-middle">
                    <div className="flex items-center gap-1 pr-1.5">
                      <input
                        value={section.note}
                        onChange={(e) => apply(setSectionNote(hub, section.id, e.target.value))}
                        onBlur={flush}
                        placeholder="Note (optional)"
                        aria-label="Section note"
                        className={`${CELL_INPUT} text-[11.5px] font-medium uppercase tracking-wide text-muted`}
                      />
                      <button
                        type="button"
                        onClick={() => deleteSection(section.id, section.rows.length)}
                        aria-label={`Delete section ${section.title || "untitled"}`}
                        className={`shrink-0 whitespace-nowrap rounded-[3px] px-1.5 py-1 text-[11px] font-medium transition-colors ${
                          confirmSection === section.id
                            ? "text-danger"
                            : "text-faint hover:text-danger"
                        }`}
                      >
                        {confirmSection === section.id ? "Delete section?" : <Trash2 size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>

                {section.rows.map((row) => {
                  const kind = rowKind(row.value);
                  const href = row.value.trim();
                  return (
                    <tr key={row.id} className="group">
                      <td className="border-b border-r border-border align-middle">
                        <input
                          value={row.label}
                          onChange={(e) => apply(setRowLabel(hub, section.id, row.id, e.target.value))}
                          onBlur={flush}
                          placeholder="What is it"
                          aria-label="Row label"
                          className={`${CELL_INPUT} text-text`}
                        />
                      </td>
                      <td className="border-b border-border align-middle">
                        <div className="flex items-center gap-1 pr-1.5">
                          <input
                            value={row.value}
                            onChange={(e) =>
                              apply(setRowValue(hub, section.id, row.id, e.target.value))
                            }
                            onBlur={flush}
                            placeholder="Paste a link, or type a tag"
                            aria-label="Row value"
                            className={`${CELL_INPUT} font-mono text-[12.5px] text-text placeholder:font-sans`}
                          />

                          {/* What the row IS comes from what is in it: a link
                              opens, a tag copies, an empty row offers neither.
                              No type field to set, and none to get out of step
                              with the value. */}
                          {kind === "link" ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label={`Open ${row.label || "link"}`}
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-muted transition-colors hover:bg-surface-2 hover:text-brand-text"
                            >
                              <ExternalLink size={12} />
                            </a>
                          ) : kind === "text" ? (
                            <button
                              type="button"
                              onClick={() => copyValue(row.id, row.value.trim())}
                              aria-label={`Copy ${row.label || "value"}`}
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-muted transition-colors hover:bg-surface-2 hover:text-brand-text"
                            >
                              {copiedId === row.id ? (
                                <Check size={12} className="text-success" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          ) : (
                            <span className="h-6 w-6 shrink-0" aria-hidden />
                          )}

                          {/* Only on hover or keyboard focus: one delete
                              control per row, always visible, would put a bin
                              icon against every line of a reference table
                              people are meant to read. */}
                          <button
                            type="button"
                            onClick={() => apply(removeRow(hub, section.id, row.id))}
                            aria-label={`Delete row ${row.label || "untitled"}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-transparent transition-colors hover:bg-surface-2 hover:text-danger focus:text-danger group-hover:text-faint"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                <tr>
                  <td colSpan={2} className="border-b border-border">
                    <button
                      type="button"
                      onClick={() => apply(addRow(hub, section.id, newId()))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-faint transition-colors hover:text-brand-text"
                    >
                      <Plus size={11} />
                      Add row
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}

            {hub.sections.length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-[12.5px] text-faint">
                  This hub is empty. Add a section to start building {clientName}&apos;s dialing
                  reference.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => apply(addSection(hub, newId()))}
        className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text"
      >
        <Plus size={13} />
        Add section
      </button>
    </div>
  );
}
