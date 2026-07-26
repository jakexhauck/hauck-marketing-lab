// Shaping GoHighLevel opportunities for the Cold Call > Pipelines boards.
//
// Pure, so the mapping is unit-tested without a network: GHL's search response
// is inconsistent about where a contact's name and phone live (sometimes on the
// opportunity, sometimes only on the nested contact), and quietly rendering
// "undefined" on a card is the kind of thing nobody notices until a caller reads
// it out loud on the phone.

export interface RawOpportunity {
  id: string;
  name?: string;
  pipelineStageId?: string;
  status?: string;
  monetaryValue?: number | null;
  updatedAt?: string;
  createdAt?: string;
  contact?: {
    id?: string;
    name?: string;
    phone?: string;
    email?: string;
    tags?: string[];
  } | null;
}

export interface PipelineCard {
  id: string;
  name: string;
  stageId: string;
  status: string;
  value: number | null;
  contactId: string | null;
  phone: string;
  email: string;
  tags: string[];
  updatedAt: string | null;
}

export function shapeOpportunity(raw: RawOpportunity): PipelineCard {
  const contact = raw.contact ?? null;
  return {
    id: raw.id,
    // The opportunity's own name is what GHL shows on the card; the contact's is
    // the fallback, and "Unnamed" beats an empty card that cannot be clicked.
    name: (raw.name ?? "").trim() || (contact?.name ?? "").trim() || "Unnamed",
    stageId: raw.pipelineStageId ?? "",
    status: raw.status ?? "open",
    value: typeof raw.monetaryValue === "number" && raw.monetaryValue > 0
      ? raw.monetaryValue
      : null,
    contactId: contact?.id ?? null,
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    tags: contact?.tags ?? [],
    updatedAt: raw.updatedAt ?? raw.createdAt ?? null,
  };
}

// Cards grouped under the stage they sit in, in the stage order the pipeline
// declares. A card whose stage is unknown (deleted stage, or a stage the caller
// cannot see) is NOT dropped: it goes to the end under its own heading, because
// a lead vanishing from a board is worse than a board with an odd column.
export function groupByStage(
  stages: { id: string; name: string }[],
  cards: PipelineCard[],
): { id: string; name: string; cards: PipelineCard[] }[] {
  const byStage = new Map<string, PipelineCard[]>();
  for (const card of cards) {
    const list = byStage.get(card.stageId) ?? [];
    list.push(card);
    byStage.set(card.stageId, list);
  }

  const columns = stages.map((s) => ({
    id: s.id,
    name: s.name,
    cards: byStage.get(s.id) ?? [],
  }));

  const known = new Set(stages.map((s) => s.id));
  const orphans = cards.filter((c) => !known.has(c.stageId));
  if (orphans.length) {
    columns.push({ id: "__unplaced", name: "Not in a stage", cards: orphans });
  }

  return columns;
}
