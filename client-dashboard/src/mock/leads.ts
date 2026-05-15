import type { Lead, LeadStage } from "../types";
import { getUsersForClient } from "./users";

// Deterministic PRNG so the demo is stable across reloads.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NicheConfig {
  firstNames: string[];
  lastNames: string[];
  ads: string[];
  campaign: string;
  valueRange: [number, number];
  stages: LeadStage[];
}

const NICHES: Record<string, NicheConfig> = {
  "smiths-roofing": {
    firstNames: ["Bob", "Linda", "James", "Susan", "Mark", "Diane", "Greg", "Patty", "Kevin", "Nancy", "Ron", "Theresa", "Frank", "Wendy", "Carl", "Joanne", "Steve", "Marie", "Doug", "Holly"],
    lastNames: ["Anderson", "Murphy", "Bennett", "Cooper", "Diaz", "Edwards", "Foster", "Greene", "Harris", "Iverson", "Jacobs", "Klein", "Lopez", "Mitchell", "Nguyen", "Owens", "Perez", "Quinn", "Roberts", "Sanchez"],
    ads: ["Spring Roof Promo", "Free Estimate Lead Form", "Storm Damage Inspection", "Senior Roof Discount", "Free Drone Inspection"],
    campaign: "FB-Lead-Form-2026-Q2",
    valueRange: [4000, 25000],
    stages: ["new", "contacted", "estimate-sent", "booked", "won", "lost", "no-show"],
  },
  "glow-medspa": {
    firstNames: ["Emma", "Olivia", "Sophia", "Mia", "Isabella", "Charlotte", "Amelia", "Harper", "Evelyn", "Abigail", "Ella", "Avery", "Scarlett", "Grace", "Chloe", "Lily", "Madison", "Aubrey", "Hannah", "Layla"],
    lastNames: ["Bell", "Carter", "Cruz", "Davis", "Evans", "Flores", "Garcia", "Hayes", "Holt", "Jenkins", "Kim", "Lane", "Mendez", "Nash", "Park", "Reed", "Shaw", "Torres", "Vega", "Walsh"],
    ads: ["Botox $9/unit Spring", "Free Skin Consult", "Filler Friday", "Bridal Glow Package", "Membership Trial"],
    campaign: "IG-Reels-2026-Q2",
    valueRange: [300, 2000],
    stages: ["new", "contacted", "consultation", "booked", "won", "lost", "no-show"],
  },
  "apex-detailing": {
    firstNames: ["Chris", "Tyler", "Brandon", "Jason", "Eric", "Derek", "Aaron", "Brian", "Cody", "Dustin", "Ethan", "Garrett", "Hunter", "Ian", "Jared", "Kyle", "Logan", "Nate", "Owen", "Pete"],
    lastNames: ["Adams", "Brooks", "Chase", "Daniels", "Ellis", "Fox", "Grant", "Hayes", "Irwin", "Jones", "Knox", "Long", "Mason", "Norris", "Ortega", "Price", "Reyes", "Stone", "Tate", "Vance"],
    ads: ["Ceramic Coat Offer", "Detail My Truck", "Interior Deep Clean", "Pre-Sale Detail Special", "Mobile Detail Promo"],
    campaign: "FB-Local-Awareness-2026-Q2",
    valueRange: [150, 800],
    stages: ["new", "contacted", "booked", "won", "lost", "no-show"],
  },
};

// Target distribution: 30% new, 25% contacted, 20% booked, 10% won, 10% lost, 5% no-show.
// Roofer and med-spa add an interstitial stage; we slot 15% of the contacted bucket into that.
const COUNT_PER_CLIENT = 20;

function pickStage(rng: () => number, niche: NicheConfig): LeadStage {
  const r = rng();
  const hasInterstitial = niche.stages.includes("estimate-sent") || niche.stages.includes("consultation");
  if (hasInterstitial) {
    if (r < 0.25) return "new";
    if (r < 0.45) return "contacted";
    if (r < 0.55) return niche.stages.includes("estimate-sent") ? "estimate-sent" : "consultation";
    if (r < 0.75) return "booked";
    if (r < 0.85) return "won";
    if (r < 0.95) return "lost";
    return "no-show";
  }
  if (r < 0.3) return "new";
  if (r < 0.55) return "contacted";
  if (r < 0.75) return "booked";
  if (r < 0.85) return "won";
  if (r < 0.95) return "lost";
  return "no-show";
}

function fakePhone(rng: () => number): string {
  const a = Math.floor(rng() * 900) + 100;
  const b = Math.floor(rng() * 9000) + 1000;
  return `(555) 0${Math.floor(rng() * 9) + 1}${Math.floor(rng() * 9)}-${a}${b.toString().slice(0, 1)}`;
}

function fakeEmail(first: string, last: string): string {
  return `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
}

function generateLeadsForClient(clientId: string, seed: number): Lead[] {
  const niche = NICHES[clientId];
  if (!niche) return [];
  const rng = mulberry32(seed);
  const reps = getUsersForClient(clientId).filter((u) => u.role === "rep");
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const leads: Lead[] = [];
  for (let i = 0; i < COUNT_PER_CLIENT; i++) {
    const first = niche.firstNames[Math.floor(rng() * niche.firstNames.length)];
    const last = niche.lastNames[Math.floor(rng() * niche.lastNames.length)];
    const stage = pickStage(rng, niche);
    const createdAt = new Date(now - rng() * thirtyDays);
    const lastActivityAt = new Date(createdAt.getTime() + rng() * (now - createdAt.getTime()));
    const value =
      stage === "won"
        ? Math.round((niche.valueRange[0] + rng() * (niche.valueRange[1] - niche.valueRange[0])) / 50) * 50
        : null;
    const assignedUserId = reps.length > 0 ? reps[Math.floor(rng() * reps.length)].id : null;
    leads.push({
      id: `${clientId}-l-${i + 1}`,
      clientId,
      assignedUserId,
      name: `${first} ${last}`,
      phone: fakePhone(rng),
      email: fakeEmail(first, last),
      sourceAd: niche.ads[Math.floor(rng() * niche.ads.length)],
      sourceCampaign: niche.campaign,
      stage,
      value,
      createdAt: createdAt.toISOString(),
      lastActivityAt: lastActivityAt.toISOString(),
      notes: null,
    });
  }
  return leads;
}

const SEEDS: Record<string, number> = {
  "smiths-roofing": 1001,
  "glow-medspa": 2002,
  "apex-detailing": 3003,
};

export function getLeadsForClient(clientId: string): Lead[] {
  return generateLeadsForClient(clientId, SEEDS[clientId] ?? 0);
}
