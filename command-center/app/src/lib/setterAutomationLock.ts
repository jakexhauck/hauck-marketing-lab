import type { ApiSetterLead } from "./api";

// A stage-action tag has been applied to a contact and that client's CRM
// automation is now (asynchronously) acting on it, usually by moving the
// lead's stage. Until we can SEE that result on the board, the contact's
// card is locked so a setter cannot pile a second action onto a lead that
// is mid-automation.
//
// There is no "automation finished" signal from the CRM, so completion is
// inferred: the lock releases when the lead's stage visibly changes, when
// the lead leaves this pipeline's board entirely (moved to Trash etc.), or
// after a timeout for automations that never move the stage at all.
export interface AutomationLock {
  contactId: string;
  // The stage the lead was in when the action fired; a different stage on a
  // later board read means the automation has done its visible work.
  stageName: string;
  lockedAt: number;
}

// Automations normally land in seconds; 90s covers a slow one without
// bricking a card whose automation makes no visible board change.
export const LOCK_TIMEOUT_MS = 90_000;

export function lockFor(lead: ApiSetterLead, now: number): AutomationLock {
  return { contactId: lead.contactId, stageName: lead.stageName, lockedAt: now };
}

// Re-evaluates every lock against a fresh board read. A lock survives only
// while it is unexpired AND some lead with that contact is still sitting in
// the stage it was locked in. Returns the same array reference when nothing
// changed, so callers can setState with it without looping.
export function resolveLocks(
  locks: AutomationLock[],
  leads: ApiSetterLead[],
  now: number,
): AutomationLock[] {
  if (locks.length === 0) return locks;
  const next = locks.filter((lock) => {
    if (now - lock.lockedAt >= LOCK_TIMEOUT_MS) return false;
    return leads.some(
      (l) => l.contactId === lock.contactId && l.stageName === lock.stageName,
    );
  });
  return next.length === locks.length ? locks : next;
}

export function lockedContactIds(locks: AutomationLock[]): Set<string> {
  return new Set(locks.map((l) => l.contactId));
}
