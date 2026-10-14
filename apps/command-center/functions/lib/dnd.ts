// Do Not Disturb, read off a GHL contact record.
//
// GHL carries DND in TWO places and reading only one of them is the bug this
// module exists to prevent:
//
//   dnd: true            the contact-level switch. Everything is off.
//   dndSettings: {       per-channel, independent of the switch above.
//     SMS: { status: "active", message: "TWILIO_ERROR_CODE: 30006" }
//   }
//
// A per-channel block is the COMMON case and the flat `dnd` boolean stays
// false through all of it: verified against the live Willis account
// 2026-07-29, where 7 of 173 contacts had SMS switched off and not one of
// them had dnd: true. Every one was set automatically by Twilio rejecting the
// number (30003/30005/30006: unreachable handset, unknown handset, landline).
// So a setter texting one of those contacts is typing into a channel that
// physically cannot deliver, and nothing in the CRM's reply box says so.
//
// `status` is GHL's own word and is "active" when the block IS in force.
// "inactive" appears on the same object for a channel that was blocked and is
// no longer, so the value has to be tested rather than the key's presence.

export interface ContactDndSource {
  dnd?: boolean;
  dndSettings?: Record<string, { status?: string; message?: string } | null | undefined>;
}

export interface ContactDnd {
  // The contact-level switch: every channel is off, whatever dndSettings says.
  all: boolean;
  // Channels individually switched off, in GHL's own casing ("SMS", "Email",
  // "Call", "WhatsApp", "GMB", "FB"). Empty when none are.
  channels: string[];
  // Why a channel is off, keyed by the same channel names, when GHL supplied a
  // reason. Twilio error codes arrive here verbatim; nothing translates them,
  // because a wrong guess about why a number rejects texts is worse than the
  // raw code an operator can look up.
  reasons: Record<string, string>;
}

// Null when the record carries no DND information at all, which is NOT the
// same as "not on DND". Callers must render null as no claim either way: the
// only thing this app ever asserts is a block it actually saw.
export function readContactDnd(c: ContactDndSource | null | undefined): ContactDnd | null {
  if (!c) return null;
  const hasFlag = typeof c.dnd === "boolean";
  const settings = c.dndSettings;
  const hasSettings = !!settings && typeof settings === "object";
  if (!hasFlag && !hasSettings) return null;

  const channels: string[] = [];
  const reasons: Record<string, string> = {};
  if (hasSettings) {
    for (const [channel, value] of Object.entries(settings)) {
      if (!value || typeof value !== "object") continue;
      if (String(value.status ?? "").toLowerCase() !== "active") continue;
      channels.push(channel);
      if (value.message) reasons[channel] = value.message;
    }
  }
  return { all: c.dnd === true, channels, reasons };
}

// True when a message on this channel is blocked. The contact-level switch
// covers every channel; otherwise the channel has to be named. Case-insensitive
// because the composer's vocabulary ("SMS", "Email") and GHL's are only equal
// by convention, not by contract.
export function isChannelBlocked(
  dnd: ContactDnd | null | undefined,
  channel: string,
): boolean {
  if (!dnd) return false;
  if (dnd.all) return true;
  const wanted = channel.trim().toLowerCase();
  return dnd.channels.some((c) => c.toLowerCase() === wanted);
}

// Whether there is anything to show at all.
export function hasDnd(dnd: ContactDnd | null | undefined): boolean {
  return !!dnd && (dnd.all || dnd.channels.length > 0);
}
