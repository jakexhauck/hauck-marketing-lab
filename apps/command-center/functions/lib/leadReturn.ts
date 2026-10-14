// Taking a company back off the power dialer and putting it on the Leads page.
//
// The reverse of `leads/send.ts`, and it has to undo every one of the four
// things that send did, because a company that went to the dialer is held in
// four places at once:
//
//   1. the scraper row, stamped `cold_call_<date>_queued`, which is why it left
//      the Leads page (that list is `send_status = pending` at the query)
//   2. a row in the prospect book (`leads`)
//   3. the `Power Dialer` tag on the GoHighLevel contact
//   4. an enrolment in the `1. | Power Dialer` workflow
//
// Number four is the one that matters and the one that is easy to miss. The tag
// is only the TRIGGER: pulling it off a contact does nothing to a manual action
// the workflow has already created, so a return that only untags leaves the
// company sitting in the queue to be dialled, now while also back on the Leads
// list to be sent again. Removing the contact from the workflow is what empties
// the queue, and both have to happen: untag alone leaves them queued, unenrol
// alone lets the tag put them straight back.
//
// Pure. The endpoint does the talking; these are the rules, kept testable
// because getting one wrong means a company is dialled after somebody asked for
// it not to be.

// Only companies nobody has rung yet (Jake, 2026-08-24). A dial that has
// happened is a fact about the business, and returning it to the pool would
// offer it up to be sent and called a second time as though the first had not
// happened. The list therefore hides them rather than refusing them at the
// button: work that cannot be done is better not offered.
export const ALREADY_CALLED_REASON = "Already called";

// The stamp `send.ts` writes is `<channel>_<yyyymmdd>_queued`, and the variant
// for a lead that was already in the book appends `_already_in_book`. Both mean
// the same thing here: this company was handed to the cold call operation.
export function wentToTheDialer(sendStatus: string, sentTo: string | null): boolean {
  if ((sentTo ?? "").trim() !== "cold_call") return false;
  const status = (sendStatus ?? "").trim();
  return status.startsWith("cold_call_") && status.includes("_queued");
}

// How many companies one press may return.
//
// A budget, not a preference, and the same ceiling that governs the send: Pages
// Functions on the free plan cut a request off at fifty outbound calls. This
// endpoint spends TWO GoHighLevel calls per company (the tag removal and the
// workflow removal) plus about six fixed (three reads, the workflow list, two
// batch writes and the admin log), so fifteen costs about thirty-six and leaves
// a quarter of the allowance unspent. Raising it without re-counting is how the
// send died past its eighth lead in August.
export const MAX_PER_RETURN = 15;

export interface ReturnCandidate {
  id: string;
  phoneE164: string;
  businessName: string | null;
  sendStatus: string;
  sentTo: string | null;
}

// What the book knows about the same company, matched on the phone number.
//
// Matched on the phone because there is no link between the two tables to match
// on: `send.ts` writes the book row without ever recording which scraper row it
// came from, so the number is the only thing they share.
export interface BookEntry {
  id: string;
  phone: string;
  ghlContactId: string | null;
  dialed: boolean;
}

export interface ReturnRejection {
  id: string;
  businessName: string | null;
  reason: string;
}

export interface ReturnPlanItem {
  leadId: string;
  bookId: string;
  ghlContactId: string;
  businessName: string | null;
}

export interface ReturnPlan {
  items: ReturnPlanItem[];
  rejected: ReturnRejection[];
}

/**
 * Which of these companies can actually be taken off the dialer, and why not
 * for the rest.
 *
 * Every rejection here is a company left exactly where it was. Nothing is
 * half-returned: a company either comes off the workflow, out of the book and
 * back onto the Leads page, or none of those things happen to it.
 */
export function planReturn(
  leads: ReturnCandidate[],
  bookByPhone: Map<string, BookEntry>,
): ReturnPlan {
  const items: ReturnPlanItem[] = [];
  const rejected: ReturnRejection[] = [];

  for (const lead of leads) {
    const name = lead.businessName;
    const book = bookByPhone.get(lead.phoneE164);

    if (!wentToTheDialer(lead.sendStatus, lead.sentTo)) {
      rejected.push({ id: lead.id, businessName: name, reason: "Not on the dialer list" });
    } else if (!book) {
      // In the book is what "in the dialer" means here. Without a book row there
      // is no contact to untag and nothing to unenrol, so the honest answer is
      // that this one is not on the list rather than that it was returned.
      rejected.push({ id: lead.id, businessName: name, reason: "Not in the call list" });
    } else if (book.dialed) {
      rejected.push({ id: lead.id, businessName: name, reason: ALREADY_CALLED_REASON });
    } else if (!book.ghlContactId) {
      // Resetting this one would put it back on the Leads page while leaving it
      // tagged and enrolled over there: it would be dialled anyway AND offered
      // to be sent again. Refusing it is the only answer that cannot mislead.
      rejected.push({
        id: lead.id,
        businessName: name,
        reason: "Not linked to GoHighLevel; take it out of manual actions by hand",
      });
    } else {
      items.push({
        leadId: lead.id,
        bookId: book.id,
        ghlContactId: book.ghlContactId,
        businessName: name,
      });
    }
  }

  return { items, rejected };
}

// The scraper row as it must read once the company is back on the Leads page.
//
// `pending` and nothing else, by Jake's call: it should look exactly like a lead
// that was never sent, because that is what it is again. The list is built from
// `send_status = pending` (CALLABLE_LEAD_FILTER), so this single field is what
// puts it back on screen; the other two are cleared because leaving a sent date
// on a lead that is not sent is a lie the export would repeat.
export function returnedLeadPatch(): {
  send_status: string;
  sent_to: null;
  sent_at: null;
} {
  return { send_status: "pending", sent_to: null, sent_at: null };
}
